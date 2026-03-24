# PROCESS_BELIEF_PROMOTION.md

## Purpose

Define how candidate beliefs move from nightly review into durable belief state.

---

## Pipeline

1. **Episodic memory** accumulates in `memory/`
2. **Nightly orchestration** refreshes memory, bounded reflection, and full introspection artifacts before the review gate
3. **Promotion review** evaluates queue entries in the later reviewed stage of `npm run deus:nightly`
4. Only then may a candidate be written into `beliefs/core.jsonl`

---

## Why this exists

Direct extraction from episodic memory into durable beliefs is too noisy.
The promotion workflow adds a review gate between observation and semantic commitment.

---

## Decision outcomes

### Promote
Candidate is strong enough to become a durable belief.

### Defer
Candidate is plausible but not yet strong enough.
Keep it in the queue and wait for more evidence.

### Reject
Candidate is too weak, too narrow, or otherwise not suitable for durable belief state.

### Refresh existing
If a candidate matches an existing belief, the existing belief may be refreshed rather than creating a duplicate.

---

## Current heuristics

Promotion review currently prefers:
- recurrence >= 3
- confidence proposal >= 0.6
- no explicit human-review requirement

These heuristics are intentionally conservative.

---

## Safety rule

The workflow should prefer under-promotion over over-promotion.
It is safer to miss one candidate belief than to pollute the durable self-model with weak abstractions.
