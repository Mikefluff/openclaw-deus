# DEUS — Cognitive Runtime

A mind, not a pipeline. Self-recursive cognitive architecture where time, emotions, abstractions, and world model emerge from one unified structure — the adaptive concept space.

## Core Idea

One structure holds everything: world model, self model, predictions, desires, memory.

```
              CONCEPT SPACE = THE MIND
             /       |       |        \
        World      Self    Predict    Desire
        (dims +    (self-  (trajec-  (gradient
         positions  traces  tories)   field:
         clusters)  same             attract +
                    space)           repel)
```

- **Dimensions are born from conflicts.** "Ball rolls, cube doesn't" → shape-axis emerges
- **Traces have positions.** New facts are placed near similar knowledge
- **Abstractions are centroids.** {ball, plate, wheel} cluster → "roundness" emerges at center
- **Time is emergent.** Not `Date.now()` — commit density × novelty × prediction error
- **Emotions are learned.** Gradient descent affect model, not keyword matching
- **Self-reflection is autonomous.** Inner dialogue runs without LLM — pure trace dynamics

## Architecture

### Continuous Event Loop

```
KERNEL (always running):
  Event in queue? → process (LLM on perception, then pure internal reflection)
  No event?       → idle thinking: dreaming, curiosity, inference, schemas

  Sleep modulated by arousal:
    high arousal → 50ms  (active thinking)
    low arousal  → 2000ms (resting)
    learning mode → 500ms (steady study)
```

### 5 Layers

| Layer | What | How |
|-------|------|-----|
| **Agent Swarm** | 5 agents in parallel (sensory→strategic) | System 1 fast-path + System 2 LLM slow-path |
| **Trace Graph** | Unified memory with Hebbian learning | SurrealDB stored procedures: spread_activation, forget, backprop, reinforce |
| **Commit Kernel** | Attention bottleneck | Convergence detection, 6 typed commits, energy-based stabilization |
| **Affect Model** | Gradient descent hormones (~40 params) | Loss = pain + error - reward. Accumulators → sigmoid → hormones → config deltas |
| **Concept Space** | Adaptive N-dimensional world model | Dimensions born from conflicts, traces have positions, abstractions = centroids |

### Cognitive Agents

| Agent | Rank | Role |
|-------|------|------|
| Sensory | 1 | Change detection, novelty, interoception (senses own state changes) |
| Predictive | 2 | Prediction errors, causal graph VOI, trajectory tracking |
| Affective | 3 | Hormonal state, pain/reward detection from system dynamics |
| Priority | 4 | Intention conflicts, urgency from phenomenal state |
| Strategic | 5 | Full deliberation with episode + causal + temporal context |

### Active Cognition (idle, no LLM)

| Process | What |
|---------|------|
| **Episodic Replay** | Re-live past episodes through trace graph (failures first) — like dreaming |
| **Curiosity** | VOI from causal graph + knowledge gaps → intrinsic exploration motivation |
| **Active Inference** | "A strongly implies B but B is weak" → boost B. Deduction from graph structure |
| **Schema Detection** | Co-activation count > threshold → abstract hub trace emerges |
| **Abstraction** | Cluster centroid = category concept. Property words across 3+ traces → [PROPERTY] trace |

### Concept Space (Gärdenfors-inspired)

```
"мячик круглый, катится" → trace at []
"кубик угловатый"        → CONFLICT → DIMENSION BORN: axis_0
  мячик → [+1], кубик → [-1]

"тарелка круглая" → projected near мячик → [+0.8]
"коробка угловатая" → near кубик → [-0.7]

axis_0 named: "круглый ↔ угловатый"

Cluster {мячик, тарелка, колесо} → centroid IS "круглое"
```

### Affect Model (learned, not hardcoded)

```
7 accumulators × W₁ → sigmoid → 4 hormones (cortisol, dopamine, NE, serotonin)
hormones × W₂ → tanh → 6 config deltas
hormones × W_mode → softmax → mode (explore/exploit/defensive/resting)

Loss = pred_error + pain - convergence - reward
Backward: analytical gradients, clipping, Xavier init
Weights persisted in SurrealDB — cumulative across restarts
```

### Unified World Model

Concept space IS the world model. No separate SQL snapshot.

| Aspect | Source |
|--------|--------|
| World structure | Dimensions (each = a learned distinction) |
| Facts | Trace positions |
| Categories | Spatial clusters |
| Self-knowledge | Self-traces in same space |
| Predictions | Trajectories (position→position vectors) |
| Desires | Gradient field (attractors from success, repellers from pain) |
| Coherence | Cluster tightness |
| Gaps | Empty regions where traces should exist |

## Stack

- **NestJS** — DI, modules, lifecycle
- **SurrealDB 3.0** — graph DB, stored procedures, HNSW vectors
- **Claude API** — LLM for perception (extraction, deliberation)
- **neverthrow** — Result<T,E>
- **TypeScript** — strict mode

## Numbers

```
~18,500 lines TypeScript
176 files
29 test suites, 193 tests
22 NestJS modules
18 nightly stages
16 SurrealDB migrations
~60 learnable config params
~40 gradient-learned affect params
6 commit types
5 cognitive agents
4 SurrealDB stored procedures
4 hormones
```

## Learning Mode

```typescript
kernel.startLearning('geometric shapes');
// System proactively studies during idle:
// - Uses LLM as "teacher" every ~3 cycles
// - Adaptive curriculum from prediction errors + knowledge gaps
// - Monitor: kernel.getLearningProgress()
kernel.stopLearning();
```

## Quick Start

```bash
npm run deus:db                          # Start SurrealDB
npx ts-node src/cli.ts bootstrap         # Migrations + seed + cognitive baseline
npx ts-node src/cli.ts metrics           # Cognitive snapshot
npx ts-node src/cli.ts diagnose          # Weakness detection
npx ts-node src/cli.ts improve           # Recursive self-improvement
npx ts-node src/cli.ts nightly           # 18-stage nightly pipeline
npx ts-node src/training/childhood.ts    # Train like a child (shapes curriculum)
npm test                                 # 29 suites, 193 tests
```

## Project Structure

```
src/
├── kernel/                    # Cognitive Kernel
│   ├── kernel-loop.service    # Continuous event loop (the mind's main process)
│   ├── agents/                # Sensory, Predictive, Affective, Priority, Strategic
│   ├── memory/                # Trace graph (Hebbian, spreading activation)
│   ├── space/                 # Adaptive concept space (dimensions, positions, clusters)
│   ├── commit/                # Attention bottleneck (typed commits, energy)
│   ├── affect/                # Gradient descent affect model
│   ├── cognition/             # Active cognition (dreaming, curiosity, inference, schemas)
│   ├── narrative/             # Temporal storytelling + commit compaction
│   └── substrate-bridge       # Sync reptilian brain ↔ traces ↔ world model
├── cognitive/                 # Substrate: config, pipeline, causal, bayesian, temporal, meta-learning
├── beliefs/                   # Extraction, decay, contradiction, promotion
├── knowledge/                 # Extraction, gaps, reinforcement, vector search
├── intention/                 # BDI: recognition, dedup, stack, lifecycle
├── deliberation/              # LLM deliberation with full context
├── experience/                # Episodes, procedures, self-assessment
├── memory/                    # Activity log, aggregation, forgetting curve
├── metrics/                   # Cognitive metrics, diagnosis, benchmarks, experiments
├── nightly/                   # 18-stage nightly pipeline
├── world-model/               # Delegates to concept space (spatial world model)
├── training/                  # Childhood curriculum (instance-based learning)
└── ...                        # introspection, policy, llm, embeddings, database, events, auth, health
```

## License

Proprietary — Basilisk Labs
