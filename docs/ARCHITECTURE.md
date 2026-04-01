# DEUS Architecture

## Philosophy

DEUS is a pre-linguistic cognitive engine. Not a pipeline. Not a chatbot wrapper. A **living kernel** where:
- The brain lives INSIDE SurrealDB as a graph
- Neural networks ARE graph relations (weights = edges, neurons = nodes)
- Forward pass = graph traversal. Backward pass = edge weight update.
- JS is only the membrane between brain and world (2 roundtrips per tick)
- All heavy computation runs in SurrealDB stored procedures (Rust)
- Traces are **immutable** — mutable state lives in trace_state (Pointer Architecture)
- Identity = topology. Archive never delete. Energy = rewrite cost.

```
┌─────────────────────────────────────────────────────────────┐
│               EVOLVING WORLD (the teacher)                   │
│                                                              │
│  12 objects with HIDDEN physics (mass, hardness, fragility)  │
│  6 actions (touch, push, drop, shake, look, squeeze)         │
│  Object states: wet, flipped, warm (weather events)          │
│  5 progressive levels, auto level-up by maturity             │
│  Boredom penalty on repeated same-action-same-object         │
└──────────────────────┬───────────────────────────────────────┘
                       │ 13 sensory channels + 16 speech = 29 numbers
                       │
┌──────────────────────▼───────────────────────────────────────┐
│              MEMBRANE (2 roundtrips per world tick)            │
│                                                               │
│  fn::world_tick($events, 100)    → perceive + think + decide  │
│  fn::action_consequence(...)     → outcome + cognitive cycle   │
│  No inline SQL. No business logic. Just translate.            │
└──────────────────────┬───────────────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────────────┐
│              THE BRAIN (lives in SurrealDB)                    │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  POINTER ARCHITECTURE (Migration 045)                    │ │
│  │                                                          │ │
│  │  trace (IMMUTABLE): content, position[64], source_type   │ │
│  │  trace_state (MUTABLE): weight, freshness, charge, cycle │ │
│  │  trace_history (APPEND-ONLY): reactivation log           │ │
│  │  learning_event (APPEND-ONLY): edge weight change log    │ │
│  │  config_snapshot (APPEND-ONLY): config at cycle N        │ │
│  │  _cfg_cache: single-record config (avoids N reads)       │ │
│  └─────────────────────────────────────────────────────────┘ │
│                         ↕                                      │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  COGNITIVE CYCLE (Migration 043, per sensory event)      │ │
│  │                                                          │ │
│  │  1. APPRAISE  — salience = |valence| + novelty + RPE    │ │
│  │  2. RETRIEVE  — Q-values from action_value table         │ │
│  │  3. PREDICT   — RPE = actual - predicted → DA spike      │ │
│  │  4. DELIBERATE — Q(action, trace) += lr × RPE            │ │
│  │  5. COMMIT    — CREATE cognitive_event (causal log)      │ │
│  │  6. LEARN     — three-factor Hebbian + mode REINFORCE    │ │
│  └─────────────────────────────────────────────────────────┘ │
│                         ↕                                      │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  AFFECT MODEL (phasic/tonic hormones)                    │ │
│  │                                                          │ │
│  │  7 acc → 4 hormones → 8 config + 4 mode outputs         │ │
│  │  Hormones: DA τ=30, NE τ=20, sero τ=200, cort τ=500    │ │
│  │  Config: log-space self-modulation (170+ params)         │ │
│  │  Mode: explore/exploit/defensive/resting (REINFORCE)     │ │
│  └─────────────────────────────────────────────────────────┘ │
│                         ↕                                      │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  STRUCTURAL PLASTICITY (Migration 047)                   │ │
│  │                                                          │ │
│  │  fn::grow_synaptic_elements — Gaussian growth curve      │ │
│  │  fn::edge_sprout — distance-weighted, element-based      │ │
│  │  fn::edge_death — inactivity + competitive pruning       │ │
│  │  Sleep: Tononi SHY (weak×0.9, strong×1.05) + replay     │ │
│  └─────────────────────────────────────────────────────────┘ │
│                         ↕                                      │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  DEVELOPMENTAL STAGES (Migration 042)                    │ │
│  │                                                          │ │
│  │  Newborn: high drain (0.01), fast fatigue, frequent sleep│ │
│  │  Maturity metric: convergence + edges + prediction + div │ │
│  │  Auto level-up when maturity > 0.7                       │ │
│  │  Endurance grows via affect output (log-space)           │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

## fn::brain_tick — The Brain Runs in SurrealDB

One stored procedure = all cognitive circuits at their natural frequencies:

```
fn::brain_tick($n) — FOR loop, all circuits:
  CRITICAL (×100):  energy drain + sleep detection → fn::sleep_consolidation
  HIGH     (×100):  hormone decay + affect fwd/bwd + config deltas + ECAN rent
  TRACE    (×50):   trace_state weight/freshness decay (lightweight, no position)
  AGENCY   (×200):  value-based action selection (Q-values + UCB1 exploration)
  MEDIUM   (×500):  spreading + forgetting + meta-modulation + ECAN hebbian update
  LOW      (×2000): consolidation + plasticity + patterns + ECAN create/forget
  DEEP     (×5000): world model + introspection + PLN inference chains
```

## fn::world_tick + fn::action_consequence — Single-Tick Architecture

```
MEMBRANE (2 roundtrips):
  1. fn::world_tick($events, 100)     → perceive ambient + brain_tick + return action
  2. fn::action_consequence(...)      → process outcome + cognitive_cycle
```

Before: 8 roundtrips/tick. After: 2. **55% speedup** (187s → 85s per 1K ticks).

## SurrealDB 3.0 Features Used

| Feature | Where |
|---------|-------|
| HNSW vector index | trace.position (64-dim), vector KNN retrieval |
| 60+ stored procedures | All cognitive logic inside DB |
| Closures (.map) | Softmax, batch computation, array transforms |
| RELATE + TYPE RELATION | nn_edge, activates, episodic |
| Native vector:: | cosine_similarity for edge learning + sprouting |
| $parent in subquery | Batch edge sum computation (affect_forward_output) |
| Indexes | trace(content,archived), nn_node(node_id), action_value(key) |

## Key Rules

1. **No inline SQL in TypeScript** — all logic in stored procs
2. **Zero hardcode in brain** — ALL 159 coefficients from kernel_state.config
3. **Archive never delete** — Pointer Architecture, trace_history, learning_event
4. **Non-blocking kernel** — NestJS onModuleInit never blocks

## 47 Migrations

| # | Name | What |
|---|------|------|
| 001-005 | Schema + fields | Tables, types, computed fields |
| 006 | BDI | Intentions, knowledge, episodes |
| 008-013 | Cognitive native | Coherence, HNSW, kernel procedures |
| 018-023 | Learning | Clusters, heavy logic, reactive events |
| 024-026 | Neural graph | nn_node, nn_edge, fn::nn_forward/backward, SurrealDB 3.0 |
| 027-031 | Kernel | kernel_state, preemptive scheduler, parallel circuits |
| 032-035 | Sensorimotor | fn::agency_tick, fn::process_sensory, three-factor Hebbian, zero hardcode |
| **036** | Graph×vector | Cosine-modulated learn_edge, prune_dissimilar, graph_vector_retrieve |
| **037** | Graph×vector wiring | Cosine spreading, vector pruning, 78→159 config params |
| **038** | Hormone differentiation | Per-hormone targets + targeted backward |
| **039** | Phasic/tonic hormones | Spike+decay: DA τ=30, NE τ=20, sero tonic, cort τ=500 |
| **040** | Wire affect output | Config deltas (tanh→log-space) + mode softmax |
| **041** | Self-tuning brain | Log-space modulation, REINFORCE mode, consolidation replay |
| **042** | Developmental stages | Newborn defaults, maturity metric, auto level-up |
| **043** | Cognitive cycle | RPE, Q-learning, salience gating, causal log (cognitive_event) |
| **044** | Single-tick | fn::world_tick + fn::action_consequence (8→2 roundtrips) |
| **045** | Pointer architecture | Immutable trace + trace_state + trace_history + learning_event |
| **046** | Pointer fixes | All functions → trace_state reads, edge sprout O(1), salience fix |
| **047** | Structural plasticity | Gaussian growth, distance sprouting, competitive pruning, Tononi SHY |

## Training Results (Latest: 5K ticks developmental)

- **631 edges** — sprouted by structural plasticity (distance-weighted)
- **RPE = 0.046** — brain predicts outcomes with 4.6% error
- **pred = 0.91** — 91% prediction quality
- **177+ Q-values** — brain knows which actions work on which objects
- **Hormones differentiated**: DA=0.97 (reward), NE=0.23 (arousal), cort=0.21 (stress), sero=0.04
- **Config self-tunes**: energy drain 0.01→0.0095, lr 0.01→0.0099
- **Auto level-up** at maturity 0.7 (convergence + edges + prediction + diversity)
- **20 sleep events** per 1K ticks (newborn brain)
- **85s per 1000 ticks** (single-tick architecture)
