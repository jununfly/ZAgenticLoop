import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInMemoryHumanSigner } from '../dist/human-signer.js';
import { createHumanApprovalUiServer } from '../dist/human-approval-ui.js';

function request({ address, path, headers = {} }) {
  return new Promise((resolve, reject) => {
    import('node:http').then(({ request: makeRequest }) => {
      const req = makeRequest({ hostname: address.address ?? '127.0.0.1', port: address.port, path, headers }, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => { const text = Buffer.concat(chunks).toString('utf8'); let body = text; try { body = JSON.parse(text); } catch {} resolve({ status: res.statusCode, headers: res.headers, body }); });
      });
      req.on('error', reject);
      req.end();
    }, reject);
  });
}

test('Web Console exposes read-only Graph Atom pending and final projection', async () => {
  const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
  const graphs = [{ schema: 'zj-loop.opn_read_only_graph_ui_read_model.v1', status: 'awaiting-verification', side_effects_executed: false, graph_id: 'graph-1', network_id: 'network-1', plan_digest: `sha256:${'a'.repeat(64)}`, phases: [], blocking_reasons: [], next_action: { kind: 'wait-agent2', label: '等待 Agent2 独立验证' }, read_model_digest: `sha256:${'b'.repeat(64)}` }];
  const server = createHumanApprovalUiServer({ signer, network_id: 'network-1', bootstrap_token: 'graph-ui-bootstrap', upstream: { async list() { return { requests: [] }; }, async graphAtoms() { return { graphs }; } } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    const bootstrap = await request({ address, path: '/ui/bootstrap?token=graph-ui-bootstrap' });
    const cookie = bootstrap.headers['set-cookie'][0].split(';', 1)[0];
    const response = await request({ address, path: '/ui/graph-atoms', headers: { cookie } });
    assert.equal(response.status, 200);
    assert.equal(response.body.graphs[0].status, 'awaiting-verification');
    assert.equal(response.body.graphs[0].next_action.kind, 'wait-agent2');
    assert.equal(response.body.side_effects_executed, false);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
