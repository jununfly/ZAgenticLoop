import type { HumanSigner } from './human-signer.js';
export declare function createPemFileHumanSigner(input: {
    human_id: string;
    private_key_path: string;
}): HumanSigner;
