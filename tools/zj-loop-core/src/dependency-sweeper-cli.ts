#!/usr/bin/env node
import { runRouteConsumerCli } from './route-consumer-cli.js';

process.exitCode = await runRouteConsumerCli({
  name: 'zj-loop-dependency-sweeper',
  routeId: 'dependency-sweeper',
  description: 'Plan Dependency Sweeper execution through the Route Table consumer gate.',
});
