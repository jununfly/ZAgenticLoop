#!/usr/bin/env node
import { runScheduleProbeCli } from './schedule-probe-command.js';

process.exitCode = await runScheduleProbeCli();
