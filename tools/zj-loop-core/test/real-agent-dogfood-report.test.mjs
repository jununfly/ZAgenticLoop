import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createRealAgentDogfoodConformanceReport,
  realAgentDogfoodConformanceReportDigest,
  createRealAgentDogfoodResultEnvelope,
} from '../dist/real-agent-dogfood-report.js';

const digest = (letter) => `sha256:${letter.repeat(64)}`;

const finding = (status = 'implemented') => ({
  finding_id: 'finding-1',
  severity: 'info',
  category: 'contract',
  claim: 'The provider-neutral contract is present.',
  status,
  file_refs: [{ path: 'README.md', start_line: 1, end_line: 2, content_sha256: digest('a') }],
  evidence_refs: [digest('b')],
  verification_refs: [digest('c')],
});

const reportInput = () => ({
  scope: {
    repository: 'jununfly/ZAgenticLoop',
    input_commit: 'a'.repeat(40),
    manifest_digest: digest('d'),
    worktree_identity: 'worktree-1',
    roadmap_revision: 'roadmap-1',
  },
  implemented: [finding('implemented')],
  partial: [],
  missing: [],
  risks: [],
  evidence_refs: [digest('b')],
  verification_refs: [digest('c')],
  recommendations: ['Keep the contract provider-neutral.'],
});

test('constructs a bounded conformance report with a stable Core digest', () => {
  const report = createRealAgentDogfoodConformanceReport(reportInput());
  assert.equal(report.schema, 'zj-loop.real_agent_dogfood_conformance_report.v1');
  assert.match(report.report_digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(report.report_digest, realAgentDogfoodConformanceReportDigest(report));
  assert.equal(report.implemented[0].status, 'implemented');
});

test('rejects unknown report fields instead of accepting unverified semantics', () => {
  assert.throws(
    () => createRealAgentDogfoodConformanceReport({ ...reportInput(), unexpected: 'agent-controlled' }),
    /real-agent-dogfood-report-input-invalid/,
  );
});

test('builds a provider-neutral result envelope without allowing lifecycle control', () => {
  const report = createRealAgentDogfoodConformanceReport(reportInput());
  const envelope = createRealAgentDogfoodResultEnvelope({
    execution: { execution_id: 'execution-1', attempt: 1, provider_id: 'provider-fixture', adapter_version: '1' },
    report,
    observations: [{ observation_id: 'observation-1', claim: 'README is present.', value_digest: digest('e'), evidence_refs: [digest('b')] }],
    claims: [{ claim_id: 'claim-1', claim: 'The contract is provider-neutral.', disposition: 'candidate', evidence_refs: [digest('b')] }],
    output: {
      events: [
        { sequence: 1, kind: 'observation', payload_digest: digest('e') },
        { sequence: 2, kind: 'terminal', payload_digest: digest('f') },
      ],
      terminal: { outcome: 'success', payload_digest: digest('f') },
    },
  });
  assert.equal(envelope.schema, 'zj-loop.real_agent_dogfood_result_envelope.v1');
  assert.equal(envelope.execution.execution_id, 'execution-1');
  assert.match(envelope.envelope_digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(envelope.envelope_digest, createRealAgentDogfoodResultEnvelope(envelope).envelope_digest);
  assert.equal('lifecycle_status' in envelope, false);
});

test('rejects an output stream without exactly one terminal event', () => {
  const report = createRealAgentDogfoodConformanceReport(reportInput());
  assert.throws(() => createRealAgentDogfoodResultEnvelope({
    execution: { execution_id: 'execution-1', attempt: 1, provider_id: 'provider-fixture', adapter_version: '1' },
    report,
    observations: [],
    claims: [],
    output: { events: [{ sequence: 1, kind: 'observation', payload_digest: digest('e') }], terminal: null },
  }), /result-envelope-output-invalid/);
});

test('rejects a provider-supplied envelope digest that Core cannot reproduce', () => {
  const report = createRealAgentDogfoodConformanceReport(reportInput());
  const input = {
    execution: { execution_id: 'execution-1', attempt: 1, provider_id: 'provider-fixture', adapter_version: '1' },
    report,
    observations: [],
    claims: [],
    output: { events: [{ sequence: 1, kind: 'terminal', payload_digest: digest('f') }], terminal: { outcome: 'success', payload_digest: digest('f') } },
  };
  const envelope = createRealAgentDogfoodResultEnvelope(input);
  assert.throws(() => createRealAgentDogfoodResultEnvelope({ ...envelope, envelope_digest: digest('z') }), /result-envelope-digest-invalid/);
});
