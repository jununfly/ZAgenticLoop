import type { RouteTableDocument } from './route.js';

export const TRIAGE_CATEGORY_ROLES = ['bug', 'enhancement'] as const;
export const TRIAGE_STATE_ROLES = ['needs-triage', 'needs-info', 'ready-for-agent', 'ready-for-human', 'wontfix'] as const;

export type TriageCategoryRole = typeof TRIAGE_CATEGORY_ROLES[number];
export type TriageStateRole = typeof TRIAGE_STATE_ROLES[number];
export type TriageRoleMapping = {
  category: Record<TriageCategoryRole, string[]>;
  state: Record<TriageStateRole, string[]>;
};

export type TriageRoleResolution = {
  category_roles: TriageCategoryRole[];
  state_roles: TriageStateRole[];
  ignored_labels: string[];
  errors: string[];
};

export const DEFAULT_TRIAGE_ROLE_MAPPING: TriageRoleMapping = {
  category: { bug: ['bug'], enhancement: ['enhancement'] },
  state: {
    'needs-triage': ['needs-triage'],
    'needs-info': ['needs-info'],
    'ready-for-agent': ['ready-for-agent'],
    'ready-for-human': ['ready-for-human'],
    wontfix: ['wontfix'],
  },
};

export function getTriageRoleMapping(table: RouteTableDocument, provider: string): TriageRoleMapping {
  const configured = (table as any).policy?.triage_role_mapping?.[provider];
  return configured ?? DEFAULT_TRIAGE_ROLE_MAPPING;
}

export function validateTriageRoleMapping(mapping: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const value = mapping as any;
  if (!value || typeof value !== 'object') return { ok: false, errors: ['mapping must be an object'] };
  validateRoleGroup(value.category, TRIAGE_CATEGORY_ROLES, 'category', errors);
  validateRoleGroup(value.state, TRIAGE_STATE_ROLES, 'state', errors);

  const owners = new Map<string, string>();
  for (const group of ['category', 'state'] as const) {
    for (const role of [...TRIAGE_CATEGORY_ROLES, ...TRIAGE_STATE_ROLES]) {
      const labels = value[group]?.[role];
      if (!Array.isArray(labels)) continue;
      for (const label of labels) {
        const normalized = normalizeLabel(label);
        const owner = `${group}.${role}`;
        if (!normalized) continue;
        const previous = owners.get(normalized);
        if (previous && previous !== owner) errors.push(`label ${normalized} maps to both ${previous} and ${owner}`);
        owners.set(normalized, owner);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

export function resolveTriageRoles(labels: unknown, mapping: TriageRoleMapping): TriageRoleResolution {
  const normalizedLabels = Array.isArray(labels) ? labels.map(normalizeLabel).filter(Boolean) : [];
  const categoryRoles = TRIAGE_CATEGORY_ROLES.filter((role) => mapping.category[role].some((label) => normalizedLabels.includes(normalizeLabel(label))));
  const stateRoles = TRIAGE_STATE_ROLES.filter((role) => mapping.state[role].some((label) => normalizedLabels.includes(normalizeLabel(label))));
  const mapped = new Set([...categoryRoles.flatMap((role) => mapping.category[role]), ...stateRoles.flatMap((role) => mapping.state[role])].map(normalizeLabel));
  return {
    category_roles: categoryRoles,
    state_roles: stateRoles,
    ignored_labels: normalizedLabels.filter((label) => !mapped.has(label)),
    errors: [
      ...(categoryRoles.length === 1 ? [] : [`expected exactly one category role, found ${categoryRoles.length}`]),
      ...(stateRoles.length === 1 ? [] : [`expected exactly one state role, found ${stateRoles.length}`]),
    ],
  };
}

function validateRoleGroup(group: unknown, roles: readonly string[], name: string, errors: string[]) {
  if (!group || typeof group !== 'object') {
    errors.push(`${name} mapping must be an object`);
    return;
  }
  for (const role of roles) {
    const labels = (group as any)[role];
    if (!Array.isArray(labels) || labels.length === 0 || labels.some((label) => !normalizeLabel(label))) {
      errors.push(`${name}.${role} must contain one or more non-empty labels`);
    }
  }
}

function normalizeLabel(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}
