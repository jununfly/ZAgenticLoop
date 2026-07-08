#!/usr/bin/env node
import { runRouteConsumerCli } from './route-consumer-cli.js';
process.exitCode = await runRouteConsumerCli({
    name: 'zj-loop-roadmap-activation',
    routeId: 'roadmap-sliced-development',
    description: 'Plan Roadmap-Sliced Development activation through the Route Table consumer gate.',
});
