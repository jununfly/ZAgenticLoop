#!/usr/bin/env node
import { type CliIo } from './cli.js';
type RuntimePaths = {
    state_store: string;
    evidence_store: string;
    worktree_root: string;
};
export declare function defaultRealAgentDogfoodRuntimePaths(platform?: NodeJS.Platform, home?: string, env?: NodeJS.ProcessEnv): RuntimePaths;
export declare function runRealAgentDogfoodCli(argv?: readonly string[], io?: CliIo): Promise<number>;
export {};
