export type ProviderKind = 'github' | 'gitlab' | 'manual';

export interface ProviderDetectionInput {
  remote?: string;
  githubActions?: boolean;
  gitlabCi?: boolean;
  glabMentioned?: boolean;
}

export interface GitRemoteRepositoryRef {
  provider: ProviderKind;
  host: string;
  ownerPath: string;
  name: string;
  slug: string;
  remoteUrl: string;
}

export interface ProviderIssueRef {
  provider: 'github' | 'gitlab';
  host: string;
  projectPath: string;
  issue: number;
  url: string;
}

export interface ProviderReviewRef {
  provider: 'github' | 'gitlab';
  host: string;
  projectPath: string;
  number: number;
  kind: 'pull-request' | 'merge-request';
  url: string;
}

export type ProviderCarrierKind =
  | 'issue'
  | 'review'
  | 'branch'
  | 'comment'
  | 'note'
  | 'artifact'
  | 'job'
  | 'workflow';

export interface ProviderApiRef {
  provider: 'github' | 'gitlab';
  host: string;
  projectPath: string;
  carrierKind: ProviderCarrierKind;
  url?: string;
  number?: number;
  branch?: string;
  reviewKind?: 'pull-request' | 'merge-request';
}

export interface ProviderAuditMetadata {
  provider: 'github' | 'gitlab';
  host: string;
  project_path: string;
  carrier_kind: ProviderCarrierKind;
  carrier_url?: string;
  issue?: number;
  review_kind?: 'pull-request' | 'merge-request';
  review_number?: number;
  branch?: string;
}

export interface BuildProviderIssueUrlInput {
  provider?: ProviderKind | 'github' | 'gitlab';
  host?: string;
  projectPath?: string;
  repo?: string;
  issue?: number | string;
}

export interface BuildGitLabApiUrlInput {
  apiBaseUrl?: string;
  projectPath: string;
  path?: string | Array<string | number>;
}

export function detectProviderKind(input: ProviderDetectionInput = {}): ProviderKind {
  const remote = String(input.remote ?? '').toLowerCase();
  if (remote.includes('github.com') || input.githubActions === true) return 'github';
  if (remote.includes('gitlab') || input.gitlabCi === true || input.glabMentioned === true) return 'gitlab';
  return 'manual';
}

export function parseGitRemoteRepository(
  remoteUrl: string,
  { providerHint }: { providerHint?: ProviderKind } = {},
): GitRemoteRepositoryRef | null {
  const original = String(remoteUrl ?? '').trim();
  if (!original) return null;

  const normalized = original.replace(/\.git(?:[?#].*)?$/, '');
  const sshMatch = normalized.match(/^git@(?<host>[^:]+):(?<path>.+)$/);
  const sshUrlMatch = normalized.match(/^ssh:\/\/git@(?<host>[^/]+)\/(?<path>.+)$/);
  const httpsMatch = normalized.match(/^https:\/\/(?:[^@/]+@)?(?<host>[^/]+)\/(?<path>.+)$/);
  const match = sshMatch ?? sshUrlMatch ?? httpsMatch;
  if (!match?.groups) return null;

  const host = match.groups.host.toLowerCase();
  const projectPath = stripGitSuffix(match.groups.path);
  const provider = providerHint && providerHint !== 'manual'
    ? providerHint
    : detectProviderKind({ remote: original });
  if (provider === 'manual') return null;

  const parts = projectPath.split('/').filter(Boolean);
  if (provider === 'github' && parts.length !== 2) return null;
  if (parts.length < 2) return null;

  const name = parts[parts.length - 1] ?? '';
  const ownerPath = parts.slice(0, -1).join('/');
  return {
    provider,
    host,
    ownerPath,
    name,
    slug: `${ownerPath}/${name}`,
    remoteUrl: original,
  };
}

export function parseProviderIssueUrl(url: string): ProviderIssueRef | null {
  const parsed = parseProviderWebUrl(url);
  if (!parsed) return null;
  const issueIndex = parsed.parts.indexOf('issues');
  if (issueIndex < 1) return null;
  const issue = Number(parsed.parts[issueIndex + 1]);
  if (!Number.isInteger(issue)) return null;

  return {
    provider: parsed.provider,
    host: parsed.host,
    projectPath: providerProjectPath(parsed.parts.slice(0, issueIndex)),
    issue,
    url: parsed.url,
  };
}

export function parseProviderReviewUrl(url: string): ProviderReviewRef | null {
  const parsed = parseProviderWebUrl(url);
  if (!parsed) return null;

  const reviewIndex = parsed.provider === 'github'
    ? parsed.parts.indexOf('pull')
    : parsed.parts.indexOf('merge_requests');
  if (reviewIndex < 1) return null;

  const number = Number(parsed.parts[reviewIndex + 1]);
  if (!Number.isInteger(number)) return null;

  return {
    provider: parsed.provider,
    host: parsed.host,
    projectPath: providerProjectPath(parsed.parts.slice(0, reviewIndex)),
    number,
    kind: parsed.provider === 'github' ? 'pull-request' : 'merge-request',
    url: parsed.url,
  };
}

export function buildProviderIssueUrl(input: BuildProviderIssueUrlInput): string {
  const provider = input.provider === 'gitlab' ? 'gitlab' : input.provider === 'github' ? 'github' : null;
  const projectPath = stripProjectPath(input.projectPath ?? input.repo ?? '');
  const issue = Number(input.issue);
  if (!provider || !projectPath || !Number.isInteger(issue)) return '';

  const host = String(input.host ?? defaultProviderHost(provider)).trim().toLowerCase();
  if (!host) return '';

  if (provider === 'github') return `https://${host}/${projectPath}/issues/${issue}`;
  return `https://${host}/${projectPath}/-/issues/${issue}`;
}

export function buildGitLabApiUrl(input: BuildGitLabApiUrlInput): string {
  const base = String(input.apiBaseUrl ?? 'https://gitlab.com/api/v4').replace(/\/+$/, '');
  const projectPath = encodeURIComponent(stripProjectPath(input.projectPath));
  const suffix = normalizeApiPath(input.path);
  return `${base}/projects/${projectPath}${suffix ? `/${suffix}` : ''}`;
}

export function buildGitLabMergeRequestApiUrl(input: {
  apiBaseUrl?: string;
  projectPath: string;
  iid: string | number;
}) {
  return buildGitLabApiUrl({
    apiBaseUrl: input.apiBaseUrl,
    projectPath: input.projectPath,
    path: ['merge_requests', input.iid],
  });
}

export function buildGitLabBranchApiUrl(input: {
  apiBaseUrl?: string;
  projectPath: string;
  branch: string;
}) {
  return buildGitLabApiUrl({
    apiBaseUrl: input.apiBaseUrl,
    projectPath: input.projectPath,
    path: ['repository', 'branches', input.branch],
  });
}

export function buildGitLabIssueApiUrl(input: {
  apiBaseUrl?: string;
  projectPath: string;
  issue: string | number;
}) {
  return buildGitLabApiUrl({
    apiBaseUrl: input.apiBaseUrl,
    projectPath: input.projectPath,
    path: ['issues', input.issue],
  });
}

export function buildGitLabAuthHeaders(input: { token?: string; jobToken?: string }): Record<string, string> {
  if (input.token) return { 'PRIVATE-TOKEN': input.token };
  if (input.jobToken) return { 'JOB-TOKEN': input.jobToken };
  return {};
}

export async function gitLabFailureReason(
  prefix: string,
  response: { status: number; text?: () => Promise<string> },
): Promise<string> {
  const body = response.text ? await response.text() : '';
  return `${prefix}:${response.status}${body ? `:${body}` : ''}`;
}

export function buildProviderAuditMetadata(input: {
  url?: string;
  provider?: 'github' | 'gitlab';
  host?: string;
  projectPath?: string;
  carrierKind?: ProviderCarrierKind;
  branch?: string;
  reviewKind?: 'pull-request' | 'merge-request';
}): ProviderAuditMetadata | null {
  if (input.url) {
    const issue = parseProviderIssueUrl(input.url);
    if (issue) {
      return {
        provider: issue.provider,
        host: issue.host,
        project_path: issue.projectPath,
        carrier_kind: 'issue',
        carrier_url: issue.url,
        issue: issue.issue,
      };
    }

    const review = parseProviderReviewUrl(input.url);
    if (review) {
      return {
        provider: review.provider,
        host: review.host,
        project_path: review.projectPath,
        carrier_kind: 'review',
        carrier_url: review.url,
        review_kind: review.kind,
        review_number: review.number,
      };
    }
  }

  const provider = input.provider;
  const projectPath = stripProjectPath(input.projectPath ?? '');
  const carrierKind = input.carrierKind;
  if (!provider || !projectPath || !carrierKind) return null;

  const metadata: ProviderAuditMetadata = {
    provider,
    host: String(input.host ?? defaultProviderHost(provider)).trim().toLowerCase(),
    project_path: projectPath,
    carrier_kind: carrierKind,
  };
  if (input.url) metadata.carrier_url = input.url;
  if (input.branch) metadata.branch = input.branch;
  if (input.reviewKind) metadata.review_kind = input.reviewKind;
  return metadata;
}

function parseProviderWebUrl(url: string): {
  provider: 'github' | 'gitlab';
  host: string;
  parts: string[];
  url: string;
} | null {
  const text = String(url ?? '').trim();
  if (!text) return null;
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;

  const host = parsed.hostname.toLowerCase();
  const provider = host === 'github.com' ? 'github' : host.includes('gitlab') ? 'gitlab' : null;
  if (!provider) return null;

  const parts = parsed.pathname.split('/').filter(Boolean);
  return { provider, host, parts, url: text };
}

function stripGitSuffix(input: string): string {
  return String(input ?? '').replace(/\.git$/, '').replace(/^\/+|\/+$/g, '');
}

function providerProjectPath(parts: string[]): string {
  return parts.filter((part) => part !== '-').join('/');
}

function stripProjectPath(input: string): string {
  return String(input ?? '').replace(/^\/+|\/+$/g, '');
}

function defaultProviderHost(provider: 'github' | 'gitlab'): string {
  return provider === 'github' ? 'github.com' : 'gitlab.com';
}

function normalizeApiPath(path: BuildGitLabApiUrlInput['path']): string {
  if (Array.isArray(path)) {
    return path.map((part) => encodeURIComponent(String(part))).join('/');
  }
  return String(path ?? '').replace(/^\/+|\/+$/g, '');
}
