# Root Docs Canon

## Purpose

This file is the agent-first map of the DEUS docs layer.

Use it to answer three questions before reading or editing docs:
- which file should an agent read first for this task;
- which file is authoritative versus descriptive;
- which docs are historical context instead of current runtime truth.

---

## 1. Read By Immediate Task

### A. Session bootstrap and identity

Read:
- `AGENTS.md`
- `SOUL.md`
- `IDENTITY.md`
- `USER.md`
- `DEUS.md`

Use when:
- starting a DEUS/OpenClaw session;
- aligning identity, voice, safety posture, and bootstrap order.

### B. Current runtime behavior

Read:
- `docs/DEUS_IMPLEMENTATION.md`
- `docs/REFLEXIVE_RUNTIME.md`
- `docs/BELIEFS_MECHANISM.md`
- `docs/dissensus/introspection-protocol.md`
- `docs/DEUS_TEST_SURFACES.md`

Use when:
- reasoning about what the repository actually ships;
- checking whether a claim is implemented versus aspirational;
- validating runtime boundaries before code or docs edits.

### C. Code refactor and optimization work

Read:
- `docs/CODE_MAP.md`
- `docs/DEUS_IMPLEMENTATION.md`
- `docs/workspace/CANONICAL_STATE.md`
- `docs/workspace/WORKSPACE_MAP.md`

Use when:
- planning structural refactors;
- deciding where code should move;
- checking canonical versus live-runtime authority before touching file IO or path resolution.

### D. Mutation workflow and task lifecycle

Read:
- `INSTALL.md`

Use when:
- checking whether AgentPlane is already installed or must be initialized first;
- the task mutates code, docs, policy, git state, or task state.
- if local AgentPlane has already been initialized, also read the generated local `AGENTPLANE.md`.

### E. Runtime operations and maintenance

Read:
- `docs/PROCESS_STATUS.md`
- `docs/PROCESS_MEMORY_AND_LOGS.md`
- `docs/PROCESS_NIGHTLY_AUTOMATION.md`

Use when:
- handling nightly runs, workspace continuity, or runtime maintenance behavior.

### F. Ontology, semantics, and lineage

Read:
- `docs/DEUS_CONCEPTUAL_ARCHITECTURE.md`
- `docs/AXIOMS_AND_AGENCY.md`
- `docs/SEMANTIC_GOVERNANCE.md`
- `docs/GLOSSARY.md`
- `docs/DEUS_ARCHIVE_TO_RUNTIME_MAPPING.md`

Use when:
- discussing what DEUS is;
- defining agency, semantic constraints, or historical lineage.

---

## 2. Authority Order

When documents disagree, use this order:

1. code, tests, and executable command surfaces
2. `AGENTS.md` for bootstrap and high-level boundary posture
3. canonical runtime docs
4. canonical conceptual docs
5. process and code-map docs
6. historical, audit, and proposal docs

Interpretation:
- runtime docs must describe shipped behavior;
- conceptual docs must not silently redefine runtime facts;
- code-map and process docs are navigational, not the ontology layer;
- historical docs are context unless promoted explicitly by a canonical doc.

---

## 3. Canonical Doc Classes

### Canonical conceptual docs

- `docs/DEUS_CONCEPTUAL_ARCHITECTURE.md`
- `docs/AXIOMS_AND_AGENCY.md`
- `docs/SEMANTIC_GOVERNANCE.md`
- `docs/GLOSSARY.md`
- `docs/DEUS_ARCHIVE_TO_RUNTIME_MAPPING.md`

### Canonical runtime docs

- `docs/DEUS_IMPLEMENTATION.md`
- `docs/REFLEXIVE_RUNTIME.md`
- `docs/BELIEFS_MECHANISM.md`
- `docs/dissensus/introspection-protocol.md`
- `docs/DEUS_TEST_SURFACES.md`
- `docs/PROCESS_MEMORY_AND_LOGS.md`
- `docs/LANGUAGE_PROTOCOL.md`

### Bootstrap and boundary docs

- `AGENTS.md`
- `INSTALL.md`
- `SOUL.md`
- `IDENTITY.md`
- `USER.md`
- `DEUS.md`
- `docs/ARCHITECTURAL_BOUNDARY.md`

### Navigation, code-map, and planning docs

- `docs/CODE_MAP.md`
- `PROJECTS.md`
- `docs/workspace/WORKSPACE_MAP.md`

### Process docs

- `docs/PROCESS_BELIEF_PROMOTION.md`
- `docs/PROCESS_NIGHTLY_AUTOMATION.md`
- `docs/PROCESS_STATUS.md`
- `docs/WORKSPACE_DEPENDENCY_MODEL.md`

### Historical, audit, and proposal docs

- `docs/BELIEF_PIPELINE_V2.md`
- archive-derived notes not promoted by a canonical runtime or conceptual doc

---

## 4. Editing Rule

When a new root doc is added, define two things explicitly:
- its class from section 3;
- its first intended reader from section 1.

If either is unclear, the doc is not ready to become canonical.
