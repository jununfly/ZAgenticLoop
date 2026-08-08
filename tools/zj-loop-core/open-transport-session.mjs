// open-transport-session.mjs
// usage: node open-transport-session.mjs
// self-contained, no PS quoting issues
import { readFile } from 'node:fs/promises';
import { createTlsTransportAdapter } from './dist/tls-transport-adapter.js';

const adapter = createTlsTransportAdapter({
  endpoint: 'https://100.119.216.26:43123',
  ca: await readFile('C:\\zj-loop\\identity\\ca.cert.pem', 'utf8'),
  cert: await readFile('C:\\zj-loop\\identity\\agent.cert.pem', 'utf8'),
  key: await readFile('C:\\zj-loop\\identity\\agent.key.pem', 'utf8'),
  bearer_token: (await readFile(
    'C:\\zj-loop\\identity\\join-session.json.credential-token',
    'utf8'
  )).trim(),
});

const session = await adapter.openSession({
  network_id: 'opn-dogfood-20260806',
  node_id: '5e555a2815a350df7df441c8468570c13ac726a166134dbf687d4c8876465815',
});
console.log(JSON.stringify(session, null, 2));
