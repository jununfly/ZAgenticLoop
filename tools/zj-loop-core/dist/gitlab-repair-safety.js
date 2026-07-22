import { createHash } from 'node:crypto';
import { buildGitLabApiUrl } from './providers.js';
export function buildGitLabRepairDedupeKey(input) {
    const canonical = JSON.stringify({
        project_path: input.projectPath,
        route_family: input.routeFamily,
        target_branch: input.targetBranch,
        actions: input.actions.map(canonicalAction).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
    });
    const digest = createHash('sha256').update(canonical).digest('hex');
    return { digest, key: `${input.projectPath}:${input.routeFamily}:${input.targetBranch}:${digest}` };
}
export function buildGitLabRepairDedupeMarker(input) {
    return `<!-- zj-loop:repair-dedupe ${JSON.stringify({ schema: 'zj-loop.repair_dedupe.v1', key: input.key, digest: input.digest, route_family: input.routeFamily })} -->`;
}
export function readGitLabRepairDedupeMarker(description) {
    const match = String(description ?? '').match(/<!--\s*zj-loop:repair-dedupe\s+(\{[\s\S]*?\})\s*-->/);
    if (!match)
        return null;
    try {
        const parsed = JSON.parse(match[1]);
        return parsed?.schema === 'zj-loop.repair_dedupe.v1' && typeof parsed.key === 'string' && typeof parsed.digest === 'string' ? parsed : null;
    }
    catch {
        return null;
    }
}
export async function findGitLabRepairMr(input) {
    const dedupe = buildGitLabRepairDedupeKey(input);
    const url = buildGitLabApiUrl({ apiBaseUrl: input.apiBaseUrl, projectPath: input.projectPath, path: 'merge_requests' });
    let response;
    try {
        response = await input.fetchImpl(`${url}?state=opened&per_page=100`, { headers: input.headers });
    }
    catch {
        return { ok: false, reason: 'repair-mr-dedupe-read-failed', dedupe };
    }
    if (!response.ok)
        return { ok: false, reason: 'repair-mr-dedupe-read-failed', status: response.status, dedupe };
    const mergeRequests = await response.json();
    if (!Array.isArray(mergeRequests))
        return { ok: false, reason: 'repair-mr-dedupe-response-invalid', dedupe };
    const existing = mergeRequests.find((mr) => {
        const marker = readGitLabRepairDedupeMarker(mr?.description);
        return marker?.key === dedupe.key || (String(mr?.source_branch ?? '') === input.branch && (!mr?.target_branch || String(mr.target_branch) === input.targetBranch));
    });
    return { ok: true, existing: existing ?? null, dedupe };
}
export async function hasEffectiveGitLabRepairDiff(input) {
    for (const action of input.actions) {
        if (action.action === 'move' || action.action === 'chmod')
            return true;
        const filePath = String(action.file_path ?? '');
        const fileUrl = buildGitLabApiUrl({ apiBaseUrl: input.apiBaseUrl, projectPath: input.projectPath, path: ['repository', 'files', filePath] });
        let response;
        try {
            response = await input.fetchImpl(`${fileUrl}?ref=${encodeURIComponent(input.targetBranch)}`, { headers: input.headers });
        }
        catch {
            return null;
        }
        if (response.status === 404) {
            if (action.action === 'delete')
                continue;
            return true;
        }
        if (!response.ok)
            return null;
        if (action.action === 'delete')
            return true;
        if (action.action === 'create')
            return true;
        const current = await response.json();
        const expected = action.encoding === 'base64' ? Buffer.from(String(action.content ?? ''), 'base64').toString('utf8') : String(action.content ?? '');
        const actual = Buffer.from(String(current.content ?? ''), 'base64').toString('utf8');
        if (actual !== expected)
            return true;
    }
    return false;
}
function canonicalAction(action) {
    return {
        action: String(action.action ?? ''),
        file_path: String(action.file_path ?? ''),
        previous_path: String(action.previous_path ?? ''),
        content: String(action.content ?? ''),
        encoding: String(action.encoding ?? ''),
        execute_filemode: String(action.execute_filemode ?? action.mode ?? ''),
    };
}
