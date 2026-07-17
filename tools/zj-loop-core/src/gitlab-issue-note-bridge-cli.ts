#!/usr/bin/env node
import { createGitLabIssueNoteBridgeServer } from './gitlab-issue-note-bridge-server.js';

const env = process.env;
const required = (name: string): string => {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name}-required`);
  return value;
};

const projectPath = required('ZJ_LOOP_BRIDGE_PROJECT_PATH');
const routeId = required('ZJ_LOOP_BRIDGE_ROUTE_ID');
const pipelineRef = required('ZJ_LOOP_BRIDGE_PIPELINE_REF');
const targetRoute = required('ZJ_LOOP_BRIDGE_TARGET_ROUTE');
const marker = required('ZJ_LOOP_BRIDGE_MARKER');
const token = required('ZJ_LOOP_GITLAB_BRIDGE_TRIGGER_TOKEN');
const server = createGitLabIssueNoteBridgeServer({
  projectPath,
  route: { routeId, marker, targetRoute, targetRef: pipelineRef },
  triggerConfig: {
    projectPath,
    routeId,
    pipelineRef,
    targetRoute,
    allowedEventType: env.ZJ_LOOP_BRIDGE_ALLOWED_EVENT_TYPE?.trim() || 'Issue Hook',
    enabled: env.ZJ_LOOP_BRIDGE_ENABLED === 'true',
    maturity: env.ZJ_LOOP_BRIDGE_MATURITY?.trim() || 'install-ready',
  },
  token,
  root: env.ZJ_LOOP_BRIDGE_ROOT?.trim() || '.',
  apiBaseUrl: env.ZJ_LOOP_GITLAB_API_URL?.trim() || 'https://gitlab.com/api/v4',
});
const port = Number(env.PORT || 8080);
if (!Number.isSafeInteger(port) || port <= 0 || port > 65535) throw new Error('PORT-invalid');
server.listen(port, '0.0.0.0', () => console.log(JSON.stringify({ schema: 'zj-loop.gitlab_issue_note_bridge_server.v1', status: 'listening', path: '/gitlab/webhook/issue-note', port })));
