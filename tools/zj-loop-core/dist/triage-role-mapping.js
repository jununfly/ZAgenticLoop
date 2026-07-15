export const TRIAGE_CATEGORY_ROLES = ['bug', 'enhancement'];
export const TRIAGE_STATE_ROLES = ['needs-triage', 'needs-info', 'ready-for-agent', 'ready-for-human', 'wontfix'];
export const DEFAULT_TRIAGE_ROLE_MAPPING = {
    category: { bug: ['bug'], enhancement: ['enhancement'] },
    state: {
        'needs-triage': ['needs-triage'],
        'needs-info': ['needs-info'],
        'ready-for-agent': ['ready-for-agent'],
        'ready-for-human': ['ready-for-human'],
        wontfix: ['wontfix'],
    },
};
export function getTriageRoleMapping(table, provider) {
    const configured = table.policy?.triage_role_mapping?.[provider];
    return configured ?? DEFAULT_TRIAGE_ROLE_MAPPING;
}
export function validateTriageRoleMapping(mapping) {
    const errors = [];
    const value = mapping;
    if (!value || typeof value !== 'object')
        return { ok: false, errors: ['mapping must be an object'] };
    validateRoleGroup(value.category, TRIAGE_CATEGORY_ROLES, 'category', errors);
    validateRoleGroup(value.state, TRIAGE_STATE_ROLES, 'state', errors);
    const owners = new Map();
    for (const group of ['category', 'state']) {
        for (const role of [...TRIAGE_CATEGORY_ROLES, ...TRIAGE_STATE_ROLES]) {
            const labels = value[group]?.[role];
            if (!Array.isArray(labels))
                continue;
            for (const label of labels) {
                const normalized = normalizeLabel(label);
                const owner = `${group}.${role}`;
                if (!normalized)
                    continue;
                const previous = owners.get(normalized);
                if (previous && previous !== owner)
                    errors.push(`label ${normalized} maps to both ${previous} and ${owner}`);
                owners.set(normalized, owner);
            }
        }
    }
    return { ok: errors.length === 0, errors };
}
export function resolveTriageRoles(labels, mapping) {
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
function validateRoleGroup(group, roles, name, errors) {
    if (!group || typeof group !== 'object') {
        errors.push(`${name} mapping must be an object`);
        return;
    }
    for (const role of roles) {
        const labels = group[role];
        if (!Array.isArray(labels) || labels.length === 0 || labels.some((label) => !normalizeLabel(label))) {
            errors.push(`${name}.${role} must contain one or more non-empty labels`);
        }
    }
}
function normalizeLabel(value) {
    return String(value ?? '').trim().toLowerCase();
}
