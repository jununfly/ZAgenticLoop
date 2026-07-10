import test from 'node:test';
import assert from 'node:assert/strict';

import { validateRoadmapActivationUserProjectFixture } from './roadmap-activation-user-project-fixture.mjs';

test('Roadmap Activation user-project fixture validates issue-triggered execution-ready dry-run path', async () => {
  const result = await validateRoadmapActivationUserProjectFixture();

  assert.equal(result.schema, 'zj-loop.roadmap_activation_user_project_fixture.v1');
  assert.match(result.activationRequestId, /^act-321-654-/);
  assert.match(result.branchName, /^zjal-act-321-654-/);
  assert.equal(result.prTitle, 'Roadmap Activation: Implement user project activation');
  assert.deepEqual(result.scenarios, [
    'created',
    'bounded-slices-pack',
    'bounded-slices-verify',
    'duplicate',
    'denied',
    'disabled',
    'loop-marker',
  ]);
});
