import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readGitLabIssueNoteBridgeConfig } from '../dist/index.js';

const json = JSON.stringify({
  ZJ_LOOP_BRIDGE_PROJECT_PATH: 'group/project',
  ZJ_LOOP_BRIDGE_ROUTE_ID: 'bridge-ci-sweeper',
  ZJ_LOOP_BRIDGE_PIPELINE_REF: 'master',
  ZJ_LOOP_BRIDGE_TARGET_ROUTE: 'ci-sweeper',
  ZJ_LOOP_BRIDGE_MARKER: '/zj-loop start ci-sweeper',
  ZJ_LOOP_BRIDGE_ALLOWED_EVENT_TYPE: 'Note Hook',
  ZJ_LOOP_BRIDGE_ENABLED: 'true',
  ZJ_LOOP_BRIDGE_MATURITY: 'install-ready',
});

test('reads bridge settings from one JSON environment value', () => {
  assert.deepEqual(readGitLabIssueNoteBridgeConfig({ ZJ_LOOP_BRIDGE_CONFIG_JSON: json }), {
    projectPath: 'group/project',
    routeId: 'bridge-ci-sweeper',
    pipelineRef: 'master',
    targetRoute: 'ci-sweeper',
    marker: '/zj-loop start ci-sweeper',
    allowedEventType: 'Note Hook',
    enabled: true,
    maturity: 'install-ready',
  });
});

test('accepts concise JSON keys and keeps legacy variables as fallback', () => {
  assert.equal(readGitLabIssueNoteBridgeConfig({
    ZJ_LOOP_BRIDGE_CONFIG_JSON: JSON.stringify({ target_route: 'ci-sweeper', enabled: true }),
    ZJ_LOOP_BRIDGE_PROJECT_PATH: 'group/project',
    ZJ_LOOP_BRIDGE_ROUTE_ID: 'bridge-ci-sweeper',
  }).targetRoute, 'ci-sweeper');
  assert.equal(readGitLabIssueNoteBridgeConfig({
    ZJ_LOOP_BRIDGE_PROJECT_PATH: 'group/project',
    ZJ_LOOP_BRIDGE_ENABLED: 'true',
  }).projectPath, 'group/project');
});

test('fails closed for malformed or non-object JSON', () => {
  assert.throws(() => readGitLabIssueNoteBridgeConfig({ ZJ_LOOP_BRIDGE_CONFIG_JSON: '{' }), /ZJ_LOOP_BRIDGE_CONFIG_JSON-invalid/);
  assert.throws(() => readGitLabIssueNoteBridgeConfig({ ZJ_LOOP_BRIDGE_CONFIG_JSON: '[]' }), /ZJ_LOOP_BRIDGE_CONFIG_JSON-invalid/);
});
