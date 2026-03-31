# Affect Model — Phasic/Tonic Neuromodulator Dynamics

## Architecture

Neural network weights are GRAPH EDGES in SurrealDB. Hormones are now **dynamic**: phasic spikes that decay + tonic baselines that drift.

```
7 acc nodes (nn_node)         4 hormone nodes (phasic+tonic)   6 config nodes + 4 mode nodes
[acc:pred_error]              [hormone:cortisol]               [config:convergence_threshold]
[acc:tension]    ──nn_edge──> [hormone:dopamine]    ──>        [config:spread_factor]
[acc:pain]       (28 edges)   [hormone:norepinephrine]         [config:hebbian_lr]
[acc:convergence]             [hormone:serotonin]              [config:energy_threshold]
[acc:reward]                       │                           [config:activation_boost]
[acc:novelty]                      │ ──nn_edge──>              [config:freshness_decay]
[acc:stability]                    │ (24 edges)
                                   │
                                   └──nn_edge──> [mode:explore|exploit|defensive|resting]
                                      (16 edges)
```

## Phasic/Tonic Model (Migration 039)

Each hormone node stores: `{ value, phasic, tonic, tau }`

**Update rule per HIGH tick:**
```
phasic *= (1 - 1/τ)                          -- exponential decay
tonic += drift_rate × (forward_target - tonic) -- slow drift to NN output
value = clamp(tonic + phasic, 0, 1.2)         -- effective level
```

**Spike injection on events:**
```
fn::hormone_spike('dopamine', magnitude)
phasic = clamp(phasic + magnitude, -cap, +cap) -- cap=0.5
```

## Per-Hormone Dynamics

| Hormone | τ (ticks) | Spike triggers | Role |
|---------|-----------|----------------|------|
| **Dopamine** | 30 | New trace (+0.1), reward (+0.2×valence) | Reward prediction error, exploration drive |
| **Norepinephrine** | 20 | New trace (+0.15), valence flip (+0.25) | Alertness, surprise, gain control |
| **Serotonin** | 200 | None (tonic only) | Contentment, patience, rises from convergence |
| **Cortisol** | 500 | Pain (+0.4×|valence|), pred_error (+0.1) | Stress, very slow decay like HPA axis |

## Verified Dynamics (300 tick test)

```
t=0   sero=0.50(ph=0.00)  dopa=0.70(ph=0.20)  nore=0.79(ph=0.29)  cort=0.50(ph=0.00)
t=60  sero=0.58(ph=0.00)  dopa=0.81(ph=0.23)  nore=0.68(ph=0.11)  cort=0.58(ph=0.00)
t=150 sero=0.68(ph=0.00)  dopa=1.08(ph=0.41)  nore=0.83(ph=0.15)  cort=0.68(ph=0.00)
t=270 sero=0.75(ph=0.00)  dopa=1.12(ph=0.37)  nore=0.80(ph=0.05)  cort=0.75(ph=0.00)
```

- **Dopamine**: pulsating 0.7-1.15 (spikes on new traces + reward)
- **NE**: fast spikes 0.29 → decays quickly → new spike → decays
- **Serotonin**: smooth tonic rise 0.50 → 0.75 (satisfaction accumulates)
- **Cortisol**: same tonic rise (no pain events at level 0)

## Accumulator Sources

**New trace (never seen before):**
- acc:novelty += 0.2, acc:pred_error += 0.3
- Dopamine spike (novelty is rewarding)
- Norepinephrine spike (new = unexpected)

**Reactivation (seen before):**
- acc:convergence += 0.1, acc:stability += 0.15
- NO phasic spikes (familiar = not surprising)
- Serotonin rises via tonic drift from convergence

**Valence flip (outcome changed sign):**
- acc:tension += 0.3, acc:pred_error += 0.3
- NE spike (surprise)

**Positive valence > threshold:**
- acc:reward += valence
- Dopamine spike

**Negative valence < -threshold:**
- acc:pain += |valence|
- Cortisol spike, negative dopamine spike

## Targeted Backward Learning (Migration 038)

Per-hormone error signals instead of single scalar loss:
```
fn::affect_backward_targeted(lr):
  for each hormone:
    target = fn::compute_hormone_targets()  -- per-hormone target from accumulators
    error = target - hormone.value
    deriv = value × (1 - value)             -- sigmoid derivative
    Δw = lr × error × deriv × input_value   -- per-edge update
```

Hormone targets:
- Cortisol target = f(pain, pred_error, -convergence, tension)
- Dopamine target = f(reward, novelty, -pain)
- NE target = f(pred_error, novelty, tension)
- Serotonin target = f(convergence, stability, -pain, -pred_error)

## Three-Factor Hebbian on Trace Edges

- fn::learn_edge: Δw = η × eligibility × M × cosine_similarity (Frémaux & Gerstner 2016)
- M = dopamine.value × TD_error + (1-dopamine.value) × surprise
- Dopamine's phasic component amplifies learning during reward events
- Cosine similarity between trace positions modulates learning strength

## Five Drives (Desire Gradient)

1. **Pain avoidance**: cortisol spike → repel from painful actions
2. **Novelty hunger**: dopamine spike → attract toward new experiences
3. **Uncertainty aversion**: NE decay → settle toward familiar patterns
4. **Mastery drive**: serotonin tonic rise → sustained engagement
5. **Prediction accuracy**: NE spike on error → model update

## Energy Coupling

- Positive affect (dopamine > baseline) partially restores energy
- Negative affect (cortisol spike) drains energy faster
- Low energy → attention narrows, forgetting accelerates
- Sleep: fn::sleep_consolidation() — neural decay ×5, Hebbian boost, prune

## Config Parameters (78 total, ALL from kernel_state.config)

Spike magnitudes, τ decay rates, tonic drift rate, phasic cap, hormone min/max, accumulator thresholds — all affect-modulatable via config deltas.
