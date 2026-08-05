export type ContentAddressedEvidenceStore = {
    put(input: {
        content: string | Uint8Array;
        kind: string;
    }): Promise<{
        digest: string;
        size: number;
        path: string;
        kind: string;
    }>;
    read(input: {
        digest: string;
        actor: string;
    }): Promise<Buffer>;
    readOnly(input: {
        digest: string;
    }): Promise<Buffer>;
};
export declare function createContentAddressedEvidenceStore(input: {
    root: string;
    initialize?: boolean;
}): Promise<ContentAddressedEvidenceStore>;
