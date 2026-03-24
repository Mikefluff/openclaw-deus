# WORKSPACE_MAP.md

> Structural map only. For the authoritative DEUS-vs-OpenClaw boundary, see `docs/ARCHITECTURAL_BOUNDARY.md`. For sync authority, see `docs/workspace/CANONICAL_STATE.md`.

## Canonical Trunk

Purpose of this section: identify the GitHub-first layer that should move through normal engineering flow.

### Bootstrap, identity, and policy
- `AGENTS.md`
- `SOUL.md`
- `IDENTITY.md`
- `USER.md`
- `DEUS.md`
- `INSTALL.md`

### Canonical code and docs
- `src/`
- `scripts/`
- `tests/`
- `docs/` except `docs/introspection/`
- `README.md`
- `docs/workspace/CANONICAL_STATE.md`
- `docs/workspace/GENERATED_ARTIFACTS.md`

### Scaffold-only overlays
- `projects/README.md`
- `skills/README.md`
- `runtime-snapshots/`

## Live Runtime State

Purpose of this section: identify tracked or generated files whose freshest copy belongs to the active workspace first.

- `STATUS.md`
- `beliefs/`
- `memory/`
- `logs/`
- `review/`
- `docs/introspection/`
- `data/`
- `reports/*.ndjson`
- `projects/*/data/`
- `projects/*/logs/`
- `projects/*/STATUS.md`

Rule of thumb:
- this layer is versionable;
- this layer is not the canonical trunk;
- preserve first, then promote intentionally.

## Ephemeral Runtime / Non-Canonical

- `.openclaw/`
- `.openclaw-flush`
- `.tmp/`
- `AGENTPLANE.md`
- `.agentplane/`
- disposable validation snapshots
- scratch backups and one-off staging files

## Rules of Thumb

1. `canonical_trunk` syncs through GitHub.
2. `live_runtime` follows the freshest active workspace until explicit promotion.
3. `ephemeral_runtime` is never a durable source-of-truth.
4. OpenClaw remains the runtime/orchestration engine and reads filesystem paths.
5. Any external runtime-root split is local deployment policy, not a clean-install requirement.
6. Secrets should live in environment/config, not tracked markdown.
