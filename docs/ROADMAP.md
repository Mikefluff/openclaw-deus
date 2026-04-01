# DEUS Roadmap

## Current State (v3.1)

- **53 migrations** — full cognitive engine + AtomSpace-inspired features in SurrealDB
- **80+ stored procedures** — brain_tick, cognitive_cycle, ECAN, PLN, DualLink, frames, etc.
- **170+ config parameters** — ALL self-tunable via affect model
- **Pointer Architecture** — immutable traces + append-only state/history
- **12 objects**, 6 actions, weather events, boredom penalty
- **Cognitive cycle**: perceive → appraise → predict → deliberate → commit → learn
- **Structural plasticity**: Gaussian growth, HNSW-accelerated sprouting, competitive pruning
- **AtomSpace features**: HNSW vectors, meta-edges, patterns, DualLink, FormulaStream, frames, ECAN, PLN
- **SurrealDB SDK 2.0.3** — WebSocket connections, sessions, transactions

## Completed Phases

| # | Phase | Key Feature |
|---|-------|-------------|
| 1 | Core schema | Tables, BDI, cognitive fields |
| 2 | Neural graph | nn_node, nn_edge, fn::nn_forward/backward |
| 3 | Kernel in DB | fn::kernel_tick, kernel_state, self-triggering events |
| 4 | Brain services | fn::build_world_model, fn::introspect, fn::nightly_run |
| 5 | Preemptive scheduler | 4 circuits, interrupts, 3 reset classes |
| 6 | Agency | fn::agency_tick, fn::process_sensory, fn::brain_tick |
| 7 | Sensorimotor | 13 channels + 16 speech, PhysicsWorld |
| 8 | Three-factor learning | Δw = η × eligibility × M (Frémaux & Gerstner) |
| 9 | Zero hardcode | ALL coefficients from config, affect-modulatable |
| 10 | Graph×vector | Cosine-modulated learning, hybrid retrieval |
| 11 | Phasic/tonic hormones | DA τ=30, NE τ=20, sero tonic, cort τ=500 |
| 12 | Self-tuning brain | Log-space config modulation, REINFORCE mode learning |
| 13 | Developmental stages | Newborn→mature, auto level-up by maturity |
| 14 | Cognitive cycle | RPE, Q-learning, salience gating, causal log |
| 15 | Single-tick architecture | 8→2 roundtrips (55% speedup) |
| 16 | Pointer architecture | Immutable traces, trace_state, trace_history, learning_event |
| 17 | Structural plasticity | Gaussian growth, distance sprouting, competitive pruning, Tononi SHY |
| 18 | AtomSpace core (052) | HNSW vector index, recursive spreading, meta-edges (modulates/gates/context_of), queries-as-data (graph_pattern), SDK 2.0.3 + WebSocket |
| 19 | AtomSpace advanced (053) | DualLink (inverted search), FormulaStream (reactive activation), term unification, graph frames, ECAN (HebbianLinks + rent + forgetting), PLN (deduction + modus ponens) |
| 20 | Membrane WebSocket | sensory_input table, fn::brain_tick_auto(), ws:// everywhere |

## Next Priorities

### Near-term
1. **Sheaves** — section extraction from trace graph for grammar/structure learning (bridge to language emergence)
2. **Sensorimotor predictor** — brain predicts next sensory state, RPE from prediction error (not just valence)
3. **Long training runs** — 50K+ ticks, persistent storage, overnight training
4. **PLN rule engine** — automated rule selection (which PLN rule to fire when), URE-style

### Medium-term
5. **Language emergence** — speech channel → symbol grounding → naming games (5-phase plan)
6. **Self-model** — introspection creates traces about own cognitive state
7. **Causal reasoning** — traverse cognitive_event graph to learn causal chains
8. **Multi-world transfer** — train on different PhysicsWorld instances, test generalization

### Long-term
9. **Personality as scheduler policy** — different budget ratios = different "personalities"
10. **Formal verification** — σ_F consistency filter, energy accounting, identity preservation proofs

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Migrations | 53 | 60+ |
| Stored procs | 80+ | 100+ |
| Config params | 170+ | 200+ |
| AtomSpace features | 13 | 20+ |
| HebbianLinks | 5+ | 100+ |
| PLN inferred edges | 0 (needs beliefs) | 50+ |
| Edges (structural) | 95+ | 2000+ |
| Speed | ~1.8s/world tick | < 0.5s/world tick |
