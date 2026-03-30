# Cognitive Cone — Learned Processing Depth

## Principle

NOT time-based cadence. NOT hardcoded if-else. A LEARNED model that determines how deep and wide to process based on cognitive state.

The cognitive cone replaces fixed tick cadence with a differentiable attention policy:
- **Depth**: how many graph hops to traverse (1-10)
- **Spread**: how many traces to attend to (3-50)
- Both are OUTPUT of a neural graph model that learns from experience

## Neural Graph Architecture

```
9 input nodes                          2 output nodes
[cone_in:cortisol]                     [cone_out:depth]  (sigmoid → scale to 1-10)
[cone_in:dopamine]     ──nn_edge──>    [cone_out:spread] (sigmoid → scale to 3-50)
[cone_in:norepinephrine] (18 edges)
[cone_in:serotonin]
[cone_in:energy]
[cone_in:fatigue]
[cone_in:activation]
[cone_in:novelty]
[cone_in:pred_error]

Forward: fn::nn_forward("cone", "input", "output")
Backward: fn::nn_backward("cone", lr, loss_sign)

Loss = processing_cost - information_gain
     = (depth × spread × 0.001) - prediction_error_reduction
```

Active intention further boosts depth: `depth += intention.priority × 2`

## Processing Layers

| Depth | Name | Operations |
|-------|------|------------|
| 1 (always) | LOCAL | Hot trace dynamics, affect accumulators (in-memory, ~1ms) |
| 2+ | ATTEND | Agency, speech, DB flush, batch edge updates |
| 3+ | REFLECT | Active cognition, predictor training, cone learning, graph conflicts, forgetting |
| 5+ | RESTRUCTURE | Dimension naming, cluster materialization, fn::nn_decay_all |
| 10+ | CONSOLIDATE | Narrative compaction, world model rebuild |

## LightCone (Hot Memory)

In-memory cache for FAST operations (no DB round-trips):
- `hotTraces`: Map of active traces with weight, freshness, emotional charge
- `pendingCreates/Links/Reactivations`: queued for batch flush to DB
- `flushWrites()`: returns accumulated writes + edge updates

All DB operations happen at ATTEND depth (2+) via:
- `traceGraph.flushToDb()` — batch create/reactivate/link
- `traceGraph.flushBatchEdgeUpdates()` — fn::batch_update_edges
- `sensorimotorPredictor.flushTransitions()` — fn::batch_insert_transitions

## Sleep Consolidation

When energy depleted → fn::sleep_consolidation() (one stored proc):
1. Episodic → semantic edge promotion
2. Hebbian boost (co_activation > 5)
3. Synaptic homeostasis (weak edges decay)
4. Dead synapse pruning (< 0.02 deleted)
5. Neural graph decay ×5 (all 3 models)
6. Trace archival (effective_strength < 0.02)
7. Narrative frame compaction
