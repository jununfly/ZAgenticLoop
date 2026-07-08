#!/usr/bin/env node
import { runRouteConsumerCli } from './route-consumer-cli.js';
process.exitCode = await runRouteConsumerCli({
    name: 'zj-loop-pr-steward',
    routeId: 'pr-steward-fix-request',
    description: 'Plan PR Steward fix-request execution through the Route Table consumer gate.',
});
