import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateGitLabChangelogDraftActions,
  createGitLabChangelogDraftCarrier,
  claimGitLabChangelogDraftCarrier,
  createGitLabChangelogDraftMr,
} from '../dist/index.js';

const CONFIRM = 'CREATE_CHANGELOG_DRAFT_PR_OR_EVIDENCE';
const request = {
  schema: 'zj-loop.changelog_draft_request.v1', request_id: 'cdr_123', status: 'draft-request-candidate',
  dedupe_key: 'changelog:group/project:v1.0.0:v1.1.0',
  release_window: { repo: 'group/project', base_branch: 'master', since_ref: 'v1.0.0', until_ref: 'v1.1.0', item_count: 2 },
  summary: 'Two controlled dogfood changes.',
};

test('GitLab Changelog adapter enforces exactly one safe draft file action', () => {
  assert.equal(validateGitLabChangelogDraftActions([{ action: 'update', file_path: 'zj-loop/dogfood/changelog-draft.md', content: '# Draft', encoding: 'text' }], 'zj-loop/dogfood/changelog-draft.md').ok, true);
  assert.equal(validateGitLabChangelogDraftActions([{ action: 'update', file_path: '../README.md', content: '# bad' }], 'zj-loop/dogfood/changelog-draft.md').ok, false);
});

test('GitLab Changelog carrier requires explicit confirmation and token', async () => {
  const result = await createGitLabChangelogDraftCarrier({ projectPath: 'group/project', request, confirmationPhrase: CONFIRM });
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'gitlab-token-required');
});

test('GitLab Changelog Draft MR adapter refuses writes without a verified claim', async () => {
  const result = await createGitLabChangelogDraftMr({
    projectPath: 'group/project', token: 'secret', request, issueIid: 7, claimId: 'claim-7',
    branch: 'automated/changelog-drafter-gitlab-abc123', targetBranch: 'master',
    draftFile: 'zj-loop/dogfood/changelog-draft.md',
    actions: [{ action: 'update', file_path: 'zj-loop/dogfood/changelog-draft.md', content: '# Draft' }],
    commitMessage: 'Draft changelog', title: 'Draft changelog', description: 'post-merge contract',
    fetchImpl: async (url) => url.includes('/notes')
      ? new Response(JSON.stringify([]), { status: 200 })
      : new Response(JSON.stringify({ iid: 7, description: '' }), { status: 200 }),
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'claim-not-found');
});

test('GitLab Changelog carrier claim writes one lifecycle marker and rereads winner', async () => {
  const calls = [];
  const description = '<!-- zj-loop:changelog-draft-request\n' + JSON.stringify(request) + '\n-->';
  let notesRead = 0;
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.endsWith('/issues/7')) return new Response(JSON.stringify({ iid: 7, description }), { status: 200 });
    if (url.includes('/issues/7/notes')) {
      if (init.method === 'POST') return new Response('{}', { status: 201 });
      notesRead += 1;
      return new Response(JSON.stringify(notesRead === 1 ? [] : [{ body: '<!-- zj-loop:changelog-draft-claim\n{"request_id":"cdr_123","claim_id":"claim-7","consumer_id":"changelog-drafter","status":"claimed"}\n-->' }]), { status: 200 });
    }
    throw new Error(url);
  };
  const result = await claimGitLabChangelogDraftCarrier({ projectPath: 'group/project', issueIid: 7, requestId: 'cdr_123', claimId: 'claim-7', token: 'secret', fetchImpl });
  assert.equal(result.outcome, 'claimed');
  assert.equal(calls.filter((call) => call.init.method === 'POST').length, 1);
});
