# PROCESS_NIGHTLY_AUTOMATION.md

## Purpose

Describe the regular night-time maintenance cycle used to keep DEUS coherent, backed up, and capable of gradual self-improvement.

---

## Nightly Sequence (Workspace-Local Time)

All daily date keys and memory/log file naming in this sequence should follow the workspace-local day resolved by the locality profile layer.
Resolution order:
- `WORKSPACE_TZ` when explicitly set;
- `USER.md` timezone when present;
- `UTC` as the clean-install default.

### 02:30 — Nightly micro-improvement
Purpose:
- inspect code and current system state
- choose one small, safe, bounded improvement
- implement it
- document it
- report the result briefly

Constraints:
- exactly one meaningful improvement per night
- no major architectural rewrites in this slot
- no destructive changes without explicit approval
- prefer local quality, clarity, tests, docs, or small reliability improvements

### 04:00 — Full-night DEUS orchestrator
Purpose:
- run the canonical DEUS night chain in this order:
  1. `deus:memory:aggregate`
  2. `deus:sleep`
  3. `deus:introspect`
  4. `deus:decay:tune` when the fresh follow-up packet authorizes it
  5. reviewed belief promotion
- write the canonical fresh-report follow-up packet from the same pass
- let the same 04:00 orchestration slot consume that packet before choosing any extra bounded measure
- produce concise user-facing summary

### 04:20 — Post-nightly review-pressure audit
Purpose:
- review the fresh nightly artifacts and recent memory after the 04:00 orchestrator already ran
- identify unresolved tensions, weak promotions, or drift between memory, review, and introspection outputs
- append concise review notes or tensions when needed
- avoid replaying the same maintenance chain from a second cron slot

### 04:40 — Constitution / regression check
Purpose:
- run bootstrap, integration, and constitution tests
- detect adapter breakage, path drift, invariant violations, or structure regressions
- support belief promotion review by ensuring the surrounding structure is healthy

### 05:00 — Nightly backup finalization
Purpose:
- preserve continuity after all semantic night maintenance has finished
- commit meaningful canonical or promoted runtime changes
- push the already-verified final night state to GitHub

Expected output:
- brief summary only

---

## Status / follow-through layer

A separate live status mechanism exists:
- `STATUS.md` — canonical live state file
- periodic follow-through cron — continues unfinished active blocks when safe

This is meant to reduce the ambiguity between “currently working”, “waiting on input”, and “idle”.

## Principles

1. Nightly automation should prefer:
   - preservation
   - self-checking
   - consolidation
   - proposal generation
   - one canonical owner for the full-night maintenance order
2. Nightly automation should avoid blind mutation of core identity.
3. Durable belief changes require stronger evidence than one-off events.
4. Runtime noise must not be confused with DEUS core state.

---

## Review Layer

Nightly jobs should write into a review layer rather than directly mutating core beliefs whenever confidence is uncertain.

Suggested review artifacts:
- `review/pending-beliefs.md`
- `review/open-tensions.md`

`review/pending-beliefs.md` should act as a promotion queue with structured fields such as evidence, recurrence, confidence proposal, promotion decision, and human review need.

---

## Weekly Additions

Not every useful maintenance task should run nightly.

Weekly review candidates:
- infra/project review
- docs drift review
- belief pipeline audit
- stale deployment inventory

### Weekly review automation
A scheduled weekly review now exists to cover the broader maintenance layer:
- projects/app state
- infra reality (Dokploy / Cloudflare when relevant)
- docs drift
- pending belief promotions
- open tensions
