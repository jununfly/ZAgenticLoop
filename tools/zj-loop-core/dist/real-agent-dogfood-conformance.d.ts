import type { ContentAddressedEvidenceStore } from './content-addressed-evidence-store.js';
export declare const REAL_AGENT_DOGFOOD_CONFORMANCE_SCHEMA: "zj-loop.real_agent_dogfood_conformance_evidence.v1";
export declare const REAL_AGENT_DOGFOOD_CONFORMANCE_DIGEST_PROFILE: "zj-loop.real-agent-dogfood-conformance.v1";
export declare const REAL_AGENT_DOGFOOD_CONFORMANCE_COMMAND: readonly ["npm", "test"];
export declare const REAL_AGENT_DOGFOOD_FAILURE_MATRIX_DIGEST: string;
export type RealAgentDogfoodConformanceEvidence = {
    schema: typeof REAL_AGENT_DOGFOOD_CONFORMANCE_SCHEMA;
    status: 'passed' | 'blocked';
    plan_digest: string;
    core_commit: string;
    package_root: string;
    test_command: readonly string[];
    failure_matrix_digest: string;
    digest_profile: typeof REAL_AGENT_DOGFOOD_CONFORMANCE_DIGEST_PROFILE;
    exit_code: number;
    output_digest: string;
    side_effects_executed: false;
};
export declare function generateRealAgentDogfoodConformanceEvidence(input: {
    repo_root: string;
    plan_digest: string;
    evidenceStore: Pick<ContentAddressedEvidenceStore, 'put'>;
    run?: (cwd: string, command: readonly string[]) => Promise<{
        exit_code: number;
        stdout: string;
        stderr: string;
    }>;
    git_head?: (cwd: string) => Promise<string>;
}): Promise<{
    status: 'passed' | 'blocked';
    evidence_digest: string;
    evidence: RealAgentDogfoodConformanceEvidence;
}>;
