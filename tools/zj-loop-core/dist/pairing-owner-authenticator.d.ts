import { type HumanPublicIdentity } from './human-authority.js';
import type { PairingOwnerAuthenticator } from './pairing-http-server.js';
export declare const PAIRING_OWNER_AUTHENTICATOR_SCHEMA: "zj-loop.pairing_owner_authenticator.v1";
export declare function createPairingOwnerAuthenticator(input: {
    identity: HumanPublicIdentity;
    owner_token: string;
    now?: () => string;
}): PairingOwnerAuthenticator;
export declare function loadPairingOwnerIdentity(input: {
    human_id: string;
    public_key_path: string;
}): Promise<HumanPublicIdentity>;
