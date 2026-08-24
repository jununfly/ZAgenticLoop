# ZAgenticLoop

This context defines the domain language for designing, operating, and evaluating agent loops. It keeps project vocabulary stable across docs, starters, patterns, and audit tooling.

## Language

**Five Loop Primitives + Memory**:
The canonical set of loop-building concepts: scheduling, worktrees, skills, connectors, and sub-agents, supported by durable memory/state. Memory is named separately because it is the substrate every loop reads from and writes to across runs.
_Avoid_: Six Primitives, Five Building Blocks, Five Primitives

**Pattern**:
A reusable loop operating model that describes a loop's goal, cadence, risk, phases, state expectations, verification approach, and human gates.
_Avoid_: Template, starter, workflow

**Starter**:
A copyable scaffold that packages a pattern for a specific tool ecosystem. A starter may include loop configuration, skills, agents, state templates, and tool-specific files.
_Avoid_: Pattern, example

**Skill**:
Persistent runtime knowledge that an agent reads during a loop run, including project judgment, output rules, safety limits, and verification steps.
_Avoid_: Script, prompt, agent

**Memory**:
The durable context a loop preserves across separate runs. Memory is the broad category that includes current state, run history, and operating constraints.
_Avoid_: State file

**Checkpoint Metadata**:
The provider-neutral, content-addressed metadata that identifies an opaque
runtime checkpoint without making that runtime state a canonical StateStore
fact. It includes the source execution identity, source revision, artifact
reference, and state digest.
_Avoid_: Canonical execution state, raw checkpoint in StateStore

**Resume Oracle**:
The native-core evaluator that compares a provider's checkpoint/resume
observation with the fixed native fixture. It proves identity preservation,
idempotent duplicate delivery, authority ownership, Evidence binding, and
Human acceptance binding; it does not adopt provider behavior as product
semantics.
_Avoid_: Provider result, framework-specific validator

**Native Checkpoint Invariants**:
The executable contract that keeps resume admission, execution lifecycle,
Evidence, and Human acceptance owned by native-core, and binds Evidence to the
same execution identity, verification digest, review handoff, and no-side-effect
acceptance boundary. Adapters consume this contract; they do not redefine it.
_Avoid_: Adapter authority, provider-defined semantics

**Checkpoint Adapter Envelope**:
The provider-neutral record exchanged across a checkpoint adapter seam. It
binds source execution/task/attempt, source revision, checkpoint namespace and
identifier, artifact reference, state digest, and native execution identity;
it carries metadata rather than provider runtime state or product authority.
_Avoid_: Provider checkpoint payload, canonical execution state

**Adapter Digest Binding**:
The rule that an adapter output must retain the exact input digest and the
same checkpoint and native execution bindings before Core can use the
observation. A digest mismatch is a blocked observation, not a successful
resume with a warning.
_Avoid_: Response checksum, advisory hash

**Adapter Dependency Pin**:
The exact identity of the native checkpoint contract and external checkpoint
capability an adapter may consume, including contract revisions, package
versions, checkpoint schema, and artifact digest. A pin mismatch blocks the
adapter instead of invoking an unverified compatibility path.
_Avoid_: Best-effort dependency, semver guess

**Checkpoint Adapter Exit Boundary**:
The rule that missing dependencies, version skew, contract or digest drift,
lossy state translation, or failed conformance stops adapter use while the
native path remains required. A conformance failure retires the adapter and
runs the native fixture again.
_Avoid_: Provider fallback, warning-only deprecation

**State**:
The current working facts for a loop: what it is watching, what it tried last, and what is waiting for a human. State is not an append-only history.
_Avoid_: Run log, history, memory

**Run Log**:
The append-only history of loop runs, including when each run happened, what it found, what it did, and how it ended.
_Avoid_: State

**Budget**:
The loop's cost and stop rules, including token caps, maximum sub-agent spawns, kill switches, and what to do when limits are exceeded.
_Avoid_: Cost estimate

**Readiness Level**:
The L0-L3 maturity label that describes how autonomously a loop can safely operate.
_Avoid_: Phase, score

**Loop Readiness Score**:
The 0-100 audit score that quantifies readiness signals. The score informs the readiness level but is not itself the level.
_Avoid_: Level

**Pattern Phase**:
A workflow step inside a pattern, such as discovery, triage, fix, verify, notify, or escalate.
_Avoid_: Readiness level

**Week One Mode**:
The recommended first-week rollout posture for adopting a pattern, usually more conservative than the pattern's eventual operating target.
_Avoid_: Phase, maturity

**Human Gate**:
A decision boundary that a loop cannot cross without human approval, usually triggered by risk such as security, payments, broad refactors, or repeated failed attempts.
_Avoid_: Notification, handoff

**Handoff**:
The act of passing loop context to a human or another executor, including current state, why the loop stopped, what it tried, and the recommended next step.
_Avoid_: Escalation

**Plan Activation**:
The explicit authorization step that turns a PRD/plan intake record into a request for a target pattern to start. Discovery, triage, and labels are not activation.
_Avoid_: Trigger status, label trigger, state queue

**Activation Request**:
An auditable request created from an authorized activation signal and later consumed by a target pattern. It records permission to start; it is not the resulting branch, roadmap, or implementation.
_Avoid_: Roadmap, issue label, STATE entry

**Route Table**:
The routing control plane that defines which loop should own a discovered signal next, what guards apply, and where lifecycle evidence should be recorded. It is policy, not a runtime queue or executor.
_Avoid_: Queue, dispatcher, workflow

**Route Decision**:
The replayable record that connects an observed signal to a route, including the evidence, risk, confidence, dedupe key, requested action, and lifecycle status.
_Avoid_: Label, trigger, route table row

**Escalation**:
The event or judgment that triggers a handoff, such as ambiguity, a risky path, max attempts, or budget exhaustion.
_Avoid_: Handoff

**Denylist**:
Paths, operations, or risk categories that a loop must not touch automatically.
_Avoid_: Blocklist, forbidden files

**Allowlist**:
Paths or operations that are explicitly approved for automatic loop action.
_Avoid_: Safe by default

**Maker**:
The agent role responsible for proposing or executing a change, whether that change is code, documentation, triage, or release text.
_Avoid_: Implementer when the work is not code

**Checker**:
The independent role category that evaluates maker output. A checker must not be the same judgment loop as the maker.
_Avoid_: Reviewer, tester

**Verifier**:
A concrete checker implementation that runs verification steps and decides whether the output passes, such as tests, audits, lint checks, or policy checks.
_Avoid_: Checker when referring to a concrete skill or agent

**Safety Docs**:
Explanatory safety guidance that helps humans design safe loops and understand why guardrails exist.
_Avoid_: Runtime constraints

**Loop Safety Policy**:
Project-local operating policy that states what loops must not do automatically, which actions require human approval, and how safety incidents are handled.
_Avoid_: Security disclosure policy, generic safety docs

**Loop Constraints**:
Project-local binding rules that every loop run must follow, typically covering push and merge behavior, protected paths, code-change limits, communication rules, and budget stops.
_Avoid_: Loop safety policy, guidelines

**Constraint Enforcer**:
The skill or agent role that loads loop constraints before work begins and applies them to every later loop action.
_Avoid_: Constraints file

**Connector**:
A loop capability for reading from or acting on an external system such as GitHub, Linear, Slack, a database, or a deployment platform.
_Avoid_: Plugin, MCP

**MCP**:
A protocol substrate for exposing external capabilities to agents in a standard way. MCP may power connectors, but it is not the connector itself.
_Avoid_: Connector when referring to a specific integration

**Plugin**:
A packaging and distribution unit for loop capabilities, which may include skills, connectors, MCP servers, apps, templates, or other reusable assets.
_Avoid_: Connector

**Loop Activity**:
Detectable evidence that a loop actually ran, such as state updates, run-log entries, scheduled workflow runs, or loop-related git history.
_Avoid_: Static readiness

**Audit Finding Category**:
The product meaning of an audit finding, separate from display severity. Categories distinguish passed checks, blockers, readiness gaps, hardening opportunities, and future tooling opportunities.
_Avoid_: Warning level

**Dogfooding**:
The practice of this repository using its own patterns, starters, and tooling to maintain itself.
_Avoid_: Proven usage

**Proven Usage**:
Evidence that a loop or pattern has run in a real or representative environment and left auditable traces.
_Avoid_: Dogfooding

**Example**:
A teaching artifact that shows how a pattern or primitive maps to a specific tool, platform, or scenario. An example does not promise clone-and-run readiness.
_Avoid_: Starter

**Release Universe**:
The set of packages this repository treats as public release surfaces. A package enters the release universe when it presents a public publish surface, not when a human remembers to list it in a release note.
_Avoid_: Ad hoc release list, published tools

**Release-managed Package**:
A package in the release universe whose workflow, tag pattern, documentation, artifacts, and dependency blockers are checked as part of release validation.
_Avoid_: Tool package when discussing release obligations

**Release-ready Gate**:
The stricter pre-tag validation boundary that rejects blockers tolerated by local development, especially local package dependencies that public npm consumers cannot resolve.
_Avoid_: Normal test gate

## Retros

- 开始 roadmap 节点前，先确认这是产品实现还是 legacy roadmap 的技能验收；范围未确认前不要引入项目依赖或推进项目开发。 — docs/zj-retros/2026-08-24-retro.md#16:10
- 开始 `1-3-1` 时先消费现有 boundary contract，再把 LangGraph bridge 限定在隔离的 provider capability seam 内。 — docs/zj-retros/2026-08-24-retro.md#15:35
- 继续保持 adapter 不持久化 provider opaque state，且不生成 Evidence、Verification 或 Human acceptance 语义。 — docs/zj-retros/2026-08-24-retro.md#15:35
