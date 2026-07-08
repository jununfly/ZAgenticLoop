import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const SCRIPT_PATH = fileURLToPath(new URL('./write-file-once.mjs', import.meta.url));

test('write-file-once writes a new relative file and refuses overwrite', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'zj-loop-write-once-'));
  await execFileAsync('node', [SCRIPT_PATH, 'docs/draft.md', 'hello'], { cwd });
  const text = await readFile(join(cwd, 'docs/draft.md'), 'utf8');

  assert.equal(text, 'hello');
  await assert.rejects(
    execFileAsync('node', [SCRIPT_PATH, 'docs/draft.md', 'again'], { cwd }),
    /EEXIST/,
  );
});

test('write-file-once refuses unsafe paths', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'zj-loop-write-once-'));

  await assert.rejects(
    execFileAsync('node', [SCRIPT_PATH, '../draft.md', 'hello'], { cwd }),
    /Refusing unsafe target path/,
  );
});
