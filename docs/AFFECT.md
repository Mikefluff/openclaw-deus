# Affect Model — Neural Graph Homeostasis

## Architecture

NOT JS matrices. Neural network weights are GRAPH EDGES in SurrealDB.

```
7 acc nodes (nn_node)         4 hormone nodes           6 config nodes + 4 mode nodes
[acc:pred_error]              [hormone:cortisol]        [config:convergence_threshold]
[acc:tension]    ──nn_edge──> [hormone:dopamine]    ──> [config:spread_factor]
[acc:pain]       (28 edges)   [hormone:norepinephrine]  [config:hebbian_lr]
[acc:convergence]             [hormone:serotonin]       [config:energy_threshold]
[acc:reward]                       │                    [config:activation_boost]
[acc:novelty]                      │ ──nn_edge──>       [config:freshness_decay]
[acc:stability]                    │ (24 edges)
                                   │
                                   └──nn_edge──> [mode:explore|exploit|defensive|resting]
                                      (16 edges)

Forward:  fn::nn_forward("affect", "input", "hidden")  → hormones (sigmoid)
          fn::nn_forward("affect", "hidden", "output") → config deltas (tanh)
          fn::nn_softmax("affect", "mode")             → mode probabilities

Backward: fn::nn_backward_layer("affect", "input", "hidden", lr, sign)
          fn::nn_backward_layer("affect", "hidden", "output", lr, sign)
          fn::nn_backward_layer("affect", "hidden", "mode", lr, sign)

Loss = acc:pred_error + acc:pain - acc:convergence - acc:reward
```

All forward/backward passes execute in SurrealDB (Rust). JS only sets accumulator values and reads results.

## Accumulator Update (JS arithmetic only)

Accumulators updated from commit metrics:
- `pred_error`: avgPredError + avgUrgency × 0.3 + baseActivity × 0.2
- `tension`: escalations × 0.3 + baseActivity × 0.1
- `pain`: only via inflictPain()
- `convergence`: convergentCommits × 0.2 + (1 - avgPredError) × baseActivity
- `reward`: only via reward()
- `novelty`: avgNovelty + baseActivity × 0.3
- `stability`: (1 - novelty_rate) × 0.2

Decay: all × (1 - decay_rate), clamped to [0, 5].

## Learning (verified working)

- Forward: accumulators → weighted sum → sigmoid → hormones (**0.5 → 0.978 confirmed**)
- Backward: fn::nn_backward with loss = pred_error + pain - convergence - reward
- Correct activation derivatives: sigmoid f'=x(1-x), tanh f'=1-x²
- SurrealDB #6382 workaround: LET binding to isolate ?? from +
- Accumulator decay 0.99× per learning step (slow, carries signal between batches)
- Neural weights 0.19 → 0.95 after 200 world ticks (636 backward updates)

## Three-Factor Hebbian on Trace Edges

- fn::learn_edge: Δw = η × eligibility × M (Frémaux & Gerstner 2016)
- M = dopamine × TD_error + (1-dopamine) × surprise
- TD_error = valence + γ×target.weight - source.weight
- Surprise = 1 - exp(-pred_error²)
- Eligibility traces decay per cycle: e *= γ×λ
- 107 edges created after 200 world ticks

## Five Drives (Desire Gradient)

1. **Pain avoidance**: repel from failed episode positions
2. **Novelty hunger**: attract toward high-VOI, knowledge gaps
3. **Uncertainty aversion**: attract toward tight clusters
4. **Mastery drive**: attract toward high-confidence self-traces
5. **Prediction accuracy**: repel from high prediction error regions

## Energy Coupling

- Positive affect (reward) partially restores energy
- Negative affect (pain) drains energy faster
- Low energy → attention narrows, forgetting accelerates
- Sleep: fn::sleep_consolidation() — neural decay ×5, Hebbian boost, prune
