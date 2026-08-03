import type { SqliteStateStore } from './sqlite-state-store.js';
import { validateRealAgentDogfoodReviewPackage, type RealAgentDogfoodReviewPackage } from './real-agent-dogfood-review-package.js';

export const REAL_AGENT_DOGFOOD_REVIEW_PACKAGE_AGGREGATE_TYPE = 'real-agent-dogfood-review-package' as const;
export const REAL_AGENT_DOGFOOD_REVIEW_PACKAGE_PUBLISHED_SCHEMA = 'zj-loop.real_agent_dogfood_review_package_published.v1' as const;
const DIGEST = /^sha256:[0-9a-f]{64}$/;

export type RealAgentDogfoodReviewPackagePublishedEvent = {
  event_id: string;
  aggregate_type: typeof REAL_AGENT_DOGFOOD_REVIEW_PACKAGE_AGGREGATE_TYPE;
  aggregate_id: string;
  event_type: 'real-agent-dogfood-review-package.published';
  occurred_at: string;
  payload: {
    schema: typeof REAL_AGENT_DOGFOOD_REVIEW_PACKAGE_PUBLISHED_SCHEMA;
    network_id: string;
    dogfood_id: string;
    execution_id: string;
    attempt: number;
    lifecycle_revision: number;
    lifecycle_digest: string;
    package_digest: string;
    evidence_digest: string;
  };
};

type PublicationResult = { status: 'recorded' | 'duplicate' | 'conflict'; aggregate_id: string; revision?: number; current_revision: number; reason?: string };

function publicationScope(input: RealAgentDogfoodReviewPackage): string {
  return `${input.network_id}:${input.dogfood_id}:${input.execution_id}:attempt-${input.attempt}:lifecycle-${input.lifecycle_revision}`;
}

function eventId(input: RealAgentDogfoodReviewPackage): string {
  return `real-agent-dogfood-review-package:${publicationScope(input)}`;
}

function validateInput(input: { review_package: RealAgentDogfoodReviewPackage; evidence_digest: string }): void {
  if (validateRealAgentDogfoodReviewPackage(input.review_package).status !== 'valid') throw new Error('real-agent-dogfood-review-package-invalid');
  if (!DIGEST.test(input.evidence_digest)) throw new Error('real-agent-dogfood-review-package-evidence-digest-invalid');
}

export async function publishRealAgentDogfoodReviewPackage(input: { stateStore: SqliteStateStore; review_package: RealAgentDogfoodReviewPackage; evidence_digest: string; expected_revision: number; now?: string }): Promise<PublicationResult> {
  validateInput(input);
  const reviewPackage = input.review_package;
  const aggregate_id = publicationScope(reviewPackage);
  const event_id = eventId(reviewPackage);
  return input.stateStore.runAtomic((transaction) => {
    const currentRevision = () => (transaction.database.prepare('SELECT current_revision FROM network_metadata WHERE network_id = ?').get(reviewPackage.network_id) as { current_revision: number } | undefined)?.current_revision ?? input.expected_revision;
    const existing = transaction.database.prepare("SELECT payload_json FROM state_events WHERE network_id = ? AND aggregate_type = ? AND aggregate_id = ? AND event_type = 'real-agent-dogfood-review-package.published'").get(reviewPackage.network_id, REAL_AGENT_DOGFOOD_REVIEW_PACKAGE_AGGREGATE_TYPE, aggregate_id) as { payload_json: string } | undefined;
    if (existing) {
      const payload = JSON.parse(existing.payload_json) as RealAgentDogfoodReviewPackagePublishedEvent['payload'];
      if (payload.package_digest === reviewPackage.package_digest && payload.evidence_digest === input.evidence_digest) return { status: 'duplicate', aggregate_id, current_revision: currentRevision() };
      return { status: 'conflict', aggregate_id, current_revision: currentRevision(), reason: 'review-package-publication-conflict' };
    }
    const payload: RealAgentDogfoodReviewPackagePublishedEvent['payload'] = {
      schema: REAL_AGENT_DOGFOOD_REVIEW_PACKAGE_PUBLISHED_SCHEMA,
      network_id: reviewPackage.network_id,
      dogfood_id: reviewPackage.dogfood_id,
      execution_id: reviewPackage.execution_id,
      attempt: reviewPackage.attempt,
      lifecycle_revision: reviewPackage.lifecycle_revision,
      lifecycle_digest: reviewPackage.lifecycle_digest,
      package_digest: reviewPackage.package_digest,
      evidence_digest: input.evidence_digest,
    };
    const event: RealAgentDogfoodReviewPackagePublishedEvent = {
      event_id,
      aggregate_type: REAL_AGENT_DOGFOOD_REVIEW_PACKAGE_AGGREGATE_TYPE,
      aggregate_id,
      event_type: 'real-agent-dogfood-review-package.published',
      occurred_at: input.now ?? new Date().toISOString(),
      payload,
    };
    const appended = transaction.appendEvent({ network_id: reviewPackage.network_id, expected_revision: input.expected_revision, now: input.now, event });
    return { status: appended.status, aggregate_id, revision: appended.revision, current_revision: appended.current_revision, reason: appended.reason };
  });
}
