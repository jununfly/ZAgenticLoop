export declare const CODEX_JSONL_PARSE_SCHEMA: "zj-loop.codex_jsonl_parse.v1";
export declare const AGENT_TASK_RESULT_SCHEMA: "zj-loop.agent_task_result.v1";
export type AgentTaskResult = {
    schema: typeof AGENT_TASK_RESULT_SCHEMA;
    status: 'completed';
    summary: string;
    claims: string[];
    file_refs: Array<{
        repository: string;
        commit: string;
        path: string;
        start_line: number;
        end_line: number;
        content_sha256: string;
    }>;
    evidence_refs: string[];
};
type CodexEvent = {
    type: string;
    id: string;
    sequence: number;
    data: Record<string, unknown>;
};
export type CodexJsonlParseResult = {
    schema: typeof CODEX_JSONL_PARSE_SCHEMA;
    status: 'completed';
    events: CodexEvent[];
    event_stream_digest: string;
    task_result: AgentTaskResult;
    final_message: string;
} | {
    schema: typeof CODEX_JSONL_PARSE_SCHEMA;
    status: 'blocked';
    reason: string;
    events: CodexEvent[];
};
export type CodexJsonlParserOptions = {
    max_line_bytes?: number;
    max_events?: number;
    max_json_depth?: number;
    max_object_fields?: number;
    max_string_bytes?: number;
    max_task_result_bytes?: number;
};
export declare function parseCodexJsonl(input: string, provided?: CodexJsonlParserOptions): CodexJsonlParseResult;
export {};
