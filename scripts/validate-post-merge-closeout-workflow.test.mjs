import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const WORKFLOW_PATH = '.github/workflows/post-merge-roadmap-closeout.yml';

test('post-merge closeout workflow runs dry-run and contract-authorized live cleanup on merged PRs only', async () => {
  const workflow = await readFile(WORKFLOW_PATH, 'utf8');

  assert.match(workflow, /pull_request:\n    types: \[closed\]/);
  assert.match(workflow, /if: github\.event_name == 'pull_request' && github\.event\.pull_request\.merged == true/);
  assert.match(workflow, /--comment-out \/tmp\/post-merge-roadmap-closeout\/comment\.md/);
  assert.match(workflow, /gh pr comment "\$PR_NUMBER" --body-file \/tmp\/post-merge-roadmap-closeout\/comment\.md/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /Execute contract-authorized live cleanup/);
  assert.match(workflow, /plan\.confirmation\?\.required !== false/);
  assert.match(workflow, /--live/);
});

test('post-merge closeout workflow keeps fixed phrase as workflow_dispatch fallback', async () => {
  const workflow = await readFile(WORKFLOW_PATH, 'utf8');

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /confirm_live_cleanup:/);
  assert.match(workflow, /DELETE_MERGED_ROADMAP_BRANCH_AND_CLOSE_CARRIER/);
  assert.match(workflow, /--require-live-confirmation/);
  assert.match(workflow, /--confirm-live-cleanup "\$CONFIRM_LIVE_CLEANUP"/);
});
