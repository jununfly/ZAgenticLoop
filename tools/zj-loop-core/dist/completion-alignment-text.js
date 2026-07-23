export const COMPLETION_ALIGNMENT_TEXT_SCHEMA = 'zj-loop.completion-alignment-text.v1';
export function renderCompletionAlignmentText(ledger) {
    const completed = ledger.cells.filter((cell) => cell.status === 'complete' || cell.status === 'not-applicable-with-reason');
    const blocked = ledger.cells.filter((cell) => cell.status === 'blocked' || cell.status === 'stale');
    const architectureReview = ledger.cells.filter((cell) => cell.gates.architecture_integrity !== 'pass');
    const actions = ledger.cells.flatMap((cell) => cell.next_actions.map((action) => ({ cell, action })));
    const lines = [
        `schema: ${COMPLETION_ALIGNMENT_TEXT_SCHEMA}`,
        `target: ${ledger.target.id}`,
        `status: ${overallStatus(ledger)}`,
        '',
        'summary:',
        ...Object.entries(ledger.summary).map(([status, count]) => `  ${status}: ${count}`),
        '',
        'completed:',
        ...formatCells(completed),
        '',
        'blocked_or_stale:',
        ...formatCells(blocked),
        '',
        'architecture_review_required:',
        ...formatCells(architectureReview),
        '',
        'next_actions:',
        ...formatActions(actions),
    ];
    return `${lines.join('\n')}\n`;
}
function overallStatus(ledger) {
    if (ledger.summary.stale > 0)
        return 'stale';
    if (ledger.summary.blocked > 0)
        return 'blocked';
    if (ledger.summary.incomplete > 0 || ledger.summary.unsupported > 0)
        return 'incomplete';
    return 'complete';
}
function formatCells(cells) {
    if (cells.length === 0)
        return ['  - none'];
    return cells.map((cell) => {
        const reason = cell.not_applicable_reason ? ` reason=${cell.not_applicable_reason}` : '';
        return `  - ${cell.route_id}:${cell.adapter_id} status=${cell.status}${reason}`;
    });
}
function formatActions(actions) {
    if (actions.length === 0)
        return ['  - none'];
    return actions.map(({ cell, action }) => `  - ${cell.route_id}:${cell.adapter_id} type=${action.type} target=${action.target} label=${action.label}`);
}
