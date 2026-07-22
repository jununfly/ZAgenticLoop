import type { ArtifactLimits } from './contracts.js';
export declare function readJsonFromZip(bytes: Uint8Array, path: string, limits: ArtifactLimits): {
    schema?: string;
    payload: unknown;
};
