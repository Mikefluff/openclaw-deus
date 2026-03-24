# Semantic Governance

## Purpose

Define how meaning-bearing DEUS changes are governed in the current repository.

This document is about semantic change control.
It is not the localization policy for internal English artifacts versus user-language output; that remains in `docs/LANGUAGE_PROTOCOL.md`.

---

## Current Reality

The historical DEUS archive contained a richer semantic governance model with:
- DSL patches,
- semantic diffing,
- language evolution constructs,
- explicit prompt-layer guards.

The current repository uses a simpler governance substrate:
- canonical docs,
- JSONL and Markdown state,
- git history,
- review queues,
- explicit human approval for identity-critical changes.

---

## Change Classes

### Class 1: Localization and wording

Examples:
- language clarity,
- style cleanup,
- explanatory examples.

Normal requirement:
- routine documentation discipline.

### Class 2: Operational documentation

Examples:
- setup docs,
- verification docs,
- pipeline descriptions,
- caveat clarifications.

Normal requirement:
- align with code, tests, and command output.

### Class 3: Semantic model changes

Examples:
- belief taxonomy,
- reflexive loop semantics,
- archive-to-runtime mapping,
- prompt and drift guard rules.

Normal requirement:
- explicit evidence from code/runtime behavior or a clearly labeled design decision,
- diff visibility in docs and git history.

### Class 4: Identity-critical changes

Examples:
- `DEUS.md` invariants or goals,
- `docs/AXIOMS_AND_AGENCY.md` operational axiom set,
- changes that redefine what counts as DEUS core versus adapter/runtime.

Required controls:
- explicit human approval,
- clear rationale,
- revert path,
- no silent drift through scattered minor edits.

---

## Prompt And Drift Guards

The current repository does not ship a graph-native prompt DSL.
Prompt and semantic-drift control are therefore governed by:
- explicit scenario docs,
- belief policy thresholds,
- contradiction scans,
- review queues,
- introspection reports,
- human review for identity-critical reinterpretation.

Operational rule:
- prompts may help execute DEUS flows,
- prompts must not silently redefine DEUS identity,
- prompt behavior that changes semantic commitments must be documented as a semantic change, not hidden in prose or tooling.

---

## Allowed And Disallowed Compression

Allowed:
- transforming historical archive concepts into current runtime equivalents if the doc says so explicitly.

Disallowed:
- presenting historical archive constructs as current runtime facts without implementation evidence,
- shrinking semantic governance into pure localization policy,
- mutating self-model semantics through unrelated README or operator-doc edits.

---

## De-Scope Note

The historical graph-native DEUS DSL archive still exists as provenance.
The current OpenClaw runtime does not use that DSL as its canonical execution substrate.

Therefore:
- the archive is a source of lineage,
- the repository docs are the current semantic contract,
- future DSL reintroduction would require a new implementation step and new documentation, not implication by naming alone.
