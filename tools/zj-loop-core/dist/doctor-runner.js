import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
export async function buildLoopDoctorReport(input = {}) {
    const runs = await readRunStates(input.root ?? '.');
    const findings = summarizeFindings(runs);
    const report = {
        schema: 'zj-loop.diagnostic_report.v1',
        schema_version: 1,
        emit_signal: input.emitSignal === true,
        total_runs: runs.length,
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
async function readRunStates(root) {
    const runsDir = path.resolve(root, 'zj-loop', 'runs');
    let entries;
    try {
        entries = await readdir(runsDir);
    }
    catch (err) {
        if (err.code === 'ENOENT')
            return [];
        throw err;
    }
    const states = [];
    for (const entry of entries) {
        if (!entry.endsWith('.json'))
            continue;
        const text = await readFile(path.join(runsDir, entry), 'utf8');
        states.push(JSON.parse(text));
    }
    return states;
}
function summarizeFindings(runs) {
    const routeAmbiguity = runs.filter((run) => stopReason(run) === 'ambiguous-route').length;
    const protocolRepair = runs.filter((run) => run.status === 'needs_protocol_repair'
        || run.machine_envelope?.status === 'needs_protocol_repair'
        || run.machine_envelope?.protocol_repair_request !== undefined).length;
    const hardStop = runs.filter((run) => (run.status === 'stopped' || run.machine_envelope?.status === 'stopped')
        && stopReason(run) !== 'ambiguous-route').length;
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
            recommendation: 'Inspect stop_signal reasons and decide whether route contracts, permissions, budgets, or verifier requirements need adjustment.',
        });
    }
    return findings;
}
function stopReason(run) {
    return run.stop_signal?.reason ?? run.machine_envelope?.stop_signal?.reason;
}
