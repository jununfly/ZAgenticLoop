# Roadmap Activation #4: Audit Finding Semantics

Source issue: https://github.com/jununfly/ZAgenticLoop/issues/4

Activation request:

- Source Issue Fix Request: https://github.com/jununfly/ZAgenticLoop/issues/4#issuecomment-4926408950
- Slash command: https://github.com/jununfly/ZAgenticLoop/issues/4#issuecomment-4926440334
- Branch: `zjal/act-4-4926440334-8c94c5b9-audit-finding-semantics`

## Parent Node: Audit Output Clarity

Completion condition:

- Findings distinguish blockers/readiness gaps from optional hardening/future tooling.
- `--suggest` makes score/level impact clear without implying optional work blocks loop execution.
- Durable implementation evidence is captured in tests and PR.

## Leaf Node: Score Impact Wording

Status: completed

Intent:

- Preserve existing readiness scoring.
- Change user-facing wording so optional hardening/future tooling findings do not read as mandatory readiness blockers.
- Add regression coverage for this UX contract.

Verification:

- `cd tools/zj-loop-audit && npm test`

Notes:

- `hardening` findings now say `optional score contribution; does not block loop execution` when they still contribute score.
- `future-tooling` findings now say `future-tooling score contribution; does not block loop execution` when they still contribute score.
- `--suggest` now describes score/level impact and loop-execution blocking separately.
