import type { OpnArtifactMetadata } from './opn-artifact-store.js';
export declare function createTlsOpnArtifactPublisher(input: {
    endpoint: string;
    ca: string | Buffer;
    cert: string | Buffer;
    key: string | Buffer;
    bearer_token: string;
}): {
    publish(inputValue: {
        bytes: Buffer;
        metadata: OpnArtifactMetadata;
        transfer_id: string;
        target_node_id: string;
    }): Promise<void>;
};
export declare function createTlsOpnArtifactDownloader(input: {
    endpoint: string;
    ca: string | Buffer;
    cert: string | Buffer;
    key: string | Buffer;
    bearer_token: string;
}): {
    download(artifact_id: string): Promise<Buffer>;
};
