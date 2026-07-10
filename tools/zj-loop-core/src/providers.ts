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
