# DEUS — Autonomous Cognitive Kernel

A pre-linguistic mind that lives inside SurrealDB. Not a pipeline. Not a chatbot. A self-sustaining cognitive kernel with preemptive scheduling, autonomous agency, and sleep/wake cycles.

## What This Is

The brain runs **entirely inside SurrealDB** as stored procedures (Rust). NestJS is just a thin membrane for world interaction. The kernel:

- **Runs autonomously** — `fn::brain_tick()` executes all cognitive circuits in one FOR loop
- **4 priority circuits** — CRITICAL (energy/sleep), HIGH (affect/decay), MEDIUM (inference/forget), LOW (world model/introspection)
- **Decides its own actions** — agency circuit driven by affect (dopamine→explore, cortisol→cautious)
- **Sleeps and wakes** — energy drops below threshold → `fn::sleep_consolidation` → recovery
- **Builds world model** — `fn::build_world_model()` from traces, beliefs, knowledge
- **Introspects itself** — `fn::introspect()` coherence scoring + posture classification
- **Neural graph** — 56 nodes + 214 edges, forward/backward pass as graph traversal
- **Archive, never delete** — traces are computational memory (Pointer Architecture)
- **Zero hardcoded thresholds** — all parameters from `kernel_state.config`, modulated by affect

## Quick Start

```bash
# Start SurrealDB in Docker
docker run -d --name deus-surrealdb -p 8000:8000 surrealdb/surrealdb:v3.0.4 start --user root --pass root memory

# Install
npm install

# Bootstrap (migrations + seed neural graph)
npx tsx src/training/bootstrap.ts

# Train (brain explores world autonomously)
npx tsx src/training/membrane.ts 500

# Tests
npm test   # 463 tests, 38 suites
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  SurrealDB 3.0 (THE BRAIN)                                  │
│                                                              │
│  fn::brain_tick($n) — all circuits in one FOR loop:          │
│    CRITICAL (×100): energy drain + sleep detection           │
│    HIGH     (×100): affect forward (nn_forward)              │
│    AGENCY   (×200): decide action (dopamine/cortisol-driven) │
│    MEDIUM   (×500): active inference + forgetting            │
│    LOW     (×2000): neural decay + consolidation             │
│    DEEP    (×5000): world model + introspection              │
│                                                              │
│  Neural Graph: 56 nn_nodes + 214 nn_edges                    │
│    Affect:    7 acc → 4 hormones → 6 config + 4 modes       │
│    Cone:      9 inputs → 2 outputs (depth/spread)            │
│    Predictor: 16 inputs → 8 delta outputs                    │
│                                                              │
│  32 migrations, 50+ stored procedures                        │
│  fn::build_world_model, fn::introspect, fn::nightly_run     │
│  fn::sleep_consolidation, fn::nn_forward/backward            │
│  fn::agency_tick, fn::process_consequence                    │
└─────────────────────┬───────────────────────────────────────┘
                      │ kernel_request (brain asks to act)
                      │ kernel_event (sensory consequences)
┌─────────────────────▼───────────────────────────────────────┐
│  NestJS (MEMBRANE)                                           │
│                                                              │
│  KernelLoopService: watchdog + health monitor                │
│  Membrane script: world ↔ brain translator                   │
│  LLM calls: only when brain requests (deliberation)          │
│  HTTP API: external monitoring                               │
│  Boot: 12ms, zero circular deps                              │
└─────────────────────┬───────────────────────────────────────┘
                      │ actions (touch, push, look...)
                      │ consequences (sensory feedback)
┌─────────────────────▼───────────────────────────────────────┐
│  EvolvingWorld                                               │
│                                                              │
│  5 levels, 25+ objects with hidden properties                │
│  Partial observability: weight, temperature, fragility       │
│  revealed through consequences, not directly                 │
│  Mama teaches labels, but brain must infer meaning            │
└─────────────────────────────────────────────────────────────┘
```

## Training Results

```
200 world ticks, 200,000 brain cycles:
  Actions:     1,000 (autonomous, affect-driven)
  Traces:      7 → 250 (stabilized by forgetting)
  Energy:      oscillates 0.1↔0.55 (sleep/wake cycles)
  World model: confidence 1.0
  Introspection: coherence 0.5, posture "review"

Performance: 24,000+ tps (internal ticks, zero JS roundtrip)
```

## Documentation

| Document | What |
|----------|------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Kernel-in-SurrealDB, 27 migrations, flat NestJS |
| [RUNTIME-MODEL.md](docs/RUNTIME-MODEL.md) | Formal spec: circuits, interrupts, resets, budgets, personality |
| [DYNAMICS.md](docs/DYNAMICS.md) | 7 update rules as equations |
| [CONCEPT-SPACE.md](docs/CONCEPT-SPACE.md) | Adaptive dimensions, spatial forgetting |
| [SENSORY.md](docs/SENSORY.md) | Self-organized modality discovery |
| [AFFECT.md](docs/AFFECT.md) | Neural graph hormones, 5 drives |
| [AGENCY.md](docs/AGENCY.md) | WorldBridge, action selection |
| [TRAINING.md](docs/TRAINING.md) | Evolving world, hidden states, consequence-based learning |
| [LIGHT-CONE.md](docs/LIGHT-CONE.md) | Cognitive cone (learned depth/spread) |
| [DEVELOPMENTAL-METRICS.md](docs/DEVELOPMENTAL-METRICS.md) | 6 metric domains + neural graph health |
| [ROADMAP.md](docs/ROADMAP.md) | What's done (9 phases), what's next |

## Numbers

```
~240 files, ~27,000 lines TypeScript
463 tests, 38 suites
32 SurrealDB migrations, 50+ stored procedures
56 neural graph nodes, 214 edges (3 models)
HNSW vector index (64-dim), ASYNC events
4 cognitive circuits with preemptive scheduling
3 reset classes (soft/safe_mode/hard)
NestJS boot: 12ms
Brain: 24,000+ tps (internal), 1M ticks in 45s
```

## Stack

- **SurrealDB 3.0** — the brain lives here (graph DB, stored procs, HNSW, async events)
- **NestJS** — thin membrane (watchdog, HTTP API, LLM bridge)
- **TypeScript** — membrane code only
- **Docker** — SurrealDB container
- **Claude API** — LLM for deliberation (zero tokens during training)

## Key Principles

1. **Brain lives in SurrealDB** — all cognition is stored procedures in Rust
2. **NestJS = membrane** — monitoring only, not control
3. **Archive, never delete** — traces are computational memory (Pointer Architecture)
4. **Zero hardcode** — all thresholds from `kernel_state.config`, modulated by affect
5. **No inline SQL in TypeScript** — everything through `fn::` stored procs
6. **No mock tests** — only math invariants, convergence, integration
7. **Personality = scheduler policy** — budget allocation between circuits = cognitive style
8. **Pure RL** — brain doesn't know object names, learns from exploration + consequences

## License

Proprietary — Basilisk Labs
