import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInMemoryHumanSigner } from '../dist/human-signer.js';
import { createHumanApprovalUiServer } from '../dist/human-approval-ui.js';

test('Graph Review static shell exposes Chinese review states and responsive assets', async () => {
  const server = createHumanApprovalUiServer({ signer: createInMemoryHumanSigner({ human_id: 'human-1' }), network_id: 'network-1', bootstrap_token: 'asset-bootstrap', upstream: { async list() { return { requests: [] }; } }, now: () => '2026-07-31T12:00:00.000Z' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    const get = (path) => new Promise((resolve, reject) => { import('node:http').then(({ request }) => { const req = request({ hostname: '127.0.0.1', port: address.port, path }, (res) => { const chunks = []; res.on('data', (chunk) => chunks.push(chunk)); res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') })); }); req.on('error', reject); req.end(); }, reject); });
    const page = await get('/ui/graph-review'); const css = await get('/assets/graph-review-ui.css'); const js = await get('/assets/graph-review-ui.js');
    assert.equal(page.status, 200); assert.match(page.body, /Graph Review/); assert.match(page.body, /zh-CN/); assert.equal(css.status, 200); assert.match(css.body, /@media/); assert.equal(js.status, 200); assert.match(js.body, /review-ready/); assert.match(js.body, /blocked/);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
