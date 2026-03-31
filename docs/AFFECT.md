# Affect Model — Phasic/Tonic Neuromodulators + Self-Tuning Config

## Architecture

```
7 accumulators (nn_node)      4 hormones (phasic+tonic)     8 config + 4 mode outputs
[acc:pred_error]              [hormone:cortisol  τ=500]     [config:hebbian_lr]
[acc:tension]   ──nn_edge──>  [hormone:dopamine  τ=30]  ──> [config:energy_threshold]
[acc:pain]      (28 edges)    [hormone:norepineph τ=20]     [config:spread_factor]
[acc:convergence]             [hormone:serotonin τ=200]     [config:endurance]
[acc:reward]                       │                        [config:sleep_need]
[acc:novelty]                      │ ──nn_edge──>           [config:activation_boost]
[acc:stability]                    │ (32+16 edges)          [config:freshness_decay]
                                   │                        [config:convergence_threshold]
                                   └──nn_edge──> [mode:explore|exploit|defensive|resting]
```

All forward/backward passes execute in SurrealDB (Rust). JS only passes sensory numbers.

## Phasic/Tonic Model (Migration 039)

Each hormone: `{ value, phasic, tonic, tau }`

**Per HIGH tick (every 100 internal ticks):**
```
phasic *= (1 - 1/τ)                          — exponential decay
tonic += drift_rate × (forward_target - tonic) — slow drift to NN output
value = clamp(tonic + phasic, 0, 1.2)         — effective level
```

**Spike injection (max-replace, not additive):**
```
fn::hormone_spike('dopamine', magnitude)
if |magnitude| > |current_phasic|:
  phasic = clamp(magnitude, -cap, +cap)      — REPLACE (no stacking)
else:
  phasic += magnitude × 0.1                  — small nudge only
```

## Per-Hormone Dynamics

| Hormone | τ | Spike triggers | Role |
|---------|---|----------------|------|
| **Dopamine** | 30 | RPE > 0 (reward prediction error) | Reward signal, exploration drive |
| **Norepinephrine** | 20 | New trace, valence flip, |RPE| > threshold | Alertness, surprise, gain control |
| **Serotonin** | 200 | None (tonic only) | Contentment, rises from convergence/stability |
| **Cortisol** | 500 | Pain (negative valence), pred_error | Stress response, very slow HPA axis decay |

## Cognitive Cycle Integration (Migration 043)

Dopamine spikes from **RPE (reward prediction error)**, not raw valence:
```
predicted = Q(action, object)     — from action_value table
actual = valence from world
RPE = actual - predicted
DA_spike = RPE × rpe_dopamine_scale
```

This is the Schultz model: dopamine signals **surprise about reward**, not reward itself.

## Self-Tuning Config (Migration 040-041)

Output layer (tanh) → **log-space multiplicative modulation**:
```
config.param = default × exp(tanh_output × sensitivity)
```

No hardcoded ranges. `sensitivity` (default 0.3) is the only hyperparameter.

**8 self-tuned parameters:**
- hebbian_lr, agency_energy_threshold, spread_weight_rate
- accumulator_valence_threshold, reactivation_weight_boost, trace_freshness_decay
- energy_drain_rate (via endurance node), sleep_threshold (via sleep_need node)

## Behavioral Mode (REINFORCE Learning)

4 modes: explore, exploit, defensive, resting. Softmax over mode nodes.

**Mode learning:** after each action with outcome:
```
advantage = RPE - running_baseline
Δw_mode = lr × advantage × (1_{selected} - π(mode)) × hormone_value
```

Agency uses mode: explore→more random, exploit→pick highest Q-value, defensive→avoid negative Q, resting→conserve energy.

## Accumulator Sources

| Event | Accumulators | Hormone spikes |
|-------|-------------|----------------|
| **New trace** | novelty += 0.2, pred_error += 0.3 | DA +0.1, NE +0.15 |
| **Reactivation** | convergence += 0.1, stability += 0.15 | (none — familiar) |
| **Valence flip** | tension += 0.3, pred_error += 0.3 | NE +0.25 |
| **Positive valence** | reward += valence | DA += valence × 0.2 |
| **Negative valence** | pain += |valence| | Cortisol += |val| × 0.4, DA -= |val| × 0.15 |
| **RPE > 0** | pred_error += |RPE|, reward += RPE | DA += RPE × 0.3 |
| **RPE < 0** | pred_error += |RPE|, pain += |RPE| | DA += RPE × 0.15 |

## Structural Plasticity (Migration 047)

**Synaptic element growth** (Butz-Wörgötter homeostatic model):
```
activity = weight × freshness
dz = η × exp(-(activity - target)² / 2σ²)
synaptic_elements += dz
```

**Edge sprouting:** when elements > 1.0, connect to nearest trace (cosine similarity) with excess elements.

**Edge pruning:** inactivity (low co_activation_count) + competitive (max K incoming per trace).

**Sleep consolidation (Tononi SHY):** weak edges ×0.9, strong edges ×1.05, plus replay + homeostasis + element growth.

## Training Results

```
t=1000: DA=0.97(ph0.06) NE=0.23 cort=0.21 sero=0.04 | 631 edges | RPE=0.046
```

Hormones differentiated. Config self-tunes ±5%. Mode learning active. Q-values diverge per action×object. RPE decreases over time (brain learns to predict).

## 159 Config Parameters (ALL from kernel_state.config)

Spike magnitudes, τ decay rates, tonic drift, phasic cap, accumulator thresholds, agency coefficients, circuit frequencies, learning rates, growth rates, pruning thresholds, consolidation parameters, maturity weights, mode modulation — all affect-modulatable via output layer.
