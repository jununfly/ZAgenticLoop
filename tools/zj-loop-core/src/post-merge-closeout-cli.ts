#!/usr/bin/env node
import { runRouteConsumerCli } from './route-consumer-cli.js';

process.exitCode = await runRouteConsumerCli({
  name: 'zj-loop-post-merge-closeout',
  routeId: 'post-merge-roadmap-closeout',
  description: 'Plan Post-Merge Roadmap Closeout through the Route Table consumer gate.',
});
