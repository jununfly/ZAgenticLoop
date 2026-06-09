---
layout: null
title: Loop Engineering — Showcase
---
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Loop Engineering — Design systems that prompt your agents</title>
  <meta name="description" content="The practical reference for loop engineering. Patterns, starters, checklists, and tooling for Grok, Claude Code, and Codex.">
  <meta property="og:title" content="Loop Engineering">
  <meta property="og:description" content="Stop prompting. Start designing loops.">
  <meta property="og:image" content="https://raw.githubusercontent.com/cobusgreyling/loop-engineering/main/assets/cobus-greyling.jpg">
  <link rel="stylesheet" href="{{ site.baseurl }}/assets/css/showcase.css">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⟳</text></svg>">
</head>
<body>

<nav class="nav">
  <div class="wrap nav-inner">
    <a href="#" class="logo">Loop <span>Engineering</span></a>
    <ul class="nav-links">
      <li><a href="#patterns">Patterns</a></li>
      <li><a href="#primitives">Primitives</a></li>
      <li><a href="#start">Get Started</a></li>
      <li><a href="https://github.com/cobusgreyling/loop-engineering">GitHub</a></li>
    </ul>
    <a href="https://github.com/cobusgreyling/loop-engineering" class="btn btn-primary">View Repo</a>
  </div>
</nav>

<header class="hero wrap">
  <div class="badge">Open source · Tool-agnostic · Production-ready</div>
  <h1>Design the system<br>that prompts your agents</h1>
  <p class="lead">
    Loop engineering moves you from "I prompt → agent responds → I prompt again"
    to "I design the autonomous system that discovers work, verifies results, and drives progress."
  </p>
  <div class="hero-cta">
    <a href="https://github.com/cobusgreyling/loop-engineering/tree/main/starters/minimal-loop" class="btn btn-primary">Clone a Starter →</a>
    <a href="https://github.com/cobusgreyling/loop-engineering/blob/main/docs/primitives-matrix.md" class="btn btn-ghost">Primitives Matrix</a>
  </div>
  <img
    class="hero-img"
    src="https://raw.githubusercontent.com/cobusgreyling/loop-engineering/main/assets/cobus-greyling.jpg"
    alt="Loop Engineering"
    loading="lazy"
  />
</header>

<div class="wrap quotes">
  <div class="quote-card">
    <blockquote>"You shouldn't be prompting coding agents anymore. You should be designing loops that prompt your agents."</blockquote>
    <cite>— Peter Steinberger</cite>
  </div>
  <div class="quote-card">
    <blockquote>"I don't prompt Claude anymore. I have loops running that prompt Claude. My job is to write loops."</blockquote>
    <cite>— Boris Cherny, Head of Claude Code</cite>
  </div>
  <div class="quote-card">
    <blockquote>"Build the loop. But build it like someone who intends to stay the engineer, not just the person who presses go."</blockquote>
    <cite>— Addy Osmani</cite>
  </div>
</div>

<section id="flow" class="wrap">
  <p class="section-label">Anatomy</p>
  <h2 class="section-title">What one loop looks like</h2>
  <p class="section-desc">You design it once. You're not prompting every micro-step.</p>
  <div class="flow">
    <span class="flow-step">⏱ Schedule</span>
    <span class="flow-arrow">→</span>
    <span class="flow-step">👁 Triage skill</span>
    <span class="flow-arrow">→</span>
    <span class="flow-step">📋 STATE.md</span>
    <span class="flow-arrow">→</span>
    <span class="flow-step">🌲 Worktree</span>
    <span class="flow-arrow">→</span>
    <span class="flow-step">⚙️ Implementer</span>
    <span class="flow-arrow">→</span>
    <span class="flow-step">✓ Verifier</span>
    <span class="flow-arrow">→</span>
    <span class="flow-step">🔗 MCP / PR</span>
    <span class="flow-arrow">→</span>
    <span class="flow-step">🧑 Human gate</span>
  </div>
</section>

<section id="primitives" class="wrap">
  <p class="section-label">Building blocks</p>
  <h2 class="section-title">Five primitives + memory</h2>
  <p class="section-desc">The same shape works in Grok, Claude Code, and Codex. Tool names differ; capabilities converge.</p>
  <div class="primitives">
    <div class="primitive">
      <div class="icon">⏱</div>
      <h3>Scheduling</h3>
      <p>/loop, cron, automations</p>
    </div>
    <div class="primitive">
      <div class="icon">🌲</div>
      <h3>Worktrees</h3>
      <p>Parallel without collisions</p>
    </div>
    <div class="primitive">
      <div class="icon">📚</div>
      <h3>Skills</h3>
      <p>Intent written once</p>
    </div>
    <div class="primitive">
      <div class="icon">🔌</div>
      <h3>Connectors</h3>
      <p>MCP → real tools</p>
    </div>
    <div class="primitive">
      <div class="icon">🔀</div>
      <h3>Sub-agents</h3>
      <p>Maker / checker split</p>
    </div>
    <div class="primitive">
      <div class="icon">💾</div>
      <h3>State</h3>
      <p>Memory outside the model</p>
    </div>
  </div>
  <div class="tools" style="margin-top: 40px;">
    <span class="tool-pill grok">Grok Build</span>
    <span class="tool-pill claude">Claude Code</span>
    <span class="tool-pill codex">Codex</span>
    <span class="tool-pill">GitHub Actions</span>
  </div>
  <p style="text-align: center; margin-top: 24px;">
    <a href="https://github.com/cobusgreyling/loop-engineering/blob/main/docs/primitives-matrix.md">Full cross-tool matrix →</a>
  </p>
</section>

<section id="patterns" class="wrap">
  <p class="section-label">Copy & run</p>
  <h2 class="section-title">Production patterns</h2>
  <p class="section-desc">Documented loops with scheduling, skills, state schemas, verification, and honest failure modes.</p>
  <div class="patterns">
    <article class="pattern-card">
      <span class="tag">Most popular</span>
      <h3>PR Babysitter</h3>
      <p>Shepherd PRs through review, CI, rebase, and merge. Human stays in the judgment seat.</p>
      <div class="pattern-meta">
        <span>⏱ 5–15m</span>
        <span>◆ Medium risk</span>
      </div>
      <a class="link" href="https://github.com/cobusgreyling/loop-engineering/blob/main/patterns/pr-babysitter.md">Read pattern →</a>
    </article>
    <article class="pattern-card">
      <span class="tag">Start here</span>
      <h3>Daily Triage</h3>
      <p>Morning scan of CI, issues, and commits. Report-only week one, then small auto-wins.</p>
      <div class="pattern-meta">
        <span>⏱ 1d–2h</span>
        <span>◆ Low risk</span>
      </div>
      <a class="link" href="https://github.com/cobusgreyling/loop-engineering/blob/main/patterns/daily-triage.md">Read pattern →</a>
    </article>
    <article class="pattern-card">
      <span class="tag">High frequency</span>
      <h3>CI Sweeper</h3>
      <p>React to failing checks with minimal fixes. Classify flakes. Escalate after 3 attempts.</p>
      <div class="pattern-meta">
        <span>⏱ 5–15m</span>
        <span>◆ Medium risk</span>
      </div>
      <a class="link" href="https://github.com/cobusgreyling/loop-engineering/blob/main/patterns/ci-sweeper.md">Read pattern →</a>
    </article>
    <article class="pattern-card">
      <span class="tag">Off-peak</span>
      <h3>Post-Merge Cleanup</h3>
      <p>TODOs, deprecations, and tech debt after merges. Small PRs overnight.</p>
      <div class="pattern-meta">
        <span>⏱ 1d–6h</span>
        <span>◆ Low risk</span>
      </div>
      <a class="link" href="https://github.com/cobusgreyling/loop-engineering/blob/main/patterns/post-merge-cleanup.md">Read pattern →</a>
    </article>
  </div>
  <div class="stats">
    <div class="stat">
      <div class="num">4</div>
      <div class="label">Patterns</div>
    </div>
    <div class="stat">
      <div class="num">3</div>
      <div class="label">Starter kits</div>
    </div>
    <div class="stat">
      <div class="num">L0→L3</div>
      <div class="label">Readiness levels</div>
    </div>
    <div class="stat">
      <div class="num">100</div>
      <div class="label">Audit score max</div>
    </div>
  </div>
</section>

<section id="start" class="wrap">
  <p class="section-label">5 minutes</p>
  <h2 class="section-title">Get started</h2>
  <p class="section-desc">Clone a starter, audit your project, run report-only for one week.</p>
  <div class="code-block">
    <div class="code-header">
      <div class="code-dots"><span></span><span></span><span></span></div>
      <span>terminal — minimal loop</span>
    </div>
    <pre><span class="comment"># Copy starter into your project</span>
cp -r starters/minimal-loop/.grok/skills/loop-triage .grok/skills/
cp starters/minimal-loop/STATE.md.example STATE.md

<span class="comment"># Score loop readiness</span>
node tools/loop-audit/dist/cli.js .

<span class="comment"># Grok — report only, week one</span>
<span class="cmd">/loop</span> <span class="flag">1d</span> Run loop-triage. Update STATE.md. No auto-fix.</pre>
  </div>
  <p style="margin-top: 24px; text-align: center;">
    <a href="https://github.com/cobusgreyling/loop-engineering/tree/main/starters">All starters</a>
    ·
    <a href="https://github.com/cobusgreyling/loop-engineering/blob/main/docs/loop-design-checklist.md">Design checklist</a>
    ·
    <a href="https://github.com/cobusgreyling/loop-engineering/tree/main/stories">Production stories</a>
  </p>
</section>

<section class="wrap" style="padding-top: 0;">
  <p class="section-label">Deep dives</p>
  <h2 class="section-title">Engineering, not hype</h2>
  <div class="patterns">
    <article class="pattern-card">
      <h3>Failure Modes</h3>
      <p>Infinite fix loops, verifier theater, token burn — with mitigations.</p>
      <a class="link" href="https://github.com/cobusgreyling/loop-engineering/blob/main/docs/failure-modes.md">Read catalog →</a>
    </article>
    <article class="pattern-card">
      <h3>Safety & Guardrails</h3>
      <p>Path denylist, auto-merge policy, MCP least privilege.</p>
      <a class="link" href="https://github.com/cobusgreyling/loop-engineering/blob/main/docs/safety.md">Read safety doc →</a>
    </article>
    <article class="pattern-card">
      <h3>loop-audit CLI</h3>
      <p>Loop Readiness Score 0–100. Know before you ship unattended.</p>
      <a class="link" href="https://github.com/cobusgreyling/loop-engineering/tree/main/tools/loop-audit">Run audit →</a>
    </article>
  </div>
</section>

<div class="cta">
  <h2>Ready to stop prompting?</h2>
  <p>The best loops are boring, reliable, and transparent.</p>
  <a href="https://github.com/cobusgreyling/loop-engineering" class="btn btn-primary">Star on GitHub</a>
  <a href="https://github.com/cobusgreyling/loop-engineering/blob/main/CONTRIBUTING.md" class="btn btn-ghost" style="margin-left: 12px;">Contribute a pattern</a>
</div>

<footer class="footer">
  <p>
    <a href="https://github.com/cobusgreyling/loop-engineering">GitHub</a>
    ·
    <a href="https://addyosmani.com/blog/loop-engineering/">Addy Osmani</a>
    ·
    MIT License
    ·
    Built by <a href="https://github.com/cobusgreyling">Cobus Greyling</a>
  </p>
</footer>

</body>
</html>