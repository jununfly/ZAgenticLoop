import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const WORKFLOW_PATH = '.github/workflows/daily-triage.yml';

async function workflowText() {
  return readFile(WORKFLOW_PATH, 'utf8');
}

test('Daily Triage delegates CI Sweeper lifecycle classification to deterministic script', async () => {
  const text = await workflowText();

  assert.match(text, /id: lifecycle/);
  assert.match(text, /node scripts\/ci-sweeper-lifecycle\.mjs/);
  assert.match(text, /LIFECYCLE_JSON_OUT:/);
  assert.match(text, /STATE_EVIDENCE_OUT:/);
});

test('Daily Triage creates and dispatches CI Sweeper only when lifecycle is none', async () => {
  const text = await workflowText();

  assert.match(
    text,
    /steps\.route\.outputs\.dispatch == 'true' && steps\.lifecycle\.outputs\.kind == 'none'/,
  );
  assert.doesNotMatch(text, /steps\.existing_route\.outputs\.duplicate/);
});

test('Daily Triage records lifecycle evidence in STATE.md', async () => {
  const text = await workflowText();

  assert.match(text, /\/tmp\/zj-loop-ci-sweeper-lifecycle-state\.md/);
  assert.match(text, /CI_SWEEPER_LIFECYCLE_EVIDENCE=/);
});
