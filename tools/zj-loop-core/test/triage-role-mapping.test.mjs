import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_TRIAGE_ROLE_MAPPING, resolveTriageRoles, validateTriageRoleMapping } from '../dist/triage-role-mapping.js';

test('triage role mapping resolves canonical roles and ignores unrelated labels', () => {
  const result = resolveTriageRoles(['bug', 'ready-for-agent', 'team:platform'], DEFAULT_TRIAGE_ROLE_MAPPING);

  assert.deepEqual(result.category_roles, ['bug']);
  assert.deepEqual(result.state_roles, ['ready-for-agent']);
  assert.deepEqual(result.ignored_labels, ['team:platform']);
  assert.deepEqual(result.errors, []);
});

test('triage role mapping rejects missing or conflicting canonical roles', () => {
  const missing = resolveTriageRoles(['ready-for-agent'], DEFAULT_TRIAGE_ROLE_MAPPING);
  assert.match(missing.errors[0], /exactly one category role/);

  const conflict = structuredClone(DEFAULT_TRIAGE_ROLE_MAPPING);
  conflict.state['ready-for-human'].push('ready-for-agent');
  const validation = validateTriageRoleMapping(conflict);
  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /maps to both/);
});

test('triage role mapping requires all canonical roles and non-empty labels', () => {
  const invalid = structuredClone(DEFAULT_TRIAGE_ROLE_MAPPING);
  delete invalid.state['needs-info'];
  assert.equal(validateTriageRoleMapping(invalid).ok, false);
});
