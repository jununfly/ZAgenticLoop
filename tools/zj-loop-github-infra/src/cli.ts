#!/usr/bin/env node
import { runCli } from './cli-runtime.js';
import { GitHubReadClient } from './read-client.js';
const exitCode = await runCli();
process.exitCode = exitCode;
