# DEUS Dynamics — 7 Fundamental Update Rules

No prose. No architecture. The equations that drive the system.

---

## 1. Trace Activation

When signal S touches trace T:

```
T.weight ← min(1, T.weight + α · (1 - T.weight) · S.confidence)
T.freshness ← 1.0
T.reactivation_count += 1
```

Where `α = config.kernel.activation_boost`

Spreading to neighbor N via edge E:

```
activation(N) = E.weight · σ_spread · T.weight · exp(-d(T,N)² / (2·σ²))
```

Where:
- `σ_spread = config.kernel.spread_factor`
- `d(T,N)` = euclidean distance in concept space
- `σ` = spread width, modulated by affect:
  - `σ = σ_base / (1 + arousal)` — high arousal → narrow (focused)
  - `σ = σ_base · (1 + dopamine)` — high dopamine → wide (exploratory)

Inhibition to opponent O via inhibit edge:

```
O.weight ← max(0, O.weight - E.weight · σ_inhibit · T.weight)
if O.weight < 0.05: O.suppressed ← true
```

---

## 2. Hebbian Edge Learning

After spreading activation, for each traversed edge E between source S and target T:

```
ΔE.weight = η · S.weight · T.weight                    (co-activation: fire together → wire together)
           - η_decay · (T.weight < 0.1 ? 1 : 0)       (anti-Hebbian: target inactive → weaken)
           - η_pred · prediction_error(T) · E.weight    (prediction error backprop)
           + η_reward · outcome_reward · E.weight        (outcome reinforcement)

E.weight ← clamp(E.weight + ΔE.weight, 0.01, 1.0)
E.co_activation_count += 1
```

Where:
- `η = config.kernel.hebbian_learning_rate`
- `η_decay = config.kernel.hebbian_decay_rate`
- `η_pred = config.kernel.pred_error_backprop_rate`
- `η_reward = config.kernel.reinforcement_rate`

---

## 3. Prediction → Trajectory Update

PredictiveAgent maintains trajectories: `from_position → to_position` given `action`.

On each cycle, for each tracked trace:

```
predicted_weight = last_prediction[T]
actual_weight = clamp(T.weight, 0, 1)
error = |actual - predicted|

if error > 0.15:
  emit prediction_error signal
  backpropagate through incoming edges (rule 2)
  update prediction: last_prediction[T] ← actual
```

Trajectory update after episode outcome:

```
trajectory.confidence += η_traj · (outcome_success ? +1 : -1) · (1 - |trajectory.confidence|)
trajectory.traversal_count += 1
```

---

## 4. Affect → Gradient Field (Multi-Drive)

NOT just valence. Five distinct drives, each generating its own gradient:

```
Drive 1: PAIN AVOIDANCE
  gradient_pain(pos) = Σ_r [repeller.strength / (1 + d(pos, r))] · normalize(pos - r.pos)

Drive 2: NOVELTY HUNGER (curiosity)
  gradient_novelty(pos) = Σ_a [VOI(a) / (1 + d(pos, a))] · normalize(a.pos - pos)
  where a = high-VOI beliefs from causal graph

Drive 3: UNCERTAINTY AVERSION
  gradient_uncertainty(pos) = -σ_local · normalize(gradient of local trace variance)
  pulls toward regions with tight clusters (well-understood areas)

Drive 4: MASTERY DRIVE
  gradient_mastery(pos) = Σ_s [s.success_rate · s.relevance / (1 + d(pos, s))] · normalize(s.pos - pos)
  pulls toward domains where system is competent

Drive 5: PREDICTION ACCURACY
  gradient_prediction(pos) = -Σ_e [e.prediction_error / (1 + d(pos, e))] · normalize(pos - e.pos)
  pushes away from regions with high prediction errors

Combined desire vector:
  desire(pos) = w_pain · grad_pain
              + w_novelty · grad_novelty
              + w_uncertainty · grad_uncertainty
              + w_mastery · grad_mastery
              + w_prediction · grad_prediction

Weights w_i are LEARNED by the affect model (gradient descent on reward signal).
```

Affect model forward pass (unchanged):

```
accumulators × W₁ → sigmoid → hormones
hormones × W₂ → tanh × 0.02 → config_deltas
hormones × W_mode → softmax → mode

Loss = pred_error_acc + pain_acc - convergence_acc - reward_acc
∂Loss/∂W via analytical gradients
```

---

## 5. Commit → Topology Reconfiguration

A commit is produced when convergence_score > threshold OR urgency > escalation_threshold.

Commit applies atomically:

```
for each spatial_movement in commit:
  T.velocity = T.velocity · 0.7 + movement.delta · 0.3     (momentum)
  T.position += T.velocity

for each new_dimension in commit:
  all_traces.position.push(0)       (neutral on new axis)
  conflict.trace_a.position[dim] = +1
  conflict.trace_b.position[dim] = -1

world_model = concept_space.snapshot()   (rebuild from spatial state)
```

---

## 6. Forgetting = Loss of Resolution & Separability

NOT drift to origin. Traces lose DISTINCTNESS:

```
for each trace T:
  # Find nearest attractor (cluster centroid or schema hub)
  A = nearest_attractor(T)
  d_A = distance(T, A)

  # Forgetting rate modulated by anchoring
  anchoring = log2(2 + T.reactivation_count) · (1 + |T.emotional_charge|)
  decay = config.kernel.freshness_decay / anchoring

  # Freshness decays
  T.freshness *= (1 - decay)

  # Position drifts toward nearest attractor (not origin!)
  # Like forgetting details but remembering the gist
  drift_direction = normalize(A.position - T.position)
  drift_speed = decay · (1 - T.weight)    # weak traces drift faster
  T.position += drift_direction · drift_speed

  # When trace reaches attractor → merged (lost individual identity)
  if d(T, A) < merge_threshold AND T.weight * T.freshness < archive_threshold:
    archive(T)                # individual trace gone
    A.weight += T.weight · 0.1  # attractor absorbs it (schema strengthened)
```

Key insight: forgetting isn't deletion or zeroing. It's MERGING into the nearest schema.
"I don't remember the specific ball, but I remember roundness."

---

## 7. Time = Local Cost of Reconfiguration Under Limited Bandwidth

```
time_sense.tempo = commits_in_window / window_size

time_sense.reconfiguration_cost =
  Σ_c∈recent_commits [
    c.novelty_cost                           # how new was this
    + Σ_m∈c.movements |m.delta|              # how much did traces move
    + c.new_dimensions.length · dim_birth_cost  # how expensive was dimension birth
  ] / commit_bandwidth

time_sense.prediction_error_rate =
  mean(c.prediction_error for c in recent_commits)

time_sense.dilation =
  reconfiguration_cost · w_reconfig
  + prediction_error_rate · w_pred_error
  + novelty_rate · w_novelty
  - (1 - tempo) · w_tempo

where commit_bandwidth = config.kernel.attention_window
```

Subjective duration of a trace:

```
felt_age(T) =
  (current_cycle - T.created_at_cycle)    # raw distance
  · (1 / log2(2 + T.reactivation_count)) # frequently recalled = feels closer
  · (1 - T.weight · 0.5)                 # high weight = feels closer
  · (1 + (1 - T.freshness) · 0.5)        # low freshness = feels older
  · reconfiguration_cost_since(T.created_at_cycle)  # NEW: how much was reorganized since
```

---

## Guards

### Anti-Rumination (extends hallucination guard)

```
for each idle cycle:
  if cycle_count_without_error_reduction > N_anti_rumination:
    AND compression_power_delta < epsilon:
      KILL idle reflection
      switch to resting mode (sleep_max_ms)

compression_power = total_traces / total_active_dimensions  # fewer traces per dim = better compressed
```

### Psychologist Trigger (multi-signal)

```
needs_expert =
  unresolved_prediction_errors > threshold_errors
  AND arousal > threshold_arousal
  AND convergence_stalled_cycles > threshold_stall
  AND self_model_perturbations > threshold_perturbation

NOT just: pain.chronic OR cortisol > 0.6
```

### Teacher Cadence (adaptive)

```
needs_teaching =
  domain_error_accumulator > critical_mass
  AND cycles_since_last_teaching > min_consolidation_gap

NOT: every 3 cycles fixed
```

---

## Layers (clean separation)

```
1. CONCEPT SPACE  — positions, dimensions, distances
2. TRACE DYNAMICS — activation, Hebbian, forgetting, spreading
3. COMMIT LAYER   — convergence, energy, atomic reconfiguration
4. NARRATIVE       — late projection, does NOT feed back into cognition
```

Narrative reads commit log + trace states → produces human-readable temporal descriptions.
Narrative NEVER modifies traces, positions, or commits. Read-only interface.

---

## Core Identity

```
reality     = position + dynamics of traces in concept space
self        = stable cluster with commit authority
memory      = weight + separability + addressability of traces
desire      = multi-drive gradient field
action      = movement along gradient
time        = local cost of reconfiguration under bandwidth constraint
forgetting  = loss of resolution, drift toward nearest schema
```
