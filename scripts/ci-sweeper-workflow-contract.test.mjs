import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import yaml from 'yaml';

const WORKFLOW_PATH = '.github/workflows/ci-sweeper.yml';

async function loadWorkflow() {
  return yaml.parse(await readFile(WORKFLOW_PATH, 'utf8'));
}

function findStep(workflow, name) {
  return workflow.jobs.repair.steps.find((step) => step.name === name);
}

test('CI Sweeper creates repair PR only when repair diff exists and all gates pass', async () => {
  const workflow = await loadWorkflow();
  const step = findStep(workflow, 'Create or update deterministic repair PR');

  assert.match(step.if, /steps\.diff\.outputs\.changed == 'true'/);
  assert.match(step.if, /steps\.repair\.outcome == 'success'/);
  assert.match(step.if, /steps\.validate_gates\.outcome == 'success'/);
  assert.match(step.if, /steps\.audit_gates\.outcome == 'success'/);
});

test('CI Sweeper escalates when deterministic repair has no diff or gates fail', async () => {
  const workflow = await loadWorkflow();
  const step = findStep(workflow, 'Escalate CI Sweeper repair failure');

  assert.match(step.if, /steps\.diff\.outputs\.changed != 'true'/);
  assert.match(step.if, /steps\.repair\.outcome != 'success'/);
  assert.match(step.if, /steps\.validate_gates\.outcome != 'success'/);
  assert.match(step.if, /steps\.audit_gates\.outcome != 'success'/);
});

test('CI Sweeper consumes the request branch emitted by the route decision', async () => {
  const workflow = await loadWorkflow();
  const createPr = findStep(workflow, 'Create or update deterministic repair PR');

  assert.ok(workflow.on.workflow_dispatch.inputs.request_branch);
  assert.match(createPr.run, /BRANCH="\$\{\{ inputs\.request_branch \}\}"/);
});
