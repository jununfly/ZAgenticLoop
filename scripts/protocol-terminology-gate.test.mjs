import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { runProtocolTerminologyGate } from './protocol-terminology-gate.mjs';

test('fails when the retired uppercase planning-signal term appears as a protocol-like term', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zj-loop-terms-'));
  await mkdir(join(root, 'docs'), { recursive: true });
  await writeFile(join(root, 'docs', 'sample.md'), `Plan ${'Signal'} -> Route Decision\n`);

  const result = await runProtocolTerminologyGate({ cwd: root, roots: ['docs'] });

  assert.equal(result.status, 'failed');
  assert.deepEqual(result.violations.map((violation) => violation.term), [`Plan ${'Signal'}`]);
});

test('allows abstract Signal and lower-case natural-language alternatives', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zj-loop-terms-'));
  await mkdir(join(root, 'docs'), { recursive: true });
  await writeFile(
    join(root, 'docs', 'sample.md'),
    [
      'Signal -> Route Decision -> Issue Fix Request',
      'plan-like signals are explanatory prose',
      'planning-related input can start an activation path',
    ].join('\n'),
  );

  const result = await runProtocolTerminologyGate({ cwd: root, roots: ['docs'] });

  assert.equal(result.status, 'passed');
  assert.deepEqual(result.violations, []);
});
