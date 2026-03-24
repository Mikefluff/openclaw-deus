# DEUS Test Surfaces

## Purpose

Explain what the current DEUS command and test surfaces actually verify, and what they do not guarantee.

This document exists because a green command surface can otherwise imply more confidence than the repository has actually earned.

---

## Root Read-Only DEUS Surfaces

### Execution-profile interpretation matrix

| Surface | What it is for | What it may read | What it may write | What a green result does not mean |
|---------|-----------------|------------------|-------------------|-----------------------------------|
| `deus:focus` | inspect posture and bounded sleep planner state | `STATUS.md`, focus/runtime posture | nothing | that any reflection ran or that action execution is allowed |
| `deus:sleep:dry` / `deus:sleep` | bounded reflection profile | focus state, logs, memory, review, policy/runtime summaries | bounded reflection artifacts only | that full introspection ran or that belief-processing stages were executed |
| `deus:introspect:dry` / `deus:introspect` | full introspection profile | beliefs, memory, logs, review pressure, repo and integration state | introspection artifacts; full non-dry profile also owns documented belief-processing writes | that actions executed or that identity docs were rewritten automatically |
| `deus:nightly` | canonical full-night maintenance chain | beliefs, bounded sleep inputs, pending review state, policy/runtime summaries, fresh introspection follow-up packet | memory aggregation outputs, bounded sleep outputs, full introspection artifacts, bounded decay override updates, then reviewed promotion outputs | that nightly bypasses review, silently rewrites identity, or executes actions |

Ownership rule:
- `deus:sleep` is reduced and does not own belief extraction, contradiction scan, or decay;
- `deus:introspect` owns those full-profile stages;
- `deus:nightly` sequences memory aggregation, bounded sleep, full introspection, bounded decay tuning, and reviewed promotion, but that does not turn `deus:sleep` itself into a full introspection profile.

### `npm run deus:bootstrap`

Checks:
- bootstrap file presence,
- belief file format,
- memory file expectations,
- entrypoint drift,
- OpenClaw memory fallback behavior.

Does not guarantee:
- that today's memory file was created in check-only mode,
- that all downstream maintenance flows succeed,
- that future optional projects are healthy.

### `npm run deus:health`

Checks:
- compact DEUS health summary from current artifacts and repo state,
- memory freshness signal (`latestDayKey`, `daysSinceLatest`) for quick staleness detection,
- current `world-model`, `action-policy`, and policy-surface digest from live runtime state.

Does not guarantee:
- that maintenance pipelines are green end-to-end,
- that beliefs are semantically correct,
- that the advisory policy decision will be enforced automatically,
- that the workspace applications are deploy-ready.

### `npm run deus:focus`

Checks:
- the canonical `STATUS.md`-derived focus-state summary,
- the current bounded sleep planner posture (`wait`, `prepare_conditions`, `sleep_reflection`, or `cron_follow_through`),
- the explicit execution boundary stating that OpenClaw still owns real action execution.

Does not guarantee:
- that any background reflection has run,
- that follow-through or sleep execution is currently allowed,
- that the suggested posture will be acted on automatically.

### `npm run deus:action:evaluate -- <intent-json>`

Checks:
- action intent normalization and validation,
- advisory ripeness/cost decision generation from the current DEUS state and latest available `world-model`,
- recommended next-step output for operator inspection.

Does not guarantee:
- that the proposed action is correct,
- that the action will execute,
- that OpenClaw or any external system has been instructed to act.

### `npm run deus:introspect:dry`

Checks:
- introspection pipeline can execute in dry mode,
- the full introspection stage topology stays visible without writing the normal outputs,
- derived `world-model`, `action-policy`, and `policy_feedback` summaries remain inspectable in dry-run output.
- belief-processing ownership remains attached to the full introspection profile rather than the bounded sleep profile.

Does not guarantee:
- that the full mutating introspection cycle succeeds,
- that belief promotion decisions are correct,
- that generated reports or `world-model` snapshots were persisted.

### `npm run deus:introspection:followup -- --prompt`

Checks:
- the latest introspection follow-up packet can be read from the canonical path,
- the packet exposes the fresh report/data paths plus bounded decision metadata,
- the agent-facing prompt contract stays inspectable without executing actions.

Does not guarantee:
- that a follow-up action was executed,
- that the packet's decision is semantically perfect,
- that the nightly cron has already consumed the packet.

### `npm run deus:decay:tune:dry`

Checks:
- the latest introspection follow-up packet can yield at most one bounded decay-tuning proposal,
- the proposal targets the runtime override artifact instead of base policy code,
- the operator can inspect the proposal without mutating the override artifact.

Does not guarantee:
- that a tuning change was applied,
- that the suggested retune is semantically correct,
- that the live runtime now uses a new override.

### `npm run deus:sleep:dry`

Checks:
- the bounded sleep planner can inspect current readiness without mutating canonical artifacts,
- when the planner enters a previewable reflection state, the reduced bounded-sleep stage set stays inspectable,
- the preview surface for logs/memory/review/introspection inputs remains inspectable,
- the bounded profile stays reduced and does not claim belief-extraction, contradiction, or decay ownership,
- the current workspace posture is evaluated without implying action execution.

Does not guarantee:
- that the mutating sleep cycle would be allowed right now,
- that any nightly outputs were written,
- that durable beliefs or identity artifacts were changed.

### `npm run deus:openclaw:check`

Checks:
- OpenClaw compatibility and adapter diagnostics,
- the current policy snapshot exposed to OpenClaw integration surfaces.

Does not guarantee:
- broader DEUS coherence outside the adapter layer,
- optional project readiness,
- that advisory policy outputs are enforced without an OpenClaw runtime action.

### `npm run deus:world-model`

Checks:
- the derived `world-model` can be built from current DEUS state,
- the latest snapshot can be persisted under `docs/introspection/`.

Does not guarantee:
- that the snapshot is semantically perfect,
- that readiness or cost judgments are sufficient for autonomous action,
- that any durable belief was changed.

### `npm run deus:policy:record -- <event-json>`

Checks:
- structured policy feedback can be normalized and appended to `logs/YYYY-MM-DD.jsonl`,
- the runtime has a canonical path for recording world-model refreshes, action evaluations, and action outcomes.

Does not guarantee:
- that memory aggregation or nightly consolidation has already consumed the event,
- that the event changed `beliefs/core.jsonl`,
- that a single policy event implies a stable recurring pattern.

---

## Root Mutating DEUS Surfaces

### `npm run deus:sleep`

Checks:
- the bounded sleep reflection runner can mutate only the allowed surfaces,
- current sleep-cycle outputs stay inside `logs/`, `memory/`, `review/`, `docs/introspection/`, and `.tmp/diagnostics/`,
- forbidden background mutation targets are still blocked by policy,
- full belief-processing ownership still stays outside the bounded sleep profile.

Does not guarantee:
- that belief promotion happened,
- that any external action was executed,
- that the workspace was in a posture where sleep reflection had to run.

### `npm run deus:decay:tune`

Checks:
- one bounded decay retune can be applied from the latest follow-up packet,
- the change lands in `beliefs/decay-policy.overrides.json`,
- the path stops after one eligible adjustment and becomes idempotent when already applied.

Does not guarantee:
- that the retune was the right semantic decision,
- that `beliefs/core.jsonl` was repaired directly,
- that broader introspection repair work has finished.

### `npm run deus:nightly`

Checks:
- the official nightly chain runs in this order: memory aggregation, bounded sleep, full introspection, bounded decay tuning, then reviewed belief promotion,
- the chain still keeps review and bounded decay constraints explicit,
- nightly semantics stay narrower than autonomous self-modification,
- nightly still preserves the reduced-vs-full distinction between `deus:sleep` and `deus:introspect`.

Does not guarantee:
- that every candidate belief was promoted,
- that follow-through cron state was changed,
- that OpenClaw executed any external/runtime action.

---

## Root Test Surfaces

### `npm test`

Current meaning:
- the curated root package test surface defined by `scripts/run-root-tests.js`.

Today it covers:
- scenario exposure,
- decay-governance audit, override, and tuning guardrails,
- focus-state and doctor verification for the official focus/sleep surfaces,
- advisory action-policy and policy-feedback surfaces,
- workspace DB contract,
- bootstrap contract checks,
- constitution checks,
- integration checks,
- OpenClaw integration checks.

It does not equal the entire root test inventory.

### `node --test tests/*.test.js`

Current meaning:
- the broader root test inventory.

Use this when you need stronger confidence in root regressions than `npm test` alone provides.

---

## Workspace Surfaces

### `npm run doctor:workspace`

Checks:
- root manifests,
- discovered workspace targets,
- command-surface integrity,
- presence of the official `deus:focus`, `deus:sleep`, `deus:sleep:dry`, `deus:decay:tune`, and `deus:decay:tune:dry` package entrypoints,
- workspace-authority classification for canonical, live-runtime, and ephemeral paths.

Does not guarantee:
- live external credentials,
- production deploy status,
- honesty of every project-level status markdown,
- that any optional external runtime-root split has been configured.

### `npm run verify:workspace`

Checks:
- root `npm test`
- plus `npm test` for any materialized `projects/<project-name>/package.json` targets discovered at runtime

Does not guarantee:
- any deeper future project-local unit surface outside a discovered package contract,
- live operator readiness for optional projects,
- the presence of any project implementation in `clean-install`.

---

## Interpretation Rule

Use the narrowest honest wording:
- "passes bootstrap"
- "passes curated root tests"
- "passes workspace verify matrix"
- "passes project-local preflight"

Avoid saying "the system is verified" unless the specific verification surface actually justifies that claim.
