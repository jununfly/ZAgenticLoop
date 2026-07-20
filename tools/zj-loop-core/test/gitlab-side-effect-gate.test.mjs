import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGitLabCarrierSideEffectGate,
  GITLAB_CI_SWEEPER_CARRIER_CONFIRMATION,
} from '../dist/index.js';

test('GitLab carrier gate allows only explicit confirmed Web requests', () => {
  const result = buildGitLabCarrierSideEffectGate({
    projectPath: 'group/project',
    routeFamily: 'ci-sweeper',
    pipelineSource: 'web',
    carrierEnabled: 'enabled',
    confirmation: GITLAB_CI_SWEEPER_CARRIER_CONFIRMATION,
  });

  assert.equal(result.status, 'allowed');
  assert.equal(result.side_effects_executed, false);
});

test('GitLab carrier gate trips on the first automatic source attempt', () => {
  const result = buildGitLabCarrierSideEffectGate({
    projectPath: 'group/project',
    routeFamily: 'ci-sweeper',
    pipelineSource: 'schedule',
    carrierEnabled: 'enabled',
    confirmation: GITLAB_CI_SWEEPER_CARRIER_CONFIRMATION,
  });

  assert.equal(result.status, 'tripped');
  assert.equal(result.reason, 'automatic-source-forbidden');
  assert.equal(result.breaker.action, 'persist-tripped-state');
});

test('GitLab carrier gate refuses disabled or unconfirmed Web requests', () => {
  const disabled = buildGitLabCarrierSideEffectGate({ projectPath: 'group/project', routeFamily: 'ci-sweeper', pipelineSource: 'web' });
  const unconfirmed = buildGitLabCarrierSideEffectGate({ projectPath: 'group/project', routeFamily: 'ci-sweeper', pipelineSource: 'web', carrierEnabled: 'enabled', confirmation: 'wrong' });

  assert.equal(disabled.reason, 'carrier-disabled');
  assert.equal(unconfirmed.reason, 'confirmation-required');
  assert.equal(unconfirmed.side_effects_executed, false);
});

test('GitLab carrier gate keeps a tripped project route family fail-closed', () => {
  const result = buildGitLabCarrierSideEffectGate({ projectPath: 'group/project', routeFamily: 'ci-sweeper', pipelineSource: 'web', carrierEnabled: 'enabled', breakerState: 'tripped' });

  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'breaker-tripped');
  assert.equal(result.breaker.action, 'human-reset-required');
});
