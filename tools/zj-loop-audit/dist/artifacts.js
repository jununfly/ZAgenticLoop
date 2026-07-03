export const LOOP_ARTIFACTS = {
    directory: 'zj-loop',
    config: {
        primary: 'zj-loop/ZJ-LOOP.md',
        legacy: [],
    },
    state: {
        candidates: [
            'zj-loop/STATE.md',
            'zj-loop/pr-babysitter-state.md',
            'zj-loop/ci-sweeper-state.md',
            'zj-loop/post-merge-state.md',
            'zj-loop/dependency-sweeper-state.md',
            'zj-loop/changelog-drafter-state.md',
            'zj-loop/issue-triage-state.md',
            'zj-loop/roadmap-sliced-state.md',
        ],
    },
    budget: {
        primary: 'zj-loop/zj-loop-budget.md',
        legacy: [],
        template: 'zj-loop-budget.md.template',
    },
    runLog: {
        primary: 'zj-loop/zj-loop-run-log.md',
        legacy: [],
        template: 'zj-loop-run-log.md.template',
    },
    constraints: {
        primary: 'zj-loop/zj-loop-constraints.md',
        legacy: [],
        template: 'zj-loop-constraints.md',
    },
    skills: {
        budget: {
            primary: 'zj-loop-budget',
            legacy: [],
        },
        constraints: {
            primary: 'zj-loop-constraints',
            legacy: [],
        },
    },
};
export function artifactCandidates(artifact) {
    return [artifact.primary, ...artifact.legacy];
}
export function skillPathCandidates(skillNames) {
    return skillNames.flatMap((skillName) => [
        `skills/${skillName}/SKILL.md`,
        `.grok/skills/${skillName}/SKILL.md`,
        `.claude/skills/${skillName}/SKILL.md`,
        `.codex/skills/${skillName}/SKILL.md`,
    ]);
}
