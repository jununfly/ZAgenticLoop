#!/usr/bin/env node
import { runRouteConsumerCli } from './route-consumer-cli.js';
process.exitCode = await runRouteConsumerCli({
    name: 'zj-loop-changelog-drafter',
    routeId: 'changelog-drafter-draft-request',
    description: 'Plan Changelog Drafter draft-request execution through the Route Table consumer gate.',
});
