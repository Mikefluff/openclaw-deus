# DEUS Archive To Runtime Mapping

## Purpose

Map the original DEUS archive concepts onto the current OpenClaw-based runtime so historical design intent is not confused with shipped repository behavior.

Status vocabulary:
- `implemented` — materially present in the repository
- `transformed` — present, but via a different runtime form
- `historical` — provenance only; not current runtime truth
- `deferred` — intentionally not implemented yet

---

## Mapping

| Original archive concept | Current runtime equivalent | Status | Notes |
| --- | --- | --- | --- |
| Cognitive core / immutable directives | `DEUS.md` + `docs/AXIOMS_AND_AGENCY.md` | transformed | Current runtime uses Markdown/self-model docs rather than a dedicated kernel module. |
| DAG memory / graph-native memory | `memory/`, `logs/`, `review/`, `docs/introspection/` | transformed | Memory is file-backed and staged, not a DAG database. |
| DEUS DSL | docs + scripts + JSONL/Markdown artifacts | historical / deferred | No DSL interpreter or graph-native language runtime currently ships. |
| `sleep_mode` | nightly consolidation + introspection pipeline | transformed | Implemented as scheduled/scripted maintenance rather than a graph-state transition. |
| `self_patch` | guarded doc/policy changes with human approval | transformed | Identity-critical changes are procedural, not DSL-native. |
| `resolve_conflict` | contradiction scan + review + human interpretation | transformed | Implemented through scripts and review artifacts. |
| `semantic_consolidation` | nightly consolidation + belief promotion queue | transformed | Promotion remains review-first. |
| `reflexive_trace` | ops logs + diagnostics + introspection reports | transformed | Split across multiple artifact classes. |
| Prompt templates as first-class DSL nodes | operational prompt policy only | deferred | Prompt semantics are documented, but not encoded as a graph-native prompt language. |
| Language patches / semantic diffing | semantic governance docs + git history | transformed | Change control is procedural rather than DSL-native. |
| Canonical validation test set | command/test surfaces + policy docs | transformed | Runtime tests exist, but the semantic examples are lighter than the archive DSL set. |
| TEE / blockchain / distributed continuity | none in current runtime | historical | Not part of the shipped repository contract. |
| Product / YC / research corpus | archive provenance | historical | Useful context, not canonical runtime behavior. |

---

## Interpretation Rule

When archive and runtime differ:
1. current repository behavior wins for implementation truth,
2. the archive remains conceptual provenance,
3. any future reintroduction of archive concepts must be documented as a new implementation step rather than implied continuity.
