import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCli } from '../dist/index.js';

function createIo() {
  const stdout = [];
  const stderr = [];
  return {
    io: {
      stdout(message) {
        stdout.push(message);
      },
      stderr(message) {
        stderr.push(message);
      },
    },
    stdout,
    stderr,
  };
}

const SPEC = {
  name: 'demo',
  usage: 'demo --name <value> [--json]',
  options: [
    { name: 'name', alias: '-n', type: 'string', description: 'Name', default: 'world' },
    { name: 'level', alias: '-l', type: 'enum', description: 'Level', values: ['L1', 'L2'], default: 'L1' },
    { name: 'dryRun', flag: 'dry-run', type: 'boolean', description: 'Dry run' },
    { name: 'targetDir', type: 'positional', description: 'Target directory', default: '.' },
    { name: 'json', type: 'boolean', description: 'JSON output' },
  ],
  handler({ io, options }) {
    io.stdout(`${options.name}:${options.level}:${options.targetDir}:${options.dryRun === true}:${options.json === true}`);
  },
};

test('runCli executes a single-command handler with parsed options and injected io', async () => {
  const captured = createIo();
  const exitCode = await runCli(SPEC, ['target', '--name', 'Ada', '--level', 'L2', '--dry-run', '--json'], captured.io);
  assert.equal(exitCode, 0);
  assert.deepEqual(captured.stdout, ['Ada:L2:target:true:true']);
  assert.deepEqual(captured.stderr, []);
});

test('runCli prints help without executing handler', async () => {
  const captured = createIo();
  let executed = false;
  const exitCode = await runCli({ ...SPEC, handler: () => { executed = true; } }, ['--help'], captured.io);
  assert.equal(exitCode, 0);
  assert.equal(executed, false);
  assert.match(captured.stdout[0], /Usage:/);
  assert.deepEqual(captured.stderr, []);
});

test('runCli fails fast on unknown options and missing values', async () => {
  const unknown = createIo();
  assert.equal(await runCli(SPEC, ['--bogus'], unknown.io), 1);
  assert.deepEqual(unknown.stderr, ['Unknown option: --bogus']);

  const missing = createIo();
  assert.equal(await runCli(SPEC, ['--name'], missing.io), 1);
  assert.deepEqual(missing.stderr, ['Missing value for option: --name']);
});

test('runCli catches handler exceptions with command context', async () => {
  const captured = createIo();
  const exitCode = await runCli({ ...SPEC, handler: () => { throw new Error('boom'); } }, [], captured.io);
  assert.equal(exitCode, 1);
  assert.deepEqual(captured.stderr, ['demo failed: boom']);
});
