export declare const WORKSPACE_CLOSEOUT_SCHEMA = "zj-loop.workspace_closeout.v1";
export declare const WORKSPACE_CLOSEOUT_CONFIRMATION_PHRASE = "ACCEPT_LOCAL_REVIEW_ARTIFACT";
export type WorkspaceCloseoutResult = {
    schema: typeof WORKSPACE_CLOSEOUT_SCHEMA;
    orchestration_id: string;
    status: 'completed' | 'resumable';
    carrier_path: string;
    archive_path?: string;
    review_manifest_path: string;
    closeout_record_path: string;
    reason: string;
    resume_command?: string[];
};
export declare function closeoutWorkspaceReview(input: {
    root: string;
    orchestrationId: string;
    confirmation?: string;
    now: string;
}): Promise<WorkspaceCloseoutResult>;
