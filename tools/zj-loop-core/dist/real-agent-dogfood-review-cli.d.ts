#!/usr/bin/env node
import { type CliIo } from './cli.js';
import type { HumanSigner } from './human-signer.js';
type ReviewCliDeps = {
    signer?: HumanSigner;
    now?: () => string;
};
export declare function runRealAgentDogfoodReviewCli(argv?: readonly string[], io?: CliIo, deps?: ReviewCliDeps): Promise<number>;
export {};
