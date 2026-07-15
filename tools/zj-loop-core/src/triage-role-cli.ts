#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';

import {
  DEFAULT_TRIAGE_ROLE_MAPPING,
  getTriageRoleMapping,
  TRIAGE_CATEGORY_ROLES,
  TRIAGE_STATE_ROLES,
  validateTriageRoleMapping,
} from './triage-role-mapping.js';
import { DEFAULT_ROUTE_TABLE_PATH, parseRouteTable } from './route.js';

const APPLY_CONFIRMATION = 'UPDATE_TRIAGE_ROLE_MAPPING';
const args = process.argv.slice(2);
const command = args[0] ?? 'help';
const root = value('--root') ?? '.';
const provider = value('--provider') ?? 'gitlab';
const routeTablePath = path.resolve(root, DEFAULT_ROUTE_TABLE_PATH);

if (command === 'help' || args.includes('--help')) {
  console.log('zj-loop-triage-roles validate|plan|apply --provider <github|gitlab> [--role category.bug|state.ready-for-agent] [--labels a,b] [--confirm UPDATE_TRIAGE_ROLE_MAPPING]');
  process.exit(0);
}

const text = await readFile(routeTablePath, 'utf8');
const table = parseRouteTable(text);
const current = getTriageRoleMapping(table, provider);
const validation = validateTriageRoleMapping(current);

if (command === 'validate') {
  console.log(JSON.stringify({ schema: 'zj-loop.triage_role_mapping_validation.v1', provider, valid: validation.ok, errors: validation.errors }, null, 2));
  process.exit(validation.ok ? 0 : 2);
}

const role = value('--role');
const labels = String(value('--labels') ?? '').split(',').map((label) => label.trim()).filter(Boolean);
if (!role || labels.length === 0) throw new Error('--role and --labels are required for plan/apply');
const [group, roleName] = role.split('.');
if ((group !== 'category' && group !== 'state') || ![...TRIAGE_CATEGORY_ROLES, ...TRIAGE_STATE_ROLES].includes(roleName as any)) {
  throw new Error('--role must be category.<role> or state.<role> using zj-triage canonical roles');
}
const proposed = structuredClone(current) as any;
proposed[group][roleName] = labels;
const proposedValidation = validateTriageRoleMapping(proposed);
const result = {
  schema: 'zj-loop.triage_role_mapping_change.v1',
  provider,
  role,
  before: (current as any)[group][roleName],
  after: labels,
  valid: proposedValidation.ok,
  errors: proposedValidation.errors,
  changed: JSON.stringify((current as any)[group][roleName]) !== JSON.stringify(labels),
  confirmation: APPLY_CONFIRMATION,
};
console.log(JSON.stringify(result, null, 2));
if (!proposedValidation.ok) process.exit(2);
if (command === 'plan') process.exit(0);
if (command !== 'apply') throw new Error(`unknown command ${command}`);
if (value('--confirm') !== APPLY_CONFIRMATION) throw new Error(`confirmation required: --confirm ${APPLY_CONFIRMATION}`);

const configured = (table as any).policy?.triage_role_mapping?.[provider];
const updatedText = configured
  ? patchExistingMapping(text, provider, group, roleName, labels)
  : insertDefaultMapping(text, provider, proposed);
await writeFile(routeTablePath, updatedText);

function value(flag: string) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function patchExistingMapping(text: string, providerName: string, groupName: string, roleKey: string, nextLabels: string[]) {
  const document = YAML.parseDocument(text);
  const node: any = document.getIn(['policy', 'triage_role_mapping', providerName, groupName, roleKey], true);
  if (!node?.range || node.range.length < 2) throw new Error('mapping target range unavailable; refusing non-local rewrite');
  return `${text.slice(0, node.range[0])}${JSON.stringify(nextLabels)}${text.slice(node.range[1])}`;
}

function insertDefaultMapping(text: string, providerName: string, mapping: any) {
  const marker = /\n(?=routes:\s*$)/m;
  const block = `\n  triage_role_mapping:\n    ${providerName}:\n${renderRoleGroup('category', mapping.category)}${renderRoleGroup('state', mapping.state)}\n`;
  if (!marker.test(text)) throw new Error('Route Table routes section not found; refusing non-local rewrite');
  return text.replace(marker, `${block}\n`);
}

function renderRoleGroup(group: string, values: Record<string, string[]>) {
  return `      ${group}:\n${Object.entries(values).map(([role, labels]) => `        ${role}: ${JSON.stringify(labels)}\n`).join('')}`;
}
