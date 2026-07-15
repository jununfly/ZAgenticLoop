export declare const WORKSPACE_CHANGED_FILES_SCHEMA = "zj-loop.workspace_changed_files.v1";
export type WorkspaceReviewCapture = {
    status: 'executed_to_review_artifact';
    patch_path: string;
    changed_files_path: string;
    changed_files: string[];
    branch: string;
    head_sha: string;
} | {
    status: 'hard_stopped';
    reason: string;
    next_steps: string[];
};
export declare function captureWorkspaceReviewArtifacts(input: {
    root: string;
    orchestrationId: string;
    carrierPath: string;
    now: string;
}): Promise<WorkspaceReviewCapture>;
