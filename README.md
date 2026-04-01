# DEUS — Autonomous Cognitive Kernel

A pre-linguistic mind that lives inside SurrealDB. Not a pipeline. Not a chatbot. A self-sustaining cognitive kernel with structural plasticity, reward prediction error learning, phasic/tonic neuromodulators, developmental stages, and AtomSpace-inspired hypergraph features.

## What It Does

A digital newborn learns to interact with physical objects through sensorimotor exploration. The brain:
- **Perceives** 13 sensory channels (touch, force, sound, temperature, breakage...)
- **Predicts** outcomes using Q-values: "pushing object 4 will feel good"
- **Learns** from prediction error: actual ≠ expected → dopamine spike → edge update
- **Grows** synaptic connections between co-active memory traces
- **Prunes** unused connections during sleep (Tononi synaptic homeostasis)
- **Self-tunes** 159+ config parameters via log-space affect modulation
- **Develops** from newborn (frequent sleep, high fatigue) to mature brain
- **Meta-edges** — edges modulate/gate other edges (hypergraph semantics)
- **Pattern matching** — stored graph patterns fire reactively during brain tick
- **HebbianLinks** — learned associative connections via ECAN attention economy
- **PLN inference** — probabilistic deduction chains over belief graph
- **Frames** — stackable graph versioning for hypothetical reasoning

## Quick Start

```bash
# Start SurrealDB
docker run -d --name deus-surrealdb -p 8000:8000 surrealdb/surrealdb:v3.0.4 start --user root --pass root

# Install + train
npm install
npx tsx src/training/developmental.ts 5000 0.95
```

## Architecture

```
World (12 objects, 6 actions)  →  Membrane (WebSocket)  →  Brain (SurrealDB)
     13 sensory channels            sensory_input table         53 migrations
     weather (rain/sun)             fn::brain_tick_auto()       80+ stored procs
     boredom penalty                kernel_request table        170+ config params
```

**Brain = SurrealDB stored procedures.** No business logic in TypeScript.

### AtomSpace-Inspired Features (Migrations 052-053)

Inspired by [OpenCog AtomSpace](https://github.com/opencog/atomspace), implemented natively in SurrealDB without forking:

| Feature | AtomSpace Concept | SurrealDB Implementation |
|---------|------------------|--------------------------|
| **HNSW Vector Index** | Content-addressed atoms | `HNSW DIMENSION 64 DIST COSINE` on trace.position |
| **Recursive Spreading** | Hypergraph traversal | `.{1..3}` recursive paths (multi-hop activation) |
| **Meta-edges** | Links-on-Links (metagraph) | `modulates`, `gates`, `context_of` relation tables |
| **Queries-as-data** | BindLink/MeetLink | `graph_pattern` table + `fn::match_pattern` |
| **DualLink** | Inverted pattern search | `fn::dual_match` — data-driven pattern firing |
| **FormulaStream** | Reactive value flow | `fn::compute_activation` — pull-based, no stale values |
| **Unification** | IdenticalLink | `fn::unify` — Robinson's algorithm for analogies |
| **Frames** | AtomSpace stacking | `graph_frame` + `frame_delta` — push/pop/merge |
| **ECAN** | Economic Attention Networks | `hebbian` links + rent collection + capacity forgetting |
| **PLN** | Probabilistic Logic Networks | `fn::pln_deduction` + `fn::pln_modus_ponens` |

### Cognitive Cycle (per action)
```
APPRAISE → RETRIEVE → PREDICT → DELIBERATE → COMMIT → LEARN
salience    Q-values    RPE        Q-update     causal   Hebbian
gating      + UCB1      → DA       + TD(0)      log      + mode
                        spike                             REINFORCE
```

### Hormone Dynamics
| Hormone | τ | Role |
|---------|---|------|
| Dopamine | 30 | Reward prediction error (Schultz model) |
| Norepinephrine | 20 | Surprise, alertness |
| Serotonin | 200 | Contentment (tonic only, no spikes) |
| Cortisol | 500 | Stress (HPA axis, very slow decay) |

### Structural Plasticity
- **Grow**: synaptic elements via Gaussian growth curve (Butz-Wörgötter)
- **Sprout**: connect similar traces via HNSW nearest-neighbor search
- **Prune**: inactivity + competitive (max K incoming per trace)
- **Sleep**: Tononi SHY (weak ×0.9, strong ×1.05) + replay + homeostasis

### ECAN (Economic Attention Networks)
- **HebbianLinks**: learned associations between co-active traces (separate from structural edges)
- **Rent collection**: STI tax per tick — attention is a scarce resource
- **Capacity forgetting**: archive lowest-weight traces when over capacity
- **Hebbian decay**: inactive associations weaken, active ones strengthen

### PLN (Probabilistic Logic Networks)
- **Deduction**: A→B, B→C ⊢ A→C with `sAC = sAB×sBC + (1-sAB)×(sC-sB×sBC)/(1-sB)`
- **Modus ponens**: P, P→Q ⊢ Q with confidence propagation
- **Inference chains**: auto-discover 2-hop belief chains and create inferred edges
- **Confidence decay**: α=0.9 per inference step (conservative chaining)

### Pointer Architecture
Traces are **immutable** after creation. Mutable state (weight, freshness) lives in `trace_state`. All changes logged in `trace_history` and `learning_event`. Identity = topology.

### Graph Frames (Hypothetical Reasoning)
Push a frame → make speculative changes → evaluate → pop (discard) or merge (apply). Enables counterfactual reasoning without touching base state.

## Training Results (1K world ticks, 950K brain cycles)

| Metric | Value |
|--------|-------|
| Traces | 35 active (content-addressable dedup) |
| Edges (activates) | 95+ (distance-weighted, HNSW-accelerated sprouting) |
| HebbianLinks | 5+ (ECAN co-activation associations) |
| Meta-edges | modulates + gates (hypergraph) |
| Actions | 4755 autonomous agent decisions |
| Sleep events | ~12 per 1K ticks (energy cycling 0.12→0.82) |
| Patterns | 3 active (dopamine_explore_boost, cortisol_suppress, defensive_emotional_boost) |

## Documentation

| Doc | Content |
|-----|---------|
| [ARCHITECTURE](docs/ARCHITECTURE.md) | System design, 53 migrations, performance |
| [AFFECT](docs/AFFECT.md) | Phasic/tonic hormones, self-tuning config, mode learning |
| [SENSORIMOTOR-INTERFACE](docs/SENSORIMOTOR-INTERFACE.md) | 13 channels, 6 actions, language emergence plan |
| [RUNTIME-MODEL](docs/RUNTIME-MODEL.md) | 4 circuits, interrupts, resets, budgets |
| [TRAINING](docs/TRAINING.md) | PhysicsWorld, developmental stages, results |
| [ROADMAP](docs/ROADMAP.md) | 20 completed phases, next priorities |

## Key Numbers

| | |
|---|---|
| Migrations | 53 |
| Stored procs | 80+ |
| Config params | 170+ (all self-tunable) |
| Neural nodes | 23 (7 acc + 4 hormone + 8 config + 4 mode) |
| Neural edges | 76 (Xavier-initialized) |
| Tables | 20+ (trace, trace_state, activates, hebbian, graph_pattern, graph_frame, modulates, gates, ...) |
| AtomSpace features | 13 (HNSW, recursive paths, meta-edges, patterns, DualLink, FormulaStream, unification, frames, ECAN, PLN, ...) |

## Stack

- **SurrealDB 3.0.4** — brain runtime (HNSW vectors, graph relations, stored procs, WebSocket)
- **surrealdb SDK 2.0.3** — WebSocket client (sessions, transactions)
- **TypeScript** — membrane (world↔brain translation)
- **NestJS** — HTTP API + LLM integration (flat module graph)
- **Docker** — SurrealDB container
- **Claude API** — agent reasoning (when kernel requests)

## Principles

1. **Brain = SurrealDB** — all computation in stored procedures (Rust)
2. **Zero hardcode** — 170+ config params, all affect-modulatable
3. **Archive never delete** — Pointer Architecture, trace_history, learning_event
4. **Identity = topology** — a trace IS its version chain, not a mutable record
5. **Sensorimotor grounding** — brain sees only numbers, never text/labels
6. **RPE-driven learning** — Schultz dopamine model, not raw reward
7. **Structural plasticity** — edges grow/die based on activity, not random
8. **Developmental** — starts as newborn, maturity emerges from learning
9. **Hypergraph** — edges on edges (meta-modulation, gating) inspired by AtomSpace
10. **Attention economy** — ECAN rent + forgetting, scarce STI budget
11. **Probabilistic inference** — PLN deduction chains with confidence propagation
