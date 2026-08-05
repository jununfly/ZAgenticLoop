import type { ContentAddressedEvidenceStore } from './content-addressed-evidence-store.js';
import { type RealAgentDogfoodGraphPlan } from './real-agent-dogfood-graph-orchestrator.js';
export type RealAgentDogfoodPreflightCheck = {
    id: string;
    status: 'passed' | 'blocked';
    reason?: string;
};
export type RealAgentDogfoodPreflightResult = {
    schema: 'zj-loop.real_agent_dogfood_preflight.v1';
    status: 'execution-ready' | 'blocked';
    side_effects_executed: false;
    plan_digest: string;
    plan_definition_digest: string;
    checks: RealAgentDogfoodPreflightCheck[];
    preflight_digest: string;
};
export declare function preflightRealAgentDogfood(input: {
    plan: RealAgentDogfoodGraphPlan;
    repo_root: string;
    evidence_store: Pick<ContentAddressedEvidenceStore, 'readOnly'>;
    conformance_evidence_digest: string;
    provider_id: string;
    provider_executable: string;
    provider_runtime_ipc: {
        socket_path: string;
        contract_digest: string;
    };
    human: {
        human_id: string;
        key_tag: string;
        helper_path: string;
    };
    platform?: NodeJS.Platform;
}): Promise<RealAgentDogfoodPreflightResult>;
