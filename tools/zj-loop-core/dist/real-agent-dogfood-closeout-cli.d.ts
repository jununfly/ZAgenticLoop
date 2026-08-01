#!/usr/bin/env node
import { type CliIo } from './cli.js';
import type { HumanSigner } from './human-signer.js';
type Deps = {
    signer?: HumanSigner;
    now?: () => string;
};
export declare function runRealAgentDogfoodCloseoutCli(argv?: readonly string[], io?: CliIo, deps?: Deps): Promise<number>;
export {};
