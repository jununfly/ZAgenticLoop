import assert from 'node:assert/strict';
import test from 'node:test';

import { replayGitLabProviderDogfood } from './gitlab-provider-dogfood-replay.mjs';

test('GitLab provider dogfood replay covers core route consumer contracts', () => {
  const replay = replayGitLabProviderDogfood();

  assert.equal(replay.schema, 'zj-loop.gitlab_provider_dogfood_replay.v1');
  assert.equal(replay.ciSweeper.provider, 'gitlab');
  assert.deepEqual(replay.ciSweeper.filesOrAreas, [
    'scripts/',
    '.gitlab-ci.yml',
    'zj-loop/gitlab-ci/',
    'zj-loop/',
  ]);

  assert.match(replay.roadmapActivation.branchName, /^zjal-act-89-4934172412-8c94c5b9-gitlab-provider-dogfood$/);
  assert.equal(replay.roadmapActivation.closeoutContractParsed, true);
  assert.equal(replay.roadmapActivation.closeoutStatus, 'dry-run');
  assert.equal(replay.roadmapActivation.closeoutProvider, 'gitlab');
  assert.equal(replay.roadmapActivation.closeoutReviewKind, 'merge-request');

  assert.equal(replay.prSteward.dryRunStatus, 'dry-run');
  assert.equal(replay.prSteward.dryRunTitle, 'PR Steward escalation for MR #123');
  assert.equal(replay.prSteward.liveStatus, 'refused');
  assert.deepEqual(replay.prSteward.liveRefusals, ['gitlab-live-review-side-effects-not-enabled']);
});
