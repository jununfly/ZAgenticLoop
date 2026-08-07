import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverProviderExecutable } from '../dist/provider-executable-discovery.js';

test('provider discovery prefers an explicit executable', async () => {
  const result = await discoverProviderExecutable({
    provider: 'workbuddy-code',
    platform: 'win32',
    explicit: 'C:\\custom\\codebuddy.exe',
    env: { PATH: 'C:\\other' },
    path_exists: async (candidate) => candidate === 'C:\\custom\\codebuddy.exe',
  });
  assert.deepEqual({ status: result.status, executable: result.executable, source: result.source }, { status: 'found', executable: 'C:\\custom\\codebuddy.exe', source: 'explicit' });
});

test('provider discovery finds WorkBuddy in a user-level Windows install', async () => {
  const expected = 'C:\\Users\\dev\\AppData\\Local\\Programs\\WorkBuddy\\resources\\app.asar.unpacked\\cli\\bin\\codebuddy.exe';
  const result = await discoverProviderExecutable({
    provider: 'workbuddy-code',
    platform: 'win32',
    env: { LOCALAPPDATA: 'C:\\Users\\dev\\AppData\\Local', PATH: 'C:\\Windows\\System32' },
    path_exists: async (candidate) => candidate === expected,
  });
  assert.equal(result.status, 'found');
  assert.equal(result.executable, expected);
  assert.equal(result.source, 'known-install');
});

test('provider discovery can find a nonstandard Windows bundle through the bounded scan', async () => {
  const expected = 'C:\\Users\\dev\\AppData\\Local\\WorkBuddy\\current\\cli\\codebuddy.exe';
  const result = await discoverProviderExecutable({
    provider: 'workbuddy-code',
    platform: 'win32',
    env: { LOCALAPPDATA: 'C:\\Users\\dev\\AppData\\Local' },
    path_exists: async () => false,
    scan_directory: async (root, names, depth) => {
      assert.equal(root, 'C:\\Users\\dev\\AppData\\Local');
      assert.equal(depth, 5);
      assert.equal(names.has('codebuddy.exe'), true);
      return expected;
    },
  });
  assert.equal(result.status, 'found');
  assert.equal(result.executable, expected);
  assert.equal(result.source, 'bounded-scan');
});

test('provider discovery returns diagnostics instead of a bare command-not-found error', async () => {
  const result = await discoverProviderExecutable({ provider: 'codex', platform: 'win32', env: { PATH: 'C:\\Windows\\System32' }, path_exists: async () => false, scan_directory: async () => undefined });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.reason, 'provider-executable-not-found');
  assert.ok(result.checked_paths.length > 0);
});
