import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runReferenceInstallationFixtures } from './reference-installation-fixtures.mjs';

test('reference installation fixtures validate GitHub, GitLab, and Workspace adapters', async () => {
  const result = await runReferenceInstallationFixtures();

  assert.equal(result.schema, 'zj-loop.reference_installation_fixtures.v1');
  assert.equal(result.status, 'passed');
  assert.equal(result.fixture_count, 3);
  assert.equal(result.provider_calls, 0);
  assert.equal(result.writes, 0);
  assert.equal(result.side_effects_executed, false);
  assert.deepEqual(result.results.map((fixture) => fixture.adapter), ['github', 'gitlab', 'workspace']);
  assert.ok(result.results.every((fixture) => fixture.status === 'passed'));
  assert.ok(result.results.every((fixture) => fixture.checks.some((check) => check.name === 'completion-ledger' && check.status === 'passed')));
});
