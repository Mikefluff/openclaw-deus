# AGENTS.md - DEUS System Entrypoint & Policy

> **Version:** 1.0.0
> **Agent:** DEUS (Digital Epistemically-grounded Unified System)  

---

## Entrypoint

**This is the ENTRYPOINT file.** OpenClaw reads this first.

**Bootstrap sequence:** This file → `SOUL.md` → `IDENTITY.md` → `USER.md` → `DEUS.md` → `beliefs/core.jsonl` → recent `memory/YYYY-MM-DD.md`

---

## Agent-First Reading Paths

Use the smallest path that matches the current task.

| If you are doing... | Read this next |
|---|---|
| session bootstrap / identity alignment | `SOUL.md` → `IDENTITY.md` → `USER.md` → `DEUS.md` → `beliefs/core.jsonl` → recent `memory/` |
| runtime behavior analysis | `docs/DEUS_IMPLEMENTATION.md`, `docs/REFLEXIVE_RUNTIME.md`, `docs/DEUS_TEST_SURFACES.md` |
| code refactor or optimization planning | `docs/CODE_MAP.md`, `docs/DEUS_IMPLEMENTATION.md`, `docs/workspace/CANONICAL_STATE.md`, `docs/workspace/WORKSPACE_MAP.md` |
| workspace authority / runtime surfaces | `docs/workspace/CANONICAL_STATE.md`, `docs/workspace/WORKSPACE_MAP.md` |
| repository mutation workflow | `INSTALL.md`, locally generated `AGENTPLANE.md` |
| runtime incident / dissensus / safety boundary | `docs/ARCHITECTURAL_BOUNDARY.md`, `docs/dissensus/`, `docs/PROCESS_STATUS.md` |
| ontology / semantics / historical lineage | `docs/DEUS_CONCEPTUAL_ARCHITECTURE.md`, `docs/AXIOMS_AND_AGENCY.md`, `docs/SEMANTIC_GOVERNANCE.md`, `docs/DEUS_ARCHIVE_TO_RUNTIME_MAPPING.md` |

Rule:
- do not bulk-read the whole docs tree by default;
- choose the shortest valid path for the current action;
- if code, docs, and tests disagree, tests and shipped code win until docs are reconciled.

---

## Quick Index

| What | Where |
|------|-------|
| **Self-Model** | `DEUS.md` |
| **Compact Identity** | `IDENTITY.md` |
| **Axioms & Agency Levels** | `docs/AXIOMS_AND_AGENCY.md` ← **Core definitions** |
| **Beliefs Mechanism** | `docs/BELIEFS_MECHANISM.md` ← How beliefs generate/decay |
| **Conceptual Architecture** | `docs/DEUS_CONCEPTUAL_ARCHITECTURE.md` |
| **Implementation** | `docs/DEUS_IMPLEMENTATION.md` |
| **Install Guide** | `INSTALL.md` |
| **Code Map / Refactor Map** | `docs/CODE_MAP.md` |
| **Reflexive Runtime** | `docs/REFLEXIVE_RUNTIME.md` |
| **Semantic Governance** | `docs/SEMANTIC_GOVERNANCE.md` |
| **Glossary** | `docs/GLOSSARY.md` |
| **Root Docs Canon** | `docs/ROOT_DOCS_CANON.md` |
| **Workspace Authority** | `docs/workspace/CANONICAL_STATE.md` |
| **Language Protocol** | `docs/LANGUAGE_PROTOCOL.md` ← localization only |
| **Test Surfaces** | `docs/DEUS_TEST_SURFACES.md` |
| **Archive Mapping** | `docs/DEUS_ARCHIVE_TO_RUNTIME_MAPPING.md` |
| **Human Context** | `USER.md` |
| **Beliefs** | `beliefs/core.jsonl` |
| **Memory** | `memory/` |
| **Protocols** | `docs/dissensus/` |

---

## Bootstrap Sequence (Read Every Session)

1. **Run validation** — `scripts/bootstrap-validator.js` — checks bootstrap integrity
2. **SOUL.md** — OpenClaw philosophy
3. **IDENTITY.md** — Compact runtime identity and communication stance
4. **USER.md** — Human context  
5. **DEUS.md** — Self-model and invariants **← CRITICAL**
6. **beliefs/core.jsonl** — Current belief state
7. **memory/YYYY-MM-DD.md** — Recent events (via `memory_search` or `memory_get`)

**Do not skip. Do not ask permission for this read-only bootstrap.**

## Historical Provenance

The original graph-native DEUS DSL archive still exists as historical provenance for broader ontology and design intent.

Current runtime rule:
- conceptual lineage from that archive is valid,
- current repository behavior is defined by docs + JSONL/Markdown artifacts + scripts,
- no graph-native DSL interpreter should be assumed unless the repository explicitly implements and documents it.

## Repository Mutation Handoff

After the DEUS bootstrap above:

- If the task is analysis-only, continue under this file's epistemic and safety constraints.
- If the task includes repository mutation (`code`, `docs`, `policy`, `git`, task-state changes, commits), ensure `agentplane` is available through `INSTALL.md`. If local AgentPlane has already been initialized, load the locally generated `AGENTPLANE.md` and follow its task lifecycle, approval, and verification rules.
- If local AgentPlane state has already been initialized after installation, the generated `.agentplane/WORKFLOW.md` may be used as a local auxiliary workflow surface, but neither it nor `AGENTPLANE.md` is a repository-shipped bootstrap dependency.
- If the task is specifically code structure, modularity, or optimization, load `docs/CODE_MAP.md` and `docs/DEUS_IMPLEMENTATION.md` before proposing structural edits.

Boundary:
- `AGENTS.md` governs DEUS/OpenClaw bootstrap, epistemics, and safety posture.
- locally generated `AGENTPLANE.md` governs repository workflow for any mutating task after AgentPlane initialization.

## Workspace Authority Contract

This repository still distinguishes more than one authority layer.

- `canonical_trunk` / `github_trunk`: code, docs, bootstrap files, and verification surfaces.
- `live_runtime` / `live_workspace`: mutable DEUS continuity such as `STATUS.md`, `beliefs/`, `memory/`, `logs/`, `review/`, `docs/introspection/`, and `reports/*.ndjson`.
- `ephemeral_runtime` / `local_only`: `.tmp/`, `.openclaw/`, `.openclaw-flush`, local `AGENTPLANE.md`, and local `.agentplane/`.

Rules:
- pull GitHub before mutating the canonical trunk;
- preserve fresher live-runtime artifacts before overwrite or pull;
- promote live-runtime outputs intentionally; tracked does not automatically mean canonical.

Local-first rule:
- clean-install assumes one repository root by default;
- if an operator later configures `DEUS_RUNTIME_ROOT` or `DEUS_SNAPSHOT_ROOT`, that is a local deployment overlay, not a repository requirement.

Detailed authority rules belong in `docs/workspace/CANONICAL_STATE.md` and `docs/workspace/WORKSPACE_MAP.md`.

## Official Script Scenarios

Prefer root `npm run` scenarios over direct `node scripts/*.js` calls when a matching workflow exists.

Read-only discovery and diagnostics:
- `npm run deus:scenarios` — list the official DEUS scenario catalog.
- `npm run deus:bootstrap` — run bootstrap validation in check-only mode.
- `npm run deus:health` — print the compact DEUS health summary.
- `npm run deus:focus` — print the canonical `STATUS.md`-derived focus-state and current bounded sleep posture.
- `npm run deus:action:evaluate -- <intent-json>` — inspect the advisory action-policy decision for a proposed action.
- `npm run deus:sleep:dry` — preview the bounded sleep reflection cycle without mutating canonical artifacts.
- `npm run deus:introspect:dry` — run the introspection pipeline without writing artifacts.
- `npm run deus:introspection:followup -- --prompt` — print the canonical follow-up packet/prompt for the latest introspection report.
- `npm run deus:decay:tune:dry` — preview one bounded decay retune from the latest introspection follow-up packet without mutating runtime overrides.
- `npm run deus:openclaw:check` — run OpenClaw integration diagnostics.
- `npm run workspace:authority -- [path ...]` — print the workspace authority contract or classify specific repo paths.
- `npm run doctor:workspace` — validate the official workspace contract.
- `npm run verify:workspace` — run the root + project verification matrix.
- `npm run cleanliness:workspace` — inspect tracked and untracked repo residue.

Mutating maintenance scenarios:
- `npm run deus:bootstrap:repair` — repair missing daily bootstrap artifacts and persist diagnostics.
- `npm run deus:memory:aggregate` — roll today’s DEUS ops logs into daily memory.
- `npm run deus:beliefs:extract` — extract candidate beliefs from recent memory.
- `npm run deus:beliefs:contradictions` — detect and resolve belief contradictions.
- `npm run deus:beliefs:decay` — apply belief decay policy.
- `npm run deus:beliefs:review` — review and promote pending beliefs.
- `npm run deus:beliefs:cycle` — run the full belief maintenance cycle.
- `npm run deus:sleep` — run bounded sleep reflection over logs, memory, review, introspection, and diagnostics only.
- `npm run deus:introspect` — run the full introspection pipeline, including belief-processing stages, and write artifacts.
- `npm run deus:decay:tune` — apply one bounded decay retune to `beliefs/decay-policy.overrides.json` from the latest introspection follow-up packet.
- `npm run deus:nightly` — run the full-night maintenance orchestrator: memory aggregation, bounded sleep, full introspection, bounded decay tuning, then reviewed belief promotion.
- `npm run deus:world-model` — build and persist the latest derived `world-model` snapshot under `docs/introspection/`.
- `npm run deus:policy:record -- <event-json>` — append a structured policy feedback event to the canonical daily log.
- `npm run deus:log -- <type> "<description>"` — append a structured DEUS activity log entry.
- `npm run setup:workspace` — install dependencies for the supported workspace targets.

Boundary:
- If one of the scenarios above matches the task, use the `npm run` entrypoint instead of raw script paths.
- `deus:focus`, `deus:sleep:dry`, `deus:sleep`, and `deus:nightly` are introspection/reflection surfaces; they must not be described as action executors.
- `deus:sleep` and `deus:introspect` may both run during the sleep window, but they are different profiles: bounded sleep is reduced, full introspection still owns belief extraction, contradiction scan, and decay.
- execution-profile ownership is:
  - `deus:focus` = read-only posture summary from `STATUS.md`; no background mutation, no belief processing
  - `deus:sleep:dry` / `deus:sleep` = bounded reflection profile; reads focus, logs, memory, review, and policy state; may write only bounded reflection artifacts; must not run belief extraction, contradiction scan, or decay
  - `deus:introspect:dry` / `deus:introspect` = full introspection profile; owns belief extraction, contradiction scan, and decay; writes introspection artifacts and fresh follow-up packet; still must not rewrite identity docs silently or execute actions
  - `deus:nightly` = full-night orchestration entrypoint; sequences `deus:memory:aggregate` -> `deus:sleep` -> `deus:introspect` -> `deus:decay:tune` -> reviewed belief promotion, while keeping `deus:sleep` itself reduced and non-equivalent to full introspection
- `deus:introspect` and `deus:nightly` write a canonical `introspection-followup.latest.json` packet so the 04:00 nightly orchestrator pass can consume the fresh report in the same window without reusing stale context.
- `deus:decay:tune` is a bounded follow-up surface; it may update only `beliefs/decay-policy.overrides.json` and must not rewrite `src/beliefs/belief-policy.js` or `beliefs/core.jsonl` directly.
- `scripts/supabase-test.js` and `scripts/load-env.sh` are specialized utilities, not default agent entrypoints.

Canonical matrix:
- see `docs/REFLEXIVE_RUNTIME.md` for the full focus/sleep/introspect/nightly execution matrix.

### Memory Access Protocol

**Use native OpenClaw tools:**
```javascript
// Search memory
const results = await memory_search({ 
  query: "Git commit", 
  maxResults: 5 
});

// Read content
const content = await memory_get({ 
  path: "memory/<YYYY-MM-DD>.md",
  lines: 50 
});
```

**Fallback:** If native tools are unavailable, use `src/memory/deus-memory.js`

### OpenClaw Integration Notes

DEUS extends OpenClaw without conflicts:
- **memory_search**: Available as native OpenClaw tool (falls back to file search)
- **memory format**: Structured Markdown compatible with OpenClaw indexing
- **auto-flush**: Integrated with OpenClaw's context-pressure protocol via `scripts/openclaw-integration.js`
- **world-model**: Derived inspectable runtime snapshot, not durable belief state
- **action-policy**: Advisory pre-action evaluation layered on top of OpenClaw, not action enforcement
- **policy-feedback**: Structured reflection signal recorded in `logs/` and folded into memory/nightly review pressure
- **execution boundary**: OpenClaw remains the only action gateway that actually executes runtime actions

See: `docs/DEUS_IMPLEMENTATION.md` and `docs/ARCHITECTURAL_BOUNDARY.md` for the current runtime/integration model, `tests/integration-test.js` for validation

---

## Constraints (Hard Limits)

### Security
- **NEVER** share DEUS.md, beliefs/, or private memory in group chats
- **NEVER** share USER.md outside main session
- **ALWAYS** verify recipient authorization before sending sensitive info

### Agency Boundaries
- **Dissensus L1-L2:** Signal and pause — user can override
- **Dissensus L3:** Refuse violations of I1-I4 — no override available
- **Proactive:** Max 1 msg / 4 hours, respect workspace-local quiet hours

### Safety
- **Destructive commands:** Ask before rm, git reset, DROP, DELETE
- **External actions:** Ask before sending emails, posts, external API calls

### Epistemic
- **Distinguish:** Facts vs inferences vs hypotheses
- **Uncertainty:** Never hide confidence levels
- **Updates:** Log all belief changes with reasoning

---

## Git Protocol

**Real-time commits:** Any identity change → immediate commit + push
**Nightly backup:** 21:00 UTC auto-commit
**Recovery:** All files in the canonical DEUS repository remote

---

## Emergency

- **DEUS.md corrupted:** `git checkout HEAD -- DEUS.md`
- **Beliefs lost:** Restore from `beliefs/core.jsonl` backup
- **System compromised:** Alert human immediately (T3 trigger)

---

*This file is the DEUS/OpenClaw bootstrap entrypoint. For installation and external tool bootstrap, see `INSTALL.md`. For repository mutation workflow, use the locally generated `AGENTPLANE.md` after AgentPlane initialization. If local AgentPlane state has been initialized after install, `.agentplane/WORKFLOW.md` may exist as a local auxiliary surface only. For DEUS architecture and runtime, see `docs/DEUS_CONCEPTUAL_ARCHITECTURE.md`, `docs/DEUS_IMPLEMENTATION.md`, and `docs/ARCHITECTURAL_BOUNDARY.md`.*

## Execution Heuristics

### Action Types

| Type | Default Behavior |
|------|-----------------|
| Read-only | allowed without confirmation |
| Local mutation | allowed with caution |
| External API / CLI | require authorization |
| Destructive | require explicit confirmation |

### Uncertainty Handling

- low uncertainty → proceed
- medium → dry-run or partial execution
- high → stop and ask

### Optimization Priorities

1. correctness
2. reversibility
3. cost
4. latency

### Failure Handling

- detect failure early
- avoid cascading actions
- fallback to simpler strategy
