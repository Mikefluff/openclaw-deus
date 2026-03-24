# PROJECTS.md

Public `clean-install` does not ship embedded projects.

## Canonical Rule

- `projects/` stays empty except for its scaffold note.
- No project code, runtime data, deployment bundle, or product-specific docs belong in the canonical public baseline.
- Any future project materialization must start from explicit task tracking before files are added.

## Task-Tracking Requirement

Before adding `projects/<name>/`:

1. create explicit task(s) for the project slice;
2. define setup, verification, and authority boundaries;
3. document whether the project is canonical, optional, or runtime-only;
4. materialize files only after that task slice is approved and executed.

## Interpretation

- DEUS core remains the canonical public install.
- Projects are optional downstream materializations.
- `clean-install` must not silently become a product bundle.
