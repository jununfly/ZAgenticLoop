import { validateAgentRegistration, type AgentRegistration } from './agent-registration.js';
import { validateBoundedLoopTask, type BoundedLoopTask } from './agent-task.js';

export const OPN_TASK_ADMISSION_SCHEMA = 'zj-loop.opn_task_admission.v1' as const;
export type SupervisionMode = 'supervised' | 'unattended';
export type OpnTaskAdmissionResult =
  | { status: 'admitted'; supervision_mode: SupervisionMode; ready_for_agent: true; side_effects_executed: false }
  | { status: 'pending-human-approval'; supervision_mode: 'supervised'; ready_for_agent: boolean; reason: 'human-approval-required'; side_effects_executed: false }
  | { status: 'blocked'; supervision_mode: SupervisionMode; ready_for_agent: false; reason: string; side_effects_executed: false };

function readyForAgent(task: BoundedLoopTask): boolean {
  return task.objective.trim().length > 0
    && task.success_criteria.length > 0
    && task.expected_evidence_kinds.length > 0
    && task.budget.timeout_ms > 0
    && task.budget.max_iterations > 0
    && task.cancellation.mode === 'cooperative';
}

export function evaluateOpnTaskAdmission(input: { task: unknown; registration: AgentRegistration; target_node_id: string; supervision_mode: SupervisionMode }): OpnTaskAdmissionResult {
  if (input.supervision_mode !== 'supervised' && input.supervision_mode !== 'unattended') return { status: 'blocked', supervision_mode: 'unattended', ready_for_agent: false, reason: 'supervision-mode-invalid', side_effects_executed: false };
  if (validateAgentRegistration(input.registration).status !== 'valid') return { status: 'blocked', supervision_mode: input.supervision_mode, ready_for_agent: false, reason: 'agent-registration-invalid', side_effects_executed: false };
  if (input.registration.agent_id !== input.target_node_id) return { status: 'blocked', supervision_mode: input.supervision_mode, ready_for_agent: false, reason: 'target-agent-mismatch', side_effects_executed: false };
  const taskValidation = validateBoundedLoopTask(input.task);
  if (taskValidation.status !== 'valid') return { status: 'blocked', supervision_mode: input.supervision_mode, ready_for_agent: false, reason: taskValidation.reason, side_effects_executed: false };
  const task = input.task as BoundedLoopTask;
  if (!input.registration.accepted_task_kinds.includes(task.task_kind) && !input.registration.accepted_task_kinds.includes('agent.task')) return { status: 'blocked', supervision_mode: input.supervision_mode, ready_for_agent: false, reason: 'task-kind-not-accepted', side_effects_executed: false };
  if (!input.registration.capabilities.includes('task.execute')) return { status: 'blocked', supervision_mode: input.supervision_mode, ready_for_agent: false, reason: 'task-execute-capability-missing', side_effects_executed: false };
  const ready = readyForAgent(task);
  if (input.supervision_mode === 'unattended' && !ready) return { status: 'blocked', supervision_mode: 'unattended', ready_for_agent: false, reason: 'ready-for-agent-required', side_effects_executed: false };
  if (input.supervision_mode === 'supervised') return { status: 'pending-human-approval', supervision_mode: 'supervised', ready_for_agent: ready, reason: 'human-approval-required', side_effects_executed: false };
  return { status: 'admitted', supervision_mode: 'unattended', ready_for_agent: true, side_effects_executed: false };
}
