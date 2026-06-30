import { z } from 'zod';
export declare const REGISTRY_SCHEMA_VERSION = 1;
declare const costSchema: z.ZodObject<{
    tokens_noop: z.ZodNumber;
    tokens_report: z.ZodNumber;
    tokens_action: z.ZodNumber;
    suggested_daily_cap: z.ZodNumber;
    early_exit_required: z.ZodBoolean;
}, z.core.$strip>;
declare const patternSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    file: z.ZodOptional<z.ZodString>;
    goal: z.ZodOptional<z.ZodString>;
    cadence: z.ZodString;
    risk: z.ZodOptional<z.ZodString>;
    tools: z.ZodDefault<z.ZodArray<z.ZodString>>;
    skills: z.ZodDefault<z.ZodArray<z.ZodString>>;
    state: z.ZodOptional<z.ZodString>;
    phases: z.ZodDefault<z.ZodArray<z.ZodString>>;
    human_gates: z.ZodDefault<z.ZodArray<z.ZodString>>;
    starter: z.ZodOptional<z.ZodString>;
    week_one_mode: z.ZodOptional<z.ZodString>;
    token_cost: z.ZodString;
    cost: z.ZodObject<{
        tokens_noop: z.ZodNumber;
        tokens_report: z.ZodNumber;
        tokens_action: z.ZodNumber;
        suggested_daily_cap: z.ZodNumber;
        early_exit_required: z.ZodBoolean;
    }, z.core.$strip>;
}, z.core.$strip>;
declare const registrySchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    patterns: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        file: z.ZodOptional<z.ZodString>;
        goal: z.ZodOptional<z.ZodString>;
        cadence: z.ZodString;
        risk: z.ZodOptional<z.ZodString>;
        tools: z.ZodDefault<z.ZodArray<z.ZodString>>;
        skills: z.ZodDefault<z.ZodArray<z.ZodString>>;
        state: z.ZodOptional<z.ZodString>;
        phases: z.ZodDefault<z.ZodArray<z.ZodString>>;
        human_gates: z.ZodDefault<z.ZodArray<z.ZodString>>;
        starter: z.ZodOptional<z.ZodString>;
        week_one_mode: z.ZodOptional<z.ZodString>;
        token_cost: z.ZodString;
        cost: z.ZodObject<{
            tokens_noop: z.ZodNumber;
            tokens_report: z.ZodNumber;
            tokens_action: z.ZodNumber;
            suggested_daily_cap: z.ZodNumber;
            early_exit_required: z.ZodBoolean;
        }, z.core.$strip>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type PatternCost = z.infer<typeof costSchema>;
export type RegistryPattern = z.infer<typeof patternSchema>;
export type PatternRegistry = z.infer<typeof registrySchema>;
export interface LoadPatternRegistryOptions {
    candidates: string[];
}
export declare function parsePatternRegistry(raw: string, source?: string): PatternRegistry;
export declare function loadPatternRegistry(options: LoadPatternRegistryOptions): Promise<PatternRegistry>;
export {};
