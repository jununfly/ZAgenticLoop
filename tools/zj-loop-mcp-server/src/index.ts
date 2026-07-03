#!/usr/bin/env node

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  estimatePatternCost,
  getPatternProfile,
  listPatternSummaries,
  recommendPatterns,
} from '@jununfly/zj-loop-core';
import {
  resolveProjectRoot,
  loadRegistry,
  loadPatternDoc,
  listSkills,
  loadSkill,
  loadState,
  listStateFiles,
  loadLoopConfig,
  loadBudget,
  loadRunLog,
  loadSafetyDoc,
  summarizeOperationalContext,
} from './resolver.js';

const server = new McpServer({
  name: 'zagenticloop',
  version: '1.0.0',
});

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

function patternSummariesForLegacyJson(registry: NonNullable<Awaited<ReturnType<typeof loadRegistry>>>) {
  return listPatternSummaries(registry).patterns.map((p) => ({
    id: p.id,
    name: p.name,
    goal: p.goal,
    cadence: p.cadence,
    risk: p.risk,
    week_one_mode: p.weekOneMode,
    token_cost: p.tokenCostTier,
    state: p.stateFile,
  }));
}

function formatRecommendationsMarkdown(registry: NonNullable<Awaited<ReturnType<typeof loadRegistry>>>, useCase: string): string {
  const result = recommendPatterns(registry, { useCase, limit: 3 });
  const lines: string[] = ['## Recommended Patterns\n'];
  for (const { pattern: p, score, reasons } of result.recommendations) {
    lines.push(`### ${p.name} (${p.id}) — relevance: ${score}`);
    lines.push(`- **Goal:** ${p.goal}`);
    lines.push(`- **Cadence:** ${p.cadence} | **Risk:** ${p.risk}`);
    lines.push(`- **Start with:** ${p.weekOneMode}`);
    lines.push(`- **Skills needed:** ${p.requiredSkills.join(', ')}`);
    lines.push(`- **Starter:** ${p.starter}`);
    if (reasons.length > 0) {
      lines.push(`- **Why:** ${reasons.slice(0, 3).map((r) => r.code).join(', ')}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function formatCostEstimateMarkdown(registry: NonNullable<Awaited<ReturnType<typeof loadRegistry>>>, patternId: string, level: 'L1' | 'L2' | 'L3', cadence?: string): string {
  const result = estimatePatternCost(registry, { patternId, level, cadence });
  if ('code' in result) {
    if (result.code === 'pattern_not_found') {
      return `Pattern "${result.patternId}" not found. Available: ${result.availablePatternIds.join(', ')}`;
    }
    if (result.code === 'invalid_cadence') return `Invalid cadence: ${result.cadence}`;
    return `Invalid level: ${result.level}. Valid: ${result.validLevels.join(', ')}`;
  }

  const { estimate } = result;
  const lines = [
    `## Cost Estimate: ${estimate.patternName}`,
    `- **Cadence:** ${estimate.cadence} (${estimate.runsPerDay} runs/day)`,
    `- **Level:** ${estimate.level}`,
    `- **Daily cap:** ${formatTokens(estimate.suggestedDailyCap)}`,
    '',
    '| Scenario | Per Run | Per Day |',
    '|----------|---------|---------|',
    `| No-op | ${formatTokens(estimate.scenarios.noop.tokensPerRun)} | ${formatTokens(estimate.scenarios.noop.tokensPerDay)} |`,
    `| Report | ${formatTokens(estimate.scenarios.report.tokensPerRun)} | ${formatTokens(estimate.scenarios.report.tokensPerDay)} |`,
    `| Action | ${formatTokens(estimate.scenarios.action.tokensPerRun)} | ${formatTokens(estimate.scenarios.action.tokensPerDay)} |`,
    `| **Realistic** | **${formatTokens(estimate.scenarios.realistic.tokensPerRun)}** | **${formatTokens(estimate.scenarios.realistic.tokensPerDay)}** |`,
  ];

  if (result.meta.warnings.length > 0) {
    lines.push('', ...result.meta.warnings.map((w) => `> Warning: ${w.message}`));
  }
  return lines.join('\n');
}

// ── Resources ──────────────────────────────────────────────────────

server.resource(
  'registry',
  'loop://registry',
  { description: 'Machine-readable pattern registry (all 7 patterns with metadata, costs, phases)' },
  async () => {
    const root = await resolveProjectRoot();
    const registry = await loadRegistry(root);
    return {
      contents: [{
        uri: 'loop://registry',
        mimeType: 'application/json',
        text: registry ? JSON.stringify(registry, null, 2) : '{"error": "registry.yaml not found"}',
      }],
    };
  },
);

server.resource(
  'loop-config',
  'loop://config',
  { description: 'zj-loop/ZJ-LOOP.md — cadence, budget, gates, and scheduling configuration' },
  async () => {
    const root = await resolveProjectRoot();
    const content = await loadLoopConfig(root);
    return {
      contents: [{
        uri: 'loop://config',
        mimeType: 'text/markdown',
        text: content ?? 'zj-loop/ZJ-LOOP.md not found',
      }],
    };
  },
);

server.resource(
  'budget',
  'loop://budget',
  { description: 'zj-loop/zj-loop-budget.md — token caps, kill switch policy, spending limits' },
  async () => {
    const root = await resolveProjectRoot();
    const content = await loadBudget(root);
    return {
      contents: [{
        uri: 'loop://budget',
        mimeType: 'text/markdown',
        text: content ?? 'zj-loop/zj-loop-budget.md not found',
      }],
    };
  },
);

server.resource(
  'run-log',
  'loop://run-log',
  { description: 'zj-loop/zj-loop-run-log.md — append-only run history with timestamps and outcomes' },
  async () => {
    const root = await resolveProjectRoot();
    const content = await loadRunLog(root);
    return {
      contents: [{
        uri: 'loop://run-log',
        mimeType: 'text/markdown',
        text: content ?? 'zj-loop/zj-loop-run-log.md not found',
      }],
    };
  },
);

server.resource(
  'safety',
  'loop://safety',
  { description: 'Safety documentation — denylists, auto-merge policy, MCP scopes, human gates' },
  async () => {
    const root = await resolveProjectRoot();
    const content = await loadSafetyDoc(root);
    return {
      contents: [{
        uri: 'loop://safety',
        mimeType: 'text/markdown',
        text: content ?? 'No safety documentation found',
      }],
    };
  },
);

// ── Resource Templates (dynamic) ───────────────────────────────────

server.resource(
  'pattern',
  new ResourceTemplate('loop://patterns/{patternId}', { list: undefined }),
  { description: 'Full pattern documentation by ID (e.g. daily-triage, pr-babysitter, ci-sweeper)' },
  async (uri, variables) => {
    const patternId = variables.patternId as string;
    const root = await resolveProjectRoot();
    const content = await loadPatternDoc(root, patternId);
    return {
      contents: [{
        uri: uri.href,
        mimeType: 'text/markdown',
        text: content ?? `Pattern "${patternId}" not found. Use loop_list_patterns to see available patterns.`,
      }],
    };
  },
);

server.resource(
  'skill',
  new ResourceTemplate('loop://skills/{skillName}', { list: undefined }),
  { description: 'Skill definition (SKILL.md) by name (e.g. loop-triage, minimal-fix, loop-verifier)' },
  async (uri, variables) => {
    const skillName = variables.skillName as string;
    const root = await resolveProjectRoot();
    const skill = await loadSkill(root, skillName);
    return {
      contents: [{
        uri: uri.href,
        mimeType: 'text/markdown',
        text: skill?.content ?? `Skill "${skillName}" not found. Use loop_list_skills to see available skills.`,
      }],
    };
  },
);

server.resource(
  'state',
  new ResourceTemplate('loop://state/{stateFile}', { list: undefined }),
  { description: 'State file content (e.g. zj-loop/STATE.md, zj-loop/pr-babysitter-state.md)' },
  async (uri, variables) => {
    const stateFile = decodeURIComponent(variables.stateFile as string);
    const root = await resolveProjectRoot();
    const content = await loadState(root, stateFile);
    return {
      contents: [{
        uri: uri.href,
        mimeType: 'text/markdown',
        text: content ?? `State file "${stateFile}" not found. Use loop_list_state_files to see available state files.`,
      }],
    };
  },
);

// ── Tools ──────────────────────────────────────────────────────────

server.tool(
  'loop_list_patterns',
  'List all available agentic loop working patterns with their goals, cadences, and risk levels',
  {},
  async () => {
    const root = await resolveProjectRoot();
    const registry = await loadRegistry(root);
    if (!registry) {
      return { content: [{ type: 'text' as const, text: 'No registry.yaml found in patterns/' }] };
    }
    const summary = patternSummariesForLegacyJson(registry);
    return { content: [{ type: 'text' as const, text: JSON.stringify(summary, null, 2) }] };
  },
);

server.tool(
  'loop_list_skills',
  'List all available skills with their names and locations',
  {},
  async () => {
    const root = await resolveProjectRoot();
    const skills = await listSkills(root);
    if (skills.length === 0) {
      return { content: [{ type: 'text' as const, text: 'No skills found. Install from starters/ or skills/' }] };
    }
    const summary = skills.map(s => ({ name: s.name, path: s.path }));
    return { content: [{ type: 'text' as const, text: JSON.stringify(summary, null, 2) }] };
  },
);

server.tool(
  'loop_list_state_files',
  'List all state files present in the project',
  {},
  async () => {
    const root = await resolveProjectRoot();
    const files = await listStateFiles(root);
    return {
      content: [{
        type: 'text' as const,
        text: files.length > 0
          ? JSON.stringify(files, null, 2)
          : 'No state files found. Run zj-loop-init to create zj-loop/STATE.md',
      }],
    };
  },
);

server.tool(
  'loop_summarize_operational_context',
  'Summarize config, budget, run-log, and safety evidence without reading full raw resources',
  {},
  async () => {
    const root = await resolveProjectRoot();
    const summary = await summarizeOperationalContext(root);
    return { content: [{ type: 'text' as const, text: JSON.stringify(summary, null, 2) }] };
  },
);

server.tool(
  'loop_get_pattern',
  'Get full documentation for a specific pattern by ID',
  { patternId: z.string().describe('Pattern ID (e.g. daily-triage, pr-babysitter, ci-sweeper)') },
  async ({ patternId }) => {
    const root = await resolveProjectRoot();

    const registry = await loadRegistry(root);
    if (!registry) {
      return { content: [{ type: 'text' as const, text: 'No registry found' }] };
    }
    const doc = await loadPatternDoc(root, patternId);
    const profile = getPatternProfile(registry, {
      patternId,
      patternDoc: doc ? { path: `patterns/${patternId}.md`, text: doc } : undefined,
    });

    if ('code' in profile) {
      return {
        content: [{
          type: 'text' as const,
          text: `Pattern "${patternId}" not found. Available: ${profile.availablePatternIds.join(', ')}`,
        }],
      };
    }

    const parts: string[] = [];
    parts.push('## Registry Metadata\n```json\n' + JSON.stringify(profile.pattern, null, 2) + '\n```\n');
    if (profile.documentation) {
      parts.push('## Pattern Documentation\n\n' + profile.documentation.text);
    }

    return { content: [{ type: 'text' as const, text: parts.join('\n') }] };
  },
);

server.tool(
  'loop_get_skill',
  'Get the full SKILL.md definition for a named skill',
  { skillName: z.string().describe('Skill name (e.g. loop-triage, minimal-fix, loop-verifier)') },
  async ({ skillName }) => {
    const root = await resolveProjectRoot();
    const skill = await loadSkill(root, skillName);
    if (!skill) {
      const all = await listSkills(root);
      return {
        content: [{
          type: 'text' as const,
          text: `Skill "${skillName}" not found. Available: ${all.map(s => s.name).join(', ')}`,
        }],
      };
    }
    return { content: [{ type: 'text' as const, text: skill.content }] };
  },
);

server.tool(
  'loop_get_state',
  'Read a state file to understand current loop status',
  { stateFile: z.string().optional().describe('State file path (default: zj-loop/STATE.md)') },
  async ({ stateFile }) => {
    const root = await resolveProjectRoot();
    const content = await loadState(root, stateFile);
    if (!content) {
      const available = await listStateFiles(root);
      return {
        content: [{
          type: 'text' as const,
          text: `State file "${stateFile ?? 'zj-loop/STATE.md'}" not found. Available: ${available.join(', ') || 'none'}`,
        }],
      };
    }
    return { content: [{ type: 'text' as const, text: content }] };
  },
);

server.tool(
  'loop_recommend_pattern',
  'Recommend the best loop pattern for a given use case',
  {
    useCase: z.string().describe('Describe what you want the loop to do (e.g. "watch CI failures", "review PRs", "update dependencies")'),
  },
  async ({ useCase }) => {
    const root = await resolveProjectRoot();
    const registry = await loadRegistry(root);
    if (!registry) {
      return { content: [{ type: 'text' as const, text: 'No registry found' }] };
    }
    return { content: [{ type: 'text' as const, text: formatRecommendationsMarkdown(registry, useCase) }] };
  },
);

server.tool(
  'loop_estimate_cost',
  'Estimate daily token cost for a pattern at a given readiness level',
  {
    patternId: z.string().describe('Pattern ID from registry'),
    level: z.enum(['L1', 'L2', 'L3']).describe('Readiness level'),
    cadence: z.string().optional().describe('Override cadence (e.g. "15m", "1d"). Uses pattern default if omitted'),
  },
  async ({ patternId, level, cadence }) => {
    const root = await resolveProjectRoot();
    const registry = await loadRegistry(root);
    if (!registry) {
      return { content: [{ type: 'text' as const, text: 'No registry found' }] };
    }
    return { content: [{ type: 'text' as const, text: formatCostEstimateMarkdown(registry, patternId, level, cadence) }] };
  },
);

// ── Start ──────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('MCP server failed to start:', err);
  process.exit(1);
});

export { server };
