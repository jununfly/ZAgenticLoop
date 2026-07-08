#!/usr/bin/env node
import { runRouteConsumerCli } from './route-consumer-cli.js';
process.exitCode = await runRouteConsumerCli({
    name: 'zj-loop-issue-triage-action',
    routeId: 'issue-triage-action',
    description: 'Plan Issue Triage Action execution through the Route Table consumer gate.',
});
