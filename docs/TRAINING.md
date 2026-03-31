# Training the Child

## PhysicsWorld: Numerical Sensorimotor Environment

Brain sees ONLY numbers. 13 sensory channels + 16 speech channels = 29 floats per transition.
Objects are internal physics models. Brain infers properties from action-outcome patterns.

See [SENSORIMOTOR-INTERFACE.md](SENSORIMOTOR-INTERFACE.md) for full spec.

### Sensory Channels (what brain receives)

```
position_delta[3]   -1..1    How much the thing moved
rotation            0..1     How much it rotated
force_feedback      0..1     Resistance (heavy = high)
sound_amplitude     0..1     How loud
sound_frequency     0..1     Low=bass, high=treble
surface_hardness    0..1     Resistance to deformation
surface_smoothness  0..1     Friction
temperature_delta   -1..1    Warmer/colder on touch
deformation         0..1     Shape change (rigid→squished)
breakage            0..1     0=intact, 1=destroyed
visual_change       0..1     How different after action
```

### Actions (abstract motor commands)

```
0: touch    Apply small force, measure resistance + temperature
1: push     Apply directional force, observe displacement + rotation
2: drop     Release from height, observe fall + sound + breakage
3: shake    Oscillating force, observe sound + movement
4: look     No force, observe visual
5: squeeze  Compression, measure deformation
```

### Object Physics (brain never sees these)

```
mass, hardness, friction, roundness, fragility, temperature, elasticity, sound_base
```

12 objects with different physics. World computes sensory consequences from physics + action + noise.

### Speech Channel

Mama speech = character codes normalized to 0..1:
```
а=1/32, б=2/32, ..., я=32/32, silence=0
speech[16]: padded character sequence
```

Brain learns word-object binding through co-occurrence of speech patterns with sensorimotor clusters.

## Membrane: World ↔ Brain Translator

`src/training/membrane.ts` — thin translator, zero text processing:

1. World.tick() → ambient sensory transitions → fn::process_sensory (numbers)
2. fn::brain_tick(1000) — brain runs 1000 internal cycles
3. Brain generates kernel_request type='action' → membrane maps to world.act()
4. World returns sensory consequence → fn::process_sensory → brain learns

Brain sees `"0:3"` (action 0 on object 3), not "touch подушка".

## Learning Pipeline

```
World consequence: {action_id, channels[13], speech[16], valence, object_idx}
  ↓
fn::process_sensory: dedup (same action:object → reactivate), create trace with position = channels
  ↓
fn::brain_tick: affect forward (accumulators → hormones), backward (loss → weight update)
  ↓
fn::learn_edge: three-factor Hebbian (Δw = η × eligibility × dopamine × TD_error)
  ↓
Traces cluster by sensorimotor similarity → objects emerge as patterns
```

## Training Results (200 world ticks)

```
Brain cycles:     200,000
Actions:          1,000 (autonomous, affect-driven)
Active traces:    29 (≈ 5 objects × 6 actions, dedup working)
Archived:         8
Edges:            107 (three-factor Hebbian)
Hormones:         0.5 → 0.978 (affect model learning!)
Neural weights:   0.19 → 0.95 (updated 636×)
Convergence:      5.0 (world predictable)
Speech traces:    4 (mama named 4 objects)

Push-trace clustering:
  push:кукла ↔ push:книжка = 0.132 (both soft, don't roll)
  push:кубик ↔ push:кукла = 0.413 (hard vs soft)
  → Brain clusters by physics, not names!
```

## Running Training

```bash
# Start SurrealDB
docker run -d --name deus-surrealdb -p 8000:8000 surrealdb/surrealdb:v3.0.4 start --user root --pass root memory

# Bootstrap
npx tsx src/training/bootstrap.ts

# Train (default 5000 ticks)
npx tsx src/training/membrane.ts 1000
```

## What Brain Learns

1. **Sensorimotor contingencies**: push(round thing) → high rotation + displacement
2. **Object clusters**: similar action-outcomes cluster together in 64-dim space
3. **Valence associations**: breaking things = negative, rolling things = positive
4. **Word-concept binding**: mama's speech pattern co-occurs with sensorimotor cluster
5. **Energy management**: sleep when depleted, wake when recovered
