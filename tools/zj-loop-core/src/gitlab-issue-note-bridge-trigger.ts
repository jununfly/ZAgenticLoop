import { buildGitLabApiUrl } from './providers.js';
import type { GitLabIssueNoteBridgeEnvelope } from './gitlab-issue-note-bridge.js';

export const GITLAB_ISSUE_NOTE_BRIDGE_TRIGGER_SCHEMA = 'zj-loop.gitlab_issue_note_bridge_trigger.v1';
export const GITLAB_BRIDGE_TRIGGER_AUTH_SOURCE = 'ZJ_LOOP_GITLAB_BRIDGE_TRIGGER_TOKEN';

const VARIABLE_KEYS = [
  'ZJ_LOOP_BRIDGE_EVENT_ID',
  'ZJ_LOOP_BRIDGE_DEDUPE_KEY',
  'ZJ_LOOP_BRIDGE_PROJECT_PATH',
  'ZJ_LOOP_BRIDGE_ISSUE_IID',
  'ZJ_LOOP_BRIDGE_NOTE_ID',
  'ZJ_LOOP_BRIDGE_TARGET_ROUTE',
  'ZJ_LOOP_BRIDGE_ENVELOPE_REF',
] as const;

export type GitLabIssueNoteBridgeTriggerConfig = {
  projectPath: string;
  routeId: string;
  pipelineRef: string;
  targetRoute: string;
  allowedEventType: string;
  enabled: boolean;
  maturity: string;
};

export type GitLabIssueNoteBridgeTriggerArtifact = {
  schema: typeof GITLAB_ISSUE_NOTE_BRIDGE_TRIGGER_SCHEMA;
  status: 'triggered' | 'failed' | 'uncertain' | 'blocked';
  reason?: string;
  project_path: string;
  route_id: string;
  pipeline_ref: string;
  target_route: string;
  event_id: string;
  dedupe_key: string;
  envelope_ref: string;
  auth_source: typeof GITLAB_BRIDGE_TRIGGER_AUTH_SOURCE | null;
  variable_keys: readonly string[];
  pipeline: { id: number; url: string } | null;
  provider_http_status: number | null;
  side_effects_executed: boolean;
  recovery: { status: 'not-needed' | 'resume-required'; next_steps: string[] };
};

export async function triggerGitLabIssueNoteBridgePipeline(input: {
  config: GitLabIssueNoteBridgeTriggerConfig;
  envelope: GitLabIssueNoteBridgeEnvelope;
  envelopeRef: string;
  token?: string;
  apiBaseUrl?: string;
  fetchImpl?: typeof fetch;
}): Promise<GitLabIssueNoteBridgeTriggerArtifact> {
  const base = artifactBase(input);
  const blocked = (reason: string): GitLabIssueNoteBridgeTriggerArtifact => ({
    ...base,
    status: 'blocked',
    reason,
    auth_source: input.token ? GITLAB_BRIDGE_TRIGGER_AUTH_SOURCE : null,
    side_effects_executed: false,
    recovery: { status: 'not-needed', next_steps: [] },
  });
  if (!input.token) return blocked('trigger-token-required');
  if (!input.config.projectPath.trim() || input.config.projectPath !== input.envelope.project_path) return blocked('route-mismatch');
  if (!input.config.routeId.trim() || input.config.targetRoute !== input.envelope.target_route) return blocked('route-mismatch');
  if (input.config.allowedEventType !== input.envelope.event_type) return blocked('event-type-mismatch');
  if (!input.config.pipelineRef.trim() || !input.config.targetRoute.trim() || input.config.pipelineRef !== input.envelope.target_ref) return blocked('route-mismatch');
  if (!input.config.enabled || !['install-ready', 'execution-ready', 'dogfood-verified', 'replayed'].includes(input.config.maturity)) return blocked('route-not-triggerable');
  if (!input.envelopeRef.trim()) return blocked('envelope-ref-required');

  const variables = buildVariables(input.envelope, input.config.targetRoute, input.envelopeRef);
  if (!variables) return blocked('variable-contract-mismatch');
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) return blocked('gitlab-fetch-unavailable');
  const url = buildGitLabApiUrl({ apiBaseUrl: input.apiBaseUrl, projectPath: input.config.projectPath, path: 'pipeline' });
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'PRIVATE-TOKEN': input.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: input.config.pipelineRef, variables }),
    });
  } catch {
    return { ...base, status: 'uncertain', reason: 'trigger-uncertain', auth_source: GITLAB_BRIDGE_TRIGGER_AUTH_SOURCE, side_effects_executed: false, recovery: { status: 'resume-required', next_steps: ['Query existing pipeline state before explicit resume.'] } };
  }
  if (response.status !== 201) {
    return { ...base, status: response.status >= 400 && response.status < 600 ? 'failed' : 'uncertain', reason: response.status >= 400 && response.status < 600 ? 'trigger-failed' : 'trigger-uncertain', auth_source: GITLAB_BRIDGE_TRIGGER_AUTH_SOURCE, provider_http_status: response.status, side_effects_executed: false, recovery: { status: 'resume-required', next_steps: ['Inspect provider state before any explicit resume.'] } };
  }
  let pipeline: any;
  try {
    pipeline = await response.json();
  } catch {
    return { ...base, status: 'uncertain', reason: 'trigger-uncertain', auth_source: GITLAB_BRIDGE_TRIGGER_AUTH_SOURCE, provider_http_status: response.status, side_effects_executed: false, recovery: { status: 'resume-required', next_steps: ['Query existing pipeline state before explicit resume.'] } };
  }
  const pipelineId = Number(pipeline?.id);
  const pipelineUrl = typeof pipeline?.web_url === 'string' ? pipeline.web_url : '';
  if (!Number.isSafeInteger(pipelineId) || pipelineId <= 0 || pipeline?.ref !== input.config.pipelineRef || !pipelineUrlBelongsToProject(pipelineUrl, input.config.projectPath)) {
    return { ...base, status: 'failed', reason: 'trigger-response-mismatch', auth_source: GITLAB_BRIDGE_TRIGGER_AUTH_SOURCE, provider_http_status: response.status, side_effects_executed: false, recovery: { status: 'resume-required', next_steps: ['Inspect provider state before any explicit resume.'] } };
  }
  return { ...base, status: 'triggered', auth_source: GITLAB_BRIDGE_TRIGGER_AUTH_SOURCE, provider_http_status: response.status, pipeline: { id: pipelineId, url: pipelineUrl }, side_effects_executed: true, recovery: { status: 'not-needed', next_steps: [] } };
}

function artifactBase(input: { config: GitLabIssueNoteBridgeTriggerConfig; envelope: GitLabIssueNoteBridgeEnvelope; envelopeRef: string }): GitLabIssueNoteBridgeTriggerArtifact {
  return {
    schema: GITLAB_ISSUE_NOTE_BRIDGE_TRIGGER_SCHEMA,
    status: 'blocked',
    project_path: input.config.projectPath,
    route_id: input.config.routeId,
    pipeline_ref: input.config.pipelineRef,
    target_route: input.config.targetRoute,
    event_id: input.envelope.event_id,
    dedupe_key: input.envelope.dedupe_key,
    envelope_ref: input.envelopeRef,
    auth_source: null,
    variable_keys: VARIABLE_KEYS,
    pipeline: null,
    provider_http_status: null,
    side_effects_executed: false,
    recovery: { status: 'not-needed', next_steps: [] },
  };
}

function buildVariables(envelope: GitLabIssueNoteBridgeEnvelope, targetRoute: string, envelopeRef: string) {
  const values = [
    envelope.event_id,
    envelope.dedupe_key,
    envelope.project_path,
    String(envelope.issue_iid),
    String(envelope.note_id),
    targetRoute,
    envelopeRef,
  ];
  if (values.some((value) => !value || value.length > 512) || !/^\d+$/.test(values[3]) || !/^\d+$/.test(values[4]) || Number(values[3]) <= 0 || Number(values[4]) <= 0) return null;
  return VARIABLE_KEYS.map((key, index) => ({ key, value: values[index] }));
}

function pipelineUrlBelongsToProject(url: string, projectPath: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.pathname.includes(`/${projectPath}/-/pipelines/`);
  } catch {
    return false;
  }
}
