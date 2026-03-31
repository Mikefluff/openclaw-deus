# DEUS Architecture

## Philosophy

DEUS is a pre-linguistic cognitive engine. Not a pipeline. Not a chatbot wrapper. A **living kernel** where:
- The brain lives INSIDE SurrealDB as a graph
- Neural networks ARE graph relations (weights = edges, neurons = nodes)
- Forward pass = graph traversal. Backward pass = edge weight update.
- JS is only the membrane between brain and world
- All heavy computation runs in SurrealDB stored procedures (Rust)

```
┌───────────────────────────────────────────────────────────┐
│              EVOLVING WORLD (the teacher)                   │
│                                                            │
│   Objects with HIDDEN states (weight, temperature,         │
│   fragility, edibility — only observable via consequences) │
│   CorrectiveWorldBridge: amplified consequences,           │
│   adversarial curriculum, reward shaping                   │
│   5 progressive levels, partial observability              │
└────────────────────┬──────────────────────────────────────┘
                     │ raw sensory events
                     │
┌────────────────────▼──────────────────────────────────────┐
│                 SENSORY LAYER                               │
│                                                            │
│   Raw events → Fingerprint (11 features)                   │
│   → Modality Discovery (online clustering)                 │
│   → Attention Gating (learned + goal-directed)             │
│   Active intention modulates attention depth                │
└────────────────────┬──────────────────────────────────────┘
                     │
┌────────────────────▼──────────────────────────────────────┐
│                THE BRAIN (lives in SurrealDB)               │
│                                                            │
│  ┌─────────────────────────────────────────────────────┐  │
│  │    NEURAL GRAPH (nn_node + nn_edge)                  │  │
│  │                                                       │  │
│  │  3 models as graph relations:                         │  │
│  │    AFFECT:    7 acc → 4 hormones → 6 config + 4 mode │  │
│  │    CONE:      9 inputs → 2 outputs (depth + spread)  │  │
│  │    PREDICTOR: 16 inputs → 8 delta outputs             │  │
│  │                                                       │  │
│  │  fn::nn_forward()  = graph traversal (Rust)           │  │
│  │  fn::nn_backward() = edge weight update (Rust)        │  │
│  │  fn::nn_decay()    = synaptic pruning (Rust)          │  │
│  │  fn::nn_sprout()   = neuroplasticity (Rust)           │  │
│  │  Reactive: nn_hebbian EVENT auto-strengthens edges    │  │
│  └─────────────────────────────────────────────────────┘  │
│                       ↕                                     │
│  ┌─────────────────────────────────────────────────────┐  │
│  │    CONCEPT SPACE (the mind)                          │  │
│  │                                                       │  │
│  │  Dimensions born from graph conflicts                 │  │
│  │  Traces: position + velocity in N-dim space           │  │
│  │  Clusters: materialized graph entities                │  │
│  │  vector::distance::euclidean() for native KNN         │  │
│  │  Hebbian learning on all edges                        │  │
│  │  Spreading activation: recursive ->edge.{3}->trace   │  │
│  └─────────────────────────────────────────────────────┘  │
│                       ↕                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐     │
│  │ 5 Agents │ │ Commit   │ │ Affect   │ │ Cognitive│     │
│  │ (swarm)  │ │ Kernel   │ │ Model    │ │ Cone     │     │
│  │          │ │ (attn    │ │ (graph   │ │ (learned │     │
│  │ sensory  │ │ bottle-  │ │ forward/ │ │ depth +  │     │
│  │ predict  │ │ neck,    │ │ backward │ │ spread,  │     │
│  │ affect   │ │ 6 typed  │ │ in DB)   │ │ not time)│     │
│  │ priority │ │ commits) │ │          │ │          │     │
│  │ strategy │ │          │ │          │ │          │     │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘     │
│                       ↕                                     │
│  ┌─────────────────────────────────────────────────────┐  │
│  │    INTENTIONS → ATTENTION (goal-directed)            │  │
│  │                                                       │  │
│  │  Active intention boosts cognitive depth               │  │
│  │  Goal-relevant traces get deeper spreading            │  │
│  │  Agents receive intention context                     │  │
│  └─────────────────────────────────────────────────────┘  │
│                       ↕                                     │
│  ┌─────────────────────────────────────────────────────┐  │
│  │    SLEEP CONSOLIDATION (fn::sleep_consolidation)     │  │
│  │                                                       │  │
│  │  One stored proc, zero JS round-trips:                │  │
│  │  episodic→semantic, Hebbian boost, prune weak edges,  │  │
│  │  neural graph decay ×5, archive faded traces,         │  │
│  │  compact narrative                                    │  │
│  └─────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────┘
```

## Cognitive Cone (not time-based)

Processing depth determined by cognitive state, not tick counter:

| Depth | Name | Operations |
|-------|------|------------|
| 1 | LOCAL | Hot trace dynamics, affect accumulators |
| 2+ | ATTEND | Agency, speech, DB sync, batch flush |
| 3+ | REFLECT | Active cognition, predictor training, cone learning, forgetting |
| 5+ | RESTRUCTURE | Dimension naming, clusters, neural decay |
| 10+ | CONSOLIDATE | Narrative, world model rebuild |

Depth/spread are LEARNED by the cognitive cone model (9→2 neural graph).

## SurrealDB 3.0 Features Used

| Feature | Where |
|---------|-------|
| HNSW vector index | trace.position (64-dim), belief/knowledge embeddings |
| 40+ stored procedures | All cognitive logic (fn::nn_forward, fn::spread_activation, etc.) |
| ASYNC events + RETRY | cognitive_spread, cognitive_backprop, nn_hebbian |
| COMPUTED fields | nn_edge.importance, trace.effective_strength, nn_node.is_firing |
| Recursive traversal | fn::spread_recursive: ->activates->trace->activates->trace |
| Native vector:: | vector::distance::euclidean(), vector::similarity::cosine() |
| CONCURRENTLY index | Non-blocking HNSW rebuild |
| COUNT index | Fast GROUP ALL aggregations |
| DEFINE SEQUENCE | Monotonic cycle/commit counters |
| Closures (.map) | fn::nn_softmax, fn::compute_centroid |
| RELATE + TYPE RELATION | nn_edge FROM nn_node TO nn_node, activates, episodic |

## Key Rule: No Inline SQL in TypeScript

**ALL database logic lives in stored procedures.** TypeScript only calls `fn::xxx()`.

- No `UPDATE/DELETE` in TS loops
- No `this.traceGraph['db']` (private field access)
- Sequential DB calls → single stored proc
- N+1 patterns → batch stored proc (fn::batch_*)

## fn::brain_tick — The Brain Runs in SurrealDB

One stored procedure = all cognitive circuits at their natural frequencies:

```
fn::brain_tick($n) — FOR loop, all circuits:
  CRITICAL  (×100):  energy drain + sleep detection + recovery
  HIGH      (×100):  affect forward pass (nn_forward)
  TRACE     (×50):   trace weight/freshness decay
  AGENCY    (×200):  decide action (dopamine→explore, cortisol→cautious)
  MEDIUM    (×500):  active inference + forgetting
  LOW       (×2000): neural decay + episodic consolidation
  DEEP      (×5000): world model + introspection
  ├── SLEEP (energy < 0.1): fn::sleep_consolidation
  └── Phenomenal state capture → kernel_state table
```

Membrane (NestJS) only: watchdog re-kick + world↔brain translation.
All learning inside SurrealDB: three-factor Hebbian, nn_backward, eligibility traces.

Supporting tables:
- `kernel_state` — singleton: energy, fatigue, cycle, phenomenal state, scope
- `kernel_request` — kernel → NestJS (when periphery needed)
- `kernel_event` — NestJS → kernel (external events)

## NestJS = Flat Membrane

All modules are @Global with `imports: []`. Zero circular deps.
NestJS boot: **12ms**. Brain lives in SurrealDB, not in JS.

NestJS only handles:
- HTTP API (controllers)
- LLM calls (agents, when kernel requests)
- World bridge (action execution)
- Bootstrap (migrations)

## 32 Migrations

| # | Name | What |
|---|------|------|
| 001-005 | Schema + fields | Tables, types, computed fields |
| 006 | BDI | Intentions, knowledge, episodes |
| 008 | Cognitive native | Coherence, coverage, HNSW indexes |
| 010 | Kernel | Traces, edges, commit_log |
| 013 | Kernel procedures | spread_activation, forget, backprop, reinforce |
| 018 | Clustered learning | Clusters, belongs_to, HNSW |
| 021 | Native operations | find_episodic_patterns, find_high_connectivity, cognitive_metrics |
| 022 | Heavy logic to DB | drift, conflicts, schemas, consolidate, batch ops |
| 023 | Reactive events | cognitive_spread, archive, hebbian, backprop (ASYNC RETRY) |
| 024 | Neural graph | nn_node, nn_edge, fn::nn_forward/backward/softmax |
| 025 | Neural graph events | nn_hebbian, nn_decay, nn_sprout, nn_metrics |
| 026 | SurrealDB 3.0 | COMPUTED fields, vector::, batch procs, sleep_consolidation |
| 027 | Kernel in DB | kernel_state, kernel_request, kernel_event, fn::kernel_tick |
| 028 | Brain services | fn::build_world_model, fn::introspect, fn::nightly_run, fn::belief_decay |
| 029 | Preemptive scheduler | 4 circuits with semaphores, fn::kernel_start/stop/reset/status |
| 030 | Runtime model | fn::interrupt, fn::check_preemption, 3 reset classes, budget accounting |
| 031 | Parallel circuits | fn::circuit_*, archive-never-delete, fn::run_parallel_status |
| 032 | Agency circuit | fn::agency_tick, fn::process_sensory, fn::brain_tick |
| 033 | Sensorimotor | fn::process_sensory (13 channels + 16 speech = 29 numbers) |
| 034 | Three-factor learning | fn::learn_edge (Δw = η×eligibility×M), fn::decay_eligibility |

## Developmental Metrics (6 domains)

1. **Cognitive**: dimension growth, abstractions, retention, cross-modal binding
2. **Vitality**: sleep regularity, energy efficiency, fatigue resilience
3. **Affect**: valence trend, cortisol baseline, curiosity sustain, mode diversity
4. **Agency**: action diversity, explore→exploit shift, consequence learning
5. **World Model**: object coverage, prediction precision, causal understanding
6. **Neural Graph**: nodes, edges, updates, dead edges, mean weight, per-model stats

Stages: sensory → categorical → predictive → agentic → reflective

## Test Status

- **463 tests**, 38 suites, 0 failures
- Property invariants (trace weight, hormones, distance, mode probabilities)
- Convergence tests (predictor loss decreases, affect stabilizes)
- Training: 200K cycles, 1000 actions, hormones 0.5→0.978, 107 edges, traces cluster by physics
- 1M+ cognitive operations in 45s (24K+ tps)
- PhysicsWorld: 13 sensory channels + 16 speech = brain sees only 29 numbers
