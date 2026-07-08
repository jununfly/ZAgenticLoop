#!/usr/bin/env bash
# Pattern/registry validation gates — shared by validate-patterns.yml and daily-triage.yml
set -euo pipefail

echo "Patterns declared in registry:"
grep '^\s*-\s*id:' patterns/registry.yaml | sed 's/.*id: //' | sort > /tmp/registry.txt
echo "Pattern markdown files:"
ls patterns/*.md | xargs -n1 basename | sed 's/.md$//' | grep -v README | sort > /tmp/files.txt
echo "=== Registry ==="; cat /tmp/registry.txt
echo "=== Files ==="; cat /tmp/files.txt
comm -23 /tmp/files.txt /tmp/registry.txt | grep . && (echo "ERROR: pattern md file(s) missing from registry.yaml"; exit 1) || echo "All pattern files registered ✓"
comm -23 /tmp/registry.txt /tmp/files.txt | grep . && (echo "ERROR: registry entry without matching .md"; exit 1) || echo "No orphan registry entries ✓"

echo "Checking that key sections exist in patterns (lightweight)"
for f in patterns/*.md; do
  if [[ "$f" == *"README.md" ]]; then continue; fi
  grep -q "^## Scheduling" "$f" || { echo "Missing Scheduling in $f"; exit 1; }
  grep -q "^## Required Skills" "$f" || { echo "Missing Required Skills in $f"; exit 1; }
  grep -Eq "maker.*checker|verifier|Maker / Checker|Verification Strategy|reviewer sub-agent" "$f" || { echo "Missing verifier strategy (maker/checker) mention in $f"; exit 1; }
done
echo "Basic pattern structure checks passed ✓"

test -f templates/pattern-template.md || (echo "Missing pattern-template.md"; exit 1)
test -f templates/zj-loop-run-log.md.template || (echo "Missing zj-loop-run-log template"; exit 1)
test -f templates/zj-loop-budget.md.template || (echo "Missing zj-loop-budget template"; exit 1)
echo "Templates present ✓"

npm install --no-save yaml@2 ajv@8
node scripts/validate-registry.mjs
node scripts/check-zj-loop-init-sync.mjs
node scripts/validate-release-workflows.mjs
node scripts/ci-sweeper-e2e-replay.mjs > /tmp/ci-sweeper-e2e-replay.json
node --test scripts/ci-sweeper-e2e-replay.test.mjs
node scripts/issue-fix-request-e2e-replay.mjs > /tmp/issue-fix-request-e2e-replay.json
node scripts/roadmap-activation-e2e-replay.mjs > /tmp/roadmap-activation-e2e-replay.json
node scripts/post-merge-roadmap-closeout-e2e-replay.mjs > /tmp/post-merge-roadmap-closeout-e2e-replay.json
node scripts/issue-triage-report-e2e-replay.mjs > /tmp/issue-triage-report-e2e-replay.json
node scripts/pr-steward-report-e2e-replay.mjs > /tmp/pr-steward-report-e2e-replay.json
node scripts/pr-steward-fix-request-e2e-replay.mjs > /tmp/pr-steward-fix-request-e2e-replay.json
node scripts/pr-steward-claim-e2e-replay.mjs > /tmp/pr-steward-claim-e2e-replay.json
node scripts/changelog-drafter-report-e2e-replay.mjs > /tmp/changelog-drafter-report-e2e-replay.json
node scripts/changelog-drafter-draft-request-e2e-replay.mjs > /tmp/changelog-drafter-draft-request-e2e-replay.json
node scripts/dependency-sweeper-route-e2e-replay.mjs > /tmp/dependency-sweeper-route-e2e-replay.json
node scripts/dependency-sweeper-claim-e2e-replay.mjs > /tmp/dependency-sweeper-claim-e2e-replay.json
node --test scripts/report-only-route-dispatcher.test.mjs scripts/issue-triage-report-e2e-replay.test.mjs scripts/pr-steward-report-e2e-replay.test.mjs scripts/pr-steward-fix-request-e2e-replay.test.mjs scripts/pr-steward-claim-e2e-replay.test.mjs scripts/pr-steward-live-runner.test.mjs scripts/changelog-drafter-report-e2e-replay.test.mjs scripts/changelog-drafter-draft-request-e2e-replay.test.mjs scripts/dependency-sweeper-route-e2e-replay.test.mjs scripts/dependency-sweeper-claim-e2e-replay.test.mjs scripts/dependency-sweeper-live-runner.test.mjs scripts/issue-fix-request-contract.test.mjs scripts/issue-fix-request-dispatcher.test.mjs scripts/issue-fix-request-e2e-replay.test.mjs scripts/roadmap-activation-e2e-replay.test.mjs scripts/roadmap-activation-dispatcher.test.mjs scripts/build-ci-issue-fix-request-body.test.mjs scripts/roadmap-handoff-gate.test.mjs scripts/protocol-terminology-gate.test.mjs scripts/post-merge-roadmap-closeout-contract.test.mjs scripts/post-merge-roadmap-closeout-e2e-replay.test.mjs scripts/post-merge-roadmap-closeout.test.mjs scripts/validate-post-merge-closeout-workflow.test.mjs
node scripts/protocol-terminology-gate.mjs
node scripts/run-tool-package-scripts.mjs test --gate=validate --install

echo "validate gates passed ✓"
