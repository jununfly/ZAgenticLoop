#!/usr/bin/env node
import { type CliIo, type CliSpec } from './cli.js';
export declare const OPN_AGENT_RESULT_SCHEMA: "zj-loop.opn_agent_result.v1";
export declare const opnTransportCliSpec: CliSpec;
export declare function runOpnTransportCli(argv?: readonly string[], io?: CliIo): Promise<number>;
