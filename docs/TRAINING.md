# Training — Developmental Learning

## Architecture

```
PhysicsWorld (JS)          Membrane (2 roundtrips)        Brain (SurrealDB)
  12 objects               fn::world_tick($events, 100)   fn::brain_tick(100)
  6 actions                fn::action_consequence(...)     fn::cognitive_cycle(...)
  weather events                                          fn::edge_sprout()
  boredom penalty                                         fn::sleep_consolidation()
```

Brain starts as **newborn** (high energy drain, frequent sleep, low endurance) and develops through experience. No fixed sessions — brain sleeps when tired, wakes, explores. Level-up when maturity crosses threshold.

## Quick Start

```bash
# Start SurrealDB
docker start deus-surrealdb || docker run -d --name deus-surrealdb -p 8000:8000 surrealdb/surrealdb:v3.0.4 start --user root --pass root

# Run developmental training (default: 50K ticks, target maturity 0.95)
npx tsx src/training/developmental.ts 20000 0.95

# Short test
npx tsx src/training/developmental.ts 2000 0.8
```

## PhysicsWorld

12 objects with hidden physics (mass, hardness, friction, roundness, fragility, temperature, elasticity, sound). Brain never sees properties — only 13 sensory channels.

**13 channels:** dx, dy, dz, rotation, force, sound_amp, sound_freq, hardness, smoothness, temp_delta, deformation, breakage, visual_change

**6 actions:** touch, push, drop, shake, look, squeeze

**Object states:** wet (rain), flipped (drop), warm (sun) — affect future outcomes.

**5 levels:** 5→8→10→10→12 objects. Auto level-up by maturity.

## Cognitive Cycle (Per Action)

```
1. APPRAISE  — salience = |valence| + novelty + |RPE| + hormone_phasic
2. RETRIEVE  — Q(action, object) from action_value table
3. PREDICT   — RPE = actual - predicted → DA spike (Schultz model)
4. DELIBERATE — Q += lr × RPE
5. COMMIT    — CREATE cognitive_event (causal log)
6. LEARN     — three-factor Hebbian (RPE-modulated) + mode REINFORCE
```

## Developmental Stages

Brain starts as newborn (drain=0.01, fatigue=0.005, sleep_threshold=0.3) and self-tunes via affect output layer (log-space).

Maturity = 0.3×convergence + 0.2×edges + 0.3×prediction + 0.2×diversity. Level-up at maturity > 0.7.

## Results (5K ticks)

| Metric | Value |
|--------|-------|
| Edges | 631 (structural plasticity) |
| RPE | 0.046 (4.6% error) |
| Prediction quality | 91% |
| Q-values | 177 action-object pairs |
| Auto level-ups | 1 (maturity 0.895) |
| DA | 0.97 (RPE-driven) |
| Cortisol | 0.21 (low stress) |
| Speed | 85s/1K ticks |

RPE decreases: early 0.122 → late 0.078 (36% improvement).
