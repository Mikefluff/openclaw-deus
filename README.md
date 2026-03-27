# DEUS — Cognitive Runtime

A virtual organism that lives in a world, learns from experience, and builds its own model of reality. Not a pipeline. Not a chatbot. A mind.

## What This Is

DEUS is a cognitive architecture where:
- **One structure holds everything** — concept space IS the world model, self model, predictions, and desires
- **Modalities are discovered**, not predefined — the system learns what "types of experience" exist
- **Abstractions emerge** from spatial clustering — "roundness" is born when balls, plates, and wheels cluster together
- **Time is emergent** — not `Date.now()` but the rate of cognitive reconfiguration
- **Emotions are learned** — gradient descent on a differentiable affect model
- **The kernel IS the agent** — it decides what to explore, when to rest, when to ask for help

## Quick Start

```bash
# Start SurrealDB
npm run deus:db

# Bootstrap (migrations + seed beliefs + cognitive baseline)
npx ts-node src/cli.ts bootstrap

# Run childhood training (child lives in virtual world)
npx ts-node src/training/childhood.ts 500

# Cognitive metrics
npx ts-node src/cli.ts metrics

# Tests
npm test   # 193 tests, 29 suites
```

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for full diagram.

```
Virtual World (objects + physics + mama)
  ↓ events
Sensory Layer (fingerprint → modality discovery → attention)
  ↓ gated signals
Brain: Concept Space + Agents + Commits + Affect + Energy
  ↓ desire gradient
Agency (kernel decides → acts through WorldBridge → learns from consequences)
```

The kernel is a continuous event loop:
- **Event arrives** → process through agents (LLM on perception, pure internal on reflection)
- **No event** → try to ACT on world (from desire gradient) → then reflect
- **Tired** → sleep (energy recovery + consolidation)
- **Stuck** → internally request LLM help (asking the adult)

## Documentation

| Document | What |
|----------|------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Virtual metabody diagram, key principles |
| [DYNAMICS.md](docs/DYNAMICS.md) | 7 update rules as equations |
| [CONCEPT-SPACE.md](docs/CONCEPT-SPACE.md) | Adaptive dimensions, spatial forgetting, verification |
| [SENSORY.md](docs/SENSORY.md) | Self-organized modality discovery, attention |
| [AFFECT.md](docs/AFFECT.md) | Gradient descent hormones, 5 drives, energy coupling |
| [AGENCY.md](docs/AGENCY.md) | WorldBridge, action selection, help requesting |
| [TRAINING.md](docs/TRAINING.md) | Virtual world, energy budget, running training |
| [LIGHT-CONE.md](docs/LIGHT-CONE.md) | Multi-frequency processing, hot memory, write batching |
| [ROADMAP.md](docs/ROADMAP.md) | Development strategy, 5 phases, success criteria |

## Numbers

```
186 files, ~21,000 lines TypeScript
29 test suites, 193 tests
22 NestJS modules
17 SurrealDB migrations, 4 stored procedures
54 database tables
5 cognitive agents, 4 hormones, 5 desire drives
6 commit types, 6 child actions
~60 learnable config params + ~40 gradient-learned affect params
```

## Stack

- **NestJS** — dependency injection, modules, lifecycle
- **SurrealDB 3.0** — graph DB, stored procedures, HNSW vectors
- **Claude API** — LLM for perception (extraction, deliberation)
- **neverthrow** — Result<T,E> error handling
- **TypeScript** — strict mode, zero `as any` in source

## Project Structure

```
src/
├── kernel/                    # The Brain
│   ├── kernel-loop.service    # Continuous event loop + agency
│   ├── agency.types           # WorldBridge, AgentAction
│   ├── energy.service         # Cognitive energy budget
│   ├── agents/                # 5 cognitive agents (sensory→strategic)
│   ├── memory/                # Trace graph (Hebbian, spreading activation)
│   ├── space/                 # Concept space (dimensions, clusters, positions)
│   ├── sensory/               # Modality discovery, fingerprinting, attention
│   ├── commit/                # Attention bottleneck (typed commits, energy)
│   ├── affect/                # Gradient descent affect model
│   ├── cognition/             # Active cognition (dreaming, curiosity, inference)
│   ├── narrative/             # Commit compaction, temporal storytelling
│   └── substrate-bridge       # Reptilian brain ↔ traces ↔ world model
├── cognitive/                 # Substrate services
├── training/                  # Virtual world + childhood runner
├── beliefs/                   # Belief system
├── knowledge/                 # Knowledge extraction + gaps
├── intention/                 # BDI intentions
├── deliberation/              # LLM deliberation
├── experience/                # Episodes, procedures, self-assessment
├── memory/                    # Activity log, aggregation
├── metrics/                   # Cognitive metrics, diagnosis, benchmarks
├── nightly/                   # 18-stage nightly pipeline
└── ...                        # world-model, policy, llm, embeddings, database, events
```

## License

Proprietary — Basilisk Labs
