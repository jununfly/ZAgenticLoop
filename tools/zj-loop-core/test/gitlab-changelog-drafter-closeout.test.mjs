import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closeGitLabChangelogDraft, CHANGELOG_DRAFTER_CLOSEOUT_CONFIRMATION } from '../dist/index.js';

const request = { schema: 'zj-loop.changelog_draft_request.v1', request_id: 'cdr-closeout', release_window: { repo: 'group/project', base_branch: 'master' } };
const description = `<!-- zj-loop:changelog-draft-request\n${JSON.stringify(request)}\n-->`;
const claim = '<!-- zj-loop:changelog-draft-claim\n{"request_id":"cdr-closeout","claim_id":"claim-closeout","consumer_id":"changelog-drafter","status":"claimed"}\n-->';

test('GitLab Changelog closeout refuses an unmerged MR before any delete or close', async () => {
  const methods = [];
  const result = await closeGitLabChangelogDraft({ projectPath: 'group/project', mergeRequestIid: 314, issueIid: 190, requestId: 'cdr-closeout', claimId: 'claim-closeout', branch: 'automated/changelog-drafter-gitlab-closeout', targetBranch: 'master', confirmationPhrase: CHANGELOG_DRAFTER_CLOSEOUT_CONFIRMATION, token: 'secret', fetchImpl: async (url, init = {}) => { methods.push(init.method ?? 'GET'); if (url.endsWith('/issues/190')) return new Response(JSON.stringify({ description }), { status: 200 }); if (url.includes('/issues/190/notes')) return new Response(JSON.stringify([{ body: claim }]), { status: 200 }); return new Response(JSON.stringify({ state: 'opened' }), { status: 200 }); } });
  assert.equal(result.reason, 'merge-not-confirmed');
  assert.equal(methods.includes('DELETE'), false);
  assert.equal(methods.includes('PUT'), false);
});
