import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';

export const DEFAULT_ROUTE_TABLE_PATH = 'zj-loop/zj-loop-route-table.yaml';

export type RouteTableRoute = {
  route_id?: string;
  enabled?: boolean;
  request_kind?: string;
  consumer?: string;
  consumer_kind?: string;
  mode?: string;
  execution?: {
    mode?: string;
    side_effect_level?: string;
    completion_forms?: string[];
    recent_success_evidence?: string[];
  };
  maturity?: {
    protocol?: string;
    runner?: string;
  };
  capabilities?: {
    scopes?: string[];
    verifiers?: string[];
    max_side_effect_level?: string;
  };
  match?: Record<string, unknown>;
  guards?: Record<string, unknown>;
  evidence_store?: string;
  enabled_reason?: string;
};

export type RouteTableDocument = {
  schemaVersion?: number;
  kind?: string;
  routes?: RouteTableRoute[];
  disabled_dispatch_routes?: RouteTableRoute[];
};

export type RouteStatus = {
  route_id: string;
  consumer: string;
  consumer_kind: string;
  enabled: boolean;
  request_kind: string;
  execution_mode: string;
  side_effect_level: string;
  completion_forms: string[];
  maturity_protocol: string;
  maturity_runner: string;
  max_side_effect_level: string;
  capability_scopes: string[];
  capability_verifiers: string[];
  recent_success_evidence: string[];
  readiness: RouteReadiness;
  readiness_reasons: string[];
  install_ready: boolean;
  execution_ready: boolean;
  user_project_ready: boolean;
  section: 'routes' | 'disabled_dispatch_routes';
  destructive: boolean;
  side_effecting: boolean;
  automation_model: RouteAutomationModel;
};

export type RouteAutomationModel = {
  readiness: {
    level: RouteReadiness;
    install_ready: boolean;
    execution_ready: boolean;
    user_project_ready: boolean;
    reasons: string[];
  };
  authorization: {
    route_enabled: boolean;
    dispatch_allowed: boolean;
    execution_allowed: boolean;
    required_confirmation: string | null;
    blocked_reasons: string[];
  };
};

export type RouteReadiness =
  | 'install-ready'
  | 'execution-ready'
  | 'dogfood-verified'
  | 'live-missing-evidence'
  | 'replayed'
  | 'designed'
  | 'missing';

export type RouteDecision = {
  schema: 'zj-loop.route_decision.v1';
  decision_id: string;
  signal_id: string;
  source: string;
  route: string;
  request_kind: string;
  requested_action: 'dispatch' | 'report' | 'ignore';
  target_consumer: string;
  allowed: boolean;
  status: 'pending' | 'denied';
  reason: string;
  evidence: string[];
};

export type RouteChangeResult = {
  route_id: string;
  consumer: string;
  enabled: boolean;
  changed: boolean;
  confirmation_required: boolean;
  destructive: boolean;
  side_effecting: boolean;
  next_steps: string[];
};

export type RouteMaturityPromotionResult = {
  route_id: string;
  consumer: string;
  runner: 'install-ready' | 'execution-ready';
  enabled: boolean;
  changed: boolean;
  confirmation_required: boolean;
  next_steps: string[];
};

export type RoutePromotionEvidenceKey =
  | 'contract-plan'
  | 'provider-live-side-effect'
  | 'activation-lifecycle'
  | 'post-merge-closeout-handoff';

export type RoutePromotionEvidenceMatch = {
  orchestration_id: string;
  path: string;
  schema?: string;
  kind?: string;
  check_result: 'passed';
};

export type RoutePromotionEvidenceCheck = {
  key: RoutePromotionEvidenceKey;
  satisfied: boolean;
  matches: RoutePromotionEvidenceMatch[];
  missing_reason?: string;
};

export type RoutePromotionGateResult = {
  route_id: string;
  consumer: string;
  target_maturity: 'execution-ready';
  promotable: boolean;
  applied: boolean;
  changed: boolean;
  required_evidence: RoutePromotionEvidenceCheck[];
  missing_evidence: RoutePromotionEvidenceKey[];
  failed_checks: string[];
  next_steps: string[];
  promotion_command: string[];
  apply_result?: RouteMaturityPromotionResult;
};

export type RouteExecutionValidation = {
  route_id: string;
  valid: boolean;
  errors: string[];
  warnings: string[];
};

export type IssueFixRequestLike = {
  status?: string;
  requested_consumer?: string;
  fix_scope?: {
    scopes?: string[];
    areas?: string[];
  };
  verification_gate?: {
    verifiers?: string[];
    commands?: string[];
  };
  verifier_requirements?: string[];
};

export type ClaimEligibility = {
  allowed: boolean;
  reason: string;
  missing: string[];
};

const EXECUTION_MODES = new Set(['report-only', 'request-only', 'claim-only', 'dry-run', 'live']);
const SIDE_EFFECT_LEVELS = ['none', 'evidence', 'request', 'claim', 'issue-comment', 'label', 'branch', 'pr', 'draft-pr', 'cleanup'];
const MATURITY_LEVELS = new Set([
  'missing',
  'designed',
  'replayed',
  'dogfooded',
  'install-ready',
  'execution-ready',
  'user-project-ready',
]);

const CONSUMER_KIND_LIMITS: Record<string, { modes: string[]; maxSideEffect: string; completionForms: string[] }> = {
  'producer-router': { modes: ['report-only', 'request-only'], maxSideEffect: 'request', completionForms: ['report-evidence'] },
  'report-consumer': { modes: ['report-only'], maxSideEffect: 'evidence', completionForms: ['report-evidence'] },
  'human-gate': { modes: ['report-only'], maxSideEffect: 'evidence', completionForms: ['human-decision'] },
  'fix-runner': { modes: ['request-only', 'claim-only', 'dry-run', 'live'], maxSideEffect: 'pr', completionForms: ['repair-pr', 'escalation-issue'] },
  'draft-consumer': { modes: ['report-only', 'request-only', 'dry-run', 'live'], maxSideEffect: 'draft-pr', completionForms: ['draft-pr', 'draft-evidence', 'escalation-issue'] },
  'cleanup-consumer': { modes: ['report-only', 'dry-run', 'live'], maxSideEffect: 'cleanup', completionForms: ['cleanup-done', 'cleanup-skipped', 'escalation-issue'] },
  'activation-consumer': { modes: ['request-only', 'dry-run', 'live'], maxSideEffect: 'branch', completionForms: ['roadmap-branch-pr', 'activation-failed', 'activation-resumable'] },
  'triage-action-consumer': {
    modes: ['request-only', 'dry-run', 'live'],
    maxSideEffect: 'label',
    completionForms: [
      'triage-label-applied',
      'triage-comment-posted',
      'triage-transition-confirmed',
      'issue-fix-request-created',
      'triage-action-skipped',
      'escalation-issue',
    ],
  },
};

export async function loadRouteTable(root: string, routeTablePath = DEFAULT_ROUTE_TABLE_PATH): Promise<RouteTableDocument> {
  const filePath = path.resolve(root, routeTablePath);
  return parseRouteTable(await readFile(filePath, 'utf8'));
}

export function parseRouteTable(text: string): RouteTableDocument {
  const parsed = YAML.parse(text) as RouteTableDocument | null;
  if (!parsed || parsed.kind !== 'zj-loop-route-table') {
    throw new Error('Expected kind: zj-loop-route-table');
  }
  return parsed;
}

export function listRoutes(table: RouteTableDocument): RouteStatus[] {
  return [
    ...normalizeRouteSection(table.routes, 'routes'),
    ...normalizeRouteSection(table.disabled_dispatch_routes, 'disabled_dispatch_routes'),
  ];
}

export function validateRouteExecutionContract(route: RouteStatus): RouteExecutionValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const limits = CONSUMER_KIND_LIMITS[route.consumer_kind];
  if (!limits) errors.push(`unknown consumer_kind: ${route.consumer_kind}`);
  if (!EXECUTION_MODES.has(route.execution_mode)) errors.push(`unknown execution.mode: ${route.execution_mode}`);
  if (!SIDE_EFFECT_LEVELS.includes(route.side_effect_level)) errors.push(`unknown side_effect_level: ${route.side_effect_level}`);
  if (!MATURITY_LEVELS.has(route.maturity_protocol)) errors.push(`unknown maturity.protocol: ${route.maturity_protocol}`);
  if (!MATURITY_LEVELS.has(route.maturity_runner)) errors.push(`unknown maturity.runner: ${route.maturity_runner}`);

  if (limits) {
    if (!limits.modes.includes(route.execution_mode)) {
      errors.push(`${route.consumer_kind} cannot use execution.mode=${route.execution_mode}`);
    }
    if (sideEffectRank(route.side_effect_level) > sideEffectRank(limits.maxSideEffect)) {
      errors.push(`${route.consumer_kind} cannot use side_effect_level=${route.side_effect_level}`);
    }
    if (sideEffectRank(route.max_side_effect_level) > sideEffectRank(limits.maxSideEffect)) {
      errors.push(`${route.consumer_kind} cannot claim max_side_effect_level=${route.max_side_effect_level}`);
    }
    if (route.completion_forms.length === 0) {
      errors.push(`${route.consumer_kind} must declare at least one completion_form`);
    }
    for (const form of route.completion_forms) {
      if (!limits.completionForms.includes(form)) {
        errors.push(`${route.consumer_kind} cannot use completion_form=${form}`);
      }
    }
  }

  if (route.execution_mode === 'live' && !isRouteLiveReady(route)) {
    errors.push('live execution requires runner maturity dogfooded or execution-ready and non-evidence side-effect boundary');
  }
  if (route.request_kind === 'report-only' && route.execution_mode !== 'report-only' && route.execution_mode !== 'dry-run') {
    warnings.push('report-only request kind should not imply request consumption or work execution');
  }
  return { route_id: route.route_id, valid: errors.length === 0, errors, warnings };
}

export function isRouteLiveReady(route: RouteStatus): boolean {
  return (
    route.execution_mode === 'live' &&
    (route.maturity_runner === 'dogfooded' || route.maturity_runner === 'execution-ready') &&
    sideEffectRank(route.side_effect_level) > sideEffectRank('evidence') &&
    route.recent_success_evidence.length > 0
  );
}

export function canClaimRequest(input: {
  route: RouteStatus;
  request: IssueFixRequestLike;
  consumer?: string;
}): ClaimEligibility {
  const consumer = input.consumer ?? input.route.consumer;
  const missing: string[] = [];
  if (input.route.consumer !== consumer) missing.push('consumer mismatch');
  if (!input.route.enabled) missing.push('route disabled');
  if (input.route.consumer_kind !== 'fix-runner') missing.push('route is not a fix-runner');
  if (input.route.execution_mode !== 'claim-only' && input.route.execution_mode !== 'live') {
    missing.push('route execution mode cannot claim');
  }
  if (input.request.status !== 'requested') missing.push('request status is not requested');
  if (input.request.requested_consumer && input.request.requested_consumer !== consumer) {
    missing.push('request consumer mismatch');
  }
  for (const scope of input.request.fix_scope?.scopes ?? []) {
    if (!input.route.capability_scopes.includes(scope)) missing.push(`missing scope capability: ${scope}`);
  }

  const requiredVerifiers = [
    ...(input.request.verifier_requirements ?? []),
    ...(input.request.verification_gate?.verifiers ?? []),
  ];
  for (const verifier of requiredVerifiers) {
    if (!input.route.capability_verifiers.includes(verifier)) missing.push(`missing verifier capability: ${verifier}`);
  }

  return {
    allowed: missing.length === 0,
    reason: missing.length === 0 ? 'claim allowed' : 'claim denied',
    missing,
  };
}

export function findRoute(table: RouteTableDocument, selector: string): RouteStatus {
  const matches = listRoutes(table).filter((route) => route.route_id === selector || route.consumer === selector);
  if (matches.length === 0) throw new Error(`Unknown route or consumer: ${selector}`);
  if (matches.length > 1) {
    throw new Error(`Ambiguous route or consumer: ${selector}. Use route_id.`);
  }
  return matches[0];
}

export function buildRouteDecision(input: {
  table: RouteTableDocument;
  selector: string;
  source?: string;
  signalId?: string;
  evidence?: string[];
}): RouteDecision {
  const route = findRoute(input.table, input.selector);
  const source = input.source ?? 'workflow-dispatch';
  const signalId = input.signalId ?? `${source}:${route.route_id}`;
  const allowed = route.enabled;
  return {
    schema: 'zj-loop.route_decision.v1',
    decision_id: stableId(`route:${route.route_id}:${signalId}`),
    signal_id: signalId,
    source,
    route: route.route_id,
    request_kind: route.request_kind,
    requested_action: allowed && route.request_kind === 'report-only' ? 'report' : allowed ? 'dispatch' : 'ignore',
    target_consumer: route.consumer,
    allowed,
    status: allowed ? 'pending' : 'denied',
    reason: allowed ? 'route enabled' : 'route disabled',
    evidence: input.evidence ?? [],
  };
}

export async function setRouteEnabled(input: {
  root: string;
  selector: string;
  enabled: boolean;
  confirm?: string;
  reason?: string;
  routeTablePath?: string;
}): Promise<RouteChangeResult> {
  const routeTablePath = input.routeTablePath ?? DEFAULT_ROUTE_TABLE_PATH;
  const filePath = path.resolve(input.root, routeTablePath);
  const text = await readFile(filePath, 'utf8');
  const table = parseRouteTable(text);
  const route = findRoute(table, input.selector);
  const confirmationRequired = input.enabled && route.side_effecting;
  if (confirmationRequired) {
    const expected = expectedConfirmationPhrase(route);
    if (input.confirm !== expected) {
      throw new Error(`Confirmation required: --confirm "${expected}"`);
    }
  }

  const target = findMutableRoute(table, route.route_id);
  const changed = target.enabled !== input.enabled || (input.reason !== undefined && target.enabled_reason !== input.reason);
  if (changed) {
    const updatedText = patchRouteEnabledText(text, {
      routeId: route.route_id,
      enabled: input.enabled,
      reason: input.reason,
    });
    if (updatedText !== null) {
      await writeFile(filePath, updatedText);
    } else {
      target.enabled = input.enabled;
      if (input.reason) target.enabled_reason = input.reason;
      if (!input.enabled && target.enabled_reason) delete target.enabled_reason;
      await writeFile(filePath, YAML.stringify(table));
    }
  }
  return {
    route_id: route.route_id,
    consumer: route.consumer,
    enabled: input.enabled,
    changed,
    confirmation_required: confirmationRequired,
    destructive: route.destructive,
    side_effecting: route.side_effecting,
    next_steps: input.enabled
      ? [`Run zj-loop-route status ${route.consumer}`, 'Run the matching workflow smoke path and inspect evidence.']
      : [`Run zj-loop-route status ${route.consumer}`, 'Re-run audit or workflow smoke path if rollback was due to failure.'],
  };
}

export async function promoteRouteMaturity(input: {
  root: string;
  selector: string;
  runner: 'install-ready' | 'execution-ready';
  confirm?: string;
  routeTablePath?: string;
}): Promise<RouteMaturityPromotionResult> {
  const routeTablePath = input.routeTablePath ?? DEFAULT_ROUTE_TABLE_PATH;
  const filePath = path.resolve(input.root, routeTablePath);
  const text = await readFile(filePath, 'utf8');
  const table = parseRouteTable(text);
  const route = findRoute(table, input.selector);
  const confirmationRequired = input.runner === 'execution-ready';
  const expected = expectedMaturityPromotionPhrase(route, input.runner);
  if (confirmationRequired && input.confirm !== expected) {
    throw new Error(`Confirmation required: --confirm "${expected}"`);
  }

  const target = findMutableRoute(table, route.route_id);
  const changed = target.maturity?.runner !== input.runner;
  if (changed) {
    const updatedText = patchRouteMaturityRunnerText(text, {
      routeId: route.route_id,
      runner: input.runner,
    });
    if (updatedText !== null) {
      await writeFile(filePath, updatedText);
    } else {
      target.maturity = { ...(target.maturity ?? {}), runner: input.runner };
      await writeFile(filePath, YAML.stringify(table));
    }
  }

  return {
    route_id: route.route_id,
    consumer: route.consumer,
    runner: input.runner,
    enabled: route.enabled,
    changed,
    confirmation_required: confirmationRequired,
    next_steps: [
      `Run zj-loop-route status ${route.route_id} --json`,
      'Enable the route separately only when authorization and verifier requirements are satisfied.',
    ],
  };
}

export async function evaluateRoutePromotionGate(input: {
  root: string;
  selector: string;
  target: 'execution-ready';
  orchestrationId?: string;
  apply?: boolean;
  confirm?: string;
  routeTablePath?: string;
}): Promise<RoutePromotionGateResult> {
  const routeTablePath = input.routeTablePath ?? DEFAULT_ROUTE_TABLE_PATH;
  const table = await loadRouteTable(input.root, routeTablePath);
  const route = findRoute(table, input.selector);
  const failedChecks: string[] = [];
  if (route.route_id !== 'roadmap-sliced-development' || route.consumer !== 'roadmap-sliced-development') {
    failedChecks.push('promotion-gate currently supports roadmap-sliced-development only');
  }

  const evidenceChecks = await collectRoadmapActivationPromotionEvidence({
    root: input.root,
    orchestrationId: input.orchestrationId,
  });
  const missingEvidence = evidenceChecks
    .filter((check) => !check.satisfied)
    .map((check) => check.key);
  const promotable = failedChecks.length === 0 && missingEvidence.length === 0;
  const promotionCommand = [
    'zj-loop-route',
    'promotion-gate',
    route.route_id,
    '--target',
    input.target,
    '--apply',
    '--confirm',
    expectedMaturityPromotionPhrase(route, input.target),
  ];
  const nextSteps = promotable
    ? input.apply
      ? [`Run zj-loop-route status ${route.route_id} --json`, 'Enable the route separately only when authorization and verifier requirements are satisfied.']
      : ['Review the promotion gate evidence, then run the promotion_command with --apply only when intentional.']
    : ['Collect the missing evidence, then rerun zj-loop-route promotion-gate.'];

  let applyResult: RouteMaturityPromotionResult | undefined;
  if (input.apply) {
    if (!promotable) {
      throw new Error(`Promotion gate failed: missing evidence ${missingEvidence.join(', ') || 'none'}${failedChecks.length > 0 ? `; ${failedChecks.join('; ')}` : ''}`);
    }
    applyResult = await promoteRouteMaturity({
      root: input.root,
      selector: route.route_id,
      runner: input.target,
      confirm: input.confirm,
      routeTablePath,
    });
  }

  return {
    route_id: route.route_id,
    consumer: route.consumer,
    target_maturity: input.target,
    promotable,
    applied: Boolean(applyResult),
    changed: applyResult?.changed ?? false,
    required_evidence: evidenceChecks,
    missing_evidence: missingEvidence,
    failed_checks: failedChecks,
    next_steps: nextSteps,
    promotion_command: promotionCommand,
    apply_result: applyResult,
  };
}

async function collectRoadmapActivationPromotionEvidence(input: {
  root: string;
  orchestrationId?: string;
}): Promise<RoutePromotionEvidenceCheck[]> {
  const checks = new Map<RoutePromotionEvidenceKey, RoutePromotionEvidenceCheck>([
    ['contract-plan', emptyEvidenceCheck('contract-plan', 'missing contract-plan review artifact')],
    ['provider-live-side-effect', emptyEvidenceCheck('provider-live-side-effect', 'missing completed provider live side effect evidence')],
    ['activation-lifecycle', emptyEvidenceCheck('activation-lifecycle', 'missing activation lifecycle evidence artifact')],
    ['post-merge-closeout-handoff', emptyEvidenceCheck('post-merge-closeout-handoff', 'missing post-merge closeout handoff artifact')],
  ]);
  const orchestrationPaths = await listOrchestrationEnvelopePaths(input);
  for (const envelopePath of orchestrationPaths) {
    const envelope = await readJsonObject(envelopePath.absolutePath);
    if (!isRoadmapActivationOrchestration(envelope)) continue;
    const orchestrationId = stringField(envelope.orchestration_id) ?? envelopePath.orchestrationId;
    const adapter = objectField(envelope.consumer_adapter_result);
    const reviewArtifacts = arrayField(adapter?.review_artifacts);
    const storagePath = stringField(objectField(envelope.storage)?.path) ?? envelopePath.relativePath;
    const liveSideEffects = objectField(adapter?.live_side_effects);

    const contractArtifact = reviewArtifacts.find((artifact) => stringField(objectField(artifact)?.kind) === 'contract-plan');
    if (contractArtifact) {
      const artifactPath = stringField(objectField(contractArtifact)?.path);
      const schema = stringField(objectField(contractArtifact)?.schema);
      if (artifactPath && schema === 'zj-loop.consumer_adapter_result.v1' && await jsonPathExists(input.root, artifactPath)) {
        addEvidenceMatch(checks.get('contract-plan'), {
          orchestration_id: orchestrationId,
          path: artifactPath,
          schema,
          kind: 'contract-plan',
          check_result: 'passed',
        });
      }
    }

    if (
      liveSideEffects?.attempted === true &&
      liveSideEffects.status === 'completed' &&
      typeof liveSideEffects.external_tool === 'string' &&
      typeof liveSideEffects.idempotency_key === 'string' &&
      objectField(liveSideEffects.review)?.url &&
      objectField(liveSideEffects.branch)?.name
    ) {
      addEvidenceMatch(checks.get('provider-live-side-effect'), {
        orchestration_id: orchestrationId,
        path: storagePath,
        schema: 'zj-loop.consumer_adapter_result.v1',
        kind: 'provider-live-side-effect',
        check_result: 'passed',
      });
    }

    const lifecycleArtifact = reviewArtifacts.find((artifact) => stringField(objectField(artifact)?.kind) === 'activation-lifecycle');
    if (lifecycleArtifact) {
      const artifactPath = stringField(objectField(lifecycleArtifact)?.path);
      const schema = stringField(objectField(lifecycleArtifact)?.schema);
      const lifecycle = artifactPath ? await readJsonObject(path.resolve(input.root, artifactPath)) : null;
      if (
        artifactPath &&
        schema === 'zj-loop.activation_lifecycle_evidence.v1' &&
        typeof lifecycle?.activation_state === 'string' &&
        typeof lifecycle?.failure_class === 'string'
      ) {
        addEvidenceMatch(checks.get('activation-lifecycle'), {
          orchestration_id: orchestrationId,
          path: artifactPath,
          schema,
          kind: 'activation-lifecycle',
          check_result: 'passed',
        });
      }
    }

    const closeoutArtifact = reviewArtifacts.find((artifact) => stringField(objectField(artifact)?.kind) === 'post-merge-closeout-handoff');
    if (closeoutArtifact) {
      const artifactPath = stringField(objectField(closeoutArtifact)?.path);
      const schema = stringField(objectField(closeoutArtifact)?.schema);
      const handoff = artifactPath ? await readJsonObject(path.resolve(input.root, artifactPath)) : null;
      if (
        artifactPath &&
        schema === 'zj-loop.post_merge_closeout_handoff.v1' &&
        typeof handoff?.provider === 'string' &&
        Array.isArray(objectField(handoff.dry_run_command)?.args) &&
        typeof objectField(handoff.live_closeout_command)?.available === 'boolean'
      ) {
        addEvidenceMatch(checks.get('post-merge-closeout-handoff'), {
          orchestration_id: orchestrationId,
          path: artifactPath,
          schema,
          kind: 'post-merge-closeout-handoff',
          check_result: 'passed',
        });
      }
    }
  }

  return Array.from(checks.values());
}

function emptyEvidenceCheck(key: RoutePromotionEvidenceKey, missingReason: string): RoutePromotionEvidenceCheck {
  return {
    key,
    satisfied: false,
    matches: [],
    missing_reason: missingReason,
  };
}

function addEvidenceMatch(check: RoutePromotionEvidenceCheck | undefined, match: RoutePromotionEvidenceMatch) {
  if (!check) return;
  check.matches.push(match);
  check.satisfied = true;
  delete check.missing_reason;
}

async function listOrchestrationEnvelopePaths(input: {
  root: string;
  orchestrationId?: string;
}): Promise<Array<{ absolutePath: string; relativePath: string; orchestrationId: string }>> {
  const baseRelative = 'zj-loop/orchestrations';
  if (input.orchestrationId) {
    const relativePath = `${baseRelative}/${input.orchestrationId}.json`;
    return [{
      absolutePath: path.resolve(input.root, relativePath),
      relativePath,
      orchestrationId: input.orchestrationId,
    }];
  }

  const base = path.resolve(input.root, baseRelative);
  let entries;
  try {
    entries = await readdir(base, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => {
      const orchestrationId = entry.name.slice(0, -'.json'.length);
      const relativePath = `${baseRelative}/${entry.name}`;
      return {
        absolutePath: path.resolve(input.root, relativePath),
        relativePath,
        orchestrationId,
      };
    });
}

function isRoadmapActivationOrchestration(value: Record<string, unknown> | null): value is Record<string, unknown> {
  if (!value) return false;
  const routeDecision = objectField(value.route_decision);
  const consumerAdapterResult = objectField(value.consumer_adapter_result);
  return (
    routeDecision?.route === 'roadmap-sliced-development' &&
    consumerAdapterResult?.route_id === 'roadmap-sliced-development'
  );
}

async function jsonPathExists(root: string, relativePath: string): Promise<boolean> {
  return Boolean(await readJsonObject(path.resolve(root, relativePath)));
}

async function readJsonObject(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf8'));
    return objectField(parsed);
  } catch {
    return null;
  }
}

function objectField(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function arrayField(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function patchRouteEnabledText(
  text: string,
  input: { routeId: string; enabled: boolean; reason?: string },
): string | null {
  const lineEnding = text.includes('\r\n') ? '\r\n' : '\n';
  const trailingNewline = text.endsWith('\n');
  const lines = text.split(/\r?\n/);
  if (trailingNewline) lines.pop();

  const routeLineIndex = lines.findIndex((line) => yamlLineScalarEquals(line, 'route_id', input.routeId));
  if (routeLineIndex === -1) return null;

  const blockStart = findRouteBlockStart(lines, routeLineIndex);
  if (blockStart === -1) return null;
  const itemIndent = lines[blockStart].match(/^(\s*)-\s+/)?.[1];
  if (itemIndent === undefined) return null;

  let blockEnd = lines.length;
  const nextItem = new RegExp(`^${escapeRegExp(itemIndent)}-\\s+`);
  for (let index = blockStart + 1; index < lines.length; index += 1) {
    if (nextItem.test(lines[index])) {
      blockEnd = index;
      break;
    }
  }

  const enabledIndex = findKeyLineInBlock(lines, blockStart, blockEnd, 'enabled');
  if (enabledIndex === -1) return null;
  const enabledIndent = lines[enabledIndex].match(/^(\s*)/)?.[1] ?? `${itemIndent}  `;
  lines[enabledIndex] = `${enabledIndent}enabled: ${input.enabled ? 'true' : 'false'}`;

  const reasonIndex = findKeyLineInBlock(lines, blockStart, blockEnd, 'enabled_reason');
  if (!input.enabled) {
    if (reasonIndex !== -1) lines.splice(reasonIndex, 1);
  } else if (input.reason !== undefined) {
    const reasonLine = `${enabledIndent}enabled_reason: ${formatYamlScalar(input.reason)}`;
    if (reasonIndex === -1) {
      lines.splice(enabledIndex + 1, 0, reasonLine);
    } else {
      lines[reasonIndex] = reasonLine;
    }
  }

  return `${lines.join(lineEnding)}${trailingNewline ? lineEnding : ''}`;
}

function patchRouteMaturityRunnerText(
  text: string,
  input: { routeId: string; runner: 'install-ready' | 'execution-ready' },
): string | null {
  const lineEnding = text.includes('\r\n') ? '\r\n' : '\n';
  const trailingNewline = text.endsWith('\n');
  const lines = text.split(/\r?\n/);
  if (trailingNewline) lines.pop();

  const routeLineIndex = lines.findIndex((line) => yamlLineScalarEquals(line, 'route_id', input.routeId));
  if (routeLineIndex === -1) return null;

  const blockStart = findRouteBlockStart(lines, routeLineIndex);
  if (blockStart === -1) return null;
  const itemIndent = lines[blockStart].match(/^(\s*)-\s+/)?.[1];
  if (itemIndent === undefined) return null;

  let blockEnd = lines.length;
  const nextItem = new RegExp(`^${escapeRegExp(itemIndent)}-\\s+`);
  for (let index = blockStart + 1; index < lines.length; index += 1) {
    if (nextItem.test(lines[index])) {
      blockEnd = index;
      break;
    }
  }

  const maturityIndex = findKeyLineInBlock(lines, blockStart, blockEnd, 'maturity');
  if (maturityIndex === -1) return null;
  const runnerIndex = findKeyLineInBlock(lines, maturityIndex + 1, blockEnd, 'runner');
  if (runnerIndex === -1) return null;
  const runnerIndent = lines[runnerIndex].match(/^(\s*)/)?.[1] ?? `${itemIndent}    `;
  lines[runnerIndex] = `${runnerIndent}runner: ${input.runner}`;
  return `${lines.join(lineEnding)}${trailingNewline ? lineEnding : ''}`;
}

function findRouteBlockStart(lines: string[], routeLineIndex: number): number {
  for (let index = routeLineIndex; index >= 0; index -= 1) {
    if (/^\s*-\s+/.test(lines[index])) return index;
  }
  return -1;
}

function findKeyLineInBlock(lines: string[], start: number, end: number, key: string): number {
  const pattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*:`);
  for (let index = start; index < end; index += 1) {
    if (pattern.test(lines[index])) return index;
  }
  return -1;
}

function yamlLineScalarEquals(line: string, key: string, expected: string): boolean {
  const match = line.match(new RegExp(`^\\s*(?:-\\s*)?${escapeRegExp(key)}\\s*:\\s*(.*?)\\s*(?:#.*)?$`));
  if (!match) return false;
  return unquoteYamlScalar(match[1]) === expected;
}

function unquoteYamlScalar(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function formatYamlScalar(value: string): string {
  return YAML.stringify(value).trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeRouteSection(
  routes: RouteTableRoute[] | undefined,
  section: 'routes' | 'disabled_dispatch_routes',
): RouteStatus[] {
  return (routes ?? []).map((route) => {
    const routeId = requireString(route.route_id, 'route_id');
    const consumer = requireString(route.consumer, `consumer for ${routeId}`);
    const requestKind = route.request_kind ?? 'report-only';
    const consumerKind = route.consumer_kind ?? inferConsumerKind(route);
    const executionMode = route.execution?.mode ?? inferExecutionMode(route);
    const sideEffectLevel = route.execution?.side_effect_level ?? inferSideEffectLevel(route);
    const completionForms = route.execution?.completion_forms ?? [];
    const maturityProtocol = route.maturity?.protocol ?? 'missing';
    const maturityRunner = route.maturity?.runner ?? 'missing';
    const maxSideEffectLevel = route.capabilities?.max_side_effect_level ?? sideEffectLevel;
    const capabilityScopes = route.capabilities?.scopes ?? [];
    const capabilityVerifiers = route.capabilities?.verifiers ?? [];
    const recentSuccessEvidence = route.execution?.recent_success_evidence ?? [];
    const destructive = Boolean(route.guards?.destructive_actions_enabled === false || route.mode?.includes('closeout'));
    const sideEffecting = requestKind !== 'report-only' || destructive || sideEffectRank(sideEffectLevel) > sideEffectRank('evidence');
    const readiness = classifyRouteReadiness({
      executionMode,
      sideEffectLevel,
      maturityRunner,
      recentSuccessEvidence,
    });
    const statusWithoutAutomation = {
      route_id: routeId,
      consumer,
      consumer_kind: consumerKind,
      enabled: route.enabled === true,
      request_kind: requestKind,
      execution_mode: executionMode,
      side_effect_level: sideEffectLevel,
      completion_forms: completionForms,
      maturity_protocol: maturityProtocol,
      maturity_runner: maturityRunner,
      max_side_effect_level: maxSideEffectLevel,
      capability_scopes: capabilityScopes,
      capability_verifiers: capabilityVerifiers,
      recent_success_evidence: recentSuccessEvidence,
      readiness: readiness.readiness,
      readiness_reasons: readiness.reasons,
      install_ready: readiness.readiness === 'install-ready' || readiness.readiness === 'execution-ready',
      execution_ready: readiness.readiness === 'execution-ready',
      user_project_ready: readiness.readiness === 'install-ready' || readiness.readiness === 'execution-ready',
      section,
      destructive,
      side_effecting: sideEffecting,
    };
    return {
      ...statusWithoutAutomation,
      automation_model: buildRouteAutomationModel(statusWithoutAutomation),
    };
  });
}

export function buildRouteAutomationModel(route: Omit<RouteStatus, 'automation_model'>): RouteAutomationModel {
  const blockedReasons: string[] = [];
  if (!route.enabled) blockedReasons.push('route disabled');
  if (!route.execution_ready) blockedReasons.push('route is not execution-ready');
  return {
    readiness: {
      level: route.readiness,
      install_ready: route.install_ready,
      execution_ready: route.execution_ready,
      user_project_ready: route.user_project_ready,
      reasons: route.readiness_reasons,
    },
    authorization: {
      route_enabled: route.enabled,
      dispatch_allowed: route.enabled,
      execution_allowed: route.enabled && route.execution_ready,
      required_confirmation: route.side_effecting && !route.enabled ? expectedConfirmationPhrase(route) : null,
      blocked_reasons: blockedReasons,
    },
  };
}

export function classifyRouteReadiness(input: {
  executionMode: string;
  sideEffectLevel: string;
  maturityRunner: string;
  recentSuccessEvidence?: string[];
}): { readiness: RouteReadiness; reasons: string[] } {
  const evidence = input.recentSuccessEvidence ?? [];
  if (input.maturityRunner === 'execution-ready') {
    return {
      readiness: 'execution-ready',
      reasons: ['runner maturity is execution-ready'],
    };
  }

  if (input.maturityRunner === 'install-ready') {
    return {
      readiness: 'install-ready',
      reasons: ['runner maturity is install-ready'],
    };
  }

  if (input.maturityRunner === 'user-project-ready') {
    return {
      readiness: 'install-ready',
      reasons: ['legacy runner maturity user-project-ready maps to install-ready'],
    };
  }

  if (input.executionMode === 'live') {
    if (
      input.maturityRunner === 'dogfooded' &&
      sideEffectRank(input.sideEffectLevel) > sideEffectRank('evidence') &&
      evidence.length > 0
    ) {
      return {
        readiness: 'dogfood-verified',
        reasons: ['live dogfood evidence exists', 'not yet promoted to execution-ready'],
      };
    }
    return {
      readiness: 'live-missing-evidence',
      reasons: ['live execution requires runner maturity and recent evidence before promotion'],
    };
  }

  if (input.maturityRunner === 'replayed' || input.maturityRunner === 'dogfooded') {
    return {
      readiness: 'replayed',
      reasons: [`runner maturity is ${input.maturityRunner}; generated-bundle live evidence is still required`],
    };
  }

  if (input.maturityRunner === 'designed') {
    return {
      readiness: 'designed',
      reasons: ['runner contract is designed but not replayed or dogfooded'],
    };
  }

  return {
    readiness: 'missing',
    reasons: ['runner is missing'],
  };
}

function inferConsumerKind(route: RouteTableRoute): string {
  if (route.request_kind === 'issue-fix-request') return 'fix-runner';
  if (route.request_kind === 'activation-comment') return 'activation-consumer';
  if (route.consumer === 'post-merge-cleanup') return 'cleanup-consumer';
  if (route.consumer === 'daily-triage') return 'producer-router';
  return 'report-consumer';
}

function inferExecutionMode(route: RouteTableRoute): string {
  if (route.request_kind === 'issue-fix-request') return route.guards?.claim_only === true ? 'claim-only' : 'request-only';
  if (route.request_kind === 'activation-comment') return 'request-only';
  return 'report-only';
}

function inferSideEffectLevel(route: RouteTableRoute): string {
  if (route.request_kind === 'issue-fix-request') return route.guards?.claim_only === true ? 'claim' : 'request';
  if (route.request_kind === 'activation-comment') return 'request';
  return 'evidence';
}

function sideEffectRank(level: string): number {
  const index = SIDE_EFFECT_LEVELS.indexOf(level);
  return index === -1 ? Number.POSITIVE_INFINITY : index;
}

function findMutableRoute(table: RouteTableDocument, routeId: string): RouteTableRoute {
  const route = [...(table.routes ?? []), ...(table.disabled_dispatch_routes ?? [])].find((entry) => entry.route_id === routeId);
  if (!route) throw new Error(`Unknown route: ${routeId}`);
  return route;
}

export function expectedConfirmationPhrase(route: { consumer: string; destructive: boolean }): string {
  return route.destructive
    ? `enable ${route.consumer} destructive side effects`
    : `enable ${route.consumer} side effects`;
}

export function expectedMaturityPromotionPhrase(
  route: { consumer: string },
  runner: 'install-ready' | 'execution-ready',
): string {
  return `promote ${route.consumer} runner to ${runner}`;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Missing ${field}`);
  return value;
}

function stableId(value: string): string {
  let hash = 0x811c9dc5;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return `rd_${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
