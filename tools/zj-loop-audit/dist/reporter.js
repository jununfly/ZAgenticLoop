const LEVEL_BADGE_COLORS = {
    L0: '6e7681',
    L1: 'd29922',
    L2: '58a6ff',
    L3: '3ee8c5',
};
const SHOWCASE_URL = 'https://jununfly.github.io/ZAgenticLoop/';
const CATEGORY_LABELS = {
    pass: 'Pass',
    blocker: 'Blockers',
    'readiness-gap': 'Readiness gaps',
    hardening: 'Hardening',
    'future-tooling': 'Future tooling',
};
const CATEGORY_ORDER = ['blocker', 'readiness-gap', 'hardening', 'future-tooling', 'pass'];
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
    for (const category of CATEGORY_ORDER) {
        const findings = findingsByCategory(r.findings, category);
        if (!findings.length)
            continue;
        lines.push(`  ${CATEGORY_LABELS[category]}:`);
        for (const f of findings) {
            const icon = f.level === 'ok' ? '✓' : f.level === 'warn' ? '!' : '✗';
            lines.push(`    ${icon} ${f.message} (${formatScoreImpact(f)})`);
        }
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
    for (const category of CATEGORY_ORDER) {
        const findings = findingsByCategory(r.findings, category);
        if (!findings.length)
            continue;
        lines.push(`### ${CATEGORY_LABELS[category]}`);
        lines.push('');
        for (const f of findings) {
            lines.push(`- **${f.level}** (${formatScoreImpact(f)}): ${f.message}`);
        }
        lines.push('');
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
export function formatSuggestionGroups(r) {
    const actionableFindings = r.findings.filter((finding) => {
        return finding.category !== 'pass' && finding.nextSteps.length > 0;
    });
    const lines = [
        '',
        '=== Suggested actions ===',
        'Grouped by product category. Each item states whether it affects the readiness score.',
        '',
    ];
    for (const category of CATEGORY_ORDER) {
        if (category === 'pass')
            continue;
        const findings = findingsByCategory(actionableFindings, category);
        if (!findings.length)
            continue;
        lines.push(`${CATEGORY_LABELS[category]}:`);
        for (const finding of findings) {
            lines.push(`  - ${finding.message}`);
            lines.push(`    Score impact: ${formatScoreImpact(finding)}.`);
            for (const step of finding.nextSteps) {
                lines.push(...formatNextStep(step).map((line) => `    ${line}`));
            }
        }
        lines.push('');
    }
    if (lines.length === 4) {
        lines.push('  No missing scaffold artifacts detected. Review warnings above for policy edits or runtime evidence.');
        lines.push('');
    }
    lines.push('Docs: docs/loop-design-checklist.md and docs/operating-loops.md');
    return lines.join('\n');
}
function findingsByCategory(findings, category) {
    return findings.filter((finding) => finding.category === category);
}
function formatScoreImpact(finding) {
    if (finding.category === 'pass')
        return 'score satisfied';
    return finding.affectsScore ? 'affects score/level' : 'does not affect score';
}
function formatNextStep(step) {
    if (step.kind === 'command')
        return [`→ ${step.label}`, `  ${step.command}`];
    if (step.kind === 'validate')
        return [`✓ ${step.label}`, `  ${step.command}`];
    if (step.kind === 'manual-review')
        return [`• ${step.label}`];
    return [`i ${step.label}`];
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
