/**
 * PhysicsWorld: Numerical world for sensorimotor learning.
 *
 * Brain sees ONLY numbers: 13 sensory channels + 16 speech channels = 29 floats.
 * Objects are internal physics models. Brain infers properties from action-outcome pairs.
 * Text labels are ONLY for debug output and mama speech generation.
 *
 * Based on: SENSORIMOTOR-INTERFACE.md spec
 */

// ═══════════════════════════════════════════
// PHYSICS MODEL
// ═══════════════════════════════════════════

interface ObjectPhysics {
  mass: number;        // 0..1
  hardness: number;    // 0..1
  friction: number;    // 0..1
  roundness: number;   // 0..1
  fragility: number;   // 0..1
  temperature: number; // 0..1 (0.5 = ambient)
  elasticity: number;  // 0..1
  sound_base: number;  // 0..1
  name: string;        // debug label (brain never sees)
}

// 13 sensory channels — what brain receives
export interface SensoryChannels {
  position_dx: number;
  position_dy: number;
  position_dz: number;
  rotation: number;
  force_feedback: number;
  sound_amplitude: number;
  sound_frequency: number;
  surface_hardness: number;
  surface_smoothness: number;
  temperature_delta: number;
  deformation: number;
  breakage: number;
  visual_change: number;
}

// Complete transition — the unit of learning
export interface SensoryTransition {
  action_id: number;           // 0-5
  object_idx: number;          // which object (brain's internal index)
  channels: number[];          // 13 sensory values
  speech: number[];            // 16 character codes (0 = silence)
  valence: number;             // world-computed pain/pleasure
  debug_label: string;         // debug only — brain never sees
}

// ═══════════════════════════════════════════
// OBJECT DATABASE (internal physics — brain never sees)
// ═══════════════════════════════════════════

const OBJECTS: ObjectPhysics[] = [
  { mass: 0.15, hardness: 0.3,  friction: 0.2,  roundness: 0.95, fragility: 0.05, temperature: 0.5,  elasticity: 0.8,  sound_base: 0.6, name: 'мячик' },
  { mass: 0.15, hardness: 0.9,  friction: 0.4,  roundness: 0.0,  fragility: 0.1,  temperature: 0.5,  elasticity: 0.1,  sound_base: 0.3, name: 'кубик' },
  { mass: 0.3,  hardness: 0.4,  friction: 0.5,  roundness: 0.0,  fragility: 0.3,  temperature: 0.5,  elasticity: 0.05, sound_base: 0.2, name: 'книжка' },
  { mass: 0.1,  hardness: 0.05, friction: 0.6,  roundness: 0.1,  fragility: 0.0,  temperature: 0.55, elasticity: 0.2,  sound_base: 0.1, name: 'подушка' },
  { mass: 0.2,  hardness: 0.2,  friction: 0.5,  roundness: 0.05, fragility: 0.2,  temperature: 0.5,  elasticity: 0.1,  sound_base: 0.1, name: 'кукла' },
  { mass: 0.2,  hardness: 0.7,  friction: 0.1,  roundness: 0.3,  fragility: 0.15, temperature: 0.5,  elasticity: 0.05, sound_base: 0.4, name: 'машинка' },
  { mass: 0.2,  hardness: 0.8,  friction: 0.2,  roundness: 0.5,  fragility: 0.85, temperature: 0.5,  elasticity: 0.0,  sound_base: 0.5, name: 'тарелка' },
  { mass: 0.2,  hardness: 0.85, friction: 0.15, roundness: 0.3,  fragility: 0.9,  temperature: 0.45, elasticity: 0.0,  sound_base: 0.5, name: 'стакан' },
  { mass: 0.2,  hardness: 0.3,  friction: 0.3,  roundness: 0.85, fragility: 0.25, temperature: 0.5,  elasticity: 0.2,  sound_base: 0.1, name: 'яблоко' },
  { mass: 0.85, hardness: 0.95, friction: 0.6,  roundness: 0.2,  fragility: 0.0,  temperature: 0.35, elasticity: 0.02, sound_base: 0.4, name: 'камень' },
  { mass: 0.2,  hardness: 0.7,  friction: 0.4,  roundness: 0.0,  fragility: 0.2,  temperature: 0.5,  elasticity: 0.05, sound_base: 0.3, name: 'пирамидка' },
  { mass: 0.15, hardness: 0.6,  friction: 0.2,  roundness: 0.0,  fragility: 0.1,  temperature: 0.4,  elasticity: 0.02, sound_base: 0.5, name: 'ложка' },
];

const ACTIONS = ['touch', 'push', 'drop', 'shake', 'look', 'squeeze'];

// ═══════════════════════════════════════════
// PHYSICS ENGINE
// ═══════════════════════════════════════════

function noise(scale = 0.05): number {
  return (Math.random() - 0.5) * scale * 2;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function computePhysics(obj: ObjectPhysics, action: number): { channels: number[]; valence: number } {
  let dx = 0, dy = 0, dz = 0, rot = 0, force = 0;
  let snd_amp = 0, snd_freq = 0, hard = 0, smooth = 0;
  let temp = 0, deform = 0, brk = 0, vis = 0;
  let valence = 0;

  switch (action) {
    case 0: // touch
      hard = obj.hardness + noise();
      smooth = 1 - obj.friction + noise();
      temp = obj.temperature - 0.5 + noise();
      force = obj.mass * 0.3 + noise();
      valence = smooth > 0.5 ? 0.1 : temp < -0.2 ? -0.2 : 0.05;
      break;

    case 1: // push
      dx = Math.max(0, (1 - obj.mass) * 0.8 - obj.friction * 0.3) + noise();
      rot = obj.roundness * (1 - obj.friction) * 0.9 + noise();
      force = obj.mass + noise();
      snd_amp = (1 - obj.mass) * 0.3 * obj.hardness + noise();
      snd_freq = obj.hardness * 0.5 + noise();
      vis = dx > 0.2 ? 0.5 : 0;
      valence = rot > 0.3 ? 0.25 : dx > 0.3 ? 0.15 : 0;
      break;

    case 2: // drop
      dz = -1.0;
      snd_amp = obj.mass * (obj.hardness + 0.3) + noise();
      snd_freq = obj.hardness * 0.7 + noise();
      brk = obj.fragility > 0.6 ? clamp(obj.fragility * 1.2 + noise(), 0, 1) : 0;
      deform = (1 - obj.hardness) * 0.4 + noise();
      dy = obj.elasticity * 0.5 + noise();
      vis = brk > 0.5 ? 0.9 : deform > 0.2 ? 0.3 : 0;
      valence = brk > 0.5 ? -0.5 : obj.elasticity > 0.3 ? 0.2 : 0;
      break;

    case 3: // shake
      snd_amp = obj.sound_base + (1 - obj.mass) * 0.3 + noise();
      snd_freq = obj.hardness * 0.4 + (1 - obj.mass) * 0.3 + noise();
      dx = (1 - obj.mass) * 0.2 + noise();
      deform = (1 - obj.hardness) * 0.2 + noise();
      force = obj.mass * 0.5 + noise();
      valence = snd_amp > 0.5 ? 0.15 : 0;
      break;

    case 4: // look — no interaction, ambient observation
      vis = 0.1; // slight visual signal = "something is there"
      break;

    case 5: // squeeze
      deform = (1 - obj.hardness) * 0.8 + noise();
      force = obj.hardness * 0.7 + noise();
      snd_amp = deform > 0.3 ? 0.2 + noise() : 0;
      hard = obj.hardness + noise();
      valence = deform > 0.5 ? 0.1 : 0;
      break;
  }

  return {
    channels: [
      clamp(dx, -1, 1), clamp(dy, -1, 1), clamp(dz, -1, 1),
      clamp(rot, 0, 1), clamp(force, 0, 1),
      clamp(snd_amp, 0, 1), clamp(snd_freq, 0, 1),
      clamp(hard, 0, 1), clamp(smooth, 0, 1),
      clamp(temp, -1, 1), clamp(deform, 0, 1),
      clamp(brk, 0, 1), clamp(vis, 0, 1),
    ],
    valence: clamp(valence, -1, 1),
  };
}

// ═══════════════════════════════════════════
// SPEECH ENCODING
// ═══════════════════════════════════════════

const CYRILLIC = 'абвгдежзийклмнопрстуфхцчшщъыьэюя';

function encodeSpeech(text: string): number[] {
  const result = new Array(16).fill(0);
  const lower = text.toLowerCase();
  for (let i = 0; i < Math.min(lower.length, 16); i++) {
    const idx = CYRILLIC.indexOf(lower[i]);
    result[i] = idx >= 0 ? (idx + 1) / 32 : 0; // normalize to 0..1
  }
  return result;
}

const SILENCE = new Array(16).fill(0);

// ═══════════════════════════════════════════
// PHYSICS WORLD
// ═══════════════════════════════════════════

export class PhysicsWorld {
  private level = 0;
  private tick_count = 0;
  private available_objects: number[]; // indices into OBJECTS
  private mama_present = true;
  pendingFeedback: SensoryTransition[] = [];
  private broken = new Set<number>(); // broken object indices
  // Object states: wet, flipped, warm (change from actions, affect future actions)
  private wet = new Set<number>();
  private flipped = new Set<number>();
  private warmed = new Set<number>();
  // Track interaction history for consequence chains
  private last_action: { action: number; object: number; valence: number } | null = null;

  constructor() {
    // Level 0: first 5 objects
    this.available_objects = [0, 1, 2, 3, 4];
  }

  /** World advances one tick. Returns ambient sensory transitions. */
  tick(): SensoryTransition[] {
    this.tick_count++;
    const transitions: SensoryTransition[] = [];

    // World events: rain (wet), sun (warm), dry (unwet)
    if (this.tick_count % 500 === 0 && Math.random() < 0.5) {
      // Rain: random objects get wet
      for (const idx of this.available_objects) {
        if (Math.random() < 0.3 && !this.broken.has(idx)) this.wet.add(idx);
      }
    }
    if (this.tick_count % 700 === 0 && Math.random() < 0.4) {
      // Sun: random objects warm up
      for (const idx of this.available_objects) {
        if (Math.random() < 0.2 && !this.broken.has(idx)) this.warmed.add(idx);
      }
    }
    if (this.tick_count % 300 === 0) {
      // Dry: wet things dry, warm things cool
      for (const idx of [...this.wet]) if (Math.random() < 0.4) this.wet.delete(idx);
      for (const idx of [...this.warmed]) if (Math.random() < 0.3) this.warmed.delete(idx);
    }

    // Ambient: random object produces background sensory signal (look action)
    if (this.available_objects.length > 0 && Math.random() < 0.5) {
      const idx = this.available_objects[Math.floor(Math.random() * this.available_objects.length)];
      if (!this.broken.has(idx)) {
        const obj = OBJECTS[idx];
        const { channels, valence } = computePhysics(obj, 4); // look
        transitions.push({
          action_id: 4,
          object_idx: idx,
          channels,
          speech: SILENCE,
          valence: 0, // ambient observation = neutral
          debug_label: `ambient:${obj.name}`,
        });
      }
    }

    // Mama speech: sometimes names an object (with speech channel)
    if (this.mama_present && Math.random() < 0.2) {
      const idx = this.available_objects[Math.floor(Math.random() * this.available_objects.length)];
      const obj = OBJECTS[idx];
      const speech = encodeSpeech(obj.name);
      transitions.push({
        action_id: -1, // no physical action, just speech
        object_idx: idx,
        channels: new Array(13).fill(0), // no physical signal
        speech,
        valence: 0.1, // mama voice = mildly positive
        debug_label: `mama:${obj.name}`,
      });
    }

    return transitions;
  }

  /** Execute brain's action on a random available object. Returns sensory transition. */
  act(action_id: number, object_idx?: number): SensoryTransition {
    // Pick object
    const available = this.available_objects.filter(i => !this.broken.has(i));
    if (available.length === 0) {
      return {
        action_id, object_idx: -1,
        channels: new Array(13).fill(0),
        speech: SILENCE, valence: 0,
        debug_label: 'nothing',
      };
    }

    const idx = (object_idx !== undefined && available.includes(object_idx))
      ? object_idx
      : available[Math.floor(Math.random() * available.length)];

    const obj = OBJECTS[idx];
    const act = clamp(action_id, 0, 5);
    const { channels, valence: baseValence } = computePhysics(obj, act);

    // State-dependent valence modifiers
    let valence = baseValence;

    // Wet objects are slippery: push/shake gives surprise bonus
    if (this.wet.has(idx) && (act === 1 || act === 3)) {
      channels[0] += 0.3; // extra displacement
      channels[3] += 0.2; // extra rotation
      valence += 0.1; // surprising = interesting
    }

    // Flipped objects behave differently: touch gives unusual texture
    if (this.flipped.has(idx) && act === 0) {
      channels[7] = 1 - channels[7]; // hardness inverted (bottom surface)
      channels[8] = 1 - channels[8]; // smoothness inverted
      valence += 0.05; // slightly novel
    }

    // Warmed objects: temperature higher
    if (this.warmed.has(idx)) {
      channels[9] += 0.3; // warmer
      if (channels[9] > 0.4) valence -= 0.15; // too hot = pain
    }

    // Drop can flip objects
    if (act === 2 && Math.random() < 0.3 && !this.broken.has(idx)) {
      this.flipped.add(idx);
    }

    // Squeeze wet objects: they squirt (surprising)
    if (act === 5 && this.wet.has(idx)) {
      channels[10] += 0.4; // deformation
      channels[5] += 0.3; // squirt sound
      valence += 0.2; // fun!
      this.wet.delete(idx); // no longer wet
    }

    // Repeated same action on same object = boredom (diminishing valence)
    if (this.last_action && this.last_action.action === act && this.last_action.object === idx) {
      valence *= 0.5; // repetition is boring
    }
    this.last_action = { action: act, object: idx, valence };

    // Track breakage
    const justBroke = channels[11] > 0.5 && !this.broken.has(idx);
    if (channels[11] > 0.5) {
      this.broken.add(idx);
    }

    // Clamp channels
    for (let i = 0; i < channels.length; i++) channels[i] = clamp(channels[i], -1, 1);
    valence = clamp(valence, -1, 1);

    // Mama feedback as separate transition (social learning)
    let mamaFeedback: SensoryTransition | null = null;
    if (this.mama_present) {
      if (justBroke) {
        // Mama says "нельзя" — negative feedback
        mamaFeedback = {
          action_id: -1, object_idx: idx,
          channels: new Array(13).fill(0),
          speech: encodeSpeech('нельзя'),
          valence: -0.4,
          debug_label: 'mama:нельзя',
        };
      } else if (valence > 0.2 && Math.random() < 0.3) {
        // Mama says "молодец" — positive feedback for good actions
        mamaFeedback = {
          action_id: -1, object_idx: idx,
          channels: new Array(13).fill(0),
          speech: encodeSpeech('молодец'),
          valence: 0.3,
          debug_label: 'mama:молодец',
        };
      }
    }

    // Store mama feedback for daemon to pick up
    if (mamaFeedback) this.pendingFeedback.push(mamaFeedback);

    return {
      action_id: act,
      object_idx: idx,
      channels,
      speech: SILENCE,
      valence,
      debug_label: `${ACTIONS[act]}:${obj.name}`,
    };
  }

  /** Level up: add more objects */
  levelUp(): void {
    this.level++;
    if (this.level === 1) this.available_objects = [0, 1, 2, 3, 4, 5, 6, 7];
    if (this.level === 2) this.available_objects = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    this.mama_present = Math.random() < (1 - this.level * 0.2);
  }

  drainFeedback(): SensoryTransition[] {
    const fb = this.pendingFeedback;
    this.pendingFeedback = [];
    return fb;
  }

  getLevel(): number { return this.level; }
  getObjectCount(): number { return this.available_objects.filter(i => !this.broken.has(i)).length; }
  getTick(): number { return this.tick_count; }

  getDebugInfo(): { objects: string[]; broken: string[]; level: number } {
    return {
      objects: this.available_objects.map(i => OBJECTS[i].name),
      broken: Array.from(this.broken).map(i => OBJECTS[i].name),
      level: this.level,
    };
  }
}
