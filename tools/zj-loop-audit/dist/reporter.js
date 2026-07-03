const LEVEL_BADGE_COLORS = {
    L0: '6e7681',
    L1: 'd29922',
    L2: '58a6ff',
    L3: '3ee8c5',
};
const SHOWCASE_URL = 'https://jununfly.github.io/ZAgenticLoop/';
/** Markdown badge for README — paste output from `zj-loop-audit . --badge`. */
export function formatBadge(r) {
    const color = LEVEL_BADGE_COLORS[r.level];
    const label = encodeURIComponent(`${r.level} (${r.score}/100)`).replace(/%20/g, '_');
    const badgeUrl = `https://img.shields.io/badge/Loop_Ready-${label}-${color}?style=flat-square`;
    return `[![Loop Ready ${r.level} (${r.score}/100)](${badgeUrl})](${SHOWCASE_URL})`;
}
export function formatHuman(r) {
    const lines = [];
    const gateReasons = inferLevelGateReasons(r);
    lines.push('');
    lines.push(`Loop Readiness Audit — ${r.target}`);
    lines.push('═'.repeat(50));
    lines.push(`Score: ${r.score}/100  Level: ${r.level}`);
    if (gateReasons.length) {
        lines.push(`Level gate: ${r.level} because ${gateReasons.join('; ')}.`);
    }
    lines.push(r.assessment);
    lines.push('');
    lines.push('Findings:');
    for (const f of r.findings) {
        const icon = f.level === 'ok' ? '✓' : f.level === 'warn' ? '!' : '✗';
        lines.push(`  ${icon} ${f.message}`);
    }
    if (r.recommendations.length) {
        lines.push('');
        lines.push('Recommendations:');
        for (const rec of r.recommendations) {
            lines.push(`  → ${rec}`);
        }
    }
    lines.push('');
    lines.push('Docs: docs/loop-design-checklist.md');
    lines.push('Tip: rerun with --suggest for context-aware next actions.');
    lines.push('');
    return lines.join('\n');
}
export function formatJson(r) {
    return JSON.stringify(r, null, 2);
}
export function formatMarkdown(r) {
    const lines = [];
    const gateReasons = inferLevelGateReasons(r);
    lines.push('# Loop Readiness Report');
    lines.push('');
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Target | \`${r.target}\` |`);
    lines.push(`| Score | **${r.score}/100** |`);
    lines.push(`| Level | ${r.level} |`);
    if (gateReasons.length) {
        lines.push(`| Level Gate | ${gateReasons.join('; ')} |`);
    }
    lines.push(`| Assessment | ${r.assessment} |`);
    lines.push('');
    lines.push('## Findings');
    lines.push('');
    for (const f of r.findings) {
        lines.push(`- **${f.level}**: ${f.message}`);
    }
    if (r.recommendations.length) {
        lines.push('');
        lines.push('## Recommendations');
        lines.push('');
        for (const rec of r.recommendations) {
            lines.push(`- ${rec}`);
        }
    }
    return lines.join('\n');
}
export function inferLevelGateReasons(r) {
    const reasons = [];
    const { signals } = r;
    if (r.level === 'L0' && r.score >= 38 && !signals.stateFile.present) {
        reasons.push('hard gate failed: no recognized state file');
    }
    if ((r.level === 'L0' || r.level === 'L1') && r.score >= 58 && !signals.triage.present) {
        reasons.push('hard gate failed: no triage skill detected');
    }
    if (r.level !== 'L3' && r.score >= 78) {
        if (!signals.verifier.present)
            reasons.push('L3 gate failed: verifier missing');
        if (!signals.stateFile.present)
            reasons.push('L3 gate failed: no recognized state file');
        if (!signals.cost.budgetDoc || !signals.cost.runLog || !signals.cost.loopMdBudget) {
            reasons.push('L3 gate failed: cost observability incomplete');
        }
        if (!signals.loopActivity.present)
            reasons.push('L3 gate failed: no proven loop activity');
    }
    return reasons;
}
