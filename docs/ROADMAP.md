# DEUS Roadmap

## Current State (v3.0)

- **47 migrations** — full cognitive engine in SurrealDB
- **60+ stored procedures** — brain_tick, cognitive_cycle, process_sensory, etc.
- **159 config parameters** — ALL self-tunable via affect model
- **Pointer Architecture** — immutable traces + append-only state/history
- **12 objects**, 6 actions, weather events, boredom penalty
- **Cognitive cycle**: perceive → appraise → predict → deliberate → commit → learn
- **Structural plasticity**: Gaussian growth, distance-weighted sprouting, competitive pruning

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

## Next Priorities

### Near-term
1. **SurrealMX time-travel** — Docker with `mem://?versioned=true&aol=async&snapshot=60s` for cognitive state replay via VERSION queries
2. **Reasoning graphs** — store chain-of-thought as graph edges (evaluated/decided pattern from SurrealDB blog)
3. **Long training runs** — 50K+ ticks, persistent storage, overnight training
4. **Sensorimotor predictor** — brain predicts next sensory state, RPE from prediction error (not just valence)

### Medium-term
5. **Language emergence** — speech channel → symbol grounding → naming games (5-phase plan in SENSORIMOTOR-INTERFACE.md)
6. **Self-model** — introspection creates traces about own cognitive state
7. **Causal reasoning** — traverse cognitive_event graph to learn causal chains
8. **Multi-world transfer** — train on different PhysicsWorld instances, test generalization

### Long-term
9. **NestJS membrane** — connect brain to HTTP API, LLM agents, real-world interaction
10. **Personality as scheduler policy** — different budget ratios = different "personalities"
11. **Formal verification** — σ_F consistency filter, energy accounting, identity preservation proofs

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Migrations | 47 | 55+ |
| Stored procs | 60+ | 80+ |
| Config params | 159 | 200+ |
| RPE (1K ticks) | 0.046 | < 0.02 |
| Q-values learned | 177 | 500+ |
| Edges (structural) | 631 | 2000+ |
| Auto level-ups | 4 per 5K | stable development |
| Speed | 85s/1K ticks | < 50s/1K |
| Boot time | 12ms (NestJS) | < 10ms |
