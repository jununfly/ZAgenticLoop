import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
export const DEFAULT_ROUTE_TABLE_PATH = 'zj-loop/zj-loop-route-table.yaml';
const EXECUTION_MODES = new Set(['report-only', 'request-only', 'claim-only', 'dry-run', 'live']);
const SIDE_EFFECT_LEVELS = ['none', 'evidence', 'request', 'claim', 'issue-comment', 'label', 'branch', 'pr', 'draft-pr', 'cleanup'];
const MATURITY_LEVELS = new Set([
    'missing',
    'designed',
    'replayed',
    'dogfooded',
    'install-ready',
    'execution-ready',
    'user-project-ready',
]);
const CONSUMER_KIND_LIMITS = {
    'producer-router': { modes: ['report-only', 'request-only'], maxSideEffect: 'request', completionForms: ['report-evidence'] },
    'report-consumer': { modes: ['report-only'], maxSideEffect: 'evidence', completionForms: ['report-evidence'] },
    'human-gate': { modes: ['report-only'], maxSideEffect: 'evidence', completionForms: ['human-decision'] },
    'fix-runner': { modes: ['request-only', 'claim-only', 'dry-run', 'live'], maxSideEffect: 'pr', completionForms: ['repair-pr', 'escalation-issue'] },
    'draft-consumer': { modes: ['report-only', 'request-only', 'dry-run', 'live'], maxSideEffect: 'draft-pr', completionForms: ['draft-pr', 'draft-evidence', 'escalation-issue'] },
    'cleanup-consumer': { modes: ['report-only', 'dry-run', 'live'], maxSideEffect: 'cleanup', completionForms: ['cleanup-done', 'cleanup-skipped', 'escalation-issue'] },
    'activation-consumer': { modes: ['request-only', 'dry-run', 'live'], maxSideEffect: 'branch', completionForms: ['roadmap-branch-pr', 'activation-failed', 'activation-resumable'] },
    'triage-action-consumer': {
        modes: ['request-only', 'dry-run', 'live'],
        maxSideEffect: 'label',
        completionForms: [
            'triage-label-applied',
            'triage-comment-posted',
            'triage-transition-confirmed',
            'issue-fix-request-created',
            'triage-action-skipped',
            'escalation-issue',
        ],
    },
};
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
export function validateRouteExecutionContract(route) {
    const errors = [];
    const warnings = [];
    const limits = CONSUMER_KIND_LIMITS[route.consumer_kind];
    if (!limits)
        errors.push(`unknown consumer_kind: ${route.consumer_kind}`);
    if (!EXECUTION_MODES.has(route.execution_mode))
        errors.push(`unknown execution.mode: ${route.execution_mode}`);
    if (!SIDE_EFFECT_LEVELS.includes(route.side_effect_level))
        errors.push(`unknown side_effect_level: ${route.side_effect_level}`);
    if (!MATURITY_LEVELS.has(route.maturity_protocol))
        errors.push(`unknown maturity.protocol: ${route.maturity_protocol}`);
    if (!MATURITY_LEVELS.has(route.maturity_runner))
        errors.push(`unknown maturity.runner: ${route.maturity_runner}`);
    if (limits) {
        if (!limits.modes.includes(route.execution_mode)) {
            errors.push(`${route.consumer_kind} cannot use execution.mode=${route.execution_mode}`);
        }
        if (sideEffectRank(route.side_effect_level) > sideEffectRank(limits.maxSideEffect)) {
            errors.push(`${route.consumer_kind} cannot use side_effect_level=${route.side_effect_level}`);
        }
        if (sideEffectRank(route.max_side_effect_level) > sideEffectRank(limits.maxSideEffect)) {
            errors.push(`${route.consumer_kind} cannot claim max_side_effect_level=${route.max_side_effect_level}`);
        }
        if (route.completion_forms.length === 0) {
            errors.push(`${route.consumer_kind} must declare at least one completion_form`);
        }
        for (const form of route.completion_forms) {
            if (!limits.completionForms.includes(form)) {
                errors.push(`${route.consumer_kind} cannot use completion_form=${form}`);
            }
        }
    }
    if (route.execution_mode === 'live' && !isRouteLiveReady(route)) {
        errors.push('live execution requires runner maturity dogfooded or execution-ready and non-evidence side-effect boundary');
    }
    if (route.request_kind === 'report-only' && route.execution_mode !== 'report-only' && route.execution_mode !== 'dry-run') {
        warnings.push('report-only request kind should not imply request consumption or work execution');
    }
    return { route_id: route.route_id, valid: errors.length === 0, errors, warnings };
}
export function isRouteLiveReady(route) {
    return (route.execution_mode === 'live' &&
        (route.maturity_runner === 'dogfooded' || route.maturity_runner === 'execution-ready') &&
        sideEffectRank(route.side_effect_level) > sideEffectRank('evidence') &&
        route.recent_success_evidence.length > 0);
}
export function canClaimRequest(input) {
    const consumer = input.consumer ?? input.route.consumer;
    const missing = [];
    if (input.route.consumer !== consumer)
        missing.push('consumer mismatch');
    if (!input.route.enabled)
        missing.push('route disabled');
    if (input.route.consumer_kind !== 'fix-runner')
        missing.push('route is not a fix-runner');
    if (input.route.execution_mode !== 'claim-only' && input.route.execution_mode !== 'live') {
        missing.push('route execution mode cannot claim');
    }
    if (input.request.status !== 'requested')
        missing.push('request status is not requested');
    if (input.request.requested_consumer && input.request.requested_consumer !== consumer) {
        missing.push('request consumer mismatch');
    }
    for (const scope of input.request.fix_scope?.scopes ?? []) {
        if (!input.route.capability_scopes.includes(scope))
            missing.push(`missing scope capability: ${scope}`);
    }
    const requiredVerifiers = [
        ...(input.request.verifier_requirements ?? []),
        ...(input.request.verification_gate?.verifiers ?? []),
    ];
    for (const verifier of requiredVerifiers) {
        if (!input.route.capability_verifiers.includes(verifier))
            missing.push(`missing verifier capability: ${verifier}`);
    }
    return {
        allowed: missing.length === 0,
        reason: missing.length === 0 ? 'claim allowed' : 'claim denied',
        missing,
    };
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
    if (changed) {
        const updatedText = patchRouteEnabledText(text, {
            routeId: route.route_id,
            enabled: input.enabled,
            reason: input.reason,
        });
        if (updatedText !== null) {
            await writeFile(filePath, updatedText);
        }
        else {
            target.enabled = input.enabled;
            if (input.reason)
                target.enabled_reason = input.reason;
            if (!input.enabled && target.enabled_reason)
                delete target.enabled_reason;
            await writeFile(filePath, YAML.stringify(table));
        }
    }
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
function patchRouteEnabledText(text, input) {
    const lineEnding = text.includes('\r\n') ? '\r\n' : '\n';
    const trailingNewline = text.endsWith('\n');
    const lines = text.split(/\r?\n/);
    if (trailingNewline)
        lines.pop();
    const routeLineIndex = lines.findIndex((line) => yamlLineScalarEquals(line, 'route_id', input.routeId));
    if (routeLineIndex === -1)
        return null;
    const blockStart = findRouteBlockStart(lines, routeLineIndex);
    if (blockStart === -1)
        return null;
    const itemIndent = lines[blockStart].match(/^(\s*)-\s+/)?.[1];
    if (itemIndent === undefined)
        return null;
    let blockEnd = lines.length;
    const nextItem = new RegExp(`^${escapeRegExp(itemIndent)}-\\s+`);
    for (let index = blockStart + 1; index < lines.length; index += 1) {
        if (nextItem.test(lines[index])) {
            blockEnd = index;
            break;
        }
    }
    const enabledIndex = findKeyLineInBlock(lines, blockStart, blockEnd, 'enabled');
    if (enabledIndex === -1)
        return null;
    const enabledIndent = lines[enabledIndex].match(/^(\s*)/)?.[1] ?? `${itemIndent}  `;
    lines[enabledIndex] = `${enabledIndent}enabled: ${input.enabled ? 'true' : 'false'}`;
    const reasonIndex = findKeyLineInBlock(lines, blockStart, blockEnd, 'enabled_reason');
    if (!input.enabled) {
        if (reasonIndex !== -1)
            lines.splice(reasonIndex, 1);
    }
    else if (input.reason !== undefined) {
        const reasonLine = `${enabledIndent}enabled_reason: ${formatYamlScalar(input.reason)}`;
        if (reasonIndex === -1) {
            lines.splice(enabledIndex + 1, 0, reasonLine);
        }
        else {
            lines[reasonIndex] = reasonLine;
        }
    }
    return `${lines.join(lineEnding)}${trailingNewline ? lineEnding : ''}`;
}
function findRouteBlockStart(lines, routeLineIndex) {
    for (let index = routeLineIndex; index >= 0; index -= 1) {
        if (/^\s*-\s+/.test(lines[index]))
            return index;
    }
    return -1;
}
function findKeyLineInBlock(lines, start, end, key) {
    const pattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*:`);
    for (let index = start; index < end; index += 1) {
        if (pattern.test(lines[index]))
            return index;
    }
    return -1;
}
function yamlLineScalarEquals(line, key, expected) {
    const match = line.match(new RegExp(`^\\s*(?:-\\s*)?${escapeRegExp(key)}\\s*:\\s*(.*?)\\s*(?:#.*)?$`));
    if (!match)
        return false;
    return unquoteYamlScalar(match[1]) === expected;
}
function unquoteYamlScalar(value) {
    const trimmed = value.trim();
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        return trimmed.slice(1, -1);
    }
    return trimmed;
}
function formatYamlScalar(value) {
    return YAML.stringify(value).trim();
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function normalizeRouteSection(routes, section) {
    return (routes ?? []).map((route) => {
        const routeId = requireString(route.route_id, 'route_id');
        const consumer = requireString(route.consumer, `consumer for ${routeId}`);
        const requestKind = route.request_kind ?? 'report-only';
        const consumerKind = route.consumer_kind ?? inferConsumerKind(route);
        const executionMode = route.execution?.mode ?? inferExecutionMode(route);
        const sideEffectLevel = route.execution?.side_effect_level ?? inferSideEffectLevel(route);
        const completionForms = route.execution?.completion_forms ?? [];
        const maturityProtocol = route.maturity?.protocol ?? 'missing';
        const maturityRunner = route.maturity?.runner ?? 'missing';
        const maxSideEffectLevel = route.capabilities?.max_side_effect_level ?? sideEffectLevel;
        const capabilityScopes = route.capabilities?.scopes ?? [];
        const capabilityVerifiers = route.capabilities?.verifiers ?? [];
        const recentSuccessEvidence = route.execution?.recent_success_evidence ?? [];
        const destructive = Boolean(route.guards?.destructive_actions_enabled === false || route.mode?.includes('closeout'));
        const sideEffecting = requestKind !== 'report-only' || destructive || sideEffectRank(sideEffectLevel) > sideEffectRank('evidence');
        const readiness = classifyRouteReadiness({
            executionMode,
            sideEffectLevel,
            maturityRunner,
            recentSuccessEvidence,
        });
        return {
            route_id: routeId,
            consumer,
            consumer_kind: consumerKind,
            enabled: route.enabled === true,
            request_kind: requestKind,
            execution_mode: executionMode,
            side_effect_level: sideEffectLevel,
            completion_forms: completionForms,
            maturity_protocol: maturityProtocol,
            maturity_runner: maturityRunner,
            max_side_effect_level: maxSideEffectLevel,
            capability_scopes: capabilityScopes,
            capability_verifiers: capabilityVerifiers,
            recent_success_evidence: recentSuccessEvidence,
            readiness: readiness.readiness,
            readiness_reasons: readiness.reasons,
            install_ready: readiness.readiness === 'install-ready' || readiness.readiness === 'execution-ready',
            execution_ready: readiness.readiness === 'execution-ready',
            user_project_ready: readiness.readiness === 'install-ready' || readiness.readiness === 'execution-ready',
            section,
            destructive,
            side_effecting: sideEffecting,
        };
    });
}
export function classifyRouteReadiness(input) {
    const evidence = input.recentSuccessEvidence ?? [];
    if (input.maturityRunner === 'execution-ready') {
        return {
            readiness: 'execution-ready',
            reasons: ['runner maturity is execution-ready'],
        };
    }
    if (input.maturityRunner === 'install-ready') {
        return {
            readiness: 'install-ready',
            reasons: ['runner maturity is install-ready'],
        };
    }
    if (input.maturityRunner === 'user-project-ready') {
        return {
            readiness: 'install-ready',
            reasons: ['legacy runner maturity user-project-ready maps to install-ready'],
        };
    }
    if (input.executionMode === 'live') {
        if (input.maturityRunner === 'dogfooded' &&
            sideEffectRank(input.sideEffectLevel) > sideEffectRank('evidence') &&
            evidence.length > 0) {
            return {
                readiness: 'dogfood-verified',
                reasons: ['live dogfood evidence exists', 'not yet promoted to execution-ready'],
            };
        }
        return {
            readiness: 'live-missing-evidence',
            reasons: ['live execution requires runner maturity and recent evidence before promotion'],
        };
    }
    if (input.maturityRunner === 'replayed' || input.maturityRunner === 'dogfooded') {
        return {
            readiness: 'replayed',
            reasons: [`runner maturity is ${input.maturityRunner}; generated-bundle live evidence is still required`],
        };
    }
    if (input.maturityRunner === 'designed') {
        return {
            readiness: 'designed',
            reasons: ['runner contract is designed but not replayed or dogfooded'],
        };
    }
    return {
        readiness: 'missing',
        reasons: ['runner is missing'],
    };
}
function inferConsumerKind(route) {
    if (route.request_kind === 'issue-fix-request')
        return 'fix-runner';
    if (route.request_kind === 'activation-comment')
        return 'activation-consumer';
    if (route.consumer === 'post-merge-cleanup')
        return 'cleanup-consumer';
    if (route.consumer === 'daily-triage')
        return 'producer-router';
    return 'report-consumer';
}
function inferExecutionMode(route) {
    if (route.request_kind === 'issue-fix-request')
        return route.guards?.claim_only === true ? 'claim-only' : 'request-only';
    if (route.request_kind === 'activation-comment')
        return 'request-only';
    return 'report-only';
}
function inferSideEffectLevel(route) {
    if (route.request_kind === 'issue-fix-request')
        return route.guards?.claim_only === true ? 'claim' : 'request';
    if (route.request_kind === 'activation-comment')
        return 'request';
    return 'evidence';
}
function sideEffectRank(level) {
    const index = SIDE_EFFECT_LEVELS.indexOf(level);
    return index === -1 ? Number.POSITIVE_INFINITY : index;
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
