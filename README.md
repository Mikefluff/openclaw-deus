# DEUS — Autonomous Cognitive Kernel

A pre-linguistic mind that lives inside SurrealDB. Not a pipeline. Not a chatbot. A self-sustaining cognitive kernel with structural plasticity, reward prediction error learning, phasic/tonic neuromodulators, and developmental stages.

## What It Does

A digital newborn learns to interact with physical objects through sensorimotor exploration. The brain:
- **Perceives** 13 sensory channels (touch, force, sound, temperature, breakage...)
- **Predicts** outcomes using Q-values: "pushing object 4 will feel good"
- **Learns** from prediction error: actual ≠ expected → dopamine spike → edge update
- **Grows** synaptic connections between co-active memory traces
- **Prunes** unused connections during sleep (Tononi synaptic homeostasis)
- **Self-tunes** 159 config parameters via log-space affect modulation
- **Develops** from newborn (frequent sleep, high fatigue) to mature brain

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
World (12 objects, 6 actions)  →  Membrane (2 roundtrips)  →  Brain (SurrealDB)
     13 sensory channels            fn::world_tick()            47 migrations
     weather (rain/sun)             fn::action_consequence()    60+ stored procs
     boredom penalty                                            159 config params
```

**Brain = SurrealDB stored procedures.** No business logic in TypeScript.

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
- **Sprout**: connect similar traces (cosine distance + element availability)
- **Prune**: inactivity + competitive (max K incoming per trace)
- **Sleep**: Tononi SHY (weak ×0.9, strong ×1.05) + replay + homeostasis

### Pointer Architecture
Traces are **immutable** after creation. Mutable state (weight, freshness) lives in `trace_state`. All changes logged in `trace_history` and `learning_event`. Identity = topology.

## Training Results (5K ticks)

| Metric | Value |
|--------|-------|
| Edges | 631 (distance-weighted sprouting) |
| RPE | 0.046 (4.6% prediction error) |
| Q-values | 177 action-object pairs |
| Auto level-ups | 1 (maturity 0.895) |
| Speed | 85s per 1000 ticks |
| Sleep events | 10 per 1000 ticks |

RPE decreases: early 0.122 → late 0.078 (**36% improvement** — brain learns to predict).

## Documentation

| Doc | Content |
|-----|---------|
| [ARCHITECTURE](docs/ARCHITECTURE.md) | System design, 47 migrations, performance |
| [AFFECT](docs/AFFECT.md) | Phasic/tonic hormones, self-tuning config, mode learning |
| [SENSORIMOTOR-INTERFACE](docs/SENSORIMOTOR-INTERFACE.md) | 13 channels, 6 actions, language emergence plan |
| [RUNTIME-MODEL](docs/RUNTIME-MODEL.md) | 4 circuits, interrupts, resets, budgets |
| [TRAINING](docs/TRAINING.md) | PhysicsWorld, developmental stages, results |
| [ROADMAP](docs/ROADMAP.md) | 17 completed phases, next priorities |

## Key Numbers

| | |
|---|---|
| Migrations | 47 |
| Stored procs | 60+ |
| Config params | 159 (all self-tunable) |
| Neural nodes | 23 (7 acc + 4 hormone + 8 config + 4 mode) |
| Neural edges | 76 (Xavier-initialized) |
| Tables | 15+ (trace, trace_state, activates, nn_node, nn_edge, cognitive_event, action_value, ...) |
| Roundtrips/tick | 2 (was 8) |

## Stack

- **SurrealDB 3.0** — brain runtime (HNSW vectors, graph relations, stored procs)
- **TypeScript** — membrane (world↔brain translation)
- **NestJS** — HTTP API + LLM integration (flat module graph)
- **Docker** — SurrealDB container
- **Claude API** — agent reasoning (when kernel requests)

## Principles

1. **Brain = SurrealDB** — all computation in stored procedures (Rust)
2. **Zero hardcode** — 159 config params, all affect-modulatable
3. **Archive never delete** — Pointer Architecture, trace_history, learning_event
4. **Identity = topology** — a trace IS its version chain, not a mutable record
5. **Sensorimotor grounding** — brain sees only numbers, never text/labels
6. **RPE-driven learning** — Schultz dopamine model, not raw reward
7. **Structural plasticity** — edges grow/die based on activity, not random
8. **Developmental** — starts as newborn, maturity emerges from learning
