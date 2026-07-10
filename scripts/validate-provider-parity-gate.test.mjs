import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validateProviderParityGate } from './validate-provider-parity-gate.mjs';

test('provider parity gate validates GitHub and GitLab generated route surfaces', async () => {
  const result = await validateProviderParityGate();

  assert.equal(result.routeTemplateCount, 9);
  assert.match(result.coreVersion, /^\d+\.\d+\.\d+$/);
  assert.ok(result.routeCount >= 9);
});
