export declare const CONTENT_ADDRESSED_ARTIFACT_SCHEMA: "zj-loop.content_addressed_artifact.v1";
export declare const ARTIFACT_SIZE_LIMIT: number;
export type ArtifactMetadata = {
    schema: typeof CONTENT_ADDRESSED_ARTIFACT_SCHEMA;
    artifact_id: string;
    network_id: string;
    content_sha256: string;
    content_type: string;
    size_bytes: number;
    created_at: string;
};
export type ContentAddressedArtifactStore = {
    putArtifact(input: {
        network_id: string;
        content: Uint8Array;
        content_type: string;
        now?: string;
    }): Promise<{
        status: 'recorded' | 'duplicate';
        metadata: ArtifactMetadata;
    }>;
    readArtifact(input: {
        network_id: string;
        artifact_id: string;
    }): Promise<{
        metadata: ArtifactMetadata;
        content: Uint8Array;
    }>;
};
export declare function createContentAddressedArtifactStore(input: {
    root: string;
}): ContentAddressedArtifactStore;
