# DEUS Runtime Model: Cognitive Kernel Formal Specification

## Core Principle

The kernel is NOT a loop. It's a **preemptive scheduler of competing cognitive circuits**.
Each circuit has its own cadence, budget, priority, and recovery semantics.
Scheduler policy IS personality — different budget allocation = different character.

## Circuit Types

### CRITICAL — Survival substrate
```
cadence:           continuous (every tick)
budget:            unlimited (always executes)
priority:          0 (highest — cannot be preempted)
interruptibility:  non-interruptible
commit policy:     must-commit or fail-safe
recovery policy:   immediate restart
preemption rights: can stop/starve all other circuits
                   can force state transitions (sleep, freeze, reset)
                   can set inhibition flags on any circuit

Operations:
  - Energy drain/recovery
  - Sleep detection + initiation
  - Emergency affect spikes (pain > threshold → immediate response)
  - Watchdog: detect stalled circuits → quarantine
  - Circuit breaker: kill runaway circuits
```

### HIGH — Affect + fast dynamics
```
cadence:           fast (every tick when energy > 0.05)
budget:            large but bounded
priority:          1
interruptibility:  only by CRITICAL
commit policy:     commit or discard (no partial state)
recovery policy:   resume from last committed state

Operations:
  - Affect model forward pass (accumulators → hormones → config deltas)
  - Cognitive cone forward (depth/spread)
  - Trace weight/freshness decay
  - Hot trace modulation (emotional amplification)
  - Spreading activation (immediate neighbors)
```

### MEDIUM — Reflective cognition
```
cadence:           batch (every N ticks, or when triggered by HIGH)
budget:            moderate, can be starved
priority:          2
interruptibility:  by CRITICAL or HIGH
commit policy:     checkpoint-based (can resume from last checkpoint)
recovery policy:   resume if state still valid, recompute if invalidated

Operations:
  - Active inference (2-hop graph traversal)
  - Schema detection (co-activation patterns)
  - Forgetting (weight decay + archive)
  - Concept space drift
  - Prediction error backpropagation
  - Belief decay
```

### LOW — Deep synthesis
```
cadence:           slow (triggered by fatigue/time, not every tick)
budget:            small, most disposable
priority:          3 (lowest)
interruptibility:  by any higher circuit
commit policy:     atomic batch (all or nothing)
recovery policy:   discard and recompute (state likely stale after interruption)

Operations:
  - World model rebuild
  - Introspection (coherence + posture)
  - Narrative compaction
  - Neural graph maintenance (decay, consolidation, pruning)
  - Nightly maintenance run
  - Dimension naming
  - Cluster materialization
```

## Interrupt Types

Each interrupt has: source, reason, target circuit, action.

| Reason | Source | Effect | Log? |
|--------|--------|--------|------|
| `energy_low` | CRITICAL | Starve LOW, then MEDIUM | yes |
| `energy_critical` | CRITICAL | Starve all except CRITICAL, initiate sleep | yes |
| `sleep_enter` | CRITICAL | Pause HIGH/MEDIUM/LOW, run consolidation | yes |
| `sleep_exit` | CRITICAL | Resume all circuits with fresh energy | yes |
| `affect_spike` | HIGH | Boost HIGH budget, may interrupt MEDIUM inference | yes |
| `pain_acute` | CRITICAL | Emergency: stop LOW, boost CRITICAL+HIGH | yes |
| `schema_conflict` | MEDIUM | May invalidate LOW world model (recompute needed) | yes |
| `world_inconsistency` | LOW | Flag for MEDIUM to re-infer, does NOT interrupt | yes |
| `reset_soft` | external/CRITICAL | Volatile state cleared, identity preserved | yes |
| `reset_safe_mode` | external/CRITICAL | Only CRITICAL runs, minimal world coherence | yes |
| `reset_hard` | external only | Near-full wipe, commit trail preserved | yes |
| `deadline_breach` | watchdog | Circuit exceeded budget → quarantine | yes |
| `runaway_detected` | watchdog | Circuit looping → kill + quarantine | yes |
| `debug_break` | external | All circuits pause, single-step mode | no |

## Reset Classes

### Soft Reset
```
Clears:     volatile state (accumulators, pending operations, hot cache)
Preserves:  identity attractor (self-traces, personality weights)
            long-term traces (weight > threshold)
            trust weights (edge importance)
            learned schemas (consolidated patterns)
            neural graph weights (nn_edge)
            commit trail (narrative frames)
Restarts:   all circuits from clean volatile state
Use case:   "confused but intact" — like waking from a bad dream
```

### Safe Mode Reset
```
Clears:     volatile state + conflicting circuit states
Preserves:  everything soft reset preserves + core beliefs
Starts:     ONLY critical loop + minimal world coherence check
            Other circuits start in SUSPENDED state
            Manual or automatic escalation to full operation
Use case:   "something is seriously wrong" — diagnostic boot
```

### Hard Reset
```
Clears:     almost everything
Preserves:  commit trail (for causal continuity)
            boot seed (initial beliefs/axioms)
            neural graph STRUCTURE (topology, not weights)
Destroys:   learned weights, traces, schemas, personality
Use case:   "start over but remember that you existed"
            NOT amnesia — the commit trail proves continuity
```

## Semaphore State

Each circuit's semaphore table stores:

```
state:            ready | running | sleeping | blocked | quarantined
priority:         0-3 (can be dynamically adjusted by CRITICAL)
budget_remaining: float (decremented each tick, replenished on cadence)
budget_max:       float (configurable, part of personality)
last_run:         datetime
last_commit:      datetime
interrupt_flags:  array<string> (pending interrupts to process)
cooldown_until:   option<datetime> (after quarantine)
ticks_this_chain: int (for watchdog — detect stalls)
error_count:      int (for circuit breaker)
```

## Budget Allocation

Total system budget per tick = `kernel_state.energy`.
Distribution = personality weights (learned, not hardcoded):

```
CRITICAL:  always gets what it needs (bounded by energy)
HIGH:      kernel_state.config.high_budget_ratio ?? 0.4
MEDIUM:    kernel_state.config.medium_budget_ratio ?? 0.3
LOW:       kernel_state.config.low_budget_ratio ?? 0.2
Reserve:   0.1 (emergency buffer for CRITICAL)
```

Affect model can shift ratios:
- High cortisol → boost CRITICAL + HIGH, starve LOW
- High dopamine → boost MEDIUM (exploration/inference)
- High serotonin → boost LOW (consolidation/reflection)
- High norepinephrine → boost HIGH (fast dynamics)

## Resume vs Recompute

When a circuit is interrupted:

| Circuit | Default | When to recompute |
|---------|---------|-------------------|
| CRITICAL | N/A (never interrupted) | — |
| HIGH | Resume (stateless per tick) | Never — each tick is independent |
| MEDIUM | Resume from checkpoint | If traces changed significantly since checkpoint |
| LOW | Recompute | Always — world state likely changed during interruption |

"Significantly changed" = Hamming distance of active trace set > threshold.

## Trace Persistence Across Resets

| Trace type | Soft | Safe Mode | Hard |
|------------|------|-----------|------|
| Active traces (weight > 0.3) | ✅ keep | ✅ keep | ❌ clear |
| Faded traces (weight < 0.1) | ❌ clear | ❌ clear | ❌ clear |
| Self-traces | ✅ keep | ✅ keep | ❌ clear |
| Schemas (co-activation > 5) | ✅ keep | ✅ keep | ❌ clear |
| nn_edge weights | ✅ keep | ✅ keep | ❌ reset to Xavier |
| nn_node values | ❌ clear | ❌ clear | ❌ clear |
| kernel_state | ❌ clear | ❌ clear | ❌ clear |
| commit_log | ✅ keep | ✅ keep | ✅ keep (always) |
| narrative_frames | ✅ keep | ✅ keep | ✅ keep (always) |
| beliefs (axioms) | ✅ keep | ✅ keep | ✅ keep (boot seed) |
| beliefs (learned) | ✅ keep | ✅ keep | ❌ clear |
| episodic edges | ✅ keep | ❌ clear | ❌ clear |

## Personality as Scheduler Policy

Different budget allocations = different cognitive styles:

```
"Anxious":     CRITICAL 60%, HIGH 30%, MEDIUM 8%, LOW 2%
               (survival-focused, little reflection, poor world model)

"Reflective":  CRITICAL 15%, HIGH 25%, MEDIUM 35%, LOW 25%
               (rich inner life, good schemas, may miss acute threats)

"Balanced":    CRITICAL 20%, HIGH 35%, MEDIUM 25%, LOW 20%
               (healthy distribution, adapts to context)

"Dissociated": CRITICAL 10%, HIGH 10%, MEDIUM 10%, LOW 70%
               (deep synthesis but disconnected from affect/survival)
```

These ratios are LEARNED through experience, not hardcoded.
The affect model's config deltas shift ratios each tick.
Over time, a stable personality emerges from the distribution.

## Implementation Notes

1. **Causality discipline**: separate state mutation → event emission → scheduler decision → effect execution
2. **Watchdog**: CRITICAL monitors all circuits, quarantines stalled ones
3. **Circuit breaker**: 3 consecutive errors → quarantine for cooldown period
4. **Interrupt log**: kernel_interrupt table records all interrupts for post-hoc analysis + learning
5. **Budget accounting**: each fn::sched_*_tick deducts from circuit budget, not just global energy
