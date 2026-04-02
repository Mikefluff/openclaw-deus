/**
 * 3D Physics World: rigid body sandbox with cannon-es.
 *
 * A 1m × 1m playpen with walls, floor, gravity.
 * Objects have real mass, shape, friction, elasticity.
 * Brain receives 13 channels per interaction — all spatially meaningful.
 *
 * Sensory channels:
 *   [0-2]  target relative position (x, y, z) normalized to [-1,1]
 *   [3-5]  target velocity after action (dx, dy, dz) normalized
 *   [6]    impact force (0-1)
 *   [7]    distance to nearest other object (0-1)
 *   [8]    surface hardness (material property)
 *   [9]    surface smoothness (1 - friction)
 *   [10]   sound amplitude (from impact/action)
 *   [11]   deformation (soft objects under force)
 *   [12]   breakage (fragile objects on hard impact)
 */

import * as CANNON from 'cannon-es';

// ═══════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════

export interface Object3D {
  name: string;
  mass: number;
  radius: number;          // bounding sphere for simple collision
  shape: 'sphere' | 'box';
  halfExtents?: [number, number, number]; // for box shape
  hardness: number;
  friction: number;
  fragility: number;
  elasticity: number;
  sound_base: number;
  color: string;
}

export interface SensoryTransition3D {
  action_id: number;
  object_idx: number;
  channels: number[];
  speech: number[];
  valence: number;
  debug_label?: string;
  positions?: { idx: number; x: number; y: number; z: number; name: string; color: string }[];
}

// ═══════════════════════════════════════════
// OBJECTS — designed for meaningful physics differences
// ═══════════════════════════════════════════

const OBJECTS_3D: Object3D[] = [
  // Мячик: light, bouncy, rolls far
  { name: 'мячик',   mass: 0.2,  radius: 0.06, shape: 'sphere', hardness: 0.3, friction: 0.2, fragility: 0.0,  elasticity: 0.85, sound_base: 0.5, color: '#f44336' },
  // Кубик: medium, doesn't roll, slides
  { name: 'кубик',   mass: 0.3,  radius: 0.05, shape: 'box', halfExtents: [0.05, 0.05, 0.05], hardness: 0.9, friction: 0.4, fragility: 0.1, elasticity: 0.1, sound_base: 0.3, color: '#2196f3' },
  // Книжка: flat, heavy, doesn't bounce
  { name: 'книжка',  mass: 0.5,  radius: 0.08, shape: 'box', halfExtents: [0.08, 0.015, 0.06], hardness: 0.5, friction: 0.6, fragility: 0.2, elasticity: 0.02, sound_base: 0.2, color: '#795548' },
  // Подушка: soft, light, absorbs impact
  { name: 'подушка', mass: 0.15, radius: 0.08, shape: 'box', halfExtents: [0.08, 0.04, 0.08], hardness: 0.05, friction: 0.7, fragility: 0.0, elasticity: 0.2, sound_base: 0.05, color: '#e8e8e8' },
  // Кукла: tall, tippy, medium weight
  { name: 'кукла',   mass: 0.25, radius: 0.04, shape: 'box', halfExtents: [0.03, 0.08, 0.03], hardness: 0.2, friction: 0.5, fragility: 0.15, elasticity: 0.1, sound_base: 0.1, color: '#ff9800' },
  // Машинка: heavy bottom, low friction → rolls on push
  { name: 'машинка', mass: 0.4,  radius: 0.06, shape: 'box', halfExtents: [0.06, 0.03, 0.035], hardness: 0.7, friction: 0.1, fragility: 0.1, elasticity: 0.05, sound_base: 0.4, color: '#4caf50' },
  // Тарелка: flat, fragile, breaks on drop
  { name: 'тарелка', mass: 0.2,  radius: 0.08, shape: 'box', halfExtents: [0.08, 0.01, 0.08], hardness: 0.8, friction: 0.2, fragility: 0.85, elasticity: 0.0, sound_base: 0.6, color: '#f5f5f5' },
  // Стакан: fragile, hollow feel, breaks easily
  { name: 'стакан',  mass: 0.15, radius: 0.03, shape: 'box', halfExtents: [0.03, 0.05, 0.03], hardness: 0.85, friction: 0.15, fragility: 0.9, elasticity: 0.0, sound_base: 0.5, color: '#b2ebf2' },
];

// Speech
const SILENCE = new Array(16).fill(0);
function encodeSpeech(text: string): number[] {
  const codes: number[] = [];
  for (const ch of text.toLowerCase()) {
    const cp = ch.charCodeAt(0);
    if (cp >= 0x430 && cp <= 0x44f) codes.push((cp - 0x430 + 1) / 32);
    else codes.push(0);
  }
  while (codes.length < 16) codes.push(0);
  return codes.slice(0, 16);
}

function clamp(v: number, lo = -1, hi = 1): number { return Math.max(lo, Math.min(hi, v)); }

// ═══════════════════════════════════════════
// WORLD
// ═══════════════════════════════════════════

const ROOM_SIZE = 0.5; // half-size: room is 1m × 1m
const WALL_HEIGHT = 0.5;

export class PhysicsWorld3D {
  private world: CANNON.World;
  private bodies: CANNON.Body[] = [];
  private broken = new Set<number>();
  private tick_count = 0;
  private mama_present = true;
  private level = 0;
  private available: number[] = [];
  pendingFeedback: SensoryTransition3D[] = [];

  constructor() {
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    this.world.defaultContactMaterial.friction = 0.3;
    this.world.defaultContactMaterial.restitution = 0.2;

    // Floor
    const floor = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Box(new CANNON.Vec3(2, 0.05, 2)),
    });
    floor.position.set(0, -0.05, 0);
    this.world.addBody(floor);

    // 4 walls (solid boxes)
    const wallX = new CANNON.Box(new CANNON.Vec3(ROOM_SIZE, WALL_HEIGHT / 2, 0.05));
    const wallZ = new CANNON.Box(new CANNON.Vec3(0.05, WALL_HEIGHT / 2, ROOM_SIZE));
    for (const [x, z, shape] of [
      [0, ROOM_SIZE + 0.05, wallX], [0, -ROOM_SIZE - 0.05, wallX],
      [ROOM_SIZE + 0.05, 0, wallZ], [-ROOM_SIZE - 0.05, 0, wallZ],
    ] as [number, number, CANNON.Box][]) {
      const w = new CANNON.Body({ type: CANNON.Body.STATIC, shape });
      w.position.set(x, WALL_HEIGHT / 2, z);
      this.world.addBody(w);
    }

    // Spawn objects
    this.available = [0, 1, 2, 3, 4];
    for (let i = 0; i < OBJECTS_3D.length; i++) {
      this.spawnObject(i);
    }
  }

  private spawnObject(idx: number) {
    const obj = OBJECTS_3D[idx];
    const shape = obj.shape === 'sphere'
      ? new CANNON.Sphere(obj.radius)
      : new CANNON.Box(new CANNON.Vec3(...(obj.halfExtents || [0.05, 0.05, 0.05])));

    const mat = new CANNON.Material({ friction: obj.friction, restitution: obj.elasticity });

    // Place on floor in a grid pattern inside room
    const col = idx % 3;
    const row = Math.floor(idx / 3);
    const x = (col - 1) * 0.25;
    const z = (row - 1) * 0.25;
    const y = obj.shape === 'sphere' ? obj.radius : (obj.halfExtents?.[1] ?? 0.05);

    const body = new CANNON.Body({ mass: obj.mass, shape, material: mat, position: new CANNON.Vec3(x, y + 0.01, z) });
    body.linearDamping = 0.3; // air resistance — objects slow down
    body.angularDamping = 0.5;
    this.world.addBody(body);
    this.bodies[idx] = body;
  }

  // ═══════════════════════════════════════════
  // SENSORY
  // ═══════════════════════════════════════════

  private buildChannels(idx: number, impactForce: number): number[] {
    const obj = OBJECTS_3D[idx];
    const b = this.bodies[idx];
    if (!b) return new Array(13).fill(0);

    // Position relative to room center, normalized by room size
    const px = b.position.x / ROOM_SIZE;
    const py = b.position.y / WALL_HEIGHT;
    const pz = b.position.z / ROOM_SIZE;

    // Velocity normalized
    const vx = b.velocity.x / 2;
    const vy = b.velocity.y / 2;
    const vz = b.velocity.z / 2;

    // Nearest other object
    let minDist = 1;
    for (let i = 0; i < this.bodies.length; i++) {
      if (i === idx || !this.available.includes(i) || this.broken.has(i) || !this.bodies[i]) continue;
      const d = b.position.distanceTo(this.bodies[i].position);
      if (d < minDist) minDist = d;
    }

    const sound = Math.min(1, impactForce * obj.sound_base * 3);
    const deform = Math.min(1, impactForce * (1 - obj.hardness));
    const breakage = (obj.fragility > 0.5 && impactForce > 0.4) ? Math.min(1, impactForce * obj.fragility) : 0;

    return [
      clamp(px), clamp(py), clamp(pz),
      clamp(vx), clamp(vy), clamp(vz),
      clamp(impactForce, 0, 1),
      clamp(minDist, 0, 1),
      clamp(obj.hardness, 0, 1),
      clamp(1 - obj.friction, 0, 1),
      clamp(sound, 0, 1),
      clamp(deform, 0, 1),
      clamp(breakage, 0, 1),
    ];
  }

  // ═══════════════════════════════════════════
  // ACTIONS — baby-strength forces
  // ═══════════════════════════════════════════

  act(action_id: number, object_idx?: number): SensoryTransition3D {
    const avail = this.available.filter(i => !this.broken.has(i));
    if (avail.length === 0) {
      return { action_id, object_idx: -1, channels: new Array(13).fill(0), speech: SILENCE, valence: 0 };
    }

    const idx = object_idx !== undefined && avail.includes(object_idx)
      ? object_idx : avail[Math.floor(Math.random() * avail.length)];

    const act = Math.max(0, Math.min(5, action_id));
    const body = this.bodies[idx];
    const obj = OBJECTS_3D[idx];
    if (!body) return { action_id: act, object_idx: idx, channels: new Array(13).fill(0), speech: SILENCE, valence: 0 };

    let impactForce = 0;

    switch (act) {
      case 0: // touch — gentle poke, feel surface
        body.applyImpulse(new CANNON.Vec3(0.02, 0, 0));
        impactForce = 0.05;
        break;
      case 1: { // push — directional force along ground
        const angle = Math.random() * Math.PI * 2;
        const force = 0.3 / Math.max(0.1, obj.mass); // lighter = pushes further
        body.applyImpulse(new CANNON.Vec3(Math.cos(angle) * force, 0.05, Math.sin(angle) * force));
        impactForce = 0.2;
        break;
      }
      case 2: // drop — lift 30cm and release
        body.position.y = 0.3;
        body.velocity.set(0, 0, 0);
        // Simulate fall
        for (let i = 0; i < 30; i++) this.world.step(1 / 60);
        impactForce = 0.5 * obj.mass; // heavier = harder impact
        break;
      case 3: // shake — quick oscillation
        body.applyImpulse(new CANNON.Vec3((Math.random() - 0.5) * 0.2, 0.15, (Math.random() - 0.5) * 0.2));
        impactForce = 0.15;
        break;
      case 4: // look — no interaction
        impactForce = 0;
        break;
      case 5: // squeeze — downward pressure
        body.applyImpulse(new CANNON.Vec3(0, -0.1, 0));
        impactForce = 0.25 * (1 - obj.hardness); // soft = more deformation
        break;
    }

    // Simulate physics response (0.5s)
    if (act !== 2) { // drop already simulated
      for (let i = 0; i < 30; i++) this.world.step(1 / 60);
    }

    const channels = this.buildChannels(idx, impactForce);

    // Valence
    let valence = 0;
    const speed = Math.sqrt(body.velocity.x ** 2 + body.velocity.z ** 2);
    if (speed > 0.5) valence += 0.1; // movement is interesting
    if (channels[12] > 0.3) valence = -0.5; // breakage = bad

    // Track breakage
    const justBroke = channels[12] > 0.3 && !this.broken.has(idx);
    if (channels[12] > 0.3) this.broken.add(idx);

    // Mama feedback
    if (this.mama_present) {
      if (justBroke) {
        this.pendingFeedback.push({
          action_id: -1, object_idx: idx,
          channels: new Array(13).fill(0), speech: encodeSpeech('нельзя'),
          valence: -0.4, debug_label: 'mama:нельзя',
        });
      } else if (valence > 0.05 && Math.random() < 0.25) {
        this.pendingFeedback.push({
          action_id: -1, object_idx: idx,
          channels: new Array(13).fill(0), speech: encodeSpeech('молодец'),
          valence: 0.3, debug_label: 'mama:молодец',
        });
      }
    }

    return {
      action_id: act, object_idx: idx, channels, speech: SILENCE,
      valence: clamp(valence),
      debug_label: `${['touch','push','drop','shake','look','squeeze'][act]}:${obj.name}`,
      positions: this.getAllPositions(),
    };
  }

  tick(): SensoryTransition3D[] {
    this.tick_count++;
    const transitions: SensoryTransition3D[] = [];

    // Step physics (keep world alive between actions)
    this.world.step(1 / 60);

    // Ambient observation
    if (this.available.length > 0 && Math.random() < 0.4) {
      const idx = this.available.filter(i => !this.broken.has(i));
      if (idx.length > 0) {
        const i = idx[Math.floor(Math.random() * idx.length)];
        transitions.push({
          action_id: 4, object_idx: i,
          channels: this.buildChannels(i, 0), speech: SILENCE, valence: 0,
          debug_label: `ambient:${OBJECTS_3D[i].name}`,
          positions: this.getAllPositions(),
        });
      }
    }

    // Mama speech
    if (this.mama_present && Math.random() < 0.15) {
      const avail = this.available.filter(i => !this.broken.has(i));
      if (avail.length > 0) {
        const i = avail[Math.floor(Math.random() * avail.length)];
        transitions.push({
          action_id: -1, object_idx: i,
          channels: new Array(13).fill(0), speech: encodeSpeech(OBJECTS_3D[i].name),
          valence: 0.1, debug_label: `mama:${OBJECTS_3D[i].name}`,
        });
      }
    }

    return transitions;
  }

  drainFeedback(): SensoryTransition3D[] {
    const fb = this.pendingFeedback; this.pendingFeedback = []; return fb;
  }

  getAllPositions() {
    return this.available.filter(i => !this.broken.has(i) && this.bodies[i]).map(i => ({
      idx: i,
      x: this.bodies[i].position.x,
      y: this.bodies[i].position.y,
      z: this.bodies[i].position.z,
      name: OBJECTS_3D[i].name,
      color: OBJECTS_3D[i].color,
    }));
  }

  levelUp(): void {
    this.level++;
    if (this.level === 1) this.available = [0, 1, 2, 3, 4, 5, 6, 7];
    if (this.level >= 2) this.available = [0, 1, 2, 3, 4, 5, 6, 7];
    this.mama_present = Math.random() < (1 - this.level * 0.2);
  }

  getLevel(): number { return this.level; }
  getObjectCount(): number { return this.available.filter(i => !this.broken.has(i)).length; }
}
