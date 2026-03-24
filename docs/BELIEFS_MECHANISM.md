# Beliefs Mechanism

> How durable beliefs are proposed, reviewed, refreshed, decayed, and promoted in the current DEUS runtime

---

## Purpose

This document describes the current belief lifecycle that the repository actually implements.

It is intentionally narrower than the broader semantic ontology from the historical DEUS archive.
For semantic governance beyond durable beliefs, see:
- `docs/SEMANTIC_GOVERNANCE.md`
- `docs/REFLEXIVE_RUNTIME.md`

---

## Canonical Belief Surfaces

| Surface | Role |
| --- | --- |
| `beliefs/core.jsonl` | durable beliefs and axioms |
| `beliefs/drift.log` | optional or historical drift artifact, not a required current runtime surface |
| `review/pending-beliefs.md` | candidate belief promotion queue |
| `memory/YYYY-MM-DD.md` | episodic source material |
| `logs/YYYY-MM-DD.jsonl` | canonical daily DEUS activity stream |
| `docs/introspection/*` | reflective reports and summaries |

Important current-runtime note:
- confidence and contradiction history is primarily recorded inside `beliefs/core.jsonl` entry fields such as `drift_history`,
- operational drift evidence is also visible in DEUS ops logs,
- `beliefs/drift.log` should not be treated as the authoritative live source unless the implementation starts writing it again.
- `world-model`, `action-policy`, and `policy-feedback` are adjacent runtime surfaces, not durable belief storage by themselves.

---

## Source Types

The current runtime still records belief `source_type`, but decay policy is no longer driven by `source_type` alone.
`source_type` describes provenance; decay behavior is controlled by the explicit decay-profile contract and `belief_class`.

| Source type | Meaning |
| --- | --- |
| `axiom` | foundational invariants and axiom-derived claims |
| `self` | self-model or identity-bearing claims |
| `external` | observed from user, docs, or external evidence |
| `inference` | derived interpretation from weaker or indirect evidence |

## Belief Classes And Decay Profiles

Durable beliefs may now carry explicit policy fields:
- `belief_class`
- `decay_mode`
- `confidence_floor`
- `review_threshold`
- `archivable`
- `refresh_strategy`

Canonical belief classes in the current runtime:

| Belief class | Typical role | Default decay mode | Floor | Review threshold | Archivable |
| --- | --- | --- | --- | --- | --- |
| `axiom` | invariants and foundational commitments | `no_decay` | `1.0` | `1.0` | `false` |
| `self_model` | self-model and identity-bearing commitments | `slow` | `0.85` | `0.9` | `false` |
| `user_model` | durable user preferences and constraints | `slow` | `0.75` | `0.8` | `false` |
| `operational` | recurring operational patterns | `normal` | `0.5` | `0.6` | `true` |
| `hypothesis` | weak or provisional claims | `fast` | `0.2` | `0.7` | `true` |

Runtime refinement:
- explicit belief-level fields win over class defaults,
- class defaults win over legacy source-type fallback,
- runtime retuning must go through `beliefs/decay-policy.overrides.json`, not through direct edits to `src/beliefs/belief-policy.js`.

---

## Current Lifecycle

### 1. Observation and capture

Potential inputs:
- user interactions,
- explicit docs and workspace facts,
- operational events,
- recurring patterns in memory and logs.

These inputs should first land in:
- `logs/`,
- `memory/`,
- or a review artifact,

not directly in durable belief state when confidence is uncertain.

Policy-layer boundary:
- `world-model` may summarize current state, `action-policy` may recommend a next step, and `policy-feedback` may raise review pressure through logs, memory aggregation, and nightly consolidation;
- none of those surfaces bypass the review-first path into `review/pending-beliefs.md` and `beliefs/core.jsonl`.

### 2. Candidate extraction

Primary entry surface:
- `npm run deus:beliefs:extract`

This stage:
- scans recent memory and related artifacts,
- proposes candidate beliefs,
- prefers review-first promotion for weaker signals,
- may refresh an existing belief when the similarity threshold is exceeded.

Current extraction policy from `src/beliefs/belief-policy.js`:
- strong signal confidence: `0.8`
- weak signal confidence: `0.6`
- similarity threshold: `0.7`
- reinforcement boost: `0.03`
- auto-promote explicit match length gate: `> 10`

Current provenance rule:
- `memory_pattern` candidates may still be eligible for extraction-time auto-promotion when the explicit signal is strong enough;
- `interactive_memory` candidates are review-first;
- `idle_background` candidates are review-first;
- `sleep_reflection` candidates are review-first.

This means:
- direct human interaction signals and background reflection outputs can enter the review queue,
- but they cannot bypass that queue into `beliefs/core.jsonl` during extraction.

### 3. Review queue

Primary artifact:
- `review/pending-beliefs.md`

This queue exists so the system can defer uncertain abstractions instead of polluting `beliefs/core.jsonl`.

Important current-runtime fields include:
- `promotion_decision`
- `human_review_needed`
- `provenance`

`provenance` is used to distinguish ordinary memory-pattern candidates from interaction, idle-background, and sleep-reflection candidates.

### 4. Contradiction scan

Primary entry surface:
- `npm run deus:beliefs:contradictions`

Purpose:
- detect collisions between durable beliefs and newer evidence,
- surface review pressure before contradiction silently accumulates.

### 5. Decay

Primary entry surface:
- `npm run deus:beliefs:decay`

Current runtime shape:
- `scripts/belief-decay.js` resolves an effective per-belief decay profile,
- the effective profile is built from explicit belief fields, class defaults, and optional runtime overrides,
- runtime overrides live in `beliefs/decay-policy.overrides.json`,
- bounded post-introspection retuning may update that override artifact through `npm run deus:decay:tune`.

Current decay modes from `src/beliefs/belief-policy.js`:

| Decay mode | Rate |
| --- | --- |
| `no_decay` | `0.0` |
| `slow` | `0.01` |
| `normal` | `0.03` |
| `fast` | `0.05` |

Additional current-runtime rules:
- review and archive behavior are separate from raw confidence drift,
- `review_needed`, `deprecated`, and `archived` are explicit lifecycle states,
- non-archivable beliefs must not be auto-archived,
- axioms and invariant-style belief IDs still receive explicit decay-exempt restoration,
- bounded tuning may adjust one class-level setting at a time and must stay within strict deltas.

### 6. Promotion review

Primary entry surface:
- `npm run deus:beliefs:review`

Current promotion policy:
- promote when recurrence `>= 3` and confidence proposal `>= 0.6`
- defer when recurrence `== 2` and confidence proposal `>= 0.65`
- defer when explicit human review is required
- otherwise reject

### 7. Durable mutation

Primary durable target:
- `beliefs/core.jsonl`

Current rule:
- direct durable mutation should be conservative,
- under-promotion is safer than over-promotion,
- identity-critical claims should not slip into durable state through weak extraction,
- sleep-reflection and idle-background signals must pass through review-first provenance before any durable promotion is possible.

---

## Fields And Semantics

Durable beliefs in `beliefs/core.jsonl` are JSONL entries.
Common fields include:
- `belief_id`
- `content`
- `confidence`
- `evidence_set`
- `source_type`
- `timestamp_created`
- `timestamp_updated`
- `drift_history`

Some entries may also include richer semantic fields such as:
- `context_scope`
- `ontological_anchor`
- `inference_trace`

The runtime should tolerate this richer structure without requiring every field on every belief.

---

## Guarantees And Non-Guarantees

### What the current mechanism guarantees

- durable beliefs have a review-first path available,
- decay policy is explicit at the belief/class level,
- promotion thresholds are centralized in code,
- axioms and invariants are protected from normal decay,
- bounded decay retuning uses an explicit override artifact instead of silently rewriting base policy code.

### What it does not guarantee

- that every belief is semantically correct,
- that every candidate enters durable state automatically,
- that the broader archive ontology is fully represented as beliefs,
- that static counts in documentation remain fresh without command-based verification.

Use command output and the actual files as the source of truth for current belief inventory.
