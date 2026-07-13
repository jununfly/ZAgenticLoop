export const PREFLIGHT_RESULT_SCHEMA = 'zj-loop.preflight_result.v1';
export function evaluateRuntimePreflight(input) {
    const repairsApplied = [];
    const checks = [];
    const warnings = [];
    const guards = input.route.guards ?? {};
    const maxWorkUnits = readPositiveInteger(guards.max_work_units);
    const effectiveMaxWorkUnits = maxWorkUnits ?? 30;
    if (maxWorkUnits === undefined) {
        repairsApplied.push({
            field: 'max_work_units',
            value: '30',
            reason: 'route guard missing; defaulted low-risk max_work_units for preflight',
        });
    }
    const declarationCheck = evaluateDeclarationCompleteness({
        route: input.route,
        executionLayer: input.executionLayer,
        guards,
    });
    checks.push(declarationCheck.check);
    if (declarationCheck.warning)
        warnings.push(declarationCheck.warning);
    if (declarationCheck.stopSignal) {
        return buildResult({
            input,
            checks,
            repairsApplied,
            warnings,
            maxWorkUnits: effectiveMaxWorkUnits,
            stopSignal: declarationCheck.stopSignal,
        });
    }
    const loopCheck = evaluateExistingLoop(input.runtime?.existingLoop);
    checks.push(loopCheck.check);
    if (loopCheck.stopSignal) {
        return buildResult({
            input,
            checks,
            repairsApplied,
            warnings,
            maxWorkUnits: effectiveMaxWorkUnits,
            stopSignal: loopCheck.stopSignal,
        });
    }
    const budgetCheck = evaluateWorkUnits({
        requested: input.runtime?.workUnitsRequested,
        max: effectiveMaxWorkUnits,
    });
    checks.push(budgetCheck.check);
    if (budgetCheck.stopSignal) {
        return buildResult({
            input,
            checks,
            repairsApplied,
            warnings,
            maxWorkUnits: effectiveMaxWorkUnits,
            stopSignal: budgetCheck.stopSignal,
        });
    }
    const credentialCheck = evaluateCredentials({
        guards,
        credentials: input.runtime?.credentials,
        executionLayer: input.executionLayer,
        provider: input.signal?.provider,
    });
    checks.push(credentialCheck.check);
    if (credentialCheck.stopSignal) {
        return buildResult({
            input,
            checks,
            repairsApplied,
            warnings,
            maxWorkUnits: effectiveMaxWorkUnits,
            stopSignal: credentialCheck.stopSignal,
        });
    }
    const actorCheck = evaluateActor({
        guards,
        actorRole: input.runtime?.actorRole,
        executionLayer: input.executionLayer,
    });
    checks.push(actorCheck.check);
    if (actorCheck.stopSignal) {
        return buildResult({
            input,
            checks,
            repairsApplied,
            warnings,
            maxWorkUnits: effectiveMaxWorkUnits,
            stopSignal: actorCheck.stopSignal,
        });
    }
    const workspaceCheck = evaluateWorkspace({
        dirtyFiles: input.runtime?.dirtyFiles,
        targetPaths: input.runtime?.targetPaths,
        executionLayer: input.executionLayer,
    });
    checks.push(workspaceCheck.check);
    if (workspaceCheck.stopSignal) {
        return buildResult({
            input,
            checks,
            repairsApplied,
            warnings,
            maxWorkUnits: effectiveMaxWorkUnits,
            stopSignal: workspaceCheck.stopSignal,
        });
    }
    return buildResult({
        input,
        checks,
        repairsApplied,
        warnings,
        maxWorkUnits: effectiveMaxWorkUnits,
    });
}
function buildResult(input) {
    const status = input.stopSignal
        ? 'hard_stop'
        : input.checks.some((check) => check.status === 'warn') || input.warnings.length > 0
            ? 'warn'
            : 'pass';
    return {
        schema: PREFLIGHT_RESULT_SCHEMA,
        status,
        route_id: input.input.route.route_id,
        consumer: input.input.route.consumer,
        execution_layer: input.input.executionLayer,
        checks: input.checks,
        repairs_applied: input.repairsApplied,
        warnings: unique(input.warnings),
        limits: {
            max_work_units: input.maxWorkUnits,
        },
        loop_key: buildPreflightLoopKey({
            route: input.input.route,
            signal: input.input.signal,
        }),
        ...(input.stopSignal === undefined ? {} : { stop_signal: input.stopSignal }),
    };
}
export function buildPreflightLoopKey(input) {
    return [
        stringOr(input.signal?.provider, 'none'),
        stringOr(input.signal?.subject?.kind, 'unknown-subject'),
        stringOr(input.signal?.subject?.id, 'unknown-id'),
        stringOr(input.signal?.intent, 'unknown-intent'),
        input.route.route_id,
        stringOr(input.signal?.signal_id, 'no-request-id'),
    ].join(':');
}
function evaluateDeclarationCompleteness(input) {
    const missing = [];
    if (input.guards.max_work_units === undefined)
        missing.push('guards.max_work_units');
    if (input.executionLayer === 'live-side-effect') {
        if (!hasCredentialDeclaration(input.guards.required_credentials))
            missing.push('guards.required_credentials');
        if (!Array.isArray(input.guards.required_actor_roles))
            missing.push('guards.required_actor_roles');
        if (!input.route.side_effect_level || input.route.side_effect_level === 'none')
            missing.push('execution.side_effect_level');
    }
    if (missing.length === 0) {
        return { check: { id: 'route-preflight-declarations', status: 'pass', reason: 'route preflight declarations are sufficient' } };
    }
    if (input.executionLayer === 'live-side-effect') {
        return {
            check: {
                id: 'route-preflight-declarations',
                status: 'hard_stop',
                reason: `live side effect route is missing critical preflight declarations: ${missing.join(', ')}`,
            },
            stopSignal: {
                stop_code: 'preflight-declaration-missing',
                layer: 'preflight',
                reason: `Live side effect route is missing critical preflight declarations: ${missing.join(', ')}.`,
                next_steps: ['Add missing Route Table guards before live execution.'],
            },
        };
    }
    return {
        check: {
            id: 'route-preflight-declarations',
            status: 'warn',
            reason: `route preflight declarations incomplete: ${missing.join(', ')}`,
        },
        warning: 'route-preflight-fields-incomplete',
    };
}
function evaluateExistingLoop(existingLoop) {
    if (!existingLoop) {
        return { check: { id: 'loop-key', status: 'pass', reason: 'no existing loop conflict supplied' } };
    }
    if (existingLoop.status === 'completed') {
        return {
            check: { id: 'loop-key', status: 'hard_stop', reason: `loop already completed as ${existingLoop.orchestration_id}` },
            stopSignal: {
                stop_code: 'duplicate-completed-loop',
                layer: 'preflight',
                reason: `Loop already completed as ${existingLoop.orchestration_id}.`,
                next_steps: [`Inspect existing orchestration: ${existingLoop.orchestration_id}.`],
            },
        };
    }
    if (existingLoop.status === 'in_progress' || existingLoop.status === 'resumable') {
        return {
            check: { id: 'loop-key', status: 'hard_stop', reason: `loop should resume ${existingLoop.orchestration_id}` },
            stopSignal: {
                stop_code: 'resume-existing-loop',
                layer: 'preflight',
                reason: `Existing loop can be resumed: ${existingLoop.orchestration_id}.`,
                next_steps: [`Resume existing orchestration: ${existingLoop.orchestration_id}.`],
            },
        };
    }
    return {
        check: { id: 'loop-key', status: 'hard_stop', reason: `previous loop failed as ${existingLoop.orchestration_id}` },
        stopSignal: {
            stop_code: 'previous-loop-failed',
            layer: 'preflight',
            reason: `Previous loop failed as ${existingLoop.orchestration_id}; retry requires a new request or explicit bounded resume.`,
            next_steps: ['Create a new request id or resume explicitly if the attempt budget allows it.'],
        },
    };
}
function evaluateWorkUnits(input) {
    const requested = input.requested ?? 1;
    if (requested > input.max) {
        return {
            check: { id: 'work-units', status: 'hard_stop', reason: `requested ${requested} work units exceeds max ${input.max}` },
            stopSignal: {
                stop_code: 'max-work-units-exceeded',
                layer: 'preflight',
                reason: `Requested ${requested} work units exceeds max_work_units ${input.max}.`,
                next_steps: ['Reduce requested work units or explicitly raise the Route Table guard.'],
            },
        };
    }
    return { check: { id: 'work-units', status: 'pass', reason: `requested ${requested} work units within max ${input.max}` } };
}
function evaluateCredentials(input) {
    const required = credentialNamesForProvider(input.guards.required_credentials, input.provider);
    if (required.length === 0 || input.executionLayer !== 'live-side-effect') {
        return { check: { id: 'credentials', status: 'pass', reason: 'no live credential check required' } };
    }
    const missing = required.filter((name) => !input.credentials?.[name]);
    if (missing.length > 0) {
        return {
            check: { id: 'credentials', status: 'hard_stop', reason: `missing credentials: ${missing.join(', ')}` },
            stopSignal: {
                stop_code: 'credential-missing',
                layer: 'preflight',
                reason: `Missing required credential: ${missing.join(', ')}.`,
                next_steps: missing.map((name) => `Provide required credential: ${name}.`),
            },
        };
    }
    return { check: { id: 'credentials', status: 'pass', reason: 'required credentials present' } };
}
function evaluateActor(input) {
    const required = stringArray(input.guards.required_actor_roles);
    if (required.length === 0 || input.executionLayer !== 'live-side-effect') {
        return { check: { id: 'actor-role', status: 'pass', reason: 'no live actor role check required' } };
    }
    if (!input.actorRole || !required.includes(input.actorRole)) {
        return {
            check: { id: 'actor-role', status: 'hard_stop', reason: `actor role must be one of: ${required.join(', ')}` },
            stopSignal: {
                stop_code: 'actor-role-insufficient',
                layer: 'preflight',
                reason: `Actor role must be one of: ${required.join(', ')}.`,
                next_steps: ['Run as an allowed actor role or request maintainer/collaborator confirmation.'],
            },
        };
    }
    return { check: { id: 'actor-role', status: 'pass', reason: 'actor role is allowed' } };
}
function evaluateWorkspace(input) {
    const dirtyFiles = input.dirtyFiles ?? [];
    const targetPaths = input.targetPaths ?? [];
    const overlaps = dirtyFiles.filter((file) => targetPaths.includes(file));
    if (input.executionLayer === 'live-side-effect' && overlaps.length > 0) {
        return {
            check: { id: 'workspace', status: 'hard_stop', reason: `dirty workspace overlaps target paths: ${overlaps.join(', ')}` },
            stopSignal: {
                stop_code: 'dirty-workspace-conflict',
                layer: 'preflight',
                reason: `Dirty workspace overlaps target paths: ${overlaps.join(', ')}.`,
                next_steps: ['Commit, stash, or remove overlapping workspace changes before live execution.'],
            },
        };
    }
    if (dirtyFiles.length > 0 && input.executionLayer !== 'live-side-effect') {
        return { check: { id: 'workspace', status: 'warn', reason: 'dirty workspace present but route only writes review/report evidence' } };
    }
    return { check: { id: 'workspace', status: 'pass', reason: 'workspace has no blocking dirty file overlap' } };
}
function readPositiveInteger(value) {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0)
        return value;
    if (typeof value === 'string' && /^\d+$/.test(value))
        return Number(value);
    return undefined;
}
function stringArray(value) {
    return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim().length > 0) : [];
}
function credentialNamesForProvider(value, provider) {
    if (Array.isArray(value))
        return stringArray(value);
    if (value && typeof value === 'object') {
        const providerKey = stringOr(provider, 'none');
        const byProvider = value[providerKey];
        return stringArray(byProvider);
    }
    return [];
}
function hasCredentialDeclaration(value) {
    if (Array.isArray(value))
        return true;
    return Boolean(value && typeof value === 'object' && Object.keys(value).length > 0);
}
function stringOr(value, fallback) {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}
function unique(values) {
    return [...new Set(values)];
}
