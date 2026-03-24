# Reflexive Runtime

## Purpose

Describe the current DEUS reflexive runtime as it actually exists in the repository.

This is the operational successor to the archive's broader `sleep_mode` / `self_patch` / semantic-consolidation ideas.

---

## Current Reflexive Loops

### 1. Bootstrap validation

Entry surface:
- `npm run deus:bootstrap`

Purpose:
- validate the root bootstrap contract,
- detect missing bootstrap artifacts,
- detect entrypoint drift,
- avoid silent degradation of DEUS continuity.

Primary outputs:
- console summary,
- optional repair path when explicitly requested.

### 2. Daily ops logging

Entry surface:
- `npm run deus:log -- <type> "<description>"`

Purpose:
- append machine-readable DEUS activity events,
- preserve operational evidence before reflective aggregation.

Primary outputs:
- `logs/YYYY-MM-DD.jsonl`

Policy-layer adjunct surfaces:
- `npm run deus:world-model` refreshes the derived `world-model` snapshot under `docs/introspection/`.
- `npm run deus:action:evaluate -- <intent-json>` computes an advisory readiness/cost/next-step evaluation from current runtime state.
- `npm run deus:policy:record -- <event-json>` records world-model refreshes, action evaluations, blockers, friction, and outcomes into the canonical daily log.

Boundary:
- these policy-layer surfaces remain inspectable, advisory, or reflective;
- OpenClaw still owns actual action execution.

### 3. Memory aggregation

Entry surface:
- `npm run deus:memory:aggregate`

Purpose:
- fold operational logs into daily episodic memory,
- preserve continuity at the day level.

Primary outputs:
- `memory/YYYY-MM-DD.md`

### 4. Interaction capture boundary

Primary runtime path:
- canonical interaction events land in `logs/YYYY-MM-DD.jsonl`
- salient interaction lines can enter the human-interaction section of `memory/YYYY-MM-DD.md`

Current rule:
- incidental chatter should stay low-salience,
- explicit user preferences, corrections, constraints, and instructions may survive into memory or review pressure,
- interaction-derived belief candidates are review-first by design and do not auto-promote directly into durable belief state.

### 5. Focus and runtime-mode state

Canonical state surface:
- `STATUS.md`
- `npm run deus:focus` for the read-only runtime summary of current focus posture

Current state machine:
- status: `active`, `waiting`, `idle`
- mode: `working`, `focus`, `cron_follow_through`, `sleep_reflection`, `idle`

Operational rule:
- follow-through only runs from explicit active state plus follow-through demand,
- bounded background reflection only runs from explicit waiting/idle posture plus the `sleep_reflection` gate.

### Execution profile matrix

| Surface | When / posture | Primary reads | Allowed writes | Must not do | Belief-processing owner |
|---------|----------------|---------------|----------------|-------------|-------------------------|
| `npm run deus:focus` | any time; read-only posture inspection | `STATUS.md`, focus planner state, bounded sleep posture | none | execute actions, start reflection implicitly, mutate runtime state | none |
| `npm run deus:sleep:dry` / `npm run deus:sleep` | quiet-hours sleep window or explicit bounded reflection pass when planner posture allows preview/run | `STATUS.md`, recent `logs/`, recent `memory/`, `review/`, policy/runtime summaries, OpenClaw diagnostics | bounded reflection artifacts only: `logs/`, `memory/`, `review/`, `docs/introspection/`, diagnostics | belief extraction, contradiction scan, belief decay, silent identity rewrite, external action execution | none; bounded sleep is reduced by design |
| `npm run deus:introspect:dry` / `npm run deus:introspect` | dedicated full introspection slot during the sleep window, explicit operator request, or the full-profile stage inside `deus:nightly` | beliefs, memory, logs, review pressure, repo state, health/integration state, policy/runtime summaries | full introspection artifacts under `docs/introspection/`; non-dry full profile also owns its documented belief-processing mutations | treat bounded sleep as equivalent, silently rewrite identity docs, execute runtime actions | full introspection owns `belief_extraction`, `contradiction_scan`, and `belief_decay` |
| `npm run deus:nightly` | canonical full-night maintenance chain | beliefs, logs, memory, review pressure, pending review state, policy/runtime summaries, health/integration state | memory aggregation outputs, bounded sleep artifacts, full introspection artifacts, bounded decay overrides, then reviewed durable-belief promotion | bypass review, silently run autonomous action execution, collapse `deus:sleep` into a full-introspection alias | nightly sequences the full chain, but the embedded `deus:sleep` stage stays reduced and never owns extraction/decay directly |

Interpretation rule:
- the sleep window is a shared time window, not a single execution profile;
- `deus:sleep` and `deus:introspect` may both run there, but they remain different contracts;
- `deus:nightly` is the canonical full-night entrypoint that sequences those contracts without erasing their ownership boundaries.

### 6. Bounded sleep reflection

Official entry surfaces:
- `npm run deus:sleep:dry`
- `npm run deus:sleep`

Purpose:
- inspect recent logs, memory, review pressure, and policy state,
- optionally run the bounded mutating reflection path,
- run only the reduced introspection subset:
  - `openclaw_integration_checks`
  - `world_model_refresh`
  - `report_generation`
  - `summary_output`
- write only to logs, memory, review, introspection, and diagnostics surfaces.

Hard boundary:
- it must not mutate `DEUS.md`, `docs/AXIOMS_AND_AGENCY.md`, or `beliefs/core.jsonl`;
- forbidden targets are blocked and audited explicitly before the mutating cycle continues.

### 7. Belief extraction

Entry surface:
- `npm run deus:beliefs:extract`

Purpose:
- derive candidate beliefs from recent memory and activity patterns,
- prefer review-first promotion over direct durable mutation.

Primary outputs:
- `review/pending-beliefs.md`
- diagnostics under `.tmp/diagnostics/`

### 8. Contradiction scan

Entry surface:
- `npm run deus:beliefs:contradictions`

Purpose:
- detect tensions between existing durable beliefs and candidate material,
- create repair or review pressure before contradiction silently accumulates.

### 9. Decay

Entry surface:
- `npm run deus:beliefs:decay`

Purpose:
- reduce stale belief confidence using the current effective decay profile,
- keep lifecycle transitions (`review_needed`, `deprecated`, `archived`) separate from raw confidence drift,
- honor the runtime override artifact at `beliefs/decay-policy.overrides.json`,
- exempt axioms and invariants from decay paths.

### 10. Promotion review

Entry surface:
- `npm run deus:beliefs:review`

Purpose:
- decide whether candidate beliefs should be promoted, deferred, refreshed, or rejected.

### 11. Introspection

Entry surfaces:
- `npm run deus:introspect:dry`
- `npm run deus:introspect`

Purpose:
- run the full introspection profile during the sleep window or on explicit operator request,
- collect health, contradiction, decay, decay-audit, memory, integration, repo state, and policy-runtime context into one reflective output,
- refresh the derived `world-model` and `action-policy` surfaces,
- summarize recent policy feedback such as blockers, high-cost action classes, and dominant outcomes,
- write a canonical `introspection-followup.latest.json` packet for the fresh report,
- support repair-oriented or review-oriented follow-up, including bounded decay-tuning recommendations.

Current full-profile note:
- full introspection now includes a dedicated `decay_policy_audit` stage between `belief_decay` and integration checks,
- that audit may recommend bounded tuning candidates when active decaying beliefs are pinned to their floor or when non-archivable beliefs drift into invalid lifecycle states,
- it must not directly rewrite the base policy module.

Primary outputs:
- `docs/introspection/*.md`
- `docs/introspection/*.json`

### 12. Bounded decay tuning follow-up

Entry surfaces:
- `npm run deus:decay:tune:dry`
- `npm run deus:decay:tune`

Purpose:
- read the fresh introspection follow-up packet,
- derive at most one eligible class-level decay retune,
- apply that retune only to `beliefs/decay-policy.overrides.json`,
- stop after one bounded change.

Hard boundary:
- this path may not rewrite `src/beliefs/belief-policy.js`,
- it may not mutate `beliefs/core.jsonl` directly,
- it may not tune `axiom` defaults automatically,
- it becomes idempotent once the suggested mode is already active.

### 13. Nightly cycle

Entry surface:
- `npm run deus:nightly`

Purpose:
- run the current maintenance chain as one ordered full-night reflexive cycle:
  1. daily memory aggregation
  2. bounded sleep reflection
  3. full introspection
  4. bounded decay tuning from the fresh follow-up packet when eligible
  5. reviewed belief promotion

Current runtime note:
- bounded sleep reflection and full introspection share the same quiet-hours/sleep-window context, but they are not the same execution profile;
- `deus:sleep` stays reduced and avoids belief-processing stages entirely;
- the heavier full introspection profile still belongs to `deus:introspect`, but `deus:nightly` now invokes that profile explicitly as its middle stage;
- a dedicated nightly automation slot should run `deus:nightly`, then consume the fresh follow-up packet written by that pass before choosing any extra bounded measure;
- when the packet authorizes bounded decay tuning, that measure should land only in `beliefs/decay-policy.overrides.json`;
- nightly consolidation still reads recent policy feedback from `logs/` and can raise review pressure around recurring blockers, readiness gaps, or maintenance-tail friction without directly bypassing the promotion gate.
- the lower-level bounded sleep runner stays narrower than the full nightly chain: it mutates logs, memory, review, introspection, and diagnostics only, while the orchestration layer adds the later full-profile and reviewed-promotion stages.

---

## Canonical Artifact Promotion Flows

### Flow A: User preference to durable belief

1. user interaction or explicit artifact
2. log or memory capture
3. candidate extraction
4. review queue with explicit provenance
5. promotion review
6. optional durable update in `beliefs/core.jsonl`

### Flow B: Ops event to recurring pattern

1. operational event
2. optional policy feedback event
3. `logs/YYYY-MM-DD.jsonl`
4. daily memory aggregation
5. nightly consolidation and pattern detection
6. candidate belief or open tension
7. introspection report and/or promotion review

### Flow C: Self-model tension to repair signal

1. contradiction or coherence degradation
2. contradiction scan / introspection
3. report or review finding
4. human review or bounded follow-up task
5. optional doc/self-model update

---

## Failure Handling

The reflexive runtime is designed to fail soft where possible:
- dry-run introspection should gather state without mutating canonical files,
- weaker candidate beliefs should be deferred rather than promoted,
- sleep-reflection and idle-background candidates should stay review-first rather than auto-promoting,
- contradiction detection should surface review pressure rather than silently mutate identity,
- identity-critical updates should be escalated to human review rather than self-applied,
- forbidden background mutations should leave an audit trail on diagnostics surfaces rather than disappearing as silent failures.

---

## What This Is Not

This runtime is not:
- a graph-native sleep-state machine,
- a self-modifying DSL interpreter,
- a proof that all original archive reflexive constructs are implemented verbatim.

It is the current, file-backed, scenario-driven reflexive runtime that the repository actually ships.
