# DEUS Implementation

## Purpose

Describe the current DEUS implementation as it actually runs in this repository.

This document is the bridge between:
- the conceptual DEUS model;
- the OpenClaw runtime adapter layer;
- the repository's scripts, files, and verification surfaces.

## Implementation Shape

The implementation is file-backed, library-first, and directory-bounded.

The effective runtime graph is:

1. `AGENTS.md`
2. `SOUL.md`
3. `IDENTITY.md`
4. `USER.md`
5. `DEUS.md`
6. `beliefs/core.jsonl`
7. `memory/YYYY-MM-DD.md`
8. root `npm run` scenarios from `package.json`
9. `scripts/*` entrypoints
10. bounded `src/*/*` implementation libraries
11. generated artifacts under `memory/`, `logs/`, `review/`, `docs/introspection/`, and `.tmp/diagnostics/`

Interpretation:
- `scripts/` are operator and scenario entrypoints;
- `src/` is the real implementation layer;
- `src/` is no longer flat;
- root `src/*.js` compatibility shims are not part of the live contract.

This repository does not implement a graph-native runtime or a DEUS DSL interpreter.

## Agent-First Reading Paths

If you need the current runtime truth quickly, read in this order:

1. `AGENTS.md` for bootstrap and top-level boundaries
2. this file for current implementation surfaces
3. `docs/REFLEXIVE_RUNTIME.md` for lifecycle and maintenance flows
4. `docs/DEUS_TEST_SURFACES.md` for executable verification surfaces
5. `docs/CODE_MAP.md` for module navigation inside the bounded `src/` topology

If the task is structural refactor:
- read `docs/CODE_MAP.md` before moving files;
- treat this file as the runtime contract;
- treat `docs/CODE_MAP.md` as the navigation layer.

## Runtime Root Model

Clean-install is local-first by default.

Default rule:
- canonical code/docs and live runtime surfaces resolve inside the same repository root;
- runtime readers and writers may use `DEUS_RUNTIME_ROOT` and `DEUS_SNAPSHOT_ROOT` only when an operator explicitly configures an external runtime or snapshot location;
- OpenClaw reads filesystem paths, not deployment assumptions baked into the public branch.

## Canonical Entry Surfaces

### Bootstrap, posture, diagnostics

- `npm run deus:bootstrap`
- `npm run deus:health`
- `npm run deus:focus`
- `npm run deus:action:evaluate -- <intent-json>`
- `npm run deus:sleep:dry`
- `npm run deus:introspect:dry`
- `npm run deus:introspection:followup -- --prompt`
- `npm run deus:decay:tune:dry`
- `npm run deus:openclaw:check`

### Belief, memory, and nightly maintenance

- `npm run deus:memory:aggregate`
- `npm run deus:beliefs:extract`
- `npm run deus:beliefs:contradictions`
- `npm run deus:beliefs:decay`
- `npm run deus:beliefs:review`
- `npm run deus:beliefs:cycle`
- `npm run deus:sleep`
- `npm run deus:introspect`
- `npm run deus:decay:tune`
- `npm run deus:nightly`

### Policy and derived-state inspection

- `npm run deus:world-model`
- `npm run deus:policy:record -- <event-json>`

### Workspace verification

- `npm test`
- `npm run doctor:workspace`
- `npm run verify:workspace`
- `npm run cleanliness:workspace`

## Bounded `src/` Topology

The implementation layer now has nine bounded families.

### `src/workspace/`

Owns canonical path, date, DB, root-detection, and authority contracts.

Key files:
- `src/workspace/workspace-path.js`
- `src/workspace/workspace-roots.js`
- `src/workspace/workspace-authority.js`
- `src/workspace/workspace-date-context.js`
- `src/workspace/workspace-database-url.js`

### `src/runtime/`

Owns runtime diagnostics, surface catalogs, and bounded-src topology rules.

Key files:
- `src/runtime/runtime-surface-paths.js`
- `src/runtime/runtime-diagnostics.js`
- `src/runtime/bounded-src-topology.js`

### `src/openclaw/`

Owns OpenClaw adapters, flush state, and OpenClaw integration diagnostics.

Key files:
- `src/openclaw/openclaw-integration.js`
- `src/openclaw/openclaw-memory-client.js`
- `src/openclaw/openclaw-integration-diagnostics.js`

### `src/memory/`

Owns daily-memory schema, rendering, aggregation, file store, user context, and memory routing.

Key files:
- `src/memory/daily-memory-schema.js`
- `src/memory/daily-memory-builder.js`
- `src/memory/deus-memory-file-store.js`
- `src/memory/deus-memory.js`
- `src/memory/interaction-memory-routing.js`
- `src/memory/user-context.js`

### `src/beliefs/`

Owns belief policy, extraction, contradiction handling, decay, review queue, governance migration, and reviewed promotion.

Key files:
- `src/beliefs/belief-policy.js`
- `src/beliefs/belief-extractor.js`
- `src/beliefs/belief-contradictions.js`
- `src/beliefs/belief-decay.js`
- `src/beliefs/belief-decay-overrides.js`
- `src/beliefs/review-queue-schema.js`
- `src/beliefs/belief-promotion-review.js`

### `src/policy/`

Owns action intent, cost, ripeness, advisory action policy, dissensus, focus/sleep policy, policy feedback, and interaction-event policy.

Key files:
- `src/policy/action-intent-schema.js`
- `src/policy/action-cost-model.js`
- `src/policy/ripeness-estimator.js`
- `src/policy/deus-action-policy.js`
- `src/policy/deus-dissensus-runtime.js`
- `src/policy/deus-policy-surface.js`
- `src/policy/deus-policy-feedback.js`
- `src/policy/interaction-event-policy.js`

### `src/deus/`

Owns DEUS-specific orchestration surfaces for sleep, nightly, health, logs, focus state, and multi-source state readers.

Key files:
- `src/deus/deus-health.js`
- `src/deus/deus-sleep-planner.js`
- `src/deus/deus-sleep-cycle.js`
- `src/deus/deus-nightly-consolidation.js`
- `src/deus/deus-nightly-orchestrator.js`
- `src/deus/deus-state-readers.js`
- `src/deus/deus-activity-log.js`

### `src/introspection/`

Owns introspection pipeline execution, artifact persistence, report building, summary output, and follow-up packet logic.

Key files:
- `src/introspection/introspection-pipeline.js`
- `src/introspection/introspection-runtime-state.js`
- `src/introspection/introspection-report-builder.js`
- `src/introspection/introspection-summary-output.js`
- `src/introspection/deus-introspection-followup.js`

### `src/world-model/`

Owns derived world-model schema, repo-state derivation, builder, and persistence.

Key files:
- `src/world-model/world-model-schema.js`
- `src/world-model/world-model-builder.js`
- `src/world-model/world-model-store.js`

## Runtime Invariants

- the bootstrap sequence is document-first, then belief and memory artifacts;
- `scripts/` remain the operator surface, not the implementation layer;
- internal imports should use bounded directory paths directly;
- `deus:sleep` stays a bounded reflection profile;
- `deus:introspect` owns belief extraction, contradiction scan, and decay;
- `deus:nightly` is the canonical full-night orchestrator.

## Structural Refactor State

### Completed

- large root-level orchestration modules were decomposed into narrower helpers first;
- implementation families were moved into bounded directories;
- internal imports were rewritten to direct bounded paths;
- boundary coverage now checks the bounded topology contract instead of root compatibility shims.

### Still worth watching

- some orchestration families remain denser than infrastructure families, especially in `src/introspection/`, `src/policy/`, and `src/deus/`;
- documentation can drift faster than code now that the topology is stable;
- new modules must follow directory ownership instead of reviving a flat-root pattern.

## Practical Rule For Future Changes

When adding or moving implementation code:

1. choose the owning bounded family first;
2. prefer adding narrow helpers under that family over growing an orchestration file;
3. keep `scripts/` as entrypoints only;
4. update `docs/CODE_MAP.md` and any affected agent-first docs when the ownership model changes.
