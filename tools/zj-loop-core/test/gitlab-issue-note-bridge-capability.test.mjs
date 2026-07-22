import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGitLabIssueNoteBridgeCapabilityArtifact } from '../dist/index.js';

const validRoute = {
  route_id: 'gitlab-issue-note-bridge',
  enabled: false,
  project_path: 'example-group/product-project',
  capability_status: 'unavailable',
  planning_status: 'deferred',
  provider_writes_allowed: false,
  declared_capabilities: ['webhook-envelope-validation', 'receipt-dedupe', 'fixed-api-trigger'],
  verified_capabilities: [],
  capabilities: { scopes: [], verifiers: ['route-table', 'disabled-state', 'zero-side-effect'], max_side_effect_level: 'evidence' },
};

test('builds a disabled route capability artifact without provider effects', () => {
  const artifact = buildGitLabIssueNoteBridgeCapabilityArtifact(validRoute);
  assert.deepEqual(artifact, {
    schema: 'zj-loop.capability.v1',
    route_artifact_schema: 'zj-loop.gitlab_issue_note_bridge_capability.v1',
    provider: 'gitlab',
    project_path: 'example-group/product-project',
    route_id: 'gitlab-issue-note-bridge',
    status: 'unavailable',
    planning_status: 'deferred',
    enabled: false,
    provider_writes_allowed: false,
    declared_capabilities: ['webhook-envelope-validation', 'receipt-dedupe', 'fixed-api-trigger'],
    verified_capabilities: [],
    verifiers: ['route-table', 'disabled-state', 'zero-side-effect'],
    verification: { status: 'verified', errors: [] },
    side_effects_executed: false,
    source_ref: { path: 'zj-loop/zj-loop-route-table.yaml', field: 'disabled_dispatch_routes.gitlab-issue-note-bridge' },
  });
});

test('blocks malformed or accidentally enabled capability routes before any provider operation', () => {
  const artifact = buildGitLabIssueNoteBridgeCapabilityArtifact({ ...validRoute, enabled: true, verified_capabilities: ['fixed-api-trigger'] });
  assert.equal(artifact.status, 'blocked');
  assert.equal(artifact.verification.status, 'blocked');
  assert.equal(artifact.enabled, true);
  assert.equal(artifact.provider_writes_allowed, false);
  assert.equal(artifact.side_effects_executed, false);
  assert.deepEqual(artifact.verification.errors, ['route must be disabled', 'verified_capabilities must be empty']);
});
