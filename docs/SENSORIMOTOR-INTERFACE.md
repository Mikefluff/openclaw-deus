# Sensorimotor Interface: World ↔ Brain

## Core Principle

Brain NEVER sees objects. Brain NEVER sees text. Brain sees ONLY:
1. Numerical sensory channels (raw signals)
2. Action outcomes (what changed after I did something)
3. Valence (pain/pleasure from world physics)

Objects emerge as clusters of similar action-outcome patterns in concept space.
The brain DISCOVERS what "round" means by learning that certain things roll when pushed.

## Sensorimotor Contingency (O'Regan & Noé, 2001)

Perception is NOT receiving features. Perception IS mastery of sensorimotor regularities.

"I perceive a ball" means: "I have learned that when I push THIS, the position delta is large and directional. When I drop THIS, it bounces. When I touch THIS, resistance is low and surface is smooth."

An object = a stable cluster of (action → consequence) mappings.

## Sensory Channels (raw numerical signals)

These are what the brain receives. All floats. No text. No labels.

```
Channel                 Range    What it is (brain doesn't know this)
─────────────────────────────────────────────────────────────────
position_delta[3]       -1..1    How much the thing moved (x, y, z)
rotation_delta          0..1     How much it rotated
force_feedback          0..1     Resistance to action (heavy = high, light = low)
sound_amplitude         0..1     How loud the consequence was
sound_frequency         0..1     Low=bass, high=treble (approximation)
surface_hardness        0..1     Resistance to deformation on touch
surface_smoothness      0..1     Friction on touch
temperature_delta       -1..1    Got colder or warmer on touch
deformation             0..1     How much shape changed (0=rigid, 1=squished)
breakage                0..1     0=intact, 1=destroyed
visual_change           0..1     How much it looks different after action
valence                 -1..1    Pain/pleasure (from world physics, NOT brain)
novelty_signal          0..1     World's measure of how unusual this outcome is
```

13 channels. Fixed by world physics, NOT by brain. Brain learns which channels matter.

## Action Space

Brain's actions are abstract motor commands. World interprets them via physics.

```
Action      Motor semantics (brain doesn't know these names)
────────────────────────────────────────────────────────
0: touch    Apply small force, measure resistance + temperature
1: push     Apply directional force, observe displacement
2: drop     Release from height, observe fall + impact
3: shake    Apply oscillating force, observe sound + movement
4: look     No force applied, just observe visual properties
5: squeeze  Apply compression, measure deformation
```

Brain sends action_id (0-5) + target_trace_id. World maps trace to object and applies physics.

## Transition Record (what goes into brain)

Every action produces a transition. This is the fundamental learning unit:

```typescript
interface SensorimotorTransition {
  action_id: number;           // 0-5
  target_trace_id: string;     // which trace brain targeted
  channels_before: number[];   // 13 sensory channels BEFORE action
  channels_after: number[];    // 13 sensory channels AFTER action
  valence: number;             // world-computed pain/pleasure
  timestamp: number;           // monotonic
}
```

Brain learns: `predict(channels_before, action_id) → channels_after_predicted`
Loss = ||channels_after_predicted - channels_after_actual||²
This IS the prediction error that drives all learning.

## World Physics Model

World computes consequences from object properties (internal, hidden from brain):

```
push(object) → {
  position_delta = object.mass < 0.5 ? [force * (1 - friction), 0, 0] : [0, 0, 0]
  rotation_delta = object.roundness * (1 - friction)
  sound_amplitude = force * object.hardness
  force_feedback = object.mass
  ...
}

touch(object) → {
  surface_hardness = object.hardness
  surface_smoothness = 1 - object.friction
  temperature_delta = object.temperature - 0.5  (ambient = 0.5)
  ...
}

drop(object) → {
  breakage = object.fragility > 0.7 ? 1.0 : 0.0
  sound_amplitude = object.mass * (object.hardness + 0.5)
  deformation = (1 - object.hardness) * 0.5
  valence = breakage > 0 ? -0.5 : 0.0  (breaking things = world says "bad")
  ...
}
```

Object internal properties (brain never sees directly):
- mass: 0..1
- hardness: 0..1
- friction: 0..1
- roundness: 0..1
- fragility: 0..1
- temperature: 0..1
- edibility: 0/1
- alive: 0/1

These are WORLD knowledge. Brain must INFER them from sensorimotor patterns.

## How Brain Builds Representations

1. Brain receives many (action, before, after) transitions
2. SensorimotorPredictorService learns to predict `after` from `(before, action)`
3. Prediction error = learning signal
4. Objects that produce SIMILAR prediction patterns cluster together
5. "Round things" = cluster where push → high rotation_delta + high position_delta
6. "Fragile things" = cluster where drop → high breakage + high sound_amplitude
7. Labels ("мячик") come later from mama speech, attached to existing clusters

## Integration with fn::process_consequence

Replace text-based trace creation with numerical transition recording:

```sql
fn::process_sensory($action_id: int, $target: string,
                    $channels_before: array, $channels_after: array,
                    $valence: float)
```

- Creates trace with `position = channels_after` (sensory vector IS the position)
- Computes prediction error: `||predicted - actual||`
- Updates affect accumulators based on error + valence
- Links to target trace (action → consequence association)

## Membrane Role

Membrane translates between brain's action_ids and world's named actions:

```
Brain says: "action 1 on trace T_abc"
Membrane:
  1. Maps T_abc → nearest world object (by trace content or random)
  2. Maps action 1 → "push"
  3. Calls world.childAction("push", object)
  4. Reads world consequence → extracts 13 sensory channels
  5. Calls fn::process_sensory(1, "T_abc", before, after, valence)
```

Brain NEVER touches world directly. Brain NEVER sees object names.
Brain sends action_id + target. Gets back numbers. Builds world model from numbers.

## What This Replaces

| Before (wrong) | After (correct) |
|----------------|-----------------|
| `content.includes('катится')` | `channels_after.rotation_delta > 0.3` (brain learns this threshold) |
| `OBJECT_DB: { roundness: 0.9 }` | Object has mass/friction/roundness internally; brain sees only consequences |
| `valence = text.includes('!')` | `valence` computed by world physics, returned as float |
| Trace `position = [0,0,...,0]` | Trace `position = channels_after` (sensory vector) |
| `fn::process_consequence(text)` | `fn::process_sensory(action, before, after, valence)` |

## Language Channel: Speech as Sensory Input

Text is NOT special. It's another sensory channel — sound patterns encoded as numbers.
Brain doesn't know letters. Brain hears sequences of numerical signals.

```
Speech channel: speech_signal[16]  — padded character codes
  а=1, б=2, в=3, г=4, д=5, е=6, ж=7, з=8, и=9, й=10,
  к=11, л=12, м=13, н=14, о=15, п=16, р=17, с=18, т=19,
  у=20, ф=21, х=22, ц=23, ч=24, ш=25, щ=26, ъ=27, ы=28,
  ь=29, э=30, ю=31, я=32, пробел=0

Total sensory input: 13 physical + 16 speech = 29 channels per transition
```

When mama is silent: `speech = [0, 0, 0, ..., 0]`
When mama says "мячик": `speech = [13, 33, 24, 9, 11, 0, 0, ..., 0]`
When mama says "круглый": `speech = [11, 17, 20, 4, 12, 28, 10, 0, ..., 0]`

### How Language Emerges (5 phases from research)

**Phase 1 — Co-occurrence detection:**
Brain notices speech pattern [13,33,24,9,11] co-occurs with
sensorimotor cluster {push→high_rotation, touch→low_hardness}.
Creates edge: lexical_trace ↔ sensorimotor_cluster.

**Phase 2 — Word-concept binding (symbol grounding):**
After 100+ co-occurrences, the edge strengthens.
Brain "knows" that sound [13,33,24,9,11] = the thing that rolls.
No one taught it — statistical regularities did.

**Phase 3 — Production (babbling → words):**
Brain generates speech_signal from active cluster.
If cluster {rolls, bounces} is active → recall associated speech pattern.
First attempts are noisy. Reinforcement from mama refines them.

**Phase 4 — Composition:**
Brain learns that speech patterns combine.
"красный мячик" = [color_signal] + [object_signal].
Two lexical traces activated simultaneously → compound expression.

**Phase 5 — Grammar emergence:**
Ordering regularities in speech sequences create implicit syntax.
Brain learns that [adjective_pattern, noun_pattern] is more common than reverse.
Grammar is NOT hardcoded — it's a learned regularity in the speech channel.

### Key: Mama Speech Events in World

World generates mama speech as a sensory event WITH the speech channel filled in:

```typescript
// World generates:
{
  channels_after: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],  // no physical change
  speech: [13, 33, 24, 9, 11, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],  // "мячик"
  valence: 0.1,  // mama's voice = mildly positive
  action_id: -1,  // no action, just listening
}
```

Brain treats this like any other sensory transition. The speech channel
activates alongside whatever physical channels are active. Over time,
the co-occurrence creates the word-concept binding.

## Verification

Brain is learning if:
1. Prediction error decreases over time for repeated (object, action) pairs
2. Similar objects cluster together in concept space (round things near each other)
3. Brain's action selection starts favoring objects with positive valence history
4. New object: high prediction error → curiosity → explore → error decreases
