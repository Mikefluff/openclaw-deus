# CANONICAL_STATE.md

## Purpose

This file defines the clean-install authority model.

The repository distinguishes three layers:

- `canonical_trunk` for code, docs, bootstrap files, and verification surfaces;
- `live_runtime` for mutable DEUS continuity artifacts;
- `ephemeral_runtime` for disposable local residue.

Local-first rule:
- clean-install assumes one repository root by default;
- if an operator later wants a separate runtime root or snapshot export root, that must be configured explicitly through environment or local deployment tooling;
- that external split is not part of the canonical repository contract.

---

## 1. Canonical Trunk

Identifiers:
- layer: `canonical_trunk`
- authority: `github_trunk`
- sync rule: `pull_push_via_git`

Typical paths:
- `AGENTS.md`
- `SOUL.md`
- `IDENTITY.md`
- `USER.md`
- `DEUS.md`
- `README.md`
- `INSTALL.md`
- `docs/**` except `docs/introspection/**`
- `src/**`
- `scripts/**`
- `tests/**`
- `projects/README.md`
- `skills/README.md`
- `runtime-snapshots/**`

Rule:
- edit locally;
- verify locally;
- push to GitHub intentionally;
- do not treat mutable runtime artifacts as canonical just because they are tracked.

---

## 2. Live Runtime

Identifiers:
- layer: `live_runtime`
- authority: `live_workspace`
- sync rule: `preserve_then_promote`

Typical paths:
- `STATUS.md`
- `beliefs/core.jsonl`
- `beliefs/decay-policy.overrides.json`
- `beliefs/drift.log`
- `memory/*.md`
- `logs/*.jsonl`
- cognition-relevant `logs/*.log`
- `review/pending-beliefs.md`
- `review/open-tensions.md`
- `docs/introspection/**`
- `reports/*.ndjson`
- `data/**`
- `projects/*/data/**`
- `projects/*/logs/**`
- `projects/*/STATUS.md`

Default location in clean-install:
- the current repository root.

Optional externalization:
- `DEUS_RUNTIME_ROOT`
- `DEUS_SNAPSHOT_ROOT`

If those are set, runtime surfaces may resolve elsewhere.
That is local deployment policy, not a repository-shipped requirement.

Rule:
- preserve fresher live state before pulling or overwriting;
- promote runtime history intentionally;
- never confuse tracked runtime continuity with canonical engineering truth.

---

## 3. Ephemeral Runtime

Identifiers:
- layer: `ephemeral_runtime`
- authority: `local_only`
- sync rule: `never_promote`

Typical paths:
- `.tmp/**`
- `.openclaw/**`
- `.openclaw-flush`
- `AGENTPLANE.md`
- `.agentplane/**`
- scratch backups like `*.bak`, `*.orig`, `*.tmp`
- OS junk like `.DS_Store` and `__MACOSX/`

Rule:
- never treat these paths as durable evidence;
- recreate or delete freely;
- keep them out of the canonical trunk.

---

## 4. Sync Protocol

### Canonical trunk
1. pull the latest GitHub state
2. make verified changes locally
3. push intentionally

### Live runtime
1. inspect whether the current workspace holds fresher runtime state
2. preserve conflicting artifacts before pull when needed
3. promote runtime outputs only through explicit review or export

### Ephemeral runtime
1. do not promote
2. do not cite as source-of-truth
3. clear or recreate as needed

---

## 5. Operational Consequence

Inside this repository there is no single universal source-of-truth for every tracked file.

- `github_trunk` governs code, docs, and bootstrap contract;
- `live_workspace` governs active DEUS continuity until promotion;
- `local_only` never governs anything beyond the current machine/process.

Use `npm run workspace:authority -- <path ...>` when a path is ambiguous.
