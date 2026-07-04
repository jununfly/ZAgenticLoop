export declare const LOOP_ARTIFACTS: {
    readonly directory: "zj-loop";
    readonly config: {
        readonly primary: "zj-loop/ZJ-LOOP.md";
        readonly legacy: readonly [];
    };
    readonly state: {
        readonly candidates: readonly ["zj-loop/STATE.md", "zj-loop/pr-steward-state.md", "zj-loop/ci-sweeper-state.md", "zj-loop/post-merge-state.md", "zj-loop/dependency-sweeper-state.md", "zj-loop/changelog-drafter-state.md", "zj-loop/issue-triage-state.md", "zj-loop/roadmap-sliced-state.md"];
    };
    readonly budget: {
        readonly primary: "zj-loop/zj-loop-budget.md";
        readonly legacy: readonly [];
        readonly template: "zj-loop-budget.md.template";
    };
    readonly runLog: {
        readonly primary: "zj-loop/zj-loop-run-log.md";
        readonly legacy: readonly [];
        readonly template: "zj-loop-run-log.md.template";
    };
    readonly constraints: {
        readonly primary: "zj-loop/zj-loop-constraints.md";
        readonly legacy: readonly [];
        readonly template: "zj-loop-constraints.md";
    };
    readonly skills: {
        readonly budget: {
            readonly primary: "zj-loop-budget";
            readonly legacy: readonly [];
        };
        readonly constraints: {
            readonly primary: "zj-loop-constraints";
            readonly legacy: readonly [];
        };
    };
};
export declare function artifactCandidates<T extends {
    primary: string;
    legacy: readonly string[];
}>(artifact: T): string[];
export declare function skillPathCandidates(skillNames: readonly string[]): string[];
