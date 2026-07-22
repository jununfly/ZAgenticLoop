#!/usr/bin/env node
import { runCli } from './cli-runtime.js';
const exitCode = await runCli();
process.exitCode = exitCode;
