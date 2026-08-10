#!/usr/bin/env node
import { runCli } from './cli.js';
import { createOpnEndpointServer, loadOpnEndpointTls } from './opn-endpoint.js';
import { createPairingOwnerAuthenticator, loadPairingOwnerIdentity } from './pairing-owner-authenticator.js';
import { createSqliteStateStore } from './sqlite-state-store.js';
import { createSqliteCredentialIssuance } from './sqlite-credential-issuance.js';
import { createOpnArtifactStore } from './opn-artifact-store.js';
import { unlink } from 'node:fs/promises';
import { acquireOpnEndpointLock, createOpnEndpointBinding, classifyOpnEndpointStatus, isProcessAlive, opnEndpointRuntimePaths, probeOpnEndpointHealthz, readOpnEndpointBinding, spawnOpnEndpointServe, writeOpnEndpointBinding } from './opn-endpoint-supervisor.js';
import { loadOpnEndpointConfig, opnEndpointIdentityDir } from './opn-endpoint-config.js';
import { installOpnEndpointService, opnEndpointServiceLabel, uninstallOpnEndpointService } from './opn-endpoint-service.js';
const spec = {
    name: 'zj-loop-opn-endpoint',
    description: 'Start the OPN pairing endpoint.',
    usage: 'zj-loop-opn-endpoint [start|status|stop|restart|serve|install-service|uninstall-service] [options]',
    options: [
        { name: 'command', type: 'positional', description: 'Lifecycle command (default: serve)' },
        { name: 'bind', type: 'string', description: 'Address to listen on', valueName: 'ADDRESS' },
        { name: 'port', type: 'string', description: 'TCP port to listen on', valueName: 'PORT' },
        { name: 'network_id', flag: 'network-id', type: 'string', description: 'Existing OPN network id', valueName: 'ID' },
        { name: 'state_store', flag: 'state-store', type: 'string', description: 'SQLite StateStore path', valueName: 'PATH' },
        { name: 'server_key', flag: 'server-key', type: 'string', description: 'Server private key PEM path', valueName: 'PATH' },
        { name: 'server_cert', flag: 'server-cert', type: 'string', description: 'Server certificate PEM path', valueName: 'PATH' },
        { name: 'client_ca', flag: 'client-ca', type: 'string', description: 'Client CA certificate PEM path', valueName: 'PATH' },
        { name: 'artifact_store', flag: 'artifact-store', type: 'string', description: 'Content-addressed ArtifactStore directory', valueName: 'PATH' },
        { name: 'owner_human_id', flag: 'owner-human-id', type: 'string', description: 'Development Human owner id' },
        { name: 'owner_public_key', flag: 'owner-public-key', type: 'string', description: 'Development Human authority public key PEM path', valueName: 'PATH' },
        { name: 'owner_token', flag: 'owner-token', type: 'string', description: 'Development owner authorization token' },
        { name: 'session_ttl_minutes', flag: 'session-ttl-minutes', type: 'string', description: 'Maximum pairing and transport session lifetime in minutes (default: 50)' },
        { name: 'runtime_dir', flag: 'runtime-dir', type: 'string', description: 'Supervisor runtime directory (default: <state-store>.runtime)', valueName: 'PATH' },
        { name: 'identity_dir', flag: 'identity-dir', type: 'string', description: 'Identity directory containing opn-endpoint.json (default: OPN_IDENTITY_DIR)', valueName: 'PATH' },
    ],
    async handler({ options, io }) {
        const command = String(options.command ?? 'serve');
        const identity_dir = options.identity_dir === undefined && !process.env.OPN_IDENTITY_DIR ? '' : opnEndpointIdentityDir(options.identity_dir === undefined ? undefined : String(options.identity_dir));
        let fileConfig;
        if (identity_dir) {
            try {
                fileConfig = await loadOpnEndpointConfig(identity_dir);
            }
            catch (error) {
                if (command !== 'serve' || options.identity_dir !== undefined || process.env.OPN_IDENTITY_DIR)
                    throw error;
            }
        }
        const resolved = (name, configName = name) => options[name] !== undefined ? String(options[name]) : String(fileConfig?.[configName] ?? '');
        const bind = resolved('bind');
        const port = Number(resolved('port', 'port'));
        const network_id = resolved('network_id');
        const sessionTtlMinutes = Number(resolved('session_ttl_minutes') || 50);
        if (!Number.isInteger(sessionTtlMinutes) || sessionTtlMinutes <= 0 || sessionTtlMinutes > 24 * 60)
            throw new Error('opn-endpoint-session-ttl-invalid');
        const session_ttl_ms = sessionTtlMinutes * 60 * 1000;
        const config = { bind, port, network_id, state_store: resolved('state_store'), server_key: resolved('server_key'), server_cert: resolved('server_cert'), client_ca: resolved('client_ca'), artifact_store: resolved('artifact_store') || undefined, owner_human_id: resolved('owner_human_id') || undefined, owner_public_key: resolved('owner_public_key') || undefined, owner_token: resolved('owner_token') || undefined, session_ttl_minutes: sessionTtlMinutes };
        const runtime_dir = String(options.runtime_dir ?? `${config.state_store}.runtime`);
        const paths = opnEndpointRuntimePaths(runtime_dir);
        if (command === 'install-service') {
            const result = await installOpnEndpointService({ label: opnEndpointServiceLabel(network_id), executable: process.execPath, script: process.argv[1], args: identity_dir ? ['serve', '--identity-dir', identity_dir] : ['serve', ...endpointArgs(config)], runtime_dir, working_directory: process.cwd() });
            io.stdout(JSON.stringify({ schema: 'zj-loop.opn_endpoint_supervisor.v1', status: 'service-installed', ...result, runtime_dir, side_effects_executed: true }));
            return;
        }
        if (command === 'uninstall-service') {
            const result = await uninstallOpnEndpointService(opnEndpointServiceLabel(network_id));
            io.stdout(JSON.stringify({ schema: 'zj-loop.opn_endpoint_supervisor.v1', status: 'service-uninstalled', ...result, runtime_dir, side_effects_executed: true }));
            return;
        }
        if (command !== 'serve') {
            if (!Number.isInteger(port) || port <= 0)
                throw new Error('opn-endpoint-supervisor-port-required');
            const binding = await readOpnEndpointBinding(paths.binding);
            if (command === 'start' || command === 'restart') {
                if (command === 'start' && binding && isProcessAlive(binding.pid))
                    throw new Error('opn-endpoint-already-running');
                if (command === 'restart' && binding && isProcessAlive(binding.pid)) {
                    process.kill(binding.pid, 'SIGTERM');
                    await new Promise((resolve) => setTimeout(resolve, 100));
                }
                const child = await spawnOpnEndpointServe({ executable: process.execPath, script: process.argv[1], log_path: paths.log, args: identity_dir ? ['--identity-dir', identity_dir] : endpointArgs(config) });
                const next = createOpnEndpointBinding({ pid: child.pid, config, command: [process.execPath, process.argv[1], 'serve', ...(identity_dir ? ['--identity-dir', identity_dir] : endpointArgs(config))] });
                await writeOpnEndpointBinding(paths.binding, next);
                io.stdout(JSON.stringify({ schema: 'zj-loop.opn_endpoint_supervisor.v1', status: 'started', pid: next.pid, runtime_dir, side_effects_executed: false }));
                return;
            }
            if (command === 'status') {
                const healthz = binding && isProcessAlive(binding.pid) ? await probeOpnEndpointHealthz({ bind: binding.bind, port: binding.port }) : 'failed';
                io.stdout(JSON.stringify({ schema: 'zj-loop.opn_endpoint_supervisor.v1', ...classifyOpnEndpointStatus({ binding, config, process_alive: Boolean(binding && isProcessAlive(binding.pid)), healthz }), runtime_dir, side_effects_executed: false }));
                return;
            }
            if (command === 'stop') {
                if (binding && isProcessAlive(binding.pid))
                    process.kill(binding.pid, 'SIGTERM');
                io.stdout(JSON.stringify({ schema: 'zj-loop.opn_endpoint_supervisor.v1', status: 'stopped', pid: binding?.pid ?? null, runtime_dir, side_effects_executed: false }));
                return;
            }
            throw new Error('opn-endpoint-command-invalid');
        }
        const tls = await loadOpnEndpointTls({ key_path: config.server_key, cert_path: config.server_cert, ca_path: config.client_ca });
        const lock = await acquireOpnEndpointLock(paths.lock);
        const stateStore = createSqliteStateStore({ filename: config.state_store });
        const issuance = createSqliteCredentialIssuance({ filename: config.state_store, stateStore, pairing_intent_ttl_ms: session_ttl_ms });
        const ownerValues = [config.owner_human_id, config.owner_public_key, config.owner_token].filter((value) => value !== undefined);
        if (ownerValues.length !== 0 && ownerValues.length !== 3)
            throw new Error('opn-endpoint-owner-config-incomplete');
        const ownerAuthenticator = ownerValues.length === 3
            ? createPairingOwnerAuthenticator({ identity: await loadPairingOwnerIdentity({ human_id: config.owner_human_id, public_key_path: config.owner_public_key }), owner_token: config.owner_token })
            : undefined;
        let endpoint;
        try {
            endpoint = await createOpnEndpointServer({ bind, port, network_id, stateStore, tls, session_ttl_ms, ownerAuthenticator, artifact_store: createOpnArtifactStore({ root: config.artifact_store ?? `${config.state_store}.artifacts` }), credentialVerifier: { verify: (input) => issuance.verifyCredential({ token: input.token, node_id: input.node_id, network_id: input.network_id ?? network_id, required_capabilities: input.required_capabilities }) }, credentialClaim: { claim: (input) => issuance.claimForPairingSession(input) }, credentialIssue: { issue: async (input) => { const result = await issuance.issuePairingIntent({ ...input, expected_revision: await stateStore.getRevision(input.network_id) }); return { status: result.status, credential_id: result.credential_id }; } } });
        }
        catch (error) {
            await issuance.close();
            await stateStore.close();
            await lock.release();
            throw error;
        }
        await writeOpnEndpointBinding(paths.binding, createOpnEndpointBinding({ pid: process.pid, config, command: process.argv.slice(1) }));
        io.stdout(JSON.stringify({ schema: 'zj-loop.opn_endpoint.v1', status: 'listening', bind: endpoint.address.address, port: endpoint.address.port, network_id, session_ttl_minutes: sessionTtlMinutes, side_effects_executed: false }));
        const shutdown = async () => { await endpoint.close(); await issuance.close(); await stateStore.close(); await unlink(paths.binding).catch(() => undefined); await lock.release(); process.exit(0); };
        process.once('SIGINT', shutdown);
        process.once('SIGTERM', shutdown);
        await new Promise(() => { });
    },
};
function endpointArgs(config) {
    const names = [['bind', '--bind'], ['port', '--port'], ['network_id', '--network-id'], ['state_store', '--state-store'], ['server_key', '--server-key'], ['server_cert', '--server-cert'], ['client_ca', '--client-ca']];
    const args = names.flatMap(([name, flag]) => [flag, String(config[name] ?? '')]);
    const optional = [['artifact_store', '--artifact-store'], ['owner_human_id', '--owner-human-id'], ['owner_public_key', '--owner-public-key'], ['owner_token', '--owner-token'], ['session_ttl_minutes', '--session-ttl-minutes']];
    for (const [name, flag] of optional)
        if (config[name] !== undefined)
            args.push(flag, String(config[name]));
    return args;
}
process.exitCode = await runCli(spec);
