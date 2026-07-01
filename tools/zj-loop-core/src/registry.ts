import { access, readFile } from 'node:fs/promises';
import yaml from 'yaml';
import { z } from 'zod';

export const REGISTRY_SCHEMA_VERSION = 1;

const costSchema = z.object({
  tokens_noop: z.number().int().nonnegative(),
  tokens_report: z.number().int().nonnegative(),
  tokens_action: z.number().int().nonnegative(),
  suggested_daily_cap: z.number().int().positive(),
  early_exit_required: z.boolean(),
}).strict();

const toolTargetSchema = z.enum(['grok', 'claude', 'codex']);

const initSchema = z.object({
  tool_starters: z.record(toolTargetSchema, z.string().min(1)).optional(),
  templates: z
    .object({
      minimal_fix: z.boolean().default(false),
      verifier: z.boolean().default(false),
    })
    .strict()
    .default({ minimal_fix: false, verifier: false }),
  budget: z.object({
    max_runs_per_day: z.number().int().positive(),
    max_spawns_l1: z.number().int().nonnegative(),
    max_spawns_l2: z.number().int().nonnegative(),
  }).strict(),
  first_loop_command: z.record(toolTargetSchema, z.string().min(1)),
}).strict();

const patternSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  file: z.string().min(1).optional(),
  goal: z.string().min(1).optional(),
  cadence: z.string().min(1),
  risk: z.string().min(1).optional(),
  tools: z.array(z.string().min(1)).default([]),
  skills: z.array(z.string().min(1)).default([]),
  state: z.string().min(1).optional(),
  phases: z.array(z.string().min(1)).default([]),
  human_gates: z.array(z.string().min(1)).default([]),
  starter: z.string().min(1).optional(),
  week_one_mode: z.string().min(1).optional(),
  token_cost: z.string().min(1),
  cost: costSchema,
  init: initSchema.optional(),
}).strict();

const registrySchema = z.object({
  schemaVersion: z.literal(REGISTRY_SCHEMA_VERSION),
  patterns: z.array(patternSchema).min(1),
}).strict();

export type PatternCost = z.infer<typeof costSchema>;
export type RegistryPattern = z.infer<typeof patternSchema>;
export type PatternRegistry = z.infer<typeof registrySchema>;

export interface LoadPatternRegistryOptions {
  candidates: string[];
}

function formatRegistryError(source: string, error: z.ZodError): Error {
  const details = error.issues
    .map((issue) => {
      const path = issue.path.length ? issue.path.join('.') : '<root>';
      return `${path}: ${issue.message}`;
    })
    .join('; ');
  return new Error(`Invalid pattern registry at ${source}: ${details}`);
}

export function parsePatternRegistry(raw: string, source = '<inline>'): PatternRegistry {
  const parsed = source.endsWith('.json') ? JSON.parse(raw) : yaml.parse(raw);
  const result = registrySchema.safeParse(parsed);
  if (!result.success) throw formatRegistryError(source, result.error);
  return result.data;
}

export async function loadPatternRegistry(options: LoadPatternRegistryOptions): Promise<PatternRegistry> {
  for (const candidate of options.candidates) {
    try {
      await access(candidate);
      return parsePatternRegistry(await readFile(candidate, 'utf8'), candidate);
    } catch (err) {
      const code = typeof err === 'object' && err !== null && 'code' in err ? err.code : undefined;
      if (code === 'ENOENT') continue;
      throw err;
    }
  }

  throw new Error('Pattern registry not found.');
}
