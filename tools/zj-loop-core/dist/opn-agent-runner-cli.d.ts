#!/usr/bin/env node
import { type CliSpec } from './cli.js';
import type { BoundedLoopTask } from './agent-task.js';
export declare function createRetryBoundedLoopTask(task: BoundedLoopTask): BoundedLoopTask;
export declare const opnAgentRunnerCliSpec: CliSpec;
