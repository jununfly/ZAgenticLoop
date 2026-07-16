#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';

import {
  buildChangelogDrafterExecutionPlan,
  executeChangelogDrafterLiveRunner,
  readChangelogDraftRequest,
} from './changelog-drafter-runner.js';
import { runCli } from './cli.js';
import { runRouteConsumerCli } from './route-consumer-cli.js';
import { createGitLabChangelogDraftCarrier, claimGitLabChangelogDraftCarrier, createGitLabChangelogDraftMr } from './gitlab-changelog-drafter-adapter.js';
import { CHANGELOG_DRAFTER_CLOSEOUT_CONFIRMATION, closeGitLabChangelogDraft } from './gitlab-changelog-drafter-closeout.js';

const argv = process.argv.slice(2);
if (argv[0] === 'gitlab-closeout') {
  process.exitCode = await runCli({
    name: 'zj-loop-changelog-drafter', description: 'Close a merged GitLab Changelog Draft MR and its carrier.',
    usage: 'zj-loop-changelog-drafter gitlab-closeout --project <group/project> --merge-request <iid> --issue-iid <iid> --request-id <id> --claim-id <id> --branch <branch> --target-branch <branch> --confirm <phrase> [--api-url <url>] [--out <path>] [--json]',
    options: [
      { name: 'command', type: 'positional', description: 'Command', default: 'gitlab-closeout' }, { name: 'project', type: 'string', description: 'GitLab project path' }, { name: 'merge-request', type: 'string', description: 'Draft MR IID' }, { name: 'issue-iid', type: 'string', description: 'Carrier Issue IID' }, { name: 'request-id', type: 'string', description: 'Request id' }, { name: 'claim-id', type: 'string', description: 'Claim id' }, { name: 'branch', type: 'string', description: 'Draft branch' }, { name: 'target-branch', type: 'string', description: 'Target branch' }, { name: 'confirm', type: 'string', description: 'Fixed closeout confirmation' }, { name: 'api-url', type: 'string', description: 'GitLab API URL' }, { name: 'out', type: 'string', description: 'Result artifact path' }, { name: 'json', type: 'boolean', description: 'Print JSON' },
    ],
    async handler({ io, options }) {
      for (const name of ['project', 'merge-request', 'issue-iid', 'request-id', 'claim-id', 'branch', 'target-branch', 'confirm']) if (typeof options[name] !== 'string') throw new Error(`--${name} is required`);
      const result = await closeGitLabChangelogDraft({ projectPath: String(options.project), mergeRequestIid: String(options['merge-request']), issueIid: String(options['issue-iid']), requestId: String(options['request-id']), claimId: String(options['claim-id']), branch: String(options.branch), targetBranch: String(options['target-branch']), confirmationPhrase: String(options.confirm), token: process.env.GITLAB_TOKEN, apiBaseUrl: typeof options['api-url'] === 'string' ? String(options['api-url']) : undefined });
      const text = `${JSON.stringify(result, null, 2)}\n`; if (typeof options.out === 'string') await writeFile(String(options.out), text); if (options.json === true || typeof options.out !== 'string') io.stdout(text.trimEnd()); return result.status === 'completed' ? 0 : 2;
    },
  }, argv);
} else if (argv[0] === 'gitlab-draft-evidence') {
  process.exitCode = await runCli({
    name: 'zj-loop-changelog-drafter', description: 'Create GitLab draft-evidence without provider-side writes.',
    usage: 'zj-loop-changelog-drafter gitlab-draft-evidence --request <path> --project <group/project> [--draft-file <path>] [--out <path>] [--json]',
    options: [
      { name: 'command', type: 'positional', description: 'Command', default: 'gitlab-draft-evidence' }, { name: 'request', type: 'string', description: 'Draft request JSON' },
      { name: 'project', type: 'string', description: 'GitLab project path' }, { name: 'draft-file', type: 'string', description: 'Artifact draft file path', default: 'docs/release-notes-draft.md' },
      { name: 'out', type: 'string', description: 'Result artifact path' }, { name: 'json', type: 'boolean', description: 'Print JSON' },
    ],
    async handler({ io, options }) {
      if (typeof options.request !== 'string' || typeof options.project !== 'string') throw new Error('--request and --project are required');
      const request = await readChangelogDraftRequest(String(options.request));
      const project = String(options.project);
      const window = request?.release_window ?? {};
      const errors = [
        request?.schema !== 'zj-loop.changelog_draft_request.v1' ? 'schema-invalid' : '',
        window.repo !== project ? 'repo-mismatch' : '',
        window.base_branch ? '' : 'base-branch-required',
        window.since_ref && window.until_ref ? '' : 'release-window-required',
      ].filter(Boolean);
      const result = errors.length > 0
        ? { schema: 'zj-loop.gitlab_changelog_draft_evidence.v1', status: 'blocked', reason: 'protocol_repair_request', errors, audit: { project_path: project, request_id: request?.request_id ?? null, draft_mode: 'evidence', side_effects_executed: false } }
        : { schema: 'zj-loop.gitlab_changelog_draft_evidence.v1', status: 'completed', outcome: 'draft-evidence', audit: { project_path: project, request_id: request.request_id, draft_mode: 'evidence', draft_file: String(options['draft-file'] ?? 'docs/release-notes-draft.md'), release_window: { repo: window.repo, base_branch: window.base_branch, since_ref: window.since_ref, until_ref: window.until_ref }, side_effects_executed: false }, draft: { summary: request.summary ?? '', item_count: window.item_count ?? null } };
      const text = `${JSON.stringify(result, null, 2)}\n`; if (typeof options.out === 'string') await writeFile(String(options.out), text); if (options.json === true || typeof options.out !== 'string') io.stdout(text.trimEnd());
      return result.status === 'completed' ? 0 : 2;
    },
  }, argv);
} else if (argv[0] === 'gitlab-carrier') {
  process.exitCode = await runCli({
    name: 'zj-loop-changelog-drafter', description: 'Create a confirmed GitLab Changelog carrier Issue.',
    usage: 'zj-loop-changelog-drafter gitlab-carrier --request <path> --project <group/project> --confirm <phrase> [--api-url <url>] [--out <path>] [--json]',
    options: [
      { name: 'command', type: 'positional', description: 'Command', default: 'gitlab-carrier' }, { name: 'request', type: 'string', description: 'Draft request JSON' }, { name: 'project', type: 'string', description: 'GitLab project path' }, { name: 'confirm', type: 'string', description: 'Fixed confirmation phrase' }, { name: 'api-url', type: 'string', description: 'GitLab API URL' }, { name: 'out', type: 'string', description: 'Result artifact path' }, { name: 'json', type: 'boolean', description: 'Print JSON' },
    ],
    async handler({ io, options }) {
      if (typeof options.request !== 'string' || typeof options.project !== 'string' || typeof options.confirm !== 'string') throw new Error('--request, --project and --confirm are required');
      const result = await createGitLabChangelogDraftCarrier({ projectPath: String(options.project), request: await readChangelogDraftRequest(String(options.request)), confirmationPhrase: String(options.confirm), token: process.env.GITLAB_TOKEN, apiBaseUrl: typeof options['api-url'] === 'string' ? String(options['api-url']) : undefined });
      const text = `${JSON.stringify(result, null, 2)}\n`; if (typeof options.out === 'string') await writeFile(String(options.out), text); if (options.json === true || typeof options.out !== 'string') io.stdout(text.trimEnd()); return result.status === 'completed' ? 0 : 2;
    },
  }, argv);
} else if (argv[0] === 'gitlab-claim') {
  process.exitCode = await runCli({
    name: 'zj-loop-changelog-drafter', description: 'Claim a GitLab Changelog carrier Issue.',
    usage: 'zj-loop-changelog-drafter gitlab-claim --project <group/project> --issue-iid <iid> --request-id <id> --claim-id <id> [--api-url <url>] [--out <path>] [--json]',
    options: [
      { name: 'command', type: 'positional', description: 'Command', default: 'gitlab-claim' }, { name: 'project', type: 'string', description: 'GitLab project path' }, { name: 'issue-iid', type: 'string', description: 'Carrier Issue IID' }, { name: 'request-id', type: 'string', description: 'Request id' }, { name: 'claim-id', type: 'string', description: 'Claim id' }, { name: 'api-url', type: 'string', description: 'GitLab API URL' }, { name: 'out', type: 'string', description: 'Result artifact path' }, { name: 'json', type: 'boolean', description: 'Print JSON' },
    ],
    async handler({ io, options }) {
      for (const name of ['project', 'issue-iid', 'request-id', 'claim-id']) if (typeof options[name] !== 'string') throw new Error(`--${name} is required`);
      const result = await claimGitLabChangelogDraftCarrier({ projectPath: String(options.project), issueIid: String(options['issue-iid']), requestId: String(options['request-id']), claimId: String(options['claim-id']), token: process.env.GITLAB_TOKEN, apiBaseUrl: typeof options['api-url'] === 'string' ? String(options['api-url']) : undefined });
      const text = `${JSON.stringify(result, null, 2)}\n`; if (typeof options.out === 'string') await writeFile(String(options.out), text); if (options.json === true || typeof options.out !== 'string') io.stdout(text.trimEnd()); return result.status === 'completed' ? 0 : 2;
    },
  }, argv);
} else if (argv[0] === 'gitlab-draft-mr') {
  process.exitCode = await runCli({
    name: 'zj-loop-changelog-drafter', description: 'Create an explicitly confirmed GitLab Draft MR for one draft file.',
    usage: 'zj-loop-changelog-drafter gitlab-draft-mr --request <path> --project <group/project> --issue-iid <iid> --claim-id <id> --draft-file <path> --branch <branch> --confirm <phrase> [--api-url <url>] [--out <path>] [--json]',
    options: [
      { name: 'command', type: 'positional', description: 'Command', default: 'gitlab-draft-mr' }, { name: 'request', type: 'string', description: 'Draft request JSON' }, { name: 'project', type: 'string', description: 'GitLab project path' }, { name: 'issue-iid', type: 'string', description: 'Carrier Issue IID' }, { name: 'claim-id', type: 'string', description: 'Claim id' }, { name: 'draft-file', type: 'string', description: 'Single draft file' }, { name: 'branch', type: 'string', description: 'Deterministic draft branch' }, { name: 'confirm', type: 'string', description: 'Fixed confirmation phrase' }, { name: 'api-url', type: 'string', description: 'GitLab API URL' }, { name: 'out', type: 'string', description: 'Result artifact path' }, { name: 'json', type: 'boolean', description: 'Print JSON' },
    ],
    async handler({ io, options }) {
      for (const name of ['request', 'project', 'issue-iid', 'claim-id', 'draft-file', 'branch', 'confirm']) if (typeof options[name] !== 'string') throw new Error(`--${name} is required`);
      const request = await readChangelogDraftRequest(String(options.request));
      const confirm = String(options.confirm);
      const result = confirm !== 'CREATE_CHANGELOG_DRAFT_PR_OR_EVIDENCE'
        ? { schema: 'zj-loop.gitlab_changelog_draft_mr.v1', status: 'blocked', reason: 'confirmation-required', side_effects_executed: false }
        : await createGitLabChangelogDraftMr({ projectPath: String(options.project), token: process.env.GITLAB_TOKEN, request, issueIid: String(options['issue-iid']), claimId: String(options['claim-id']), branch: String(options.branch), targetBranch: String(request.release_window.base_branch), draftFile: String(options['draft-file']), actions: [{ action: 'create', file_path: String(options['draft-file']), content: buildArtifactDraft(request), encoding: 'text' }], commitMessage: `Draft changelog ${request.release_window.until_ref}`, title: `Draft changelog ${request.release_window.since_ref}...${request.release_window.until_ref}`, description: `Post-merge contract for ${request.request_id}`, apiBaseUrl: typeof options['api-url'] === 'string' ? String(options['api-url']) : undefined });
      const text = `${JSON.stringify(result, null, 2)}\n`; if (typeof options.out === 'string') await writeFile(String(options.out), text); if (options.json === true || typeof options.out !== 'string') io.stdout(text.trimEnd()); return result.status === 'completed' ? 0 : 2;
    },
  }, argv);
} else if (argv[0] === 'draft-plan') {
  process.exitCode = await runCli({
    name: 'zj-loop-changelog-drafter',
    description: 'Build Changelog Drafter draft evidence or draft PR plan.',
    usage: 'zj-loop-changelog-drafter draft-plan --request <path> [--draft-mode evidence|pr] [--draft-file <path>] [--live] [--confirm-live-draft <phrase>] [--out <path>] [--json]',
    options: [
      { name: 'command', type: 'positional', description: 'Command', default: 'draft-plan' },
      { name: 'request', type: 'string', description: 'Path to a changelog draft request JSON file' },
      { name: 'draft-mode', type: 'enum', description: 'Draft output mode', values: ['evidence', 'pr'], default: 'evidence' },
      { name: 'draft-file', type: 'string', description: 'Repository-relative markdown draft file', default: 'docs/release-notes-draft.md' },
      { name: 'live', type: 'boolean', description: 'Plan live side effects' },
      { name: 'confirm-live-draft', type: 'string', description: 'Fixed confirmation phrase for live drafting' },
      { name: 'out', type: 'string', description: 'Write JSON plan to this path' },
      { name: 'json', type: 'boolean', description: 'Print JSON output' },
    ],
    async handler({ io, options }) {
      if (typeof options.request !== 'string') throw new Error('--request is required');
      const draftRequest = await readChangelogDraftRequest(options.request);
      const plan = buildChangelogDrafterExecutionPlan({
        draftRequest,
        draftMode: String(options['draft-mode'] ?? 'evidence'),
        draftFile: String(options['draft-file'] ?? 'docs/release-notes-draft.md'),
        live: options.live === true,
        confirmationPhrase: typeof options['confirm-live-draft'] === 'string'
          ? options['confirm-live-draft']
          : '',
      });
      const text = `${JSON.stringify(plan, null, 2)}\n`;
      if (typeof options.out === 'string') await writeFile(options.out, text);
      if (options.json === true || typeof options.out !== 'string') io.stdout(text.trimEnd());
      if (plan.status === 'refused') return 1;
    },
  }, argv);
} else if (argv[0] === 'live-draft') {
  process.exitCode = await runCli({
    name: 'zj-loop-changelog-drafter',
    description: 'Execute Changelog Drafter live draft evidence or draft PR creation.',
    usage: 'zj-loop-changelog-drafter live-draft --request <path> [--draft-mode evidence|pr] [--draft-file <path>] --confirm-live-draft <phrase> [--out <path>] [--json]',
    options: [
      { name: 'command', type: 'positional', description: 'Command', default: 'live-draft' },
      { name: 'request', type: 'string', description: 'Path to a changelog draft request JSON file' },
      { name: 'draft-mode', type: 'enum', description: 'Draft output mode', values: ['evidence', 'pr'], default: 'evidence' },
      { name: 'draft-file', type: 'string', description: 'Repository-relative markdown draft file', default: 'docs/release-notes-draft.md' },
      { name: 'confirm-live-draft', type: 'string', description: 'Fixed confirmation phrase for live drafting' },
      { name: 'out', type: 'string', description: 'Write JSON result to this path' },
      { name: 'json', type: 'boolean', description: 'Print JSON output' },
    ],
    async handler({ io, options }) {
      if (typeof options.request !== 'string') throw new Error('--request is required');
      const draftRequest = await readChangelogDraftRequest(options.request);
      const plan = buildChangelogDrafterExecutionPlan({
        draftRequest,
        draftMode: String(options['draft-mode'] ?? 'evidence'),
        draftFile: String(options['draft-file'] ?? 'docs/release-notes-draft.md'),
        live: true,
        confirmationPhrase: typeof options['confirm-live-draft'] === 'string'
          ? options['confirm-live-draft']
          : '',
      });
      const result = await executeChangelogDrafterLiveRunner(plan);
      const text = `${JSON.stringify(result, null, 2)}\n`;
      if (typeof options.out === 'string') await writeFile(options.out, text);
      if (options.json === true || typeof options.out !== 'string') io.stdout(text.trimEnd());
      if (result.outcome !== 'draft-evidence' && result.outcome !== 'draft-pr') return 1;
    },
  }, argv);
} else {
  process.exitCode = await runRouteConsumerCli({
    name: 'zj-loop-changelog-drafter',
    routeId: 'changelog-drafter-draft-request',
    description: 'Plan Changelog Drafter draft-request execution through the Route Table consumer gate.',
  }, argv);
}

function buildArtifactDraft(request: any) {
  const window = request?.release_window ?? {};
  return ['# Release Notes Draft', '', `Window: ${window.since_ref ?? ''}...${window.until_ref ?? ''}`, `Repository: ${window.repo ?? ''}`, `Base branch: ${window.base_branch ?? ''}`, '', request?.summary ?? '', '', 'A maintainer must review and accept final release notes before release.'].join('\n') + '\n';
}
