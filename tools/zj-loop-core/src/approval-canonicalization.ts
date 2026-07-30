import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';

export const APPROVAL_CANONICALIZATION = 'jcs-rfc8785' as const;
export const APPROVAL_CANONICALIZATION_PROFILE = 'approval-v2-default-2026-07' as const;
export const APPROVAL_CANONICALIZATION_PROFILE_SCHEMA = 'zj-loop.canonicalization_profile.v1' as const;

export type StrictJsonValue = null | boolean | string | number | StrictJsonValue[] | { [key: string]: StrictJsonValue };

export type ApprovalCanonicalizationProfile = {
  schema: typeof APPROVAL_CANONICALIZATION_PROFILE_SCHEMA;
  profile_id: typeof APPROVAL_CANONICALIZATION_PROFILE;
  canonicalization: typeof APPROVAL_CANONICALIZATION;
  schema_version: 'zj-loop.human_authority.v2';
  set_paths: readonly string[];
};

export const APPROVAL_PROFILE: ApprovalCanonicalizationProfile = Object.freeze({
  schema: APPROVAL_CANONICALIZATION_PROFILE_SCHEMA,
  profile_id: APPROVAL_CANONICALIZATION_PROFILE,
  canonicalization: APPROVAL_CANONICALIZATION,
  schema_version: 'zj-loop.human_authority.v2',
  set_paths: Object.freeze([]),
});

function invalid(): never {
  throw new Error('approval-canonicalization-invalid');
}

function validate(value: unknown, seen: Set<object>): asserts value is StrictJsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) invalid();
    return;
  }
  if (typeof value !== 'object') invalid();
  if (seen.has(value)) invalid();
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const ownKeys = Reflect.ownKeys(value);
      if (ownKeys.some((key) => typeof key !== 'string' || !/^\d+$/.test(key) && key !== 'length')) invalid();
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) invalid();
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !('value' in descriptor) || descriptor.enumerable !== true || descriptor.configurable !== true || descriptor.writable !== true) invalid();
        validate(descriptor.value, seen);
      }
      return;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) invalid();
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') invalid();
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor) || descriptor.enumerable !== true || descriptor.configurable !== true || descriptor.writable !== true) invalid();
      validate(descriptor.value, seen);
    }
  } finally {
    seen.delete(value);
  }
}

export function canonicalizeApproval(value: unknown, profile: ApprovalCanonicalizationProfile = APPROVAL_PROFILE): Uint8Array {
  if (profile.profile_id !== APPROVAL_CANONICALIZATION_PROFILE || profile.canonicalization !== APPROVAL_CANONICALIZATION || profile.schema_version !== 'zj-loop.human_authority.v2') invalid();
  validate(value, new Set());
  const result = canonicalize(value);
  if (typeof result !== 'string') invalid();
  const bytes = new TextEncoder().encode(result);
  if (bytes.byteLength > 64 * 1024) throw new Error('approval-json-limit-exceeded');
  return bytes;
}

export function approvalDigest(value: unknown, profile?: ApprovalCanonicalizationProfile): string {
  return `sha256:${createHash('sha256').update(canonicalizeApproval(value, profile)).digest('hex')}`;
}

export function approvalProfileSha256(profile: ApprovalCanonicalizationProfile = APPROVAL_PROFILE): string {
  const bytes = new TextEncoder().encode(canonicalize(profile));
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}
