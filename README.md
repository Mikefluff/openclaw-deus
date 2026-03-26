# DEUS — Cognitive Runtime

Self-recursive cognitive architecture where time, emotions, and learning emerge from system dynamics rather than being hardcoded.

## Architecture: 5-Layer Cognitive Kernel

```
                    ┌─────────────────────────────────┐
                    │     OPERATOR MESSAGE             │
                    └──────────────┬──────────────────┘
                                   │
                    ┌──────────────▼──────────────────┐
                    │   LAYER 1: AGENT SWARM           │
                    │   5 agents in parallel            │
                    │   System 1 (fast) + System 2 (LLM)│
                    │   Sensory│Predictive│Affective     │
                    │   Priority│Strategic               │
                    └──────────────┬──────────────────┘
                                   │ signals
                    ┌──────────────▼──────────────────┐
                    │   LAYER 2: TRACE GRAPH           │
                    │   Unified memory substrate        │
                    │   Spreading activation + Hebbian   │
                    │   Prediction error backprop        │
                    │   SurrealDB stored procedures      │
                    └──────────────┬──────────────────┘
                                   │ convergence
                    ┌──────────────▼──────────────────┐
                    │   LAYER 3: COMMIT KERNEL         │
                    │   Attention bottleneck            │
                    │   Typed commits (6 types)         │
                    │   Energy-based stabilization       │
                    └──────────────┬──────────────────┘
                                   │ commits
                    ┌──────────────▼──────────────────┐
                    │   LAYER 4: AFFECT MODEL          │
                    │   Gradient descent (~40 params)   │
                    │   Loss = pain + error - reward    │
                    │   Hormones → config modulation    │
                    └──────────────┬──────────────────┘
                                   │ config deltas
                    ┌──────────────▼──────────────────┐
                    │   LAYER 5: SELF-RECURSION        │
                    │   Commits trigger new signals     │
                    │   Loop until energy stabilizes    │
                    │   Guardrails vs hallucination     │
                    └──────────────┬──────────────────┘
                                   │
                    ┌──────────────▼──────────────────┐
                    │   OUTPUT: Remainder after         │
                    │   stabilization                   │
                    │   what_changed │ what_clearer     │
                    │   what_tense  │ actions_matured   │
                    └─────────────────────────────────┘
```

## Key Principles

**Time is emergent.** No `Date.now()` in the kernel. Cognitive cycles are the only clock. "Давно" = low trace weight + few reactivations. "Только что" = high freshness. "Тянулось" = many commits + high prediction error.

**Learning is real.** Not `config.adjust()` stochastic parrot. Hebbian learning on graph edges (fire together → wire together). Prediction error backpropagation through causal paths. Outcome reinforcement from episodes. Gradient descent in affect model.

**Emotions modulate cognition.** Affect model: 7 accumulators → W₁ → sigmoid → 4 hormones → W₂ → config deltas. Loss = prediction_error + pain - convergence - reward. Cortisol (stress) → conservative. Dopamine (reward) → explorative. System learns to minimize pain.

**Self-recursion IS consciousness.** The kernel doesn't process messages — it experiences them. Agents signal → traces activate → convergence → commit → commit changes world → new signals → loop. Stops when energy stabilizes, not when counter expires.

**Substrate preserved.** Current BDI pipeline (intentions, knowledge, beliefs, episodes) = reptilian brain. Kernel = neocortex on top. 22 NestJS modules, all functional.

## Stack

- **NestJS** — DI, modules, lifecycle
- **SurrealDB 3.0** — graph DB, stored procedures, HNSW vectors
- **Claude API** — LLM for extraction, deliberation, diagnosis
- **neverthrow** — Result<T,E> error handling
- **TypeScript** — strict mode

## Numbers

- 174 files, 17,200 lines TypeScript
- 29 test suites, 193 tests
- 22 NestJS modules, 18 nightly stages
- ~60 learnable config params + ~40 gradient-learned affect params
- 14 SurrealDB migrations, 4 stored procedures
- 6 commit types, 5 cognitive agents, 4 hormones

## Kernel Components

### Agent Swarm (Layer 1)
| Agent | Rank | Fast-path | Slow-path |
|-------|------|-----------|-----------|
| Sensory | 1 | Change detection, novelty, interoception | LLM: intention + knowledge extraction |
| Predictive | 2 | Bayesian priors, causal graph VOI | LLM: scenario planning |
| Affective | 3 | Hormonal state, importance scoring | Emotional charge from dynamics |
| Priority | 4 | Intention stack, ripeness, conflict detection | LLM: reprioritization |
| Strategic | 5 | Meta-learning, deliberation history | LLM: full deliberation |

### Trace Graph (Layer 2)
- **Spreading activation** via `fn::spread_activation` (SurrealDB)
- **Hebbian**: co-active traces strengthen their edge
- **Prediction error backprop** via `fn::backprop_pred_error`
- **Outcome reinforcement** via `fn::reinforce_outcome`
- **Forgetting** via `fn::forget_traces` — emotional traces decay slower

### Commit Kernel (Layer 3)
- **Convergence**: 2+ agents agree → commit
- **Escalation**: single agent urgency breakthrough
- **6 types**: perceptual, interpretive, priority, self_model, action, meta
- **Energy-based stabilization** (not counter)
- **Guardrails**: hallucination detection, self_model blocking, uncertainty monotonicity

### Affect Model (Layer 4)
```
accumulators × W₁ → sigmoid → hormones (cortisol, dopamine, NE, serotonin)
hormones × W₂ → tanh → config_deltas (6 kernel params)
hormones × W_mode → softmax → mode (explore/exploit/defensive/resting)

Loss = pred_error + pain - convergence - reward
Backward: analytical gradients, clipping [-1,1], Xavier init
Weights persisted in SurrealDB — cumulative learning across restarts
```

### Self-Recursion (Layer 5)
```
iter 0: agents process raw input
iter 1+: agents process own commits (inner dialogue)
  SensoryAgent → interoception (trace weight shifts)
  AffectiveAgent → hormonal shift signals
  PredictiveAgent → prediction errors
  → loop until energy < threshold
```

## Quick Start

```bash
npm run deus:db                          # Start SurrealDB
npx ts-node src/cli.ts bootstrap         # Migrations + seed + cognitive baseline
npx ts-node src/cli.ts metrics           # Cognitive snapshot (10 dimensions)
npx ts-node src/cli.ts diagnose          # Weakness detection (rule + LLM)
npx ts-node src/cli.ts improve           # Recursive self-improvement loop
npx ts-node src/cli.ts nightly           # 18-stage nightly pipeline
npm test                                 # 29 suites, 193 tests
```

## Project Structure

```
src/
├── kernel/                    # 5-Layer Cognitive Kernel
│   ├── agents/                # Sensory, Predictive, Affective, Priority, Strategic
│   ├── memory/                # Trace graph (Hebbian, spreading activation)
│   ├── commit/                # Attention bottleneck (typed commits, energy)
│   ├── affect/                # Gradient descent affect model
│   └── narrative/             # Temporal storytelling + commit compaction
├── cognitive/                 # Substrate: config, pipeline, causal, bayesian, temporal
├── beliefs/                   # Extraction, decay, contradiction, promotion
├── knowledge/                 # Extraction, gaps, reinforcement, vector search
├── intention/                 # BDI: recognition, dedup, stack, lifecycle
├── deliberation/              # LLM deliberation with episodes + causal context
├── experience/                # Episodes, procedures, self-assessment
├── memory/                    # Activity log, aggregation, forgetting curve
├── metrics/                   # Metrics, diagnosis, benchmarks, experiments
├── nightly/                   # 18-stage nightly pipeline
├── introspection/             # Coherence, posture
├── world-model/               # Unified reality snapshot
├── operator-model/            # Human modeling
├── policy/                    # Ripeness, dissensus
├── llm/                       # Claude API, budget, cache
├── embeddings/                # Vectors, HNSW, similarity
├── database/                  # SurrealDB, 14 migrations, 4 stored procedures
└── events/                    # WebSocket, webhooks
```

## License

Proprietary — Basilisk Labs
