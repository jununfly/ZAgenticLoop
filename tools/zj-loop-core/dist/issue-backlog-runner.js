import { buildGitLabApiUrl, buildGitLabAuthHeaders } from './providers.js';
import { buildIssueRecommendationsArtifact } from './issue-triage-transition-runner.js';
export async function scanGitLabIssueBacklog(input) {
    const fetchImpl = input.fetchImpl ?? globalThis.fetch;
    const headers = buildGitLabAuthHeaders({ token: input.token, jobToken: input.jobToken });
    if (!fetchImpl)
        throw new Error('GitLab backlog scan requires fetch support');
    if (Object.keys(headers).length === 0)
        throw new Error('GitLab backlog scan requires GITLAB_TOKEN or CI_JOB_TOKEN');
    const limit = Math.max(1, Math.min(100, Number(input.limit ?? 30) || 30));
    const url = `${buildGitLabApiUrl({ apiBaseUrl: input.apiBaseUrl, projectPath: input.projectPath, path: 'issues' })}?state=opened&per_page=${limit}&order_by=updated_at&sort=desc`;
    const response = await fetchImpl(url, { headers: { ...headers, 'User-Agent': 'zj-loop-gitlab-issue-backlog' } });
    if (!response.ok)
        throw new Error(`GitLab backlog scan failed: ${response.status}`);
    const issues = await response.json();
    const recommendations = issues.map((issue) => ({
        provider: 'gitlab',
        project_path: input.projectPath,
        issue_iid: Number(issue.iid),
        issue_url: String(issue.web_url ?? ''),
        labels: Array.isArray(issue.labels) ? issue.labels.map(String) : [],
        assignees: Array.isArray(issue.assignees) ? issue.assignees.map((assignee) => String(assignee.username ?? '')) : [],
        ...classifyGitLabIssue(issue),
    }));
    return {
        ...buildIssueRecommendationsArtifact({ provider: 'gitlab', projectPath: input.projectPath, pipelineUrl: input.pipelineUrl, source: 'gitlab-issues-api', recommendations }),
        side_effects: { labels: false, comments: false, state: false, requests: false },
    };
}
function classifyGitLabIssue(issue) {
    const labels = (Array.isArray(issue.labels) ? issue.labels : []).map((label) => String(label).toLowerCase());
    const description = String(issue.description ?? '');
    if (labels.includes('to roadmap') || labels.includes('to-roadmap') || labels.includes('roadmap')) {
        return { recommendation: 'to-roadmap', reason: 'roadmap label detected' };
    }
    if (labels.includes('ready-for-agent') && !(issue.assignees?.length) && !/need confirmation|需要.*确认/i.test(description) && !/blocked by\s*\n\s*-\s*#\d+/i.test(description)) {
        return { recommendation: 'agent-ready-request', reason: 'ready-for-agent label with no assignment or declared blocker' };
    }
    if (issue.assignees?.length)
        return { recommendation: 'human-owned', reason: 'issue already has an assignee' };
    if (/need confirmation|需要.*确认/i.test(description))
        return { recommendation: 'needs-human-clarification', reason: 'issue asks for confirmation' };
    return { recommendation: 'human-review', reason: 'not explicitly ready for agent' };
}
