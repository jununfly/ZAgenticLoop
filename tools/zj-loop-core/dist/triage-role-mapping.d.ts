import type { RouteTableDocument } from './route.js';
export declare const TRIAGE_CATEGORY_ROLES: readonly ["bug", "enhancement"];
export declare const TRIAGE_STATE_ROLES: readonly ["needs-triage", "needs-info", "ready-for-agent", "ready-for-human", "wontfix"];
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
export declare const DEFAULT_TRIAGE_ROLE_MAPPING: TriageRoleMapping;
export declare function getTriageRoleMapping(table: RouteTableDocument, provider: string): TriageRoleMapping;
export declare function validateTriageRoleMapping(mapping: unknown): {
    ok: boolean;
    errors: string[];
};
export declare function resolveTriageRoles(labels: unknown, mapping: TriageRoleMapping): TriageRoleResolution;
