export declare const HUMAN_HANDOFF_SCHEMA = "zj-loop.human_handoff.v1";
export type HumanHandoff = {
    schema: typeof HUMAN_HANDOFF_SCHEMA;
    confirmation_location: 'not-required' | 'terminal-command' | 'provider-comment' | 'workflow-dispatch';
    required_phrase: string | null;
    side_effects: string[];
    why_required: string;
    resume_command: string[];
    retry_policy: 'resume-after-remediation' | 'new-request-or-bounded-resume' | 'do-not-retry';
};
export declare function buildHumanHandoff(input: {
    orchestrationId: string;
    reason: string;
    stopCode?: string;
    requiredPhrase?: string;
    confirmationLocation?: Exclude<HumanHandoff['confirmation_location'], 'not-required'>;
    sideEffects?: string[];
    whyRequired?: string;
}): HumanHandoff;
