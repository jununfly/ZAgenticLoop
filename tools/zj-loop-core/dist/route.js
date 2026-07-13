import { readdir, readFile, writeFile } from 'node:fs/promises';
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
export async function promoteRouteMaturity(input) {
    const routeTablePath = input.routeTablePath ?? DEFAULT_ROUTE_TABLE_PATH;
    const filePath = path.resolve(input.root, routeTablePath);
    const text = await readFile(filePath, 'utf8');
    const table = parseRouteTable(text);
    const route = findRoute(table, input.selector);
    const confirmationRequired = input.runner === 'execution-ready';
    const expected = expectedMaturityPromotionPhrase(route, input.runner);
    if (confirmationRequired && input.confirm !== expected) {
        throw new Error(`Confirmation required: --confirm "${expected}"`);
    }
    const target = findMutableRoute(table, route.route_id);
    const changed = target.maturity?.runner !== input.runner;
    if (changed) {
        const updatedText = patchRouteMaturityRunnerText(text, {
            routeId: route.route_id,
            runner: input.runner,
        });
        if (updatedText !== null) {
            await writeFile(filePath, updatedText);
        }
        else {
            target.maturity = { ...(target.maturity ?? {}), runner: input.runner };
            await writeFile(filePath, YAML.stringify(table));
        }
    }
    return {
        route_id: route.route_id,
        consumer: route.consumer,
        runner: input.runner,
        enabled: route.enabled,
        changed,
        confirmation_required: confirmationRequired,
        next_steps: [
            `Run zj-loop-route status ${route.route_id} --json`,
            'Enable the route separately only when authorization and verifier requirements are satisfied.',
        ],
    };
}
export async function evaluateRoutePromotionGate(input) {
    const routeTablePath = input.routeTablePath ?? DEFAULT_ROUTE_TABLE_PATH;
    const table = await loadRouteTable(input.root, routeTablePath);
    const route = findRoute(table, input.selector);
    const failedChecks = [];
    const evidenceChecks = route.consumer_kind === 'activation-consumer'
        ? await collectRoadmapActivationPromotionEvidence({
            root: input.root,
            orchestrationId: input.orchestrationId,
        })
        : route.consumer_kind === 'fix-runner'
            ? await collectFixRunnerPromotionEvidence({ root: input.root, route })
            : route.consumer_kind === 'draft-consumer'
                ? await collectDraftConsumerPromotionEvidence({ root: input.root, route })
                : [];
    if (route.consumer_kind === 'activation-consumer' && (route.route_id !== 'roadmap-sliced-development' || route.consumer !== 'roadmap-sliced-development')) {
        failedChecks.push('promotion-gate currently supports roadmap-sliced-development activation consumers only');
    }
    if (route.consumer_kind !== 'activation-consumer' && route.consumer_kind !== 'fix-runner' && route.consumer_kind !== 'draft-consumer') {
        failedChecks.push('promotion-gate currently supports activation-consumer, fix-runner, and draft-consumer routes only');
    }
    const missingEvidence = evidenceChecks
        .filter((check) => !check.satisfied)
        .map((check) => check.key);
    const promotable = failedChecks.length === 0 && missingEvidence.length === 0;
    const promotionCommand = [
        'zj-loop-route',
        'promotion-gate',
        route.route_id,
        '--target',
        input.target,
        '--apply',
        '--confirm',
        expectedMaturityPromotionPhrase(route, input.target),
    ];
    const nextSteps = promotable
        ? input.apply
            ? [`Run zj-loop-route status ${route.route_id} --json`, 'Enable the route separately only when authorization and verifier requirements are satisfied.']
            : ['Review the promotion gate evidence, then run the promotion_command with --apply only when intentional.']
        : ['Collect the missing evidence, then rerun zj-loop-route promotion-gate.'];
    let applyResult;
    if (input.apply) {
        if (!promotable) {
            throw new Error(`Promotion gate failed: missing evidence ${missingEvidence.join(', ') || 'none'}${failedChecks.length > 0 ? `; ${failedChecks.join('; ')}` : ''}`);
        }
        applyResult = await promoteRouteMaturity({
            root: input.root,
            selector: route.route_id,
            runner: input.target,
            confirm: input.confirm,
            routeTablePath,
        });
    }
    return {
        route_id: route.route_id,
        consumer: route.consumer,
        target_maturity: input.target,
        promotable,
        applied: Boolean(applyResult),
        changed: applyResult?.changed ?? false,
        required_evidence: evidenceChecks,
        missing_evidence: missingEvidence,
        failed_checks: failedChecks,
        next_steps: nextSteps,
        promotion_command: promotionCommand,
        apply_result: applyResult,
    };
}
async function collectFixRunnerPromotionEvidence(input) {
    const checks = new Map([
        ['request-carrier', emptyEvidenceCheck('request-carrier', 'missing structured Issue Fix Request carrier evidence')],
        ['claim-lifecycle', emptyEvidenceCheck('claim-lifecycle', 'missing claim or live request consumption lifecycle evidence')],
        ['live-runner-evidence', emptyEvidenceCheck('live-runner-evidence', 'missing live runner repair-pr/escalation-issue evidence')],
        ['verifier-backed-outcome', emptyEvidenceCheck('verifier-backed-outcome', 'missing verifier-backed repair or explicit escalation evidence')],
        ['side-effect-boundary', emptyEvidenceCheck('side-effect-boundary', 'missing proof that side effects are bounded to repair PR or escalation issue and auto-merge is disabled')],
        ['workflow-dispatch-dogfood', emptyEvidenceCheck('workflow-dispatch-dogfood', 'missing real workflow-dispatch dogfood evidence')],
    ]);
    const statePath = input.route.evidence_store || `zj-loop/${input.route.consumer}-state.md`;
    const stateText = await readTextFile(path.resolve(input.root, statePath));
    const lowerState = stateText.toLowerCase();
    const routePath = DEFAULT_ROUTE_TABLE_PATH;
    if (input.route.request_kind === 'issue-fix-request' &&
        (lowerState.includes('issue fix request') || input.route.recent_success_evidence.length > 0)) {
        addEvidenceMatch(checks.get('request-carrier'), {
            orchestration_id: input.route.route_id,
            path: statePath,
            kind: 'request-carrier',
            check_result: 'passed',
        });
    }
    if ((input.route.execution_mode === 'live' && input.route.recent_success_evidence.length > 0) ||
        lowerState.includes('consumed') ||
        lowerState.includes('claim replay') ||
        lowerState.includes('claim evidence')) {
        addEvidenceMatch(checks.get('claim-lifecycle'), {
            orchestration_id: input.route.route_id,
            path: statePath,
            kind: 'claim-lifecycle',
            check_result: 'passed',
        });
    }
    if (lowerState.includes('live runner') &&
        (lowerState.includes('repair-pr') || lowerState.includes('escalation-issue'))) {
        addEvidenceMatch(checks.get('live-runner-evidence'), {
            orchestration_id: input.route.route_id,
            path: statePath,
            schema: 'zj-loop.live_runner_evidence.v1',
            kind: 'live-runner-evidence',
            check_result: 'passed',
        });
    }
    if ((lowerState.includes('verification gate') || lowerState.includes('verifier') || input.route.capability_verifiers.length > 0) &&
        (lowerState.includes('repair-pr') || lowerState.includes('escalation-issue'))) {
        addEvidenceMatch(checks.get('verifier-backed-outcome'), {
            orchestration_id: input.route.route_id,
            path: statePath,
            kind: 'verifier-backed-outcome',
            check_result: 'passed',
        });
    }
    if (input.route.guards?.auto_merge === false &&
        (input.route.guards?.create_pr_only === true ||
            lowerState.includes('source pr/mr side effects are false') ||
            lowerState.includes('not write source pr comments') ||
            lowerState.includes('automatic routing must not') ||
            lowerState.includes('auto-merge is disabled'))) {
        addEvidenceMatch(checks.get('side-effect-boundary'), {
            orchestration_id: input.route.route_id,
            path: routePath,
            kind: 'side-effect-boundary',
            check_result: 'passed',
        });
    }
    if (input.route.recent_success_evidence.length > 0 ||
        lowerState.includes('real workflow-dispatch dogfood evidence:')) {
        addEvidenceMatch(checks.get('workflow-dispatch-dogfood'), {
            orchestration_id: input.route.route_id,
            path: statePath,
            kind: 'workflow-dispatch-dogfood',
            check_result: 'passed',
        });
    }
    return Array.from(checks.values());
}
async function collectDraftConsumerPromotionEvidence(input) {
    const checks = new Map([
        ['draft-request-carrier', emptyEvidenceCheck('draft-request-carrier', 'missing structured draft request carrier evidence')],
        ['draft-lifecycle', emptyEvidenceCheck('draft-lifecycle', 'missing draft request lifecycle evidence')],
        ['live-runner-evidence', emptyEvidenceCheck('live-runner-evidence', 'missing live runner draft-evidence/draft-pr/escalation-issue evidence')],
        ['reviewable-draft-outcome', emptyEvidenceCheck('reviewable-draft-outcome', 'missing reviewable draft-evidence or draft-pr outcome evidence')],
        ['side-effect-boundary', emptyEvidenceCheck('side-effect-boundary', 'missing proof that draft side effects do not tag, release, publish, or finalize changelog acceptance')],
        ['workflow-dispatch-dogfood', emptyEvidenceCheck('workflow-dispatch-dogfood', 'missing real workflow-dispatch dogfood evidence')],
    ]);
    const statePath = input.route.evidence_store || `zj-loop/${input.route.consumer}-state.md`;
    const stateText = await readTextFile(path.resolve(input.root, statePath));
    const lowerState = stateText.toLowerCase();
    const routePath = DEFAULT_ROUTE_TABLE_PATH;
    if (lowerState.includes('draft request') ||
        lowerState.includes('draft-request-candidate') ||
        input.route.recent_success_evidence.length > 0) {
        addEvidenceMatch(checks.get('draft-request-carrier'), {
            orchestration_id: input.route.route_id,
            path: statePath,
            kind: 'draft-request-carrier',
            check_result: 'passed',
        });
    }
    if (lowerState.includes('draft lifecycle') ||
        lowerState.includes('draft-request-candidate ->') ||
        lowerState.includes('draft request candidate')) {
        addEvidenceMatch(checks.get('draft-lifecycle'), {
            orchestration_id: input.route.route_id,
            path: statePath,
            kind: 'draft-lifecycle',
            check_result: 'passed',
        });
    }
    if (lowerState.includes('live runner') &&
        (lowerState.includes('draft-evidence') ||
            lowerState.includes('draft-pr') ||
            lowerState.includes('escalation-issue'))) {
        addEvidenceMatch(checks.get('live-runner-evidence'), {
            orchestration_id: input.route.route_id,
            path: statePath,
            schema: 'zj-loop.live_runner_evidence.v1',
            kind: 'live-runner-evidence',
            check_result: 'passed',
        });
    }
    if (lowerState.includes('reviewable draft outcome') &&
        (lowerState.includes('draft-evidence') || lowerState.includes('draft-pr'))) {
        addEvidenceMatch(checks.get('reviewable-draft-outcome'), {
            orchestration_id: input.route.route_id,
            path: statePath,
            kind: 'reviewable-draft-outcome',
            check_result: 'passed',
        });
    }
    if (input.route.guards?.tag_allowed === false &&
        input.route.guards?.release_allowed === false &&
        input.route.guards?.package_publish_allowed === false &&
        lowerState.includes('tag_created=false') &&
        lowerState.includes('release_created=false') &&
        lowerState.includes('package_published=false') &&
        lowerState.includes('final_changelog_acceptance=false')) {
        addEvidenceMatch(checks.get('side-effect-boundary'), {
            orchestration_id: input.route.route_id,
            path: routePath,
            kind: 'side-effect-boundary',
            check_result: 'passed',
        });
    }
    if (input.route.recent_success_evidence.length > 0 ||
        lowerState.includes('real workflow-dispatch dogfood evidence:')) {
        addEvidenceMatch(checks.get('workflow-dispatch-dogfood'), {
            orchestration_id: input.route.route_id,
            path: statePath,
            kind: 'workflow-dispatch-dogfood',
            check_result: 'passed',
        });
    }
    return Array.from(checks.values());
}
async function collectRoadmapActivationPromotionEvidence(input) {
    const checks = new Map([
        ['contract-plan', emptyEvidenceCheck('contract-plan', 'missing contract-plan review artifact')],
        ['provider-live-side-effect', emptyEvidenceCheck('provider-live-side-effect', 'missing completed provider live side effect evidence')],
        ['activation-lifecycle', emptyEvidenceCheck('activation-lifecycle', 'missing activation lifecycle evidence artifact')],
        ['post-merge-closeout-handoff', emptyEvidenceCheck('post-merge-closeout-handoff', 'missing post-merge closeout handoff artifact')],
    ]);
    const orchestrationPaths = await listOrchestrationEnvelopePaths(input);
    for (const envelopePath of orchestrationPaths) {
        const envelope = await readJsonObject(envelopePath.absolutePath);
        if (!isRoadmapActivationOrchestration(envelope))
            continue;
        const orchestrationId = stringField(envelope.orchestration_id) ?? envelopePath.orchestrationId;
        const adapter = objectField(envelope.consumer_adapter_result);
        const reviewArtifacts = arrayField(adapter?.review_artifacts);
        const storagePath = stringField(objectField(envelope.storage)?.path) ?? envelopePath.relativePath;
        const liveSideEffects = objectField(adapter?.live_side_effects);
        const contractArtifact = reviewArtifacts.find((artifact) => stringField(objectField(artifact)?.kind) === 'contract-plan');
        if (contractArtifact) {
            const artifactPath = stringField(objectField(contractArtifact)?.path);
            const schema = stringField(objectField(contractArtifact)?.schema);
            if (artifactPath && schema === 'zj-loop.consumer_adapter_result.v1' && await jsonPathExists(input.root, artifactPath)) {
                addEvidenceMatch(checks.get('contract-plan'), {
                    orchestration_id: orchestrationId,
                    path: artifactPath,
                    schema,
                    kind: 'contract-plan',
                    check_result: 'passed',
                });
            }
        }
        if (liveSideEffects?.attempted === true &&
            liveSideEffects.status === 'completed' &&
            typeof liveSideEffects.external_tool === 'string' &&
            typeof liveSideEffects.idempotency_key === 'string' &&
            objectField(liveSideEffects.review)?.url &&
            objectField(liveSideEffects.branch)?.name) {
            addEvidenceMatch(checks.get('provider-live-side-effect'), {
                orchestration_id: orchestrationId,
                path: storagePath,
                schema: 'zj-loop.consumer_adapter_result.v1',
                kind: 'provider-live-side-effect',
                check_result: 'passed',
            });
        }
        const lifecycleArtifact = reviewArtifacts.find((artifact) => stringField(objectField(artifact)?.kind) === 'activation-lifecycle');
        if (lifecycleArtifact) {
            const artifactPath = stringField(objectField(lifecycleArtifact)?.path);
            const schema = stringField(objectField(lifecycleArtifact)?.schema);
            const lifecycle = artifactPath ? await readJsonObject(path.resolve(input.root, artifactPath)) : null;
            if (artifactPath &&
                schema === 'zj-loop.activation_lifecycle_evidence.v1' &&
                typeof lifecycle?.activation_state === 'string' &&
                typeof lifecycle?.failure_class === 'string') {
                addEvidenceMatch(checks.get('activation-lifecycle'), {
                    orchestration_id: orchestrationId,
                    path: artifactPath,
                    schema,
                    kind: 'activation-lifecycle',
                    check_result: 'passed',
                });
            }
        }
        const closeoutArtifact = reviewArtifacts.find((artifact) => stringField(objectField(artifact)?.kind) === 'post-merge-closeout-handoff');
        if (closeoutArtifact) {
            const artifactPath = stringField(objectField(closeoutArtifact)?.path);
            const schema = stringField(objectField(closeoutArtifact)?.schema);
            const handoff = artifactPath ? await readJsonObject(path.resolve(input.root, artifactPath)) : null;
            if (artifactPath &&
                schema === 'zj-loop.post_merge_closeout_handoff.v1' &&
                typeof handoff?.provider === 'string' &&
                Array.isArray(objectField(handoff.dry_run_command)?.args) &&
                typeof objectField(handoff.live_closeout_command)?.available === 'boolean') {
                addEvidenceMatch(checks.get('post-merge-closeout-handoff'), {
                    orchestration_id: orchestrationId,
                    path: artifactPath,
                    schema,
                    kind: 'post-merge-closeout-handoff',
                    check_result: 'passed',
                });
            }
        }
    }
    return Array.from(checks.values());
}
function emptyEvidenceCheck(key, missingReason) {
    return {
        key,
        satisfied: false,
        matches: [],
        missing_reason: missingReason,
    };
}
function addEvidenceMatch(check, match) {
    if (!check)
        return;
    check.matches.push(match);
    check.satisfied = true;
    delete check.missing_reason;
}
async function listOrchestrationEnvelopePaths(input) {
    const baseRelative = 'zj-loop/orchestrations';
    if (input.orchestrationId) {
        const relativePath = `${baseRelative}/${input.orchestrationId}.json`;
        return [{
                absolutePath: path.resolve(input.root, relativePath),
                relativePath,
                orchestrationId: input.orchestrationId,
            }];
    }
    const base = path.resolve(input.root, baseRelative);
    let entries;
    try {
        entries = await readdir(base, { withFileTypes: true });
    }
    catch {
        return [];
    }
    return entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map((entry) => {
        const orchestrationId = entry.name.slice(0, -'.json'.length);
        const relativePath = `${baseRelative}/${entry.name}`;
        return {
            absolutePath: path.resolve(input.root, relativePath),
            relativePath,
            orchestrationId,
        };
    });
}
function isRoadmapActivationOrchestration(value) {
    if (!value)
        return false;
    const routeDecision = objectField(value.route_decision);
    const consumerAdapterResult = objectField(value.consumer_adapter_result);
    return (routeDecision?.route === 'roadmap-sliced-development' &&
        consumerAdapterResult?.route_id === 'roadmap-sliced-development');
}
async function jsonPathExists(root, relativePath) {
    return Boolean(await readJsonObject(path.resolve(root, relativePath)));
}
async function readJsonObject(filePath) {
    try {
        const parsed = JSON.parse(await readFile(filePath, 'utf8'));
        return objectField(parsed);
    }
    catch {
        return null;
    }
}
async function readTextFile(filePath) {
    try {
        return await readFile(filePath, 'utf8');
    }
    catch {
        return '';
    }
}
function objectField(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}
function arrayField(value) {
    return Array.isArray(value) ? value : [];
}
function stringField(value) {
    return typeof value === 'string' ? value : undefined;
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
function patchRouteMaturityRunnerText(text, input) {
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
    const maturityIndex = findKeyLineInBlock(lines, blockStart, blockEnd, 'maturity');
    if (maturityIndex === -1)
        return null;
    const runnerIndex = findKeyLineInBlock(lines, maturityIndex + 1, blockEnd, 'runner');
    if (runnerIndex === -1)
        return null;
    const runnerIndent = lines[runnerIndex].match(/^(\s*)/)?.[1] ?? `${itemIndent}    `;
    lines[runnerIndex] = `${runnerIndent}runner: ${input.runner}`;
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
        const statusWithoutAutomation = {
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
            evidence_store: route.evidence_store,
            readiness: readiness.readiness,
            readiness_reasons: readiness.reasons,
            install_ready: readiness.readiness === 'install-ready' || readiness.readiness === 'execution-ready',
            execution_ready: readiness.readiness === 'execution-ready',
            user_project_ready: readiness.readiness === 'install-ready' || readiness.readiness === 'execution-ready',
            section,
            destructive,
            side_effecting: sideEffecting,
            guards: route.guards ?? {},
        };
        return {
            ...statusWithoutAutomation,
            automation_model: buildRouteAutomationModel(statusWithoutAutomation),
        };
    });
}
export function buildRouteAutomationModel(route) {
    const blockedReasons = [];
    if (!route.enabled)
        blockedReasons.push('route disabled');
    if (!route.execution_ready)
        blockedReasons.push('route is not execution-ready');
    return {
        readiness: {
            level: route.readiness,
            install_ready: route.install_ready,
            execution_ready: route.execution_ready,
            user_project_ready: route.user_project_ready,
            reasons: route.readiness_reasons,
        },
        authorization: {
            route_enabled: route.enabled,
            dispatch_allowed: route.enabled,
            execution_allowed: route.enabled && route.execution_ready,
            required_confirmation: route.side_effecting && !route.enabled ? expectedConfirmationPhrase(route) : null,
            blocked_reasons: blockedReasons,
        },
    };
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
export function expectedMaturityPromotionPhrase(route, runner) {
    return `promote ${route.consumer} runner to ${runner}`;
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
