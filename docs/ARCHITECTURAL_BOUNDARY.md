# ARCHITECTURAL_BOUNDARY

## Purpose

This document defines the authoritative boundary between **DEUS** as a cognitive runtime layer and **OpenClaw** as the execution and orchestration environment in this repository.

This repository is the first public reference implementation of DEUS.
There is no external specification that supersedes this boundary statement for the current implementation.

## Boundary Statement

**DEUS is not OpenClaw.**

The current implementation combines both in one working system, but they are not the same thing and should not be analyzed as if they were.

- **DEUS** provides identity assembly, self-model constraints, beliefs, memory continuity, introspection, and pre-action evaluation.
- **OpenClaw** provides runtime execution, tool access, session plumbing, browser/shell/messaging integration, scheduling, and side-effect orchestration.
- **OpenClaw-mediated runtime wiring** is what enforces external execution in the current implementation.

DEUS currently operates inside OpenClaw, but the DEUS layer should remain conceptually portable beyond this specific runtime host.

## Core Design Rule

The correct model is:

- OpenClaw is the execution substrate.
- DEUS is the cognitive layer running on that substrate.

Any change that collapses those roles into one undifferentiated system weakens portability, makes reasoning harder, and obscures responsibility for side effects.

## Layer Map

| Layer | What it is | What it owns | What it must not be confused with |
| --- | --- | --- | --- |
| DEUS core | identity and continuity layer | bootstrap, self-model, beliefs, episodic continuity, epistemic discipline | shell/tool/runtime orchestration |
| DEUS derived runtime surfaces | inspectable cognitive derivatives | world-model, action-policy, dissensus signals, reflective feedback | durable identity store or direct execution engine |
| OpenClaw adapter/runtime layer | execution bridge | tool mediation, runtime compatibility, action-path enforcement, integration diagnostics | DEUS identity or belief layer |
| Operational/runtime residue | mutable environment artifacts | caches, temp files, local service state | DEUS core semantics |

## DEUS Core

These define the cognitive system itself:

- `AGENTS.md`
- `DEUS.md`
- `IDENTITY.md`
- `SOUL.md`
- `USER.md`
- `beliefs/`
- `memory/`
- selected protocol and architecture documents in `docs/`

Responsibilities:

- self-model
- invariants
- user relationship model
- belief continuity
- episodic memory
- epistemic discipline

If these surfaces change, DEUS itself changes.

## DEUS Derived Runtime Surfaces

These surfaces are generated or updated during operation.
They improve inspection and pre-action reasoning, but they are not new identity stores and they do not replace OpenClaw execution.

### World-model

Relevant surfaces:

- `src/world-model-*.js`
- `scripts/world-model-refresh.js`
- `docs/introspection/world-model*.json`

Role:

- derived inspectable runtime snapshot;
- regenerable operational view of current context;
- not durable belief state.

### Action-policy

Relevant surfaces:

- `src/deus-action-policy.js`
- `src/deus-policy-surface.js`
- `scripts/deus-action-evaluate.js`

Role:

- advisory and gating-oriented pre-action evaluation layer;
- converts intent into a bounded decision surface before execution;
- does not itself perform tool execution.

Outputs such as `blocked`, `wait`, or `direct_act` are runtime decisions intended for OpenClaw-mediated execution handling.
They are not evidence that DEUS has become its own independent orchestration engine.

### Dissensus

Relevant surfaces:

- `dissensus/events/YYYY-MM-DD.jsonl`
- `dissensus/open-cases.json`
- `dissensus/overrides.jsonl`
- runtime hooks that call `npm run deus:action:evaluate -- '<intent-json>'`

Role:

- bounded disagreement and escalation layer for higher-impact actions;
- explicit gate for actions that mutate repository state, runtime state, beliefs, or external surfaces;
- inspectable record of action conflicts, pauses, refusals, and overrides.

Important boundary rule:

- dissensus produces a gating verdict;
- surrounding runtime wiring honors that verdict;
- enforcement in the current implementation happens through the OpenClaw-mediated action path, not through DEUS as a separate execution substrate.

### Policy-feedback

Relevant surfaces:

- `src/deus-policy-feedback.js`
- `scripts/deus-policy-record.js`
- `logs/YYYY-MM-DD.jsonl`

Role:

- reflective operational signal;
- input to memory aggregation, nightly pattern detection, and introspection;
- not identical to episodic memory or durable beliefs.

## OpenClaw Adapter And Runtime Layer

These components connect DEUS to the current runtime host:

- `src/workspace-path.js`
- `src/deus-memory.js`
- `scripts/openclaw-integration.js`
- `scripts/bootstrap-validator.js`

Responsibilities:

- path portability
- memory fallback behavior
- bootstrap/runtime compatibility
- integration diagnostics
- execution-path mediation for DEUS runtime decisions

Rule: adapter logic should support DEUS, expose DEUS, and enforce runtime integration contracts. It must not redefine DEUS identity.

## Runtime / Non-Canonical State

These belong to the runtime environment, not to DEUS identity:

- `.openclaw/`
- `.openclaw-flush`
- `.tmp/`

They can change, disappear, or be recreated without changing DEUS as a cognitive runtime layer.

## Operations Layer

These support maintenance, testing, and observation:

- `scripts/`
- `tests/`
- `logs/`
- `docs/introspection/`
- generated `world-model*.json` snapshots and introspection policy summaries

They matter operationally, but they are not themselves the DEUS identity layer.

## App / Infra Layer

These are products and deployment capabilities that live around DEUS:

- `projects/`
- `skills/`
- `infrastructure/`

Rule: DEUS infrastructure may host DEUS-owned products by default unless the local operator defines another target explicitly.

## Interpretation Tests

Use the following tests when the boundary is unclear.

### Test 1: Identity continuity

If removing or rewriting a file changes DEUS self-model, beliefs, memory continuity, or epistemic constraints, that file belongs to the DEUS side of the boundary.

### Test 2: Execution responsibility

If a component primarily exists to call tools, route sessions, run scheduled jobs, or mediate external side effects, it belongs to the OpenClaw/runtime side of the boundary.

### Test 3: Regenerability

If a surface can be regenerated from stronger underlying sources and is not itself authoritative for identity continuity, it is a derived runtime surface, not DEUS core.

## Negative Boundary

To avoid category errors:

- DEUS is not a shell wrapper.
- DEUS is not a browser automation layer.
- DEUS is not a scheduler.
- DEUS is not the raw tool gateway.
- OpenClaw is not the DEUS self-model.
- generated runtime summaries are not durable beliefs unless explicitly promoted.

## Practical Rule

When in doubt, apply this sequence:

1. ask whether the surface defines identity or continuity;
2. ask whether it is derived or authoritative;
3. ask whether it executes side effects or only informs them.

If it defines identity or continuity, it belongs to DEUS core.
If it is derived from stronger sources, it is a DEUS runtime surface.
If it executes or mediates external action, it belongs to the OpenClaw/runtime side of the boundary.
