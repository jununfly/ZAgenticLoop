import { createHash } from 'node:crypto';
import { buildHumanHandoff, HumanHandoff } from './human-handoff.js';

export const GITLAB_CONTROL_ROUTE_EVIDENCE_SCHEMA = 'zj-loop.gitlab_control_route_evidence.v1';
export const GITLAB_CONTROL_SIGNAL_SOURCE = 'gitlab-protocol';
export const GITLAB_CONTROL_ROUTES = ['human', 'ignore'] as const;

type ControlRouteId = typeof GITLAB_CONTROL_ROUTES[number];

export type GitLabControlRouteEvidenceInput = {
  projectPath: string;
  orchestrationId: string;
  routeId: string;
  reason: string;
  signal: {
    source: string;
    signal_id: string;
    project: string;
  };
  requestedSideEffect?: string;
};

export type GitLabControlRouteEvidence = {
  schema: typeof GITLAB_CONTROL_ROUTE_EVIDENCE_SCHEMA;
  status: 'completed' | 'blocked';
  reason?: string;
  route_id: string;
  provider: 'gitlab';
  project: string;
  signal: GitLabControlRouteEvidenceInput['signal'];
  outcome?: 'human-handoff' | 'suppressed';
  side_effects_executed: false;
  artifact: HumanHandoff | Record<string, unknown> | null;
  recovery: {
    status: 'resumable' | 'new-request';
    resume_command: string[];
  };
  verification: {
    passed: boolean;
    checks: string[];
  };
  compatibility_fingerprint: string;
  next_steps: string[][];
};

export function buildGitLabControlRouteEvidence(input: GitLabControlRouteEvidenceInput): GitLabControlRouteEvidence {
  const base = {
    route_id: input.routeId,
    provider: 'gitlab' as const,
    project: input.projectPath,
    signal: input.signal,
  };
  const resumeCommand = ['zj-loop-dispatch', '--orchestration', input.orchestrationId, '--mode', 'resume'];
  const fingerprint = compatibilityFingerprint({
    route_id: input.routeId,
    provider: 'gitlab',
    project: input.projectPath,
    signal: input.signal,
    reason: input.reason,
    requested_side_effect: input.requestedSideEffect ?? null,
  });
  const blocked = (reason: string, checks: string[]): GitLabControlRouteEvidence => ({
    schema: GITLAB_CONTROL_ROUTE_EVIDENCE_SCHEMA,
    status: 'blocked',
    reason,
    ...base,
    side_effects_executed: false,
    artifact: null,
    recovery: { status: 'new-request', resume_command: resumeCommand },
    verification: { passed: false, checks },
    compatibility_fingerprint: fingerprint,
    next_steps: [resumeCommand],
  });

  if (input.signal.source !== GITLAB_CONTROL_SIGNAL_SOURCE) {
    return blocked('gitlab-source-required', ['signal.source=gitlab-protocol']);
  }
  if (!input.projectPath.trim() || input.signal.project !== input.projectPath) {
    return blocked('gitlab-project-mismatch', ['signal.project=projectPath']);
  }
  if (!input.signal.signal_id.trim() || !input.orchestrationId.trim() || !input.reason.trim()) {
    return blocked('control-route-input-invalid', ['signal_id', 'orchestration_id', 'reason']);
  }
  if (!GITLAB_CONTROL_ROUTES.includes(input.routeId as ControlRouteId)) {
    return blocked('unsupported-control-route', ['route_id in human|ignore']);
  }
  if (input.requestedSideEffect?.trim()) {
    return blocked('control-route-side-effect-forbidden', ['requested_side_effect is empty']);
  }

  if (input.routeId === 'human') {
    const artifact = buildHumanHandoff({
      orchestrationId: input.orchestrationId,
      reason: input.reason,
      stopCode: 'human-review-required',
    });
    return {
      schema: GITLAB_CONTROL_ROUTE_EVIDENCE_SCHEMA,
      status: 'completed',
      ...base,
      outcome: 'human-handoff',
      side_effects_executed: false,
      artifact,
      recovery: { status: 'resumable', resume_command: resumeCommand },
      verification: { passed: true, checks: ['gitlab-source-bound', 'control-route-allowlisted', 'no-provider-side-effect'] },
      compatibility_fingerprint: fingerprint,
      next_steps: [resumeCommand],
    };
  }

  const artifact = {
    schema: 'zj-loop.route_decision.v1',
    decision_id: `rd_${fingerprint.slice(0, 12)}`,
    signal_id: input.signal.signal_id,
    source: input.signal.source,
    route: 'ignore',
    request_kind: 'report-only',
    requested_action: 'ignore',
    target_consumer: 'daily-triage',
    allowed: false,
    status: 'denied',
    reason: input.reason,
    evidence: ['gitlab-control-route-evidence'],
  };
  return {
    schema: GITLAB_CONTROL_ROUTE_EVIDENCE_SCHEMA,
    status: 'completed',
    ...base,
    outcome: 'suppressed',
    side_effects_executed: false,
    artifact,
    recovery: { status: 'resumable', resume_command: resumeCommand },
    verification: { passed: true, checks: ['gitlab-source-bound', 'control-route-allowlisted', 'no-provider-side-effect'] },
    compatibility_fingerprint: fingerprint,
    next_steps: [resumeCommand],
  };
}

function compatibilityFingerprint(value: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
