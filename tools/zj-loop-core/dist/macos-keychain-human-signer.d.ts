import type { HumanSigner } from './human-signer.js';
export declare function createMacOSKeychainHumanSigner(input: {
    human_id: string;
    key_tag: string;
    helper_path: string;
}): HumanSigner;
