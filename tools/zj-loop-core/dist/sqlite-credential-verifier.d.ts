import type { CredentialVerifier } from './sqlite-state-store-server.js';
import type { ScopedCredential } from './node-enrollment.js';
export declare const SQLITE_CREDENTIAL_STORE_SCHEMA: "zj-loop.sqlite_credential_store.v1";
export type SqliteCredentialVerifier = CredentialVerifier & {
    issueCredential(input: {
        credential: ScopedCredential;
        now?: string;
    }): Promise<{
        status: 'recorded' | 'duplicate';
        credential_id: string;
        token?: string;
    }>;
    revokeCredential(input: {
        credential_id: string;
        now?: string;
    }): Promise<{
        status: 'revoked' | 'duplicate';
    }>;
    close(): Promise<void>;
};
export declare function createSqliteCredentialVerifier(input: {
    filename: string;
    now?: () => string;
}): SqliteCredentialVerifier;
