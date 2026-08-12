import { type AgentRegistration } from './agent-registration.js';
export declare const OPN_TASK_ADMISSION_SCHEMA: "zj-loop.opn_task_admission.v1";
export type SupervisionMode = 'supervised' | 'unattended';
export type OpnTaskAdmissionResult = {
    status: 'admitted';
    supervision_mode: SupervisionMode;
    ready_for_agent: true;
    side_effects_executed: false;
} | {
    status: 'pending-human-approval';
    supervision_mode: 'supervised';
    ready_for_agent: boolean;
    reason: 'human-approval-required';
    side_effects_executed: false;
} | {
    status: 'blocked';
    supervision_mode: SupervisionMode;
    ready_for_agent: false;
    reason: string;
    side_effects_executed: false;
};
export declare function evaluateOpnTaskAdmission(input: {
    task: unknown;
    registration: AgentRegistration;
    target_node_id: string;
    supervision_mode: SupervisionMode;
}): OpnTaskAdmissionResult;
