export const HUMAN_HANDOFF_SCHEMA = 'zj-loop.human_handoff.v1';

export type HumanHandoff = {
  schema: typeof HUMAN_HANDOFF_SCHEMA;
  confirmation_location: 'not-required' | 'terminal-command' | 'provider-comment' | 'workflow-dispatch';
  required_phrase: string | null;
  side_effects: string[];
  why_required: string;
  resume_command: string[];
  retry_policy: 'resume-after-remediation' | 'new-request-or-bounded-resume' | 'do-not-retry';
};

export function buildHumanHandoff(input: {
  orchestrationId: string;
  reason: string;
  stopCode?: string;
  requiredPhrase?: string;
  confirmationLocation?: Exclude<HumanHandoff['confirmation_location'], 'not-required'>;
  sideEffects?: string[];
  whyRequired?: string;
}): HumanHandoff {
  const requiresConfirmation = typeof input.requiredPhrase === 'string' && input.requiredPhrase.trim().length > 0;
  return {
    schema: HUMAN_HANDOFF_SCHEMA,
    confirmation_location: requiresConfirmation ? input.confirmationLocation ?? 'terminal-command' : 'not-required',
    required_phrase: requiresConfirmation ? input.requiredPhrase!.trim() : null,
    side_effects: requiresConfirmation ? input.sideEffects ?? [] : [],
    why_required: input.whyRequired ?? whyRequiredForStop(input.stopCode, input.reason),
    resume_command: [
      'zj-loop-dispatch',
      '--root',
      '.',
      '--orchestration',
      input.orchestrationId,
      '--mode',
      'resume',
    ],
    retry_policy: retryPolicyForStop(input.stopCode),
  };
}

function whyRequiredForStop(stopCode: string | undefined, reason: string): string {
  if (stopCode === 'credential-missing') {
    return 'No human confirmation is required; provide the missing credential before retrying live side effects.';
  }
  if (stopCode === 'actor-role-insufficient') {
    return 'No human confirmation is required; run with an allowed actor role before retrying live side effects.';
  }
  return `No human confirmation is required; resolve the stop signal before resuming: ${reason}`;
}

function retryPolicyForStop(stopCode: string | undefined): HumanHandoff['retry_policy'] {
  if (stopCode === 'duplicate-completed-loop') return 'do-not-retry';
  if (stopCode === 'previous-loop-failed') return 'new-request-or-bounded-resume';
  return 'resume-after-remediation';
}
