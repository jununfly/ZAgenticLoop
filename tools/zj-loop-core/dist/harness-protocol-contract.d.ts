export declare const LOOP_HARNESS_OUTPUT_SCHEMA = "zj-loop.harness_output.v1";
export declare const LOOP_HARNESS_INPUT_SCHEMA = "zj-loop.harness_input.v1";
export declare const LOOP_RUN_METRICS_SCHEMA = "zj-loop.run_metrics.v1";
export declare const LOOP_HARNESS_RUN_STATE_SCHEMA = "zj-loop.harness_run_state.v1";
export declare const LOOP_HARNESS_SCHEMA_VERSION = 1;
export declare const LOOP_HARNESS_INPUT_ENVELOPE_TYPES: readonly ["slash_command", "fenced_protocol_block", "deterministic_cli_output"];
export declare const LOOP_HARNESS_INPUT_INTENTS: readonly ["run_route", "resume_loop", "confirm", "closeout"];
export declare const LOOP_HARNESS_OUTPUT_STATUSES: readonly ["completed", "in_progress", "stopped", "failed", "skipped", "needs_protocol_repair"];
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
export type LoopHarnessProtocolInputDefaults = {
    run_id?: string;
    created_at?: string;
    max_slices?: number;
    evidence_target?: unknown;
    closeout_strategy?: unknown;
    resume_policy?: unknown;
    repo?: {
        provider?: string;
        owner?: string;
        name?: string;
        branch?: string;
        [key: string]: unknown;
    };
};
export type LoopProtocolRepairRequest = {
    missing_fields: string[];
    invalid_fields: string[];
    autofill_attempted: string[];
    safe_defaults_available: string[];
    required_human_input: string[];
    resume_envelope: {
        resume_id: string;
        original_input: unknown;
        next_safe_step: string;
    };
    next_command_hint: string;
};
export type LoopHarnessProtocolInputNormalization = {
    ok: true;
    input: LoopHarnessProtocolInput;
    autofill_attempted: string[];
    protocol_repair_request?: never;
} | {
    ok: false;
    input?: never;
    autofill_attempted: string[];
    protocol_repair_request: LoopProtocolRepairRequest;
};
export type LoopHarnessNextAction = {
    type: LoopHarnessNextActionType | string;
    target: string;
    label: string;
};
export type LoopHarnessProtocolOutput = {
    schema: typeof LOOP_HARNESS_OUTPUT_SCHEMA;
    schema_version: typeof LOOP_HARNESS_SCHEMA_VERSION;
    human_summary: string;
    machine_envelope: {
        status: LoopHarnessOutputStatus | string;
        run_id: string;
        route_id: string;
        consumer: string;
        completed_steps: string[];
        next_action: LoopHarnessNextAction;
        evidence: unknown[];
        artifacts: unknown[];
        stop_signal?: unknown;
        failure?: unknown;
        retry_policy?: unknown;
        protocol_repair_request?: unknown;
        resume?: unknown;
        closeout?: unknown;
        [key: string]: unknown;
    };
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
export type LoopHarnessRunStateRecord = {
    schema: typeof LOOP_HARNESS_RUN_STATE_SCHEMA;
    schema_version: typeof LOOP_HARNESS_SCHEMA_VERSION;
    run_id: string;
    source: {
        kind?: string;
        id?: string;
        [key: string]: unknown;
    };
    route_id: string;
    consumer: string;
    status: LoopHarnessOutputStatus | string;
    completed_steps: string[];
    resume_envelopes: unknown[];
    evidence: unknown[];
    artifacts: unknown[];
    storage: {
        local_path: string;
    };
};
export declare function validateLoopProtocolInput(input: unknown): {
    ok: boolean;
    errors: string[];
};
export declare function normalizeLoopProtocolInput(input: unknown, defaults?: LoopHarnessProtocolInputDefaults): LoopHarnessProtocolInputNormalization;
export declare function validateLoopProtocolOutput(output: unknown): {
    ok: boolean;
    errors: string[];
};
export declare function renderLoopProtocolOutputMarkdown(output: LoopHarnessProtocolOutput): string;
export declare function recordLoopRunMetrics(input: {
    run_id: string;
    outputs: LoopHarnessProtocolOutput[];
}): LoopRunMetrics;
export declare function buildHarnessRunStateRecord(input: {
    source: LoopHarnessRunStateRecord['source'];
    output: LoopHarnessProtocolOutput;
}): LoopHarnessRunStateRecord;
export declare function getHarnessRunStatePath(runId: string): string;
export declare function findHarnessResumeEnvelope(records: LoopHarnessRunStateRecord[], query: {
    resume_id?: string;
    source?: {
        kind?: string;
        id?: string;
    };
    route_id?: string;
    active_run_id?: string;
}): unknown | undefined;
