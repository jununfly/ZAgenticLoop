export declare const APPROVAL_CANONICALIZATION: "jcs-rfc8785";
export declare const APPROVAL_CANONICALIZATION_PROFILE: "approval-v2-default-2026-07";
export declare const APPROVAL_CANONICALIZATION_PROFILE_SCHEMA: "zj-loop.canonicalization_profile.v1";
export type StrictJsonValue = null | boolean | string | number | StrictJsonValue[] | {
    [key: string]: StrictJsonValue;
};
export type ApprovalCanonicalizationProfile = {
    schema: typeof APPROVAL_CANONICALIZATION_PROFILE_SCHEMA;
    profile_id: typeof APPROVAL_CANONICALIZATION_PROFILE;
    canonicalization: typeof APPROVAL_CANONICALIZATION;
    schema_version: 'zj-loop.human_authority.v2';
    set_paths: readonly string[];
};
export declare const APPROVAL_PROFILE: ApprovalCanonicalizationProfile;
export declare function canonicalizeApproval(value: unknown, profile?: ApprovalCanonicalizationProfile): Uint8Array;
export declare function approvalDigest(value: unknown, profile?: ApprovalCanonicalizationProfile): string;
export declare function approvalProfileSha256(profile?: ApprovalCanonicalizationProfile): string;
