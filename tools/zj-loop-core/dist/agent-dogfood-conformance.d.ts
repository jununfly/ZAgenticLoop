export declare const AGENT_DOGFOOD_CONFORMANCE_SCHEMA: "zj-loop.agent_dogfood_conformance.v1";
export type AgentDogfoodFixture = {
    fixture_version: string;
    network_id: string;
    task_id: string;
    registry_snapshot: {
        revision: number;
        digest: string;
    };
    execution: {
        execution_id: string;
        attempt: number;
        commit_sha: string;
        approved_preflight_digest: string;
        registry_snapshot_digest: string;
        preflight_digest: string;
        process_status: 'completed' | 'failed' | 'cancelled' | 'timed-out';
        result_digest: string;
        verifier_status: 'passed' | 'blocked';
    };
    post_run_observation: {
        status: 'signed' | 'uncertain';
        execution_id: string;
        attempt: number;
        preflight_digest: string;
        proof_digest: string;
        registry_snapshot_digest: string;
        after_worktree_clean: boolean;
        after_network_policy_proved: boolean;
        after_credentials_clean: boolean;
        side_effects_detected: boolean;
        process_boundary: {
            kind: 'process-group' | 'job-object';
            process_group_id: string | null;
            job_object_id: string | null;
            child_process_count: number;
            all_descendants_terminated: boolean;
            termination_sequence_digest: string;
            orphan_processes_detected: boolean;
            unknown_descendants_detected: boolean;
        };
        signature: {
            algorithm: 'ECDSA-P256';
            public_key_pem: string;
            public_key_fingerprint: string;
            signature_base64: string;
        };
    };
    provider: {
        provider_id: string;
        adapter_version: string;
    };
    trusted_runner_registry: Array<{
        runner_id: string;
        public_key_fingerprint: string;
        status: 'active' | 'revoked';
    }>;
    environment: {
        proof_source: 'trusted-runner' | 'agent-self-report';
        proof_stage: 'pre-launch' | 'post-launch';
        runner_isolation: 'separate-process' | 'protected-sandbox' | 'same-process';
        network_policy: {
            mode: 'network-denied' | 'network-allowed';
            policy_digest: string;
            status: 'proved' | 'blocked';
            evidence_digest: string;
        };
        credentials: {
            status: 'clean' | 'blocked';
            evidence_digest: string;
        };
        trusted_runner: {
            runner_id: string;
            runner_version: string;
            execution_id: string;
            attempt: number;
            preflight_digest: string;
            registry_snapshot_digest: string;
            worktree_digest: string;
            network_policy: {
                mode: 'network-denied' | 'network-allowed';
                policy_digest: string;
                evidence_digest: string;
            };
            credential_evidence_digest: string;
            issued_at: string;
            expires_at: string;
            proof_digest: string;
            signature: {
                algorithm: 'ECDSA-P256';
                public_key_pem: string;
                public_key_fingerprint: string;
                signature_base64: string;
            };
        };
    };
    worktree: {
        before_clean: boolean;
        after_clean: boolean;
    };
    artifacts: {
        redaction_status: 'passed' | 'blocked';
        artifact_digests: string[];
    };
    review: {
        package_digest: string;
        decision: 'accepted' | 'rejected' | 'request-revision' | 'pending';
    };
    created_at: string;
};
export type AgentDogfoodConformanceReport = {
    schema: typeof AGENT_DOGFOOD_CONFORMANCE_SCHEMA;
    fixture_version: string;
    network_id: string;
    task_id: string;
    status: 'passed' | 'blocked';
    side_effects_executed: false;
    provider: AgentDogfoodFixture['provider'];
    execution: Pick<AgentDogfoodFixture['execution'], 'execution_id' | 'attempt' | 'commit_sha' | 'preflight_digest'>;
    phases: Array<{
        name: 'environment' | 'execution' | 'artifacts' | 'verification' | 'human-review';
        status: 'passed' | 'blocked';
        reason?: string;
    }>;
    blocking_reasons: string[];
    created_at: string;
    report_digest: string;
};
export declare function evaluateAgentDogfoodConformance(input: AgentDogfoodFixture): AgentDogfoodConformanceReport;
export declare function agentDogfoodConformanceDigest(report: AgentDogfoodConformanceReport): string;
export declare function createAgentDogfoodFixture(mode?: 'network-denied' | 'network-allowed'): AgentDogfoodFixture;
