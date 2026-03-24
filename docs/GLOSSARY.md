# DEUS Glossary

## Purpose

Compact glossary for the current DEUS repository.

Rule:
- if a term is defined here and the runtime docs use the same word differently, the runtime docs must say so explicitly;
- if a historical DEUS archive used a broader meaning, this glossary documents the current repository meaning first.

---

## Terms

### DEUS
The cognitive and governance layer represented in this repository by identity docs, axioms, beliefs, memory, reflection flows, and runtime policy.

DEUS is not identical to OpenClaw, the embedded projects, or the deployment stack.

### OpenClaw
The runtime engine and agent host that DEUS currently runs on top of.

OpenClaw provides execution context, tooling, and memory/tool integration. It does not define DEUS ontology by itself.

### Exocortex
External cognitive support surfaces used by DEUS.

In the current repository this means OpenClaw runtime affordances plus repository-backed memory, beliefs, logs, and scripts rather than a graph-native external mind.

### Axiom
A non-negotiable operating principle that constrains behavior and policy.

Current axioms are documented in `docs/AXIOMS_AND_AGENCY.md`.

### Invariant
A condition DEUS tries to preserve across sessions, maintenance cycles, and edits.

Invariants can be encoded in identity docs, policy checks, review gates, or runtime conventions.

### Belief
A durable statement stored or proposed as part of DEUS operating knowledge.

Beliefs are not raw thoughts. They are extracted, scored, reviewed, decayed, contradicted, and promoted under the policy in `docs/BELIEFS_MECHANISM.md`.

### Daily Memory
Session and operations memory stored as `memory/YYYY-MM-DD.md`.

This is the canonical day-keyed reflective log surface, not an append-only raw event stream.

### Review Queue
The pending promotion surface for candidate beliefs.

Current durable surface: `review/pending-beliefs.md`.

### Introspection
The maintenance pass that reviews recent activity, extracts candidate beliefs, scans contradictions, applies decay, checks integration posture, and generates summaries.

Current pipeline behavior is documented in `docs/dissensus/introspection-protocol.md`.

### Reflexive Runtime
The whole maintenance loop around logs, memory aggregation, candidate belief extraction, review, decay, contradictions, and introspection.

This term names the operational self-maintenance behavior DEUS currently implements.

### Semantic Governance
Rules for changing identity-critical concepts, prompts, terminology, and repository meaning without silently rewriting DEUS.

Canonical doc: `docs/SEMANTIC_GOVERNANCE.md`.

### Dissensus
The mechanism for escalating disagreement between DEUS and the human or between local actions and higher-order constraints.

Current meaning is operational and policy-bound, not a full historical protocol stack.

### Continuity
The degree to which DEUS preserves coherent identity, memory, beliefs, and operating principles across sessions and edits.

Current continuity is file-backed and workflow-backed, not distributed or graph-native.

### Historical Archive
The original DEUS knowledge corpus outside or prior to the current runtime-oriented repository shape.

It informs terminology and design intent, but it is not automatically part of the current runtime contract.

### Deferred
A concept or capability intentionally documented as not implemented in the current repository.

Deferred does not mean abandoned. It means "do not describe as shipped runtime truth yet."
