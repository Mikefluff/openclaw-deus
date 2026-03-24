# GENERATED_ARTIFACTS.md

## Purpose

This file defines how generated outputs should be treated in the DEUS workspace.

Workspace-authority note:
- some generated files remain versioned as `live_runtime` history;
- versioned does not automatically make them part of the `canonical_trunk`.
- clean-install defaults to a local-first repository layout unless an operator explicitly redirects runtime roots.

---

## Versioned Generated Artifacts

Keep generated files under version control when they preserve meaningful history or debugging continuity.
Even then, treat them as live runtime history unless another canonical doc explicitly promotes them into the engineering trunk.

### Keep versioned
- `memory/*.md` produced through normal DEUS operation
- `docs/introspection/*.md`
- `docs/introspection/*.json`
- `logs/belief-decay.log`
- `logs/belief-extractor.log`
- `logs/contradictions.log`

Rationale: these files help preserve continuity of cognition, drift, and self-observation.

Promotion note:
- keep the live file in the active workspace;
- export or promote only the snapshot you actually want to preserve in the canonical trunk;
- do not treat the live runtime path itself as a replacement for `runtime-snapshots/`.

---

## Conditionally Versioned

These files may be useful during stabilization, but can become noisy over time.

### Review periodically
- promoted validation snapshots copied into a canonical review surface
- promoted integration test snapshots copied into a canonical review surface
- similar validation snapshots that were intentionally preserved

Rule:
- treat the live runtime output paths as disposable by default
- preserve a snapshot only through an intentional promotion step into a canonical review/history surface
- the normal promotion surface for runtime continuity is `runtime-snapshots/**`
- stabilization does not by itself make the live runtime output path canonical
- root legacy snapshots such as `logs/bootstrap-validation.json` and `logs/openclaw-integration-test.json` were removed from the tracked tree during clean-install canonicalization
- current runtime integration diagnostics should prefer `.tmp/diagnostics/openclaw-integration-test.json`

---

## Non-Versioned Runtime / Staging Artifacts

Never treat these as canonical:
- `.openclaw/`
- `.openclaw-flush`
- `.tmp/`
- live validation snapshots in their runtime output paths
- live integration result JSON files in their runtime output paths
- cache files
- extracted archives
- OS junk like `__MACOSX`, `.DS_Store`

---

## Recommended Rotation Policy

### Logs
- Keep cognition-relevant logs versioned until the system reaches stable operating cadence.
- Once stable, move verbose operational test outputs to ignored or rotated files.

### Validation outputs
- Use them to stabilize bootstrap/runtime adapter.
- Keep the runtime output path disposable.
- Keep only the latest snapshot plus a capped retained history in `.tmp/diagnostics/history/`.
- When a specific snapshot matters, copy or promote it intentionally instead of leaving the live file path tracked as canonical history.

---

## Current Working Policy

- Keep introspection and cognition-related logs versioned.
- Treat bootstrap/integration result JSONs as runtime diagnostics by default, not canonical history.
- Ignore runtime state and staging.
- Use `.tmp/` as the sole workspace staging namespace.
- Revisit code paths that still write tracked runtime diagnostics so they match this policy.
