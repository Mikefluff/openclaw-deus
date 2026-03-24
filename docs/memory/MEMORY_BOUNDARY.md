# MEMORY_BOUNDARY.md

## Purpose

Define the boundary between episodic memory and semantic/belief memory in the current DEUS workspace.

---

## Episodic Memory

Stored primarily in:
- `memory/YYYY-MM-DD.md`
- operational logs
- introspection reports

Characteristics:
- event-oriented
- time-indexed
- may contain raw observations, mistakes, decisions, context, and one-off events
- useful for reconstruction, traceability, and review

Examples:
- "Fixed bootstrap validator import"
- "Dokploy access confirmed"
- "User declared DEUS server as default home for future projects"

---

## Semantic / Belief Memory

Stored primarily in:
- `beliefs/core.jsonl`

Characteristics:
- stabilized abstractions
- reusable across sessions
- should survive beyond a single day or event
- should be evidence-linked and coherence-checked

Examples:
- stable invariants
- persistent user preferences
- durable self-model claims
- recurring operational truths

---

## Boundary Rule

Not every event belongs in beliefs.

Promotion from episodic memory to semantic memory should happen only when an observation is:
1. recurring,
2. durable,
3. relevant beyond one day,
4. evidence-backed,
5. non-contradictory with current invariants.

---

## Current Problem

The current DEUS implementation partially mixes:
- raw events,
- temporary operational lessons,
- durable beliefs.

This creates drift risk and overpopulation of `beliefs/core.jsonl`.

---

## Working Policy

- `memory/` is the first landing zone for events.
- `beliefs/` should hold only stabilized semantic claims.
- daily introspection may propose belief updates, but should not blindly convert every event into belief state.
