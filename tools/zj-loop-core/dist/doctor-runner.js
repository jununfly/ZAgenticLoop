import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
export async function buildLoopDoctorReport(input = {}) {
    const root = input.root ?? '.';
    const runs = await readRunStates(root, input.filters);
    const orchestrations = await readOrchestrations(root, input.filters);
    const runSummaries = runs.map(runSummary);
    const orchestrationSummaries = orchestrations.map(orchestrationSummary);
    const artifactIndex = [
        ...runs.flatMap(runArtifacts),
        ...orchestrations.flatMap(orchestrationArtifacts),
        ...await readOrchestrationChildArtifacts(root, orchestrations),
    ];
    const classifiedStopSignals = [
        ...runs.flatMap(classifyRunStopSignals),
        ...orchestrations.flatMap(classifyOrchestrationStopSignals),
    ];
    const findings = summarizeFindings({ runs, classifiedStopSignals });
    const report = {
        schema: 'zj-loop.diagnostic_report.v1',
        schema_version: 1,
        emit_signal: input.emitSignal === true,
        total_runs: runSummaries.length,
        summary: buildSummary({ runSummaries, orchestrationSummaries, classifiedStopSignals }),
        run_summaries: runSummaries,
        orchestration_summaries: orchestrationSummaries,
        artifact_index: artifactIndex,
        linked_items: buildLinkedItems({ runSummaries, orchestrationSummaries }),
        classified_stop_signals: classifiedStopSignals,
        findings,
    };
    if (input.emitSignal === true) {
        const { signal: _signal, ...diagnosticReport } = report;
        report.signal = {
            schema: 'zj-loop.signal.v1',
            source: 'zj-loop-doctor',
            diagnostic_report: diagnosticReport,
        };
    }
    return report;
}
async function readRunStates(root, filters) {
    const runsDir = path.resolve(root, 'zj-loop', 'runs');
    const states = [];
    for (const entry of await safeReaddir(runsDir)) {
        if (!entry.endsWith('.json'))
            continue;
        const relativePath = `zj-loop/runs/${entry}`;
        const value = JSON.parse(await readFile(path.join(runsDir, entry), 'utf8'));
        if (filters?.runId && value.run_id !== filters.runId)
            continue;
        if (filters?.orchestrationId || filters?.provider || filters?.subject)
            continue;
        states.push({ path: relativePath, value });
    }
    return states.sort((left, right) => left.path.localeCompare(right.path));
}
async function readOrchestrations(root, filters) {
    const orchestrationDir = path.resolve(root, 'zj-loop', 'orchestrations');
    const states = [];
    for (const entry of await safeReaddir(orchestrationDir)) {
        if (!entry.endsWith('.json'))
            continue;
        const relativePath = `zj-loop/orchestrations/${entry}`;
        const value = JSON.parse(await readFile(path.join(orchestrationDir, entry), 'utf8'));
        if (filters?.orchestrationId && value.orchestration_id !== filters.orchestrationId)
            continue;
        if (filters?.provider && value.signal?.provider !== filters.provider)
            continue;
        if (filters?.subject && subjectKey(value) !== filters.subject)
            continue;
        states.push({
            path: relativePath,
            artifactDir: `zj-loop/orchestrations/${entry.slice(0, -'.json'.length)}`,
            value,
        });
    }
    return states.sort((left, right) => left.path.localeCompare(right.path));
}
async function safeReaddir(dir) {
    try {
        return (await readdir(dir)).sort();
    }
    catch (err) {
        if (err.code === 'ENOENT')
            return [];
        throw err;
    }
}
function runSummary(run) {
    return {
        run_id: stringOr(run.value.run_id, path.basename(run.path, '.json')),
        route_id: stringOr(run.value.route_id ?? run.value.machine_envelope?.route_id, 'unknown'),
        status: stringOr(run.value.status ?? run.value.machine_envelope?.status, 'unknown'),
        updated_at: run.value.updated_at,
        stop_reason: runStopReason(run.value),
        evidence_count: Array.isArray(run.value.evidence) ? run.value.evidence.length : 0,
        artifact_count: Array.isArray(run.value.review_artifacts) ? run.value.review_artifacts.length : 0,
        source_ref: { path: run.path },
    };
}
function orchestrationSummary(orchestration) {
    const value = orchestration.value;
    return {
        orchestration_id: stringOr(value.orchestration_id, path.basename(orchestration.path, '.json')),
        route_id: stringOr(value.consumer_run_plan?.route_id ?? value.preflight_result?.route_id, 'unknown'),
        consumer: value.consumer_run_plan?.consumer,
        status: stringOr(value.status, 'unknown'),
        mode: value.mode,
        provider: value.signal?.provider,
        subject_kind: value.signal?.subject?.kind,
        subject_id: value.signal?.subject?.id,
        signal_id: value.signal?.signal_id,
        updated_at: value.updated_at,
        stop_reason: orchestrationStopReason(value),
        source_ref: { path: orchestration.path },
    };
}
function runArtifacts(run) {
    return [
        ...arrayOfRecords(run.value.evidence).map((artifact, index) => artifactFromRecord({
            record: artifact,
            fallbackKind: 'run-evidence',
            sourcePath: run.path,
            sourceField: `evidence[${index}]`,
            routeId: run.value.route_id,
        })),
        ...arrayOfRecords(run.value.review_artifacts).map((artifact, index) => artifactFromRecord({
            record: artifact,
            fallbackKind: 'run-review-artifact',
            sourcePath: run.path,
            sourceField: `review_artifacts[${index}]`,
            routeId: run.value.route_id,
        })),
    ];
}
function orchestrationArtifacts(orchestration) {
    const artifacts = [];
    const routeId = orchestration.value.consumer_run_plan?.route_id ?? orchestration.value.preflight_result?.route_id;
    if (orchestration.value.preflight_result) {
        artifacts.push({
            kind: 'runtime-preflight',
            path: orchestration.path,
            route_id: routeId,
            status: orchestration.value.preflight_result.status,
            source_ref: { path: orchestration.path, field: 'preflight_result' },
        });
    }
    if (orchestration.value.review_artifact?.path) {
        artifacts.push({
            kind: stringOr(orchestration.value.review_artifact.kind, 'review-artifact'),
            path: orchestration.value.review_artifact.path,
            route_id: routeId,
            source_ref: { path: orchestration.path, field: 'review_artifact' },
        });
    }
    for (const [index, artifact] of arrayOfRecords(orchestration.value.consumer_adapter_result?.review_artifacts).entries()) {
        artifacts.push(artifactFromRecord({
            record: artifact,
            fallbackKind: 'consumer-adapter-review-artifact',
            sourcePath: orchestration.path,
            sourceField: `consumer_adapter_result.review_artifacts[${index}]`,
            routeId,
        }));
    }
    return artifacts;
}
async function readOrchestrationChildArtifacts(root, orchestrations) {
    const artifacts = [];
    for (const orchestration of orchestrations) {
        const absoluteDir = path.resolve(root, orchestration.artifactDir);
        for (const entry of await safeReaddir(absoluteDir)) {
            if (!entry.endsWith('.json'))
                continue;
            artifacts.push({
                kind: 'orchestration-child-artifact',
                path: `${orchestration.artifactDir}/${entry}`,
                route_id: orchestration.value.consumer_run_plan?.route_id ?? orchestration.value.preflight_result?.route_id,
                source_ref: { path: `${orchestration.artifactDir}/${entry}`, field: '$' },
            });
        }
    }
    return artifacts;
}
function artifactFromRecord(input) {
    return {
        kind: stringOr(input.record.kind, input.fallbackKind),
        path: stringOr(input.record.path, input.sourcePath),
        route_id: stringOr(input.record.route_id, input.routeId ?? 'unknown'),
        status: typeof input.record.status === 'string' ? input.record.status : undefined,
        source_ref: { path: input.sourcePath, field: input.sourceField },
    };
}
function classifyRunStopSignals(run) {
    const reason = runStopReason(run.value);
    if (!reason)
        return [];
    return [classifyStopSignal({
            stopCode: reason,
            reason,
            nextSteps: [],
            sourcePath: run.path,
            sourceField: run.value.stop_signal?.reason ? 'stop_signal' : 'machine_envelope.stop_signal',
        })];
}
function classifyOrchestrationStopSignals(orchestration) {
    const value = orchestration.value;
    if (value.preflight_result?.stop_signal) {
        return [classifyStopSignal({
                stopCode: value.preflight_result.stop_signal.stop_code ?? value.preflight_result.stop_signal.reason,
                reason: stringOr(value.preflight_result.stop_signal.reason, 'runtime preflight hard stopped'),
                nextSteps: value.preflight_result.stop_signal.next_steps ?? [],
                sourcePath: orchestration.path,
                sourceField: 'preflight_result.stop_signal',
            })];
    }
    const reason = value.consumer_adapter_result?.stop_signal?.reason ?? value.stop_signal?.reason;
    if (!reason)
        return [];
    return [classifyStopSignal({
            stopCode: reason,
            reason,
            nextSteps: value.consumer_adapter_result?.stop_signal?.next_steps ?? value.stop_signal?.next_steps ?? [],
            sourcePath: orchestration.path,
            sourceField: value.consumer_adapter_result?.stop_signal ? 'consumer_adapter_result.stop_signal' : 'stop_signal',
        })];
}
function classifyStopSignal(input) {
    const stopCode = normalizeStopCode(input.stopCode ?? input.reason);
    const preset = stopSignalPreset(stopCode);
    return {
        stop_code: stopCode,
        category: preset.category,
        responsible_layer: preset.responsible_layer,
        severity: preset.severity,
        recoverability: preset.recoverability,
        reason: input.reason,
        next_actions: input.nextSteps.length > 0
            ? input.nextSteps.map((step) => ({ type: preset.next_action_type, label: step }))
            : [{ type: preset.next_action_type, label: preset.default_next_action }],
        source_ref: {
            path: input.sourcePath,
            field: input.sourceField,
        },
    };
}
function stopSignalPreset(stopCode) {
    if (stopCode === 'ambiguous-route') {
        return {
            category: 'routing',
            responsible_layer: 'route-decision',
            severity: 'warning',
            recoverability: 'choose_route',
            next_action_type: 'choose_route',
            default_next_action: 'Rerun with an explicit --route value.',
        };
    }
    if (stopCode === 'credential-missing' || stopCode === 'actor-role-insufficient') {
        return {
            category: 'authorization',
            responsible_layer: 'preflight',
            severity: 'blocked',
            recoverability: 'human_action_required',
            next_action_type: 'provide_authorization',
            default_next_action: 'Provide the required credential or actor role.',
        };
    }
    if (stopCode === 'max-work-units-exceeded') {
        return {
            category: 'budget',
            responsible_layer: 'preflight',
            severity: 'blocked',
            recoverability: 'human_action_required',
            next_action_type: 'adjust_budget',
            default_next_action: 'Reduce requested work units or raise the configured limit.',
        };
    }
    if (stopCode === 'dirty-workspace-conflict') {
        return {
            category: 'workspace',
            responsible_layer: 'preflight',
            severity: 'blocked',
            recoverability: 'human_action_required',
            next_action_type: 'clean_workspace',
            default_next_action: 'Commit, stash, or remove overlapping workspace changes.',
        };
    }
    if (stopCode === 'needs-protocol-repair') {
        return {
            category: 'protocol',
            responsible_layer: 'harness',
            severity: 'warning',
            recoverability: 'resume_available',
            next_action_type: 'repair_protocol',
            default_next_action: 'Provide the missing protocol fields and resume.',
        };
    }
    return {
        category: 'execution',
        responsible_layer: 'consumer',
        severity: 'info',
        recoverability: 'inspect_required',
        next_action_type: 'inspect_evidence',
        default_next_action: 'Inspect the referenced evidence before retrying.',
    };
}
function summarizeFindings(input) {
    const routeAmbiguity = input.classifiedStopSignals.filter((signal) => signal.stop_code === 'ambiguous-route').length;
    const protocolRepair = input.runs.filter((run) => run.value.status === 'needs_protocol_repair'
        || run.value.machine_envelope?.status === 'needs_protocol_repair'
        || run.value.machine_envelope?.protocol_repair_request !== undefined).length;
    const hardStop = input.classifiedStopSignals.filter((signal) => signal.stop_code !== 'ambiguous-route').length;
    const findings = [];
    if (routeAmbiguity > 0) {
        findings.push({
            kind: 'route-ambiguity',
            count: routeAmbiguity,
            severity: 'warning',
            recommendation: 'Prefer explicit --route or improve deterministic resolver rules for repeated ambiguous goals.',
        });
    }
    if (protocolRepair > 0) {
        findings.push({
            kind: 'protocol-repair',
            count: protocolRepair,
            severity: 'warning',
            recommendation: 'Review repeated protocol repair requests and promote safe defaults into deterministic normalization.',
        });
    }
    if (hardStop > 0) {
        findings.push({
            kind: 'hard-stop',
            count: hardStop,
            severity: 'info',
            recommendation: 'Inspect classified_stop_signals and decide whether route contracts, permissions, budgets, or verifier requirements need adjustment.',
        });
    }
    return findings;
}
function buildSummary(input) {
    const allStatuses = [
        ...input.runSummaries.map((run) => ({ status: run.status, updated_at: run.updated_at })),
        ...input.orchestrationSummaries.map((orchestration) => ({ status: orchestration.status, updated_at: orchestration.updated_at })),
    ].sort((left, right) => stringOr(right.updated_at, '').localeCompare(stringOr(left.updated_at, '')));
    return {
        total_runs: input.runSummaries.length,
        total_orchestrations: input.orchestrationSummaries.length,
        latest_status: allStatuses[0]?.status ?? 'none',
        open_stop_signals_count: input.classifiedStopSignals.length,
        recent_success_count: allStatuses.filter((item) => item.status === 'completed' || item.status === 'executed_to_review_artifact').length,
        route_health: healthByRoute(input),
        provider_health: healthByProvider(input.orchestrationSummaries),
        last_updated_at: allStatuses[0]?.updated_at,
        recommended_next_actions: input.classifiedStopSignals.slice(0, 5).map((signal) => signal.next_actions[0]?.label ?? signal.reason),
    };
}
function healthByRoute(input) {
    const rows = new Map();
    for (const item of [...input.runSummaries, ...input.orchestrationSummaries]) {
        const row = rows.get(item.route_id) ?? { route_id: item.route_id, total: 0, stopped: 0, latest_status: item.status };
        row.total++;
        if (item.status === 'stopped' || item.status === 'hard_stopped' || item.stop_reason)
            row.stopped++;
        if (!row.latest || stringOr(item.updated_at, '').localeCompare(row.latest) > 0) {
            row.latest = item.updated_at;
            row.latest_status = item.status;
        }
        rows.set(item.route_id, row);
    }
    return [...rows.values()]
        .sort((left, right) => left.route_id.localeCompare(right.route_id))
        .map(({ latest: _latest, ...row }) => row);
}
function healthByProvider(orchestrations) {
    const rows = new Map();
    for (const item of orchestrations) {
        const provider = item.provider ?? 'none';
        const row = rows.get(provider) ?? { provider, total: 0, stopped: 0, latest_status: item.status };
        row.total++;
        if (item.status === 'hard_stopped' || item.stop_reason)
            row.stopped++;
        if (!row.latest || stringOr(item.updated_at, '').localeCompare(row.latest) > 0) {
            row.latest = item.updated_at;
            row.latest_status = item.status;
        }
        rows.set(provider, row);
    }
    return [...rows.values()]
        .sort((left, right) => left.provider.localeCompare(right.provider))
        .map(({ latest: _latest, ...row }) => row);
}
function buildLinkedItems(input) {
    return [
        ...input.runSummaries.map((run) => ({
            route_id: run.route_id,
            run_id: run.run_id,
        })),
        ...input.orchestrationSummaries.map((orchestration) => ({
            provider: orchestration.provider,
            subject_kind: orchestration.subject_kind,
            subject_id: orchestration.subject_id,
            route_id: orchestration.route_id,
            signal_id: orchestration.signal_id,
            orchestration_id: orchestration.orchestration_id,
        })),
    ];
}
function runStopReason(run) {
    return run.stop_signal?.reason ?? run.machine_envelope?.stop_signal?.reason;
}
function orchestrationStopReason(orchestration) {
    return orchestration.preflight_result?.stop_signal?.reason
        ?? orchestration.consumer_adapter_result?.stop_signal?.reason
        ?? orchestration.stop_signal?.reason;
}
function subjectKey(orchestration) {
    const kind = orchestration.signal?.subject?.kind;
    const id = orchestration.signal?.subject?.id;
    return kind && id ? `${kind}:${id}` : undefined;
}
function normalizeStopCode(value) {
    const trimmed = value.trim();
    if (!trimmed)
        return 'unknown-stop';
    if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmed))
        return trimmed;
    if (/missing required credential/i.test(trimmed))
        return 'credential-missing';
    if (/ambiguous-route/i.test(trimmed))
        return 'ambiguous-route';
    if (/protocol/i.test(trimmed) && /repair/i.test(trimmed))
        return 'needs-protocol-repair';
    if (/dirty workspace/i.test(trimmed))
        return 'dirty-workspace-conflict';
    return trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown-stop';
}
function arrayOfRecords(value) {
    return Array.isArray(value)
        ? value.filter((item) => typeof item === 'object' && item !== null && !Array.isArray(item))
        : [];
}
function stringOr(value, fallback) {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}
