#!/usr/bin/env node
import { runRouteConsumerCli } from './route-consumer-cli.js';

process.exitCode = await runRouteConsumerCli({
  name: 'zj-loop-ci-sweeper',
  routeId: 'ci-sweeper',
  description: 'Plan CI Sweeper execution through the Route Table consumer gate.',
});
