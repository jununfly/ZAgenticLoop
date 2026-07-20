export type GitLabLifecycleAuditInput = {
  projectPath: string;
  issueIid?: string | number;
  requestId?: string;
  claimId?: string;
  consumerId?: string;
  token?: string;
};

export function buildGitLabLifecycleAudit(input: GitLabLifecycleAuditInput) {
  return {
    project_path: input.projectPath,
    ...(input.issueIid !== undefined ? { issue_iid: Number(input.issueIid) } : {}),
    ...(input.requestId !== undefined ? { request_id: input.requestId } : {}),
    ...(input.claimId !== undefined ? { claim_id: input.claimId } : {}),
    ...(input.consumerId !== undefined ? { consumer_id: input.consumerId } : {}),
    auth_source: input.token ? 'GITLAB_TOKEN' : null,
  };
}

export function validateGitLabRequestSourceBinding(input: {
  request?: any;
  projectPath: string;
  requestId: string;
  consumerId: string;
}) {
  const request = input.request;
  const ok = Boolean(
    request
      && request.source_signal?.provider === 'gitlab'
      && String(request.subject?.repo ?? '') === input.projectPath
      && request.request_id === input.requestId
      && request.route_decision?.target_consumer === input.consumerId,
  );
  return { ok, reason: ok ? null : 'request-source-mismatch' } as const;
}

export function buildGitLabLifecycleMarker(marker: string, payload: Record<string, unknown>) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(marker)) throw new Error('lifecycle-marker-invalid');
  return `<!-- zj-loop:${marker}\n${JSON.stringify(payload)}\n-->`;
}

export function parseGitLabLifecycleMarker(note: { body?: unknown }, marker: string) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(marker)) return null;
  const match = String(note?.body ?? '').match(new RegExp(`<!--\\s*zj-loop:${marker}\\s*\\n([\\s\\S]*?)\\n-->`));
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
