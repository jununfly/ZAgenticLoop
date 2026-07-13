import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildRouteFamilyProviderParityEvidence } from './route-family-provider-parity-evidence.mjs';

test('route family provider parity evidence classifies every family across GitHub and GitLab', async () => {
  const evidence = await buildRouteFamilyProviderParityEvidence();

  assert.equal(evidence.schema, 'zj-loop.route_family_provider_parity_evidence.v1');
  assert.ok(evidence.generated_at);
  assert.ok(evidence.families.length >= 10);
  assert.deepEqual(evidence.providers, ['github', 'gitlab']);

  for (const family of evidence.families) {
    assert.ok(family.family_id);
    assert.ok(family.consumer_kind);
    assert.ok(family.routes.length > 0);
    for (const provider of evidence.providers) {
      const support = family.providers[provider];
      assert.ok(support, `${family.family_id} missing ${provider}`);
      assert.match(support.status, /^(live-supported|dry-run-supported|explicitly-refused-with-reason|blocked-with-follow-up)$/);
      assert.ok(Array.isArray(support.evidence_refs));
      assert.ok(support.evidence_refs.length > 0, `${family.family_id}.${provider} missing evidence refs`);
      assert.ok(Array.isArray(support.gaps), `${family.family_id}.${provider} missing gaps`);
      assert.ok(Array.isArray(support.next_steps), `${family.family_id}.${provider} missing next steps`);
    }
  }

  const roadmap = evidence.families.find((family) => family.family_id === 'roadmap-sliced-development');
  assert.equal(roadmap.providers.gitlab.status, 'dry-run-supported');
  assert.equal(roadmap.providers.gitlab.dogfood_replay_covered, true);
  assert.ok(roadmap.providers.gitlab.evidence_refs.some((item) => item.startsWith('replay:')));

  const ciSweeper = evidence.families.find((family) => family.family_id === 'ci-sweeper');
  assert.equal(ciSweeper.providers.gitlab.dogfood_replay_covered, true);
  assert.ok(ciSweeper.providers.gitlab.template_covered);

  const prSteward = evidence.families.find((family) => family.family_id === 'pr-steward');
  assert.equal(prSteward.providers.gitlab.dogfood_replay_covered, true);
  assert.ok(prSteward.providers.gitlab.gaps.some((gap) => gap.includes('live')));
});

