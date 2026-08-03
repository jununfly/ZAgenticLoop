import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { createBootstrapBinding, encodeBootstrapFrame } from '../dist/bootstrap-protocol.js';
import {
  createTrustedRunnerSidecarBootstrap,
  createTrustedRunnerSidecarLaunchContract,
  trustedRunnerSidecarContractDigest,
} from '../dist/trusted-runner-sidecar-bootstrap.js';

const digest = (letter) => `sha256:${letter.repeat(64)}`;
const binding = createBootstrapBinding({
  identity: { schema: 'zj-loop.worker_identity_facts.v1', platform: 'darwin', kind: 'process-audit', executable_digest: digest('a'), signer_digest: digest('b') },
  execution: { network_id: 'network-1', execution_id: 'execution-1', attempt: 1, provider_id: 'agent-1', execution_binding_nonce: 'n'.repeat(32) },
});

test('sidecar launch contract freezes FD roles and excludes secret bytes', () => {
  const contract = createTrustedRunnerSidecarLaunchContract({
    execution_id: 'execution-1',
    attempt: 1,
    sidecar_argv: ['/usr/bin/sidecar'],
    worker_argv: ['/usr/bin/worker'],
    endpoint_path: '/tmp/zj-loop/execution-1.sock',
    bootstrap_profile_sha256: binding.bootstrap_profile_sha256,
    execution_binding_digest: binding.execution_binding_digest,
    secret_content_type: 'application/octet-stream',
    secret_byte_length: 13,
  });
  assert.equal(contract.secret.bytes, undefined);
  assert.deepEqual(contract.fd_channels, [
    { channel_role: 'secret', direction: 'trusted-runner-to-sidecar', ownership: 'trusted-runner', fd: 3, close_on_exec: true },
    { channel_role: 'identity-binding', direction: 'trusted-runner-to-sidecar', ownership: 'trusted-runner', fd: 4, close_on_exec: true },
    { channel_role: 'status', direction: 'sidecar-to-trusted-runner', ownership: 'sidecar', fd: 5, close_on_exec: true },
  ]);
  assert.deepEqual(contract.worker_inherited_fd_roles, []);
  assert.equal(contract.contract_digest, trustedRunnerSidecarContractDigest({ ...contract, contract_digest: undefined }));
  assert.equal(
    trustedRunnerSidecarContractDigest({ ...contract, fd_channels: contract.fd_channels.map((channel) => ({ ...channel, fd: channel.fd + 20 })) }),
    contract.contract_digest,
  );
});

test('TrustedRunner sidecar bootstrap injects bounded FD channels and cleans its process group', async () => {
  const script = [
    "const fs=require('node:fs');",
    "const cp=require('node:child_process');",
    'fs.readFileSync(3);',
    'fs.readFileSync(4);',
    "const workerScript=\"const fs=require('node:fs'); const fds=[3,4,5].filter((fd)=>{try{return fs.fstatSync(fd).isFIFO();}catch{return false;}}); process.stdout.write(JSON.stringify({inherited_fds:fds})); setInterval(()=>{},1000);\";",
    "const nullFd=fs.openSync('/dev/null','r'); const worker=cp.spawn(process.execPath,['-e',workerScript],{stdio:['ignore','pipe','ignore',nullFd,nullFd,nullFd]}); fs.closeSync(nullFd);",
    "let workerOutput=''; worker.stdout.on('data',(chunk)=>{workerOutput+=chunk.toString();});",
    "const payload={status:'runtime-ready',worker_pid:worker.pid,worker_fd_probe:()=>JSON.parse(workerOutput)};",
    "const send=()=>{if(!workerOutput)return setTimeout(send,10); const resolved={status:'runtime-ready',worker_fd_probe:payload.worker_fd_probe(),worker_pid:worker.pid}; const body=Buffer.from(JSON.stringify({channel_role:'status',payload:resolved,schema:'zj-loop.bootstrap_frame.v1'})); const frame=Buffer.alloc(body.length+4); frame.writeUInt32BE(body.length,0); body.copy(frame,4); fs.writeSync(5,frame);}; send();",
    'setInterval(()=>{},1000);',
  ].join('');
  const contract = createTrustedRunnerSidecarLaunchContract({
    execution_id: 'execution-1',
    attempt: 1,
    sidecar_argv: [process.execPath, '-e', script],
    worker_argv: [process.execPath, '-e', 'setInterval(()=>{},1000)'],
    endpoint_path: '/tmp/zj-loop/execution-1.sock',
    bootstrap_profile_sha256: binding.bootstrap_profile_sha256,
    execution_binding_digest: binding.execution_binding_digest,
    secret_content_type: 'application/octet-stream',
    secret_byte_length: Buffer.byteLength('opaque-secret'),
  });
  const bootstrap = createTrustedRunnerSidecarBootstrap({ contract, secret: Buffer.from('opaque-secret'), binding_frame: { schema: 'zj-loop.bootstrap_frame.v1', channel_role: 'identity-binding', payload: { bootstrap_profile_sha256: binding.bootstrap_profile_sha256, execution_binding_digest: binding.execution_binding_digest } } });
  await bootstrap.start();
  const status = await bootstrap.waitForStatus({ timeout_ms: 2_000 });
  assert.equal(status.payload.status, 'runtime-ready');
  assert.ok(Number.isInteger(status.payload.worker_pid));
  assert.deepEqual(status.payload.worker_fd_probe.inherited_fds, []);
  assert.notEqual(status.payload.worker_pid, bootstrap.process_group_id());
  assert.doesNotThrow(() => process.kill(status.payload.worker_pid, 0));
  const cleanup = await bootstrap.cleanup({ grace_ms: 1_000 });
  assert.equal(cleanup.status, 'cleaned');
  assert.throws(() => process.kill(status.payload.worker_pid, 0));
});
