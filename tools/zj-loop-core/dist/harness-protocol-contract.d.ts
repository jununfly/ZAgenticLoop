export declare const LOOP_HARNESS_OUTPUT_SCHEMA = "zj-loop.harness_output.v1";
export declare const LOOP_HARNESS_INPUT_SCHEMA = "zj-loop.harness_input.v1";
export declare const LOOP_RUN_METRICS_SCHEMA = "zj-loop.run_metrics.v1";
export declare const LOOP_HARNESS_SCHEMA_VERSION = 1;
export declare const LOOP_HARNESS_INPUT_ENVELOPE_TYPES: readonly ["slash_command", "fenced_protocol_block", "deterministic_cli_output"];
export declare const LOOP_HARNESS_INPUT_INTENTS: readonly ["run_route", "resume_loop", "confirm", "closeout"];
export declare const LOOP_HARNESS_OUTPUT_STATUSES: readonly ["continued", "stopped", "completed", "failed", "needs_confirmation"];
export declare const LOOP_HARNESS_NEXT_ACTION_TYPES: readonly ["continue_loop", "resume_loop", "request_confirmation", "create_review_artifact", "run_verification", "perform_closeout", "open_provider_link", "write_local_evidence", "stop"];
export type LoopHarnessOutputStatus = typeof LOOP_HARNESS_OUTPUT_STATUSES[number];
export type LoopHarnessNextActionType = typeof LOOP_HARNESS_NEXT_ACTION_TYPES[number];
export type LoopHarnessInputEnvelopeType = typeof LOOP_HARNESS_INPUT_ENVELOPE_TYPES[number];
export type LoopHarnessInputIntent = typeof LOOP_HARNESS_INPUT_INTENTS[number];
export type LoopHarnessProtocolInput = {
    schema: typeof LOOP_HARNESS_INPUT_SCHEMA;
    schema_version: typeof LOOP_HARNESS_SCHEMA_VERSION;
    envelope_type: LoopHarnessInputEnvelopeType | string;
    intent: LoopHarnessInputIntent | string;
    source: {
        kind?: string;
        id?: string;
        [key: string]: unknown;
    };
    payload: Record<string, unknown>;
    [key: string]: unknown;
};
export type LoopHarnessNextAction = {
    type: LoopHarnessNextActionType | string;
    target: string;
    label: string;
};
export type LoopHarnessProtocolOutput = {
    schema: typeof LOOP_HARNESS_OUTPUT_SCHEMA;
    schema_version: typeof LOOP_HARNESS_SCHEMA_VERSION;
    status: LoopHarnessOutputStatus | string;
    summary: string;
    next_actions: LoopHarnessNextAction[];
    evidence: unknown[];
    artifacts: unknown[];
    stop_signal?: unknown;
    confirmation?: unknown;
    resume?: unknown;
    [key: string]: unknown;
};
export type LoopRunMetrics = {
    schema: typeof LOOP_RUN_METRICS_SCHEMA;
    schema_version: typeof LOOP_HARNESS_SCHEMA_VERSION;
    run_id: string;
    human_handoff_count: number;
    location_switch_count: number;
    unnecessary_confirmation_count: number;
    ambiguous_natural_language_next_step_count: number;
    structured_stop_signal_count: number;
    signal_to_review_artifact_completed: boolean;
    post_merge_closeout_evidence_count: number;
    surfaces: string[];
};
export declare function validateLoopProtocolInput(input: unknown): {
    ok: boolean;
    errors: string[];
};
export declare function validateLoopProtocolOutput(output: unknown): {
    ok: boolean;
    errors: string[];
};
export declare function renderLoopProtocolOutputMarkdown(output: LoopHarnessProtocolOutput): string;
export declare function recordLoopRunMetrics(input: {
    run_id: string;
    outputs: LoopHarnessProtocolOutput[];
}): LoopRunMetrics;
