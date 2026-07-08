import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
export const DEFAULT_ROUTE_TABLE_PATH = 'zj-loop/zj-loop-route-table.yaml';
export async function loadRouteTable(root, routeTablePath = DEFAULT_ROUTE_TABLE_PATH) {
    const filePath = path.resolve(root, routeTablePath);
    return parseRouteTable(await readFile(filePath, 'utf8'));
}
export function parseRouteTable(text) {
    const parsed = YAML.parse(text);
    if (!parsed || parsed.kind !== 'zj-loop-route-table') {
        throw new Error('Expected kind: zj-loop-route-table');
    }
    return parsed;
}
export function listRoutes(table) {
    return [
        ...normalizeRouteSection(table.routes, 'routes'),
        ...normalizeRouteSection(table.disabled_dispatch_routes, 'disabled_dispatch_routes'),
    ];
}
export function findRoute(table, selector) {
    const matches = listRoutes(table).filter((route) => route.route_id === selector || route.consumer === selector);
    if (matches.length === 0)
        throw new Error(`Unknown route or consumer: ${selector}`);
    if (matches.length > 1) {
        throw new Error(`Ambiguous route or consumer: ${selector}. Use route_id.`);
    }
    return matches[0];
}
export function buildRouteDecision(input) {
    const route = findRoute(input.table, input.selector);
    const source = input.source ?? 'workflow-dispatch';
    const signalId = input.signalId ?? `${source}:${route.route_id}`;
    const allowed = route.enabled;
    return {
        schema: 'zj-loop.route_decision.v1',
        decision_id: stableId(`route:${route.route_id}:${signalId}`),
        signal_id: signalId,
        source,
        route: route.route_id,
        request_kind: route.request_kind,
        requested_action: allowed && route.request_kind === 'report-only' ? 'report' : allowed ? 'dispatch' : 'ignore',
        target_consumer: route.consumer,
        allowed,
        status: allowed ? 'pending' : 'denied',
        reason: allowed ? 'route enabled' : 'route disabled',
        evidence: input.evidence ?? [],
    };
}
export async function setRouteEnabled(input) {
    const routeTablePath = input.routeTablePath ?? DEFAULT_ROUTE_TABLE_PATH;
    const filePath = path.resolve(input.root, routeTablePath);
    const text = await readFile(filePath, 'utf8');
    const table = parseRouteTable(text);
    const route = findRoute(table, input.selector);
    const confirmationRequired = input.enabled && route.side_effecting;
    if (confirmationRequired) {
        const expected = expectedConfirmationPhrase(route);
        if (input.confirm !== expected) {
            throw new Error(`Confirmation required: --confirm "${expected}"`);
        }
    }
    const target = findMutableRoute(table, route.route_id);
    const changed = target.enabled !== input.enabled || (input.reason !== undefined && target.enabled_reason !== input.reason);
    target.enabled = input.enabled;
    if (input.reason)
        target.enabled_reason = input.reason;
    if (!input.enabled && target.enabled_reason)
        delete target.enabled_reason;
    await writeFile(filePath, YAML.stringify(table));
    return {
        route_id: route.route_id,
        consumer: route.consumer,
        enabled: input.enabled,
        changed,
        confirmation_required: confirmationRequired,
        destructive: route.destructive,
        side_effecting: route.side_effecting,
        next_steps: input.enabled
            ? [`Run zj-loop-route status ${route.consumer}`, 'Run the matching workflow smoke path and inspect evidence.']
            : [`Run zj-loop-route status ${route.consumer}`, 'Re-run audit or workflow smoke path if rollback was due to failure.'],
    };
}
function normalizeRouteSection(routes, section) {
    return (routes ?? []).map((route) => {
        const routeId = requireString(route.route_id, 'route_id');
        const consumer = requireString(route.consumer, `consumer for ${routeId}`);
        const requestKind = route.request_kind ?? 'report-only';
        const destructive = Boolean(route.guards?.destructive_actions_enabled === false || route.mode?.includes('closeout'));
        const sideEffecting = requestKind !== 'report-only' || destructive;
        return {
            route_id: routeId,
            consumer,
            enabled: route.enabled === true,
            request_kind: requestKind,
            section,
            destructive,
            side_effecting: sideEffecting,
        };
    });
}
function findMutableRoute(table, routeId) {
    const route = [...(table.routes ?? []), ...(table.disabled_dispatch_routes ?? [])].find((entry) => entry.route_id === routeId);
    if (!route)
        throw new Error(`Unknown route: ${routeId}`);
    return route;
}
export function expectedConfirmationPhrase(route) {
    return route.destructive
        ? `enable ${route.consumer} destructive side effects`
        : `enable ${route.consumer} side effects`;
}
function requireString(value, field) {
    if (typeof value !== 'string' || value.length === 0)
        throw new Error(`Missing ${field}`);
    return value;
}
function stableId(value) {
    let hash = 0x811c9dc5;
    for (const char of value) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 0x01000193);
    }
    return `rd_${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
