# DEUS Conceptual Architecture

## Purpose

This document restores the conceptual layer that existed in the original DEUS archive and maps it onto the current OpenClaw-based repository without pretending that the old graph-native design already ships unchanged.

Use this file to answer:
- what DEUS is as a system,
- which conceptual layers still matter,
- which parts are implemented now,
- which parts remain design intent or historical provenance.

---

## Current Definition

In this repository, DEUS is a cognitive system composed of:
- a self-model and invariant set,
- durable beliefs,
- episodic memory,
- a review-first reflexive runtime,
- an OpenClaw adapter layer,
- operational scripts and reports,
- application projects that live around, but not inside, DEUS core identity.

DEUS is not the same thing as:
- OpenClaw itself,
- the workspace projects under `projects/`,
- infrastructure/deployment tooling,
- every historical concept from the original archive.

---

## Conceptual Layers

### 1. Identity Layer

Canonical artifacts:
- `DEUS.md`
- `docs/AXIOMS_AND_AGENCY.md`
- `AGENTS.md`

Responsibilities:
- define self-model,
- define invariants,
- define the authority boundary,
- define what counts as identity-critical change.

### 2. Belief Layer

Canonical artifacts:
- `beliefs/core.jsonl`
- `docs/BELIEFS_MECHANISM.md`
- `docs/PROCESS_BELIEF_PROMOTION.md`

Responsibilities:
- hold durable abstractions,
- distinguish axioms, self-beliefs, external observations, and inferences,
- prefer review-first promotion over direct mutation of the durable self-model.

### 3. Memory Layer

Canonical artifacts:
- `memory/YYYY-MM-DD.md`
- `logs/YYYY-MM-DD.jsonl`
- `docs/PROCESS_MEMORY_AND_LOGS.md`

Responsibilities:
- maintain day-level continuity,
- separate episodic memory from operational logs,
- preserve the raw material from which beliefs may later be proposed.

### 4. Reflexive Runtime Layer

Canonical artifacts:
- `scripts/deus-scenarios.js`
- `src/introspection/introspection-pipeline.js`
- `docs/REFLEXIVE_RUNTIME.md`

Responsibilities:
- bootstrap validation,
- activity aggregation,
- candidate belief extraction,
- contradiction scan,
- decay,
- promotion review,
- introspection reporting.

### 5. Runtime Adapter Layer

Canonical artifacts:
- `src/memory/deus-memory.js`
- `src/openclaw/openclaw-memory-client.js`
- `scripts/openclaw-integration.js`
- `docs/ARCHITECTURAL_BOUNDARY.md`

Responsibilities:
- connect DEUS to OpenClaw-native memory and runtime surfaces,
- preserve portability of DEUS semantics across runtimes,
- keep adapter behavior subordinate to DEUS rather than redefining it.

### 6. External Products Layer

Canonical artifacts:
- `PROJECTS.md`
- `projects/*`

Responsibilities:
- host application and service projects adjacent to DEUS,
- keep product runtimes separate from DEUS core identity,
- reuse shared workspace contracts where appropriate.

---

## What Changed During OpenClaw Adaptation

The original DEUS archive described a broader graph-native architecture with:
- DAG-oriented memory semantics,
- a dedicated DSL,
- explicit `sleep_mode` / `self_patch` / `semantic_diff` constructs,
- prompt governance as a first-class semantic layer,
- product/research/whitepaper material living near the core concept.

The current repository intentionally shifted toward:
- file-backed memory and belief artifacts,
- script-driven maintenance flows,
- JSONL and Markdown as canonical operational formats,
- explicit workspace verification,
- practical runtime boundaries around OpenClaw.

This means the adaptation was not a pure port.
It was a transformation from a broader conceptual corpus into an operational monorepo.

---

## Implemented, Transformed, Deferred

| Conceptual area | Current status | Notes |
| --- | --- | --- |
| Self-model and invariants | Implemented | `DEUS.md` and the current axiom/invariant docs are canonical. |
| Durable beliefs | Implemented | Stored in `beliefs/core.jsonl` with review-first promotion. |
| Episodic memory | Implemented | File-backed daily memory plus daily activity logs. |
| Reflexive cycle | Implemented in transformed form | Realized as scenario/script pipelines rather than a graph-native state machine. |
| Semantic drift management | Implemented in transformed form | Exists through policy, review queues, contradiction scans, and docs rather than a DSL runtime. |
| Prompt governance | Partially documented | No graph-native prompt layer ships; current contract is operational and policy-based. |
| DSL as canonical runtime language | Deferred / historical | The archive remains provenance, not the current runtime substrate. |
| DAG-native cognitive graph | Deferred / historical | Current runtime uses Markdown, JSONL, and scripts instead. |
| TEE / blockchain / distributed immortality claims | Historical design intent | Not part of the current repository's shipped runtime contract. |

---

## Design Rule

When a document describes DEUS:
- it must clearly state whether it is conceptual, implemented, transformed, deferred, or historical;
- it must not describe historical archive concepts as current runtime truth unless the repository actually implements them;
- it should prefer explicit lineage over silent compression.

For the detailed archive-to-runtime lineage, see `docs/DEUS_ARCHIVE_TO_RUNTIME_MAPPING.md`.
