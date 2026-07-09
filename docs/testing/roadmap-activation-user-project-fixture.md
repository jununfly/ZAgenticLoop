# Roadmap Activation User-Project Fixture

Status: active deterministic fixture

This fixture validates the generated-bundle path for issue-triggered Roadmap
Activation without writing to GitHub.

## Release-Gated Local Fixture

Command:

```bash
node --test scripts/roadmap-activation-user-project-fixture.test.mjs
npm run test:generated-bundle-release-gate
```

Coverage:

- `zj-loop-init --add github-actions` generates a user-project-shaped bundle.
- The generated Route Table is enabled for `roadmap-sliced-development` inside
  the temporary fixture project.
- A maintainer/collaborator-style slash command creates an Activation Request.
- The Route Decision allows the activation route.
- The Activation Request comment contains a stable `activation_request_id`.
- Deterministic helpers produce the branch name, PR title, and PR body contract.
- Duplicate request, missing permission, disabled route, and loop marker cases
  are covered.

This fixture is intentionally local and deterministic. It is a release gate
because it does not depend on live GitHub writes.

## GitHub Smoke Fixture

Use a real repository or this repository when validating operational behavior:

1. Post `/zj-loop start roadmap-sliced-development` as a maintainer or
   collaborator on a test issue.
2. Confirm the workflow creates or proposes an Activation Request comment.
3. Confirm the consumer workflow emits `activation-plan.json` and
   `contract-plan.json` evidence.
4. Confirm the run stops with branch/PR contract evidence or explicit
   `blocked`/`failed` evidence.

This smoke path is dogfood/periodic validation. It should not be required for
every release gate because it performs live GitHub writes.
