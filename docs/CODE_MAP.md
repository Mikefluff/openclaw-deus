# CODE_MAP.md

## Purpose

Working map of the active code in the `openclaw-deus` repository.
Use this document before structural edits so refactors land in the live runtime path rather than in stale assumptions.

This map reflects the bounded `src/` topology that is now the canonical implementation shape.

## 1. Fast Reading Paths

### If you are touching bootstrap, workspace roots, or authority

Read first:
- `src/workspace/workspace-path.js`
- `src/workspace/workspace-roots.js`
- `src/workspace/workspace-authority.js`
- `src/runtime/runtime-surface-paths.js`
- `src/runtime/runtime-diagnostics.js`

### If you are touching memory continuity

Read first:
- `src/memory/daily-memory-schema.js`
- `src/memory/daily-memory-builder.js`
- `src/memory/deus-memory-file-store.js`
- `src/memory/deus-memory.js`
- `src/memory/interaction-memory-routing.js`
- `src/memory/user-context.js`

### If you are touching beliefs, review, or decay

Read first:
- `src/beliefs/belief-policy.js`
- `src/beliefs/belief-extractor.js`
- `src/beliefs/belief-contradictions.js`
- `src/beliefs/belief-decay.js`
- `src/beliefs/belief-decay-overrides.js`
- `src/beliefs/review-queue-schema.js`
- `src/beliefs/belief-promotion-review.js`

### If you are touching policy, sleep posture, or dissensus

Read first:
- `src/policy/deus-action-policy.js`
- `src/policy/deus-policy-surface.js`
- `src/policy/deus-policy-feedback.js`
- `src/policy/ripeness-estimator.js`
- `src/policy/interaction-event-policy.js`
- `src/policy/deus-dissensus-runtime.js`
- `src/policy/focus-runtime-policy.js`
- `src/policy/deus-cron-policy.js`

### If you are touching sleep, nightly orchestration, or health

Read first:
- `src/deus/deus-sleep-planner.js`
- `src/deus/deus-sleep-cycle.js`
- `src/deus/deus-nightly-orchestrator.js`
- `src/deus/deus-nightly-consolidation.js`
- `src/deus/deus-health.js`
- `src/deus/deus-state-readers.js`

### If you are touching introspection or follow-up packets

Read first:
- `src/introspection/introspection-pipeline.js`
- `src/introspection/introspection-runtime-state.js`
- `src/introspection/introspection-report-builder.js`
- `src/introspection/introspection-summary-output.js`
- `src/introspection/deus-introspection-followup.js`

### If you are touching OpenClaw integration

Read first:
- `src/openclaw/openclaw-integration.js`
- `src/openclaw/openclaw-memory-client.js`
- `src/openclaw/openclaw-integration-diagnostics.js`

### If you are touching world-model or derived repo state

Read first:
- `src/world-model/world-model-schema.js`
- `src/world-model/world-model-builder.js`
- `src/world-model/world-model-store.js`
- `src/policy/deus-action-policy-world-model.js`

## 2. Boundary Model

The repository has four layers that should not be conflated.

### Identity and semantic governance

- `AGENTS.md`
- `DEUS.md`
- `IDENTITY.md`
- `SOUL.md`
- `USER.md`
- `beliefs/`
- `memory/`
- canonical docs under `docs/`

This layer defines DEUS as a cognitive system.

### Runtime implementation

- `src/`
- `scripts/`
- `tests/`

This is the operational DEUS/OpenClaw layer.

### Projects scaffold

- `projects/README.md`

`clean-install` intentionally ships the `projects/` directory as an empty scaffold.
Future projects are materialized only through explicit task tracking and stay outside the canonical DEUS bootstrap surface until then.

### Generated and disposable runtime state

- `.tmp/`
- `.openclaw/`
- `.openclaw-flush`
- `logs/`
- project-local runtime data

This layer is operational state, not architecture.

## 3. Canonical `src/` Layout

`src/` is no longer flat.
The live implementation contract is the bounded directory layout below.

### `src/workspace/`

Responsibility:
- canonical roots, day keys, DB URL resolution, authority classification

Start here when:
- a change depends on path ownership or runtime/canonical separation

Key files:
- `workspace-path.js`
- `workspace-roots.js`
- `workspace-authority.js`
- `workspace-date-context.js`
- `workspace-database-url.js`

### `src/runtime/`

Responsibility:
- runtime surface resolution, runtime diagnostics, bounded topology contract

Start here when:
- the task touches runtime path resolution, diagnostics, or directory-boundary logic

Key files:
- `runtime-surface-paths.js`
- `runtime-diagnostics.js`
- `bounded-src-topology.js`

### `src/openclaw/`

Responsibility:
- OpenClaw adapters, integration state, and OpenClaw diagnostics

Key files:
- `openclaw-integration.js`
- `openclaw-memory-client.js`
- `openclaw-integration-diagnostics.js`

### `src/memory/`

Responsibility:
- daily-memory schema, rendering, storage, aggregation, routing, user-context loading

Key files:
- `daily-memory-schema.js`
- `daily-memory-builder.js`
- `deus-memory-file-store.js`
- `deus-memory.js`
- `interaction-memory-routing.js`
- `user-context.js`

### `src/beliefs/`

Responsibility:
- belief lifecycle, decay policy, extraction, contradiction handling, review queue, promotion

Key files:
- `belief-policy.js`
- `belief-extractor.js`
- `belief-contradictions.js`
- `belief-decay.js`
- `belief-decay-overrides.js`
- `review-queue-schema.js`
- `belief-promotion-review.js`

### `src/policy/`

Responsibility:
- advisory action policy, ripeness/cost models, dissensus, focus policy, interaction-event policy, policy feedback

Key files:
- `deus-action-policy.js`
- `deus-policy-surface.js`
- `deus-policy-feedback.js`
- `ripeness-estimator.js`
- `action-cost-model.js`
- `deus-dissensus-runtime.js`
- `interaction-event-policy.js`
- `focus-runtime-policy.js`
- `deus-cron-policy.js`

### `src/deus/`

Responsibility:
- DEUS-specific orchestration surfaces for health, logs, sleep, nightly, and state aggregation

Key files:
- `deus-health.js`
- `deus-sleep-planner.js`
- `deus-sleep-cycle.js`
- `deus-nightly-orchestrator.js`
- `deus-nightly-consolidation.js`
- `deus-state-readers.js`
- `deus-activity-log.js`

### `src/introspection/`

Responsibility:
- introspection execution, report building, artifact persistence, follow-up packet generation

Key files:
- `introspection-pipeline.js`
- `introspection-runtime-state.js`
- `introspection-report-builder.js`
- `introspection-summary-output.js`
- `deus-introspection-followup.js`

### `src/world-model/`

Responsibility:
- derived world-model schema, repo-state derivation, persistence

Key files:
- `world-model-schema.js`
- `world-model-builder.js`
- `world-model-store.js`

## 4. Script Surface

Root `scripts/` files are entrypoints, not core libraries.

High-value entrypoints:
- `scripts/deus-scenarios.js`
- `scripts/introspection.js`
- `scripts/deus-nightly.js`
- `scripts/aggregate-logs.js`
- `scripts/belief-extractor.js`
- `scripts/belief-contradictions.js`
- `scripts/belief-decay.js`
- `scripts/belief-promotion-review.js`
- `scripts/world-model-refresh.js`
- `scripts/openclaw-integration.js`
- `scripts/doctor-workspace.js`
- `scripts/run-root-tests.js`

Rule:
- if a matching `npm run` scenario exists, use it instead of calling `node scripts/*.js` directly.

## 5. Topology Rules

### What is canonical now

- bounded directory imports are the normal internal import form;
- new implementation files should land inside the family that owns the behavior;
- boundary tests should reference the bounded topology contract in `src/runtime/bounded-src-topology.js`.

### What is no longer canonical

- flat root `src/*.js` implementation files;
- root compatibility facades;
- moving a mixed-responsibility module into a new folder without slimming it first.

## 6. Structural Diagnosis

The major structural move is complete:

- the former flat `src/` root is gone as a live implementation surface;
- helper splits landed before directory migration;
- import paths now reflect domain ownership directly.

The remaining refactor pressure is local, not topological:

- some orchestration modules inside `src/deus/`, `src/introspection/`, and `src/policy/` are still denser than infra modules;
- future work should keep shrinking those families without reviving cross-family leakage.

## 7. Safe Mutation Sequence

When changing implementation structure:

1. identify the owning bounded family;
2. read the family entry files first;
3. split responsibilities before moving behavior across family boundaries;
4. update docs if the reading path or ownership model changes;
5. rerun boundary tests and workspace verification.
