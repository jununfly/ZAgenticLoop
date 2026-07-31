export declare const AGENT_REGISTRATION_SCHEMA: "zj-loop.agent_registration.v1";
export declare const AGENT_REGISTRATION_PROFILE: "opn-agent-registration-v1-2026-08";
export type AgentRegistration = {
    schema: typeof AGENT_REGISTRATION_SCHEMA;
    agent_id: string;
    display_name: string;
    capabilities: string[];
    accepted_task_kinds: string[];
    evidence_kinds: string[];
    protocol_version: string;
    identity_ref: string;
    registration_digest: string;
};
type AgentRegistrationInput = Omit<AgentRegistration, 'schema' | 'registration_digest'>;
export declare function createAgentRegistration(input: AgentRegistrationInput): AgentRegistration;
export declare function agentRegistrationDigest(value: AgentRegistration): string;
export declare function validateAgentRegistration(value: unknown): {
    status: 'valid';
} | {
    status: 'blocked';
    reason: string;
};
export {};
