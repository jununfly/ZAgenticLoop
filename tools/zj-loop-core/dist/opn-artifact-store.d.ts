export declare const OPN_ARTIFACT_SCHEMA: "zj-loop.opn_artifact.v1";
export declare const OPN_ARTIFACT_MAX_BYTES: number;
export type OpnArtifactMetadata = {
    schema: typeof OPN_ARTIFACT_SCHEMA;
    artifact_id: string;
    content_sha256: string;
    size_bytes: number;
    file_name: string;
    media_type: string;
};
export type OpnArtifactStore = {
    put(input: {
        bytes: Uint8Array;
        file_name: string;
        media_type?: string;
        expected_digest?: string;
    }): Promise<{
        status: 'stored' | 'duplicate';
        metadata: OpnArtifactMetadata;
    }>;
    read(artifact_id: string): Promise<{
        metadata: OpnArtifactMetadata;
        bytes: Buffer;
    }>;
    has(artifact_id: string): Promise<boolean>;
};
export declare function createOpnArtifactStore(input: {
    root: string;
    max_bytes?: number;
}): OpnArtifactStore;
