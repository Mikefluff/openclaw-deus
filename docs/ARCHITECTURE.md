# DEUS Architecture

## Virtual Metabody

DEUS is not a pipeline. It's a virtual organism with a body (world interface), a brain (concept space + kernel), and a life cycle (energy, sleep, growth).

```
┌─────────────────────────────────────────────────────────┐
│                    VIRTUAL WORLD                         │
│   Objects + Physics + Mama + Weather + Surprises         │
│                                                          │
│   The world EXISTS. Events happen. The child LIVES here. │
└─────────────────────┬───────────────────────────────────┘
                      │ ambient events
                      │
┌─────────────────────▼───────────────────────────────────┐
│                 SENSORY LAYER                             │
│                                                          │
│   Raw events → Fingerprint (11 statistical features)     │
│   → Modality Discovery (online clustering)               │
│   → Attention Gating (learned, gradient descent)         │
│                                                          │
│   Modalities are DISCOVERED, not predefined.             │
│   Attention is LEARNED from prediction error reduction.  │
└─────────────────────┬───────────────────────────────────┘
                      │ gated signals
                      │
┌─────────────────────▼───────────────────────────────────┐
│                   THE BRAIN                               │
│                                                          │
│   ┌─────────────────────────────────────────────┐       │
│   │         CONCEPT SPACE (the only model)       │       │
│   │                                               │       │
│   │   Dimensions born from conflicts              │       │
│   │   Traces have positions (learned)             │       │
│   │   Clusters = categories                       │       │
│   │   Centroids = abstractions                    │       │
│   │   Trajectories = predictions                  │       │
│   │   Gradient field = desires                    │       │
│   │   Self-traces = self model                    │       │
│   │                                               │       │
│   │   Hebbian learning on all edges               │       │
│   │   Prediction error backpropagation            │       │
│   │   Spreading activation (spatial + edge-based) │       │
│   │   Forgetting = drift toward nearest schema    │       │
│   └─────────────────────────────────────────────┘       │
│                      ↕                                    │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│   │ 5 Agents │ │ Commit   │ │ Affect   │ │ Energy   │  │
│   │ (swarm)  │ │ Kernel   │ │ Model    │ │ Budget   │  │
│   │          │ │ (attn    │ │ (grad    │ │ (gates   │  │
│   │ sensory  │ │ bottle-  │ │ descent, │ │ all ops, │  │
│   │ predict  │ │ neck,    │ │ ~40      │ │ sleep,   │  │
│   │ affect   │ │ 6 typed  │ │ learned  │ │ fatigue) │  │
│   │ priority │ │ commits) │ │ params)  │ │          │  │
│   │ strategy │ │          │ │          │ │          │  │
│   └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
│                      ↕                                    │
│   ┌─────────────────────────────────────────────┐       │
│   │         ACTIVE COGNITION (idle, no LLM)      │       │
│   │                                               │       │
│   │   Episodic replay (dreaming)                  │       │
│   │   Curiosity (VOI-driven exploration)          │       │
│   │   Active inference (deduction from graph)     │       │
│   │   Schema detection (abstraction emergence)    │       │
│   └─────────────────────────────────────────────┘       │
│                      ↕                                    │
│   ┌─────────────────────────────────────────────┐       │
│   │         AGENCY (kernel decides actions)       │       │
│   │                                               │       │
│   │   Desire gradient → action selection          │       │
│   │   Curiosity → explore unknown targets         │       │
│   │   Energy gates all actions                    │       │
│   │   WorldBridge → execute in world              │       │
│   │   Consequences → learning signal              │       │
│   └─────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────┘
```

## Key Principle: One Space, All Functions

The concept space is not "one module among many." It IS the mind:

| Function | Implementation in Concept Space |
|----------|-------------------------------|
| World model | Dimensions = beliefs about structure. Positions = facts. |
| Self model | Self-traces in same space, tagged `source_type: 'self'` |
| Memory | Trace weight + freshness + reactivation count |
| Forgetting | Drift toward nearest schema (not deletion) |
| Prediction | Trajectories: position→position vectors |
| Desire | Gradient field from 5 drives |
| Categories | Spatial clusters |
| Abstractions | Cluster centroids |
| Physical laws | Stable cross-modal correlations |
| Time | Rate of reconfiguration under bandwidth constraint |

## Concurrent Modulation, Not Pipeline

Affect, energy, and attention are not sequential steps. They modulate ALL operations simultaneously:

- **Affect** modulates: activation spread width, trace emotional charge, config parameters
- **Energy** gates: LLM calls, trace creation depth, exploration vs exploitation
- **Attention** selects: which modalities get deep vs shallow processing

## Light Cone: Multi-Frequency Processing

See [LIGHT-CONE.md](LIGHT-CONE.md) for details.

Not everything runs at the same speed. Local = fast, global = slow:

| Layer | Frequency | What | Where |
|-------|-----------|------|-------|
| FAST | every tick | trace dynamics, affect, energy | in-memory |
| MEDIUM | ×5 | spreading activation | in-memory |
| SLOW | ×50 | DB sync, agency, reflection | DB |
| GLOBAL | ×200 | clustering, dimension naming | DB |
| DEEP | ×1000 | narrative, world model rebuild | DB |

Consciousness never stops. But DB operations happen on a slower cadence.
