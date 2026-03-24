# Introspection Pipeline Protocol

> Current DEUS introspection contract for the OpenClaw runtime

---

## Purpose

Describe the current introspection pipeline as implemented by the repository, not the older manual six-phase ritual from the historical archive.

Primary implementation:
- `src/introspection/introspection-pipeline.js`
- `scripts/introspection.js`

---

## Entry Surfaces

Read-only:
- `npm run deus:introspect:dry`

Mutating:
- `npm run deus:introspect`
- `npm run deus:nightly` as the canonical full-night maintenance chain that includes a full introspection stage plus later bounded follow-up surfaces

---

## Inputs

The current pipeline reasons over:
- `DEUS.md`
- `beliefs/core.jsonl`
- `memory/YYYY-MM-DD.md`
- `logs/YYYY-MM-DD.jsonl`
- `STATUS.md`
- repository cleanliness and integration state

During the run it also refreshes the derived `world-model` and advisory `action-policy` surfaces from the current workspace state.

Related but not directly read by the current pipeline:
- `review/pending-beliefs.md` remains part of the broader reflexive loop, but not a direct introspection input today
- `beliefs/drift.log` should not be documented as a required input for the current pipeline contract

---

## Current Stage Order

The repository now ships two introspection profiles.

Interpretation rule:
- the sleep window is shared by more than one maintenance surface;
- shared timing does not imply shared ownership;
- bounded sleep and full introspection therefore stay separate execution profiles even when both run in the same quiet-hours window.

### Full introspection profile

Used by:
- `npm run deus:introspect`
- `npm run deus:introspect:dry`
- the full-introspection stage inside `npm run deus:nightly`
- any dedicated nightly automation slot that invokes the full-night orchestrator

Canonical stage names:

1. `belief_extraction`
2. `contradiction_scan`
3. `belief_decay`
4. `decay_policy_audit`
5. `openclaw_integration_checks`
6. `world_model_refresh`
7. `report_generation`
8. `summary_output`

### Bounded sleep introspection profile

Used by:
- `npm run deus:sleep`
- `npm run deus:sleep:dry`

Canonical stage names:

1. `openclaw_integration_checks`
2. `world_model_refresh`
3. `report_generation`
4. `summary_output`

These names come from `src/introspection/introspection-pipeline.js` and should be treated as the current contract unless the implementation changes.

Ownership boundary:
- bounded sleep owns only the reduced stage set above;
- it does not own `belief_extraction`, `contradiction_scan`, or `belief_decay`;
- those stages belong to the full introspection profile only;
- `npm run deus:nightly` now sequences bounded sleep, full introspection, bounded decay tuning, and reviewed promotion, but that still does not make sleep an alias for full introspection.

---

## Stage Semantics

### `belief_extraction`
- gathers candidate belief material from recent artifacts
- prepares input for review-first promotion

### `contradiction_scan`
- detects tensions between durable beliefs and newer evidence

### `belief_decay`
- applies the current decay policy
- preserves decay exemptions for axioms and invariants

### `decay_policy_audit`
- inspects effective decay classes, modes, floors, lifecycle pressure, and override-sensitive drift
- may propose bounded tuning candidates for the follow-up packet
- must not mutate the base policy module directly

### `openclaw_integration_checks`
- evaluates adapter/runtime compatibility

### `world_model_refresh`
- rebuilds or reloads the derived `world-model` snapshot from the current DEUS state
- evaluates the current advisory `action-policy` surface on top of that state
- keeps these surfaces inspectable for health, introspection, and OpenClaw diagnostics

### `report_generation`
- assembles the introspection report body
- includes coherence, belief, memory, repo-state, and policy-runtime context
- persists a canonical follow-up packet (`introspection-YYYY-MM-DD.followup.json` and `introspection-followup.latest.json`) for the next agent pass
- includes decay-audit counts and bounded tuning candidates when present

### `summary_output`
- writes or prints the summary-oriented result of the run

---

## Dry-Run Semantics

`npm run deus:introspect:dry` should:
- still execute the pipeline shell and reporting path,
- keep the full introspection stage topology visible,
- skip mutating belief-maintenance effects such as extraction, contradiction resolution, and decay,
- still refresh the derived `world-model` and advisory `action-policy` surfaces in memory for inspection,
- avoid persistent `world-model` writes and policy-feedback log writes where dry-run protection applies,
- avoid normal persistent report mutations where dry-run protection applies,
- act as a safe diagnostic surface for pipeline health.

Dry-run is meant for inspection, not for silently changing durable DEUS state.

`npm run deus:sleep:dry` should:
- keep the reduced bounded-sleep topology visible whenever the planner enters a previewable reflection state,
- avoid belief extraction, contradiction scan, and decay entirely,
- preview the bounded reflection outputs without mutating canonical artifacts.

---

## Failure Handling

The current introspection pipeline is stage-based and fail-soft oriented.

Operational rule:
- stage failures should surface explicitly,
- weaker semantic signals should increase review pressure rather than force durable mutation,
- identity-critical follow-up should be escalated through human-reviewed docs or tasks rather than silently self-applied.

---

## Outputs

Typical outputs include:
- introspection reports under `docs/introspection/`
- summary JSON or Markdown artifacts
- `introspection-followup.latest.json` as the canonical fresh-report handoff packet
- `world_model`, `action_policy`, and `policy_feedback` sections in the report/summary payload
- related diagnostics
- updated review pressure for later maintenance steps

Operational runtime note:
- a dedicated nightly automation slot should first run `npm run deus:nightly`,
- then it should read the fresh `introspection-followup.latest.json` packet and the referenced report/data files,
- then it may take one bounded measure consistent with that packet's `decision`, `allowedMeasures`, and `guardrails` without replaying the full-night chain,
- and when that measure is bounded decay tuning it should flow through `npm run deus:decay:tune`, which only updates `beliefs/decay-policy.overrides.json`.

For the broader reflexive loop around introspection, see `docs/REFLEXIVE_RUNTIME.md`.
