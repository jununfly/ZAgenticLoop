import { buildCompletionEvidence } from './completion-evidence.js';
export function buildGitLabCompletionEvidence(input) {
    const artifact = input.artifact;
    const currentHeadSha = input.pipeline.sha ?? 'not-provided';
    return buildCompletionEvidence({
        orchestrationId: input.orchestrationId,
        signalId: input.signalId,
        routeId: input.routeId,
        requestId: input.requestId,
        carrier: input.carrier,
        consumerId: input.consumerId,
        currentHeadSha,
        status: artifact ? 'executed_to_review_artifact' : 'hard_stopped',
        reviewArtifact: artifact ? {
            kind: 'gitlab-job-artifact',
            path: artifact.path,
            ...(artifact.schema ? { schema: artifact.schema } : {}),
        } : null,
        stopReason: artifact ? null : 'scheduled-artifact-missing',
        evidenceRefs: [
            { kind: 'gitlab-pipeline', url: input.pipeline.web_url ?? undefined },
            { kind: 'gitlab-job', url: input.job.web_url ?? undefined },
            ...(artifact ? [{ kind: 'gitlab-artifact', path: artifact.path }] : []),
        ],
        provenance: {
            provider: 'gitlab',
            project: input.infraProvenance.project_path,
            pipeline_id: String(input.pipeline.id),
            pipeline_url: input.pipeline.web_url,
            job_id: String(input.job.id),
            job_url: input.job.web_url,
            commit: currentHeadSha,
            ref: input.pipeline.ref,
            artifact: artifact?.path ?? null,
            artifact_schema: artifact?.schema ?? null,
            infra_contract: input.infraProvenance.contract,
            infra_version: input.infraProvenance.infra_version,
            gitlab_version: input.infraProvenance.gitlab_version,
            capabilities: input.infraProvenance.capabilities,
        },
        sideEffectsExecuted: false,
    });
}
