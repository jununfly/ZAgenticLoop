#!/usr/bin/env node
import { createGitLabIssueNoteBridgeServer } from './gitlab-issue-note-bridge-server.js';
import { readGitLabIssueNoteBridgeConfig } from './gitlab-issue-note-bridge-config.js';

const env = process.env;
const config = readGitLabIssueNoteBridgeConfig(env);
const required = (name: keyof typeof config, envName: string): string => {
  const value = config[name];
  if (!value) throw new Error(`${envName}-required`);
  return String(value);
};
const requiredEnv = (name: string): string => {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name}-required`);
  return value;
};

const projectPath = required('projectPath', 'ZJ_LOOP_BRIDGE_PROJECT_PATH');
const routeId = required('routeId', 'ZJ_LOOP_BRIDGE_ROUTE_ID');
const pipelineRef = required('pipelineRef', 'ZJ_LOOP_BRIDGE_PIPELINE_REF');
const targetRoute = required('targetRoute', 'ZJ_LOOP_BRIDGE_TARGET_ROUTE');
const marker = required('marker', 'ZJ_LOOP_BRIDGE_MARKER');
const webhookSecret = requiredEnv('ZJ_LOOP_GITLAB_WEBHOOK_SECRET');
const triggerToken = requiredEnv('ZJ_LOOP_GITLAB_BRIDGE_TRIGGER_TOKEN');
const server = createGitLabIssueNoteBridgeServer({
  projectPath,
  route: { routeId, marker, targetRoute, targetRef: pipelineRef },
  triggerConfig: {
    projectPath,
    routeId,
    pipelineRef,
    targetRoute,
    allowedEventType: config.allowedEventType || 'Note Hook',
    enabled: config.enabled === true,
    maturity: config.maturity || 'install-ready',
  },
  webhookSecret,
  triggerToken,
  root: env.ZJ_LOOP_BRIDGE_ROOT?.trim() || '.',
  apiBaseUrl: env.ZJ_LOOP_GITLAB_API_URL?.trim() || 'https://gitlab.com/api/v4',
});
const port = Number(env.PORT || 8080);
if (!Number.isSafeInteger(port) || port <= 0 || port > 65535) throw new Error('PORT-invalid');
server.listen(port, '0.0.0.0', () => console.log(JSON.stringify({ schema: 'zj-loop.gitlab_issue_note_bridge_server.v1', status: 'listening', path: '/gitlab/webhook/issue-note', port })));
