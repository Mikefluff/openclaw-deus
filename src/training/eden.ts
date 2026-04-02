/**
 * Eden Garden: developmental environment for DEUS cognitive kernel.
 *
 * A headless cannon-es physics world that grows with the brain.
 * Stage 0: empty room, 2 objects, look only
 * Stage 1: 4 objects, reach + touch, surfaces differ
 * Stage 2: 6 objects + containers, push/drop/shake, cause-effect chains
 *
 * Percepts are RELATIONAL — brain receives spatial relations, not just raw numbers.
 * Sensory channels (13):
 *   [0-2]  target position relative to agent (x, y, z)
 *   [3-5]  target velocity after action (dx, dy, dz)
 *   [6]    contact force
 *   [7]    nearest neighbor distance
 *   [8]    surface hardness
 *   [9]    surface smoothness
 *   [10]   sound
 *   [11]   deformation
 *   [12]   breakage
 *
 * Additional relational percepts (via extra channels 13-15):
 *   [13]   is_contained (0 or 1 — object is inside a container)
 *   [14]   is_stacked (0 or 1 — object has something on top)
 *   [15]   agent_distance (0-1, how far from agent's reach)
 */

import * as CANNON from 'cannon-es';

// ═══════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════

export interface EdenObject {
  name: string;
  mass: number;
  shape: 'sphere' | 'box' | 'cylinder';
  halfExtents: [number, number, number];
  hardness: number;
  friction: number;
  fragility: number;
  elasticity: number;
  sound_base: number;
  color: string;
  // Affordances (brain discovers these through interaction)
  graspable: boolean;
  stackable: boolean;   // flat top
  containable: boolean; // hollow — things can go inside
  rollable: boolean;
}

export interface EdenTransition {
  action_id: number;
  object_idx: number;
  channels: number[];      // 16 sensory channels
  speech: number[];        // 16 speech channels
  valence: number;
  debug_label?: string;
  // World snapshot for dashboard
  snapshot?: EdenSnapshot;
}

export interface EdenSnapshot {
  objects: { idx: number; name: string; x: number; y: number; z: number; color: string; broken: boolean }[];
  relations: { subject: number; relation: string; object: number }[];
  stage: number;
  agentPos: [number, number, number];
}

// ═══════════════════════════════════════════
// OBJECTS — designed for developmental discovery
// ═══════════════════════════════════════════

const EDEN_OBJECTS: EdenObject[] = [
  // Stage 0-1: basic objects with VERY different properties
  { name: 'мячик',   mass: 0.2,  shape: 'sphere',   halfExtents: [0.06, 0.06, 0.06],    hardness: 0.3, friction: 0.2, fragility: 0,    elasticity: 0.85, sound_base: 0.5, color: '#f44336', graspable: true,  stackable: false, containable: false, rollable: true },
  { name: 'кубик',   mass: 0.3,  shape: 'box',      halfExtents: [0.05, 0.05, 0.05],    hardness: 0.9, friction: 0.5, fragility: 0.1,  elasticity: 0.1,  sound_base: 0.4, color: '#2196f3', graspable: true,  stackable: true,  containable: false, rollable: false },
  // Stage 1: more contrast
  { name: 'подушка', mass: 0.15, shape: 'box',      halfExtents: [0.08, 0.03, 0.08],    hardness: 0.05,friction: 0.7, fragility: 0,    elasticity: 0.3,  sound_base: 0.05,color: '#e0e0e0', graspable: true,  stackable: true,  containable: false, rollable: false },
  { name: 'колокольчик', mass: 0.1, shape: 'sphere', halfExtents: [0.03, 0.03, 0.03],  hardness: 0.8, friction: 0.2, fragility: 0.3,  elasticity: 0.6,  sound_base: 0.9, color: '#ffd700', graspable: true,  stackable: false, containable: false, rollable: true },
  // Stage 2: containers + stackable
  { name: 'чашка',   mass: 0.2,  shape: 'cylinder', halfExtents: [0.04, 0.05, 0.04],    hardness: 0.7, friction: 0.3, fragility: 0.5,  elasticity: 0.0,  sound_base: 0.5, color: '#ff9800', graspable: true,  stackable: true,  containable: true,  rollable: false },
  { name: 'коробка', mass: 0.3,  shape: 'box',      halfExtents: [0.08, 0.04, 0.08],    hardness: 0.5, friction: 0.5, fragility: 0.1,  elasticity: 0.0,  sound_base: 0.3, color: '#795548', graspable: true,  stackable: true,  containable: true,  rollable: false },
];

// Speech encoding
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
// EDEN GARDEN
// ═══════════════════════════════════════════

const ROOM_HALF = 0.6; // 1.2m × 1.2m room

export class EdenGarden {
  private world: CANNON.World;
  private bodies: CANNON.Body[] = [];
  private broken = new Set<number>();
  private tick_count = 0;
  private stage = 0;
  private available: number[] = [];
  private lastInteracted = -1;
  private mama_present = true;
  private agentPos: [number, number, number] = [0, 0.3, -0.4]; // agent sits at edge
  pendingFeedback: EdenTransition[] = [];

  constructor() {
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    this.world.defaultContactMaterial.friction = 0.4;
    this.world.defaultContactMaterial.restitution = 0.2;

    // Floor
    const floor = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Box(new CANNON.Vec3(2, 0.05, 2)),
    });
    floor.position.set(0, -0.05, 0);
    this.world.addBody(floor);

    // 4 walls
    const wallX = new CANNON.Box(new CANNON.Vec3(ROOM_HALF, 0.3, 0.05));
    const wallZ = new CANNON.Box(new CANNON.Vec3(0.05, 0.3, ROOM_HALF));
    for (const [x, z, shape] of [
      [0, ROOM_HALF + 0.05, wallX], [0, -ROOM_HALF - 0.05, wallX],
      [ROOM_HALF + 0.05, 0, wallZ], [-ROOM_HALF - 0.05, 0, wallZ],
    ] as [number, number, CANNON.Box][]) {
      const w = new CANNON.Body({ type: CANNON.Body.STATIC, shape });
      w.position.set(x, 0.3, z);
      this.world.addBody(w);
    }

    // Spawn objects for stage 0
    for (let i = 0; i < EDEN_OBJECTS.length; i++) this.spawnObject(i);
    this.setStage(0);
  }

  private spawnObject(idx: number) {
    const obj = EDEN_OBJECTS[idx];
    let shape: CANNON.Shape;
    if (obj.shape === 'sphere') shape = new CANNON.Sphere(obj.halfExtents[0]);
    else shape = new CANNON.Box(new CANNON.Vec3(...obj.halfExtents));

    const mat = new CANNON.Material({ friction: obj.friction, restitution: obj.elasticity });
    const col = idx % 3;
    const row = Math.floor(idx / 3);
    const body = new CANNON.Body({
      mass: obj.mass,
      shape,
      material: mat,
      position: new CANNON.Vec3((col - 1) * 0.2, obj.halfExtents[1] + 0.01, (row - 0.5) * 0.2),
      linearDamping: 0.4,
      angularDamping: 0.5,
    });
    this.world.addBody(body);
    this.bodies[idx] = body;
  }

  private setStage(s: number) {
    this.stage = s;
    if (s === 0) this.available = [0, 1]; // мячик + кубик
    else if (s === 1) this.available = [0, 1, 2, 3]; // + подушка + колокольчик
    else this.available = [0, 1, 2, 3, 4, 5]; // + чашка + коробка
  }

  // ═══════════════════════════════════════════
  // RELATIONAL PERCEPTS
  // ═══════════════════════════════════════════

  private computeRelations(): { subject: number; relation: string; object: number }[] {
    const relations: { subject: number; relation: string; object: number }[] = [];
    const avail = this.available.filter(i => !this.broken.has(i));

    for (const i of avail) {
      for (const j of avail) {
        if (i === j) continue;
        const bi = this.bodies[i], bj = this.bodies[j];
        if (!bi || !bj) continue;

        const dx = bj.position.x - bi.position.x;
        const dy = bj.position.y - bi.position.y;
        const dz = bj.position.z - bi.position.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        // ON: j is on top of i (dy > 0, close horizontally)
        if (dy > 0.03 && dy < 0.15 && Math.abs(dx) < 0.08 && Math.abs(dz) < 0.08) {
          relations.push({ subject: j, relation: 'on', object: i });
        }

        // NEAR: close but not on top
        if (dist < 0.2 && Math.abs(dy) < 0.05) {
          relations.push({ subject: i, relation: 'near', object: j });
        }

        // INSIDE: j is inside i (container), close position, i is containable
        if (EDEN_OBJECTS[i].containable && dist < 0.06 && dy > -0.02 && dy < 0.08) {
          relations.push({ subject: j, relation: 'inside', object: i });
        }
      }
    }

    return relations;
  }

  private buildChannels(idx: number, impactForce: number): number[] {
    const obj = EDEN_OBJECTS[idx];
    const b = this.bodies[idx];
    if (!b) return new Array(16).fill(0);

    // Position relative to agent, normalized
    const px = (b.position.x - this.agentPos[0]) / ROOM_HALF;
    const py = (b.position.y - this.agentPos[1]) / 0.5;
    const pz = (b.position.z - this.agentPos[2]) / ROOM_HALF;

    const vx = b.velocity.x / 2;
    const vy = b.velocity.y / 2;
    const vz = b.velocity.z / 2;

    // Nearest other object
    let minDist = 1;
    for (const i of this.available) {
      if (i === idx || this.broken.has(i) || !this.bodies[i]) continue;
      const d = b.position.distanceTo(this.bodies[i].position);
      if (d < minDist) minDist = d;
    }

    const sound = Math.min(1, impactForce * obj.sound_base * 3);
    const deform = Math.min(1, impactForce * (1 - obj.hardness));
    const breakage = (obj.fragility > 0.4 && impactForce > 0.4) ? Math.min(1, impactForce * obj.fragility) : 0;

    // Relational channels
    const relations = this.computeRelations();
    const isContained = relations.some(r => r.subject === idx && r.relation === 'inside') ? 1 : 0;
    const isStacked = relations.some(r => r.object === idx && r.relation === 'on') ? 1 : 0;
    const agentDist = Math.sqrt(
      (b.position.x - this.agentPos[0]) ** 2 +
      (b.position.z - this.agentPos[2]) ** 2
    );

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
      // Relational channels
      isContained,
      isStacked,
      clamp(agentDist / ROOM_HALF, 0, 1),
    ];
  }

  // ═══════════════════════════════════════════
  // ACTIONS
  // ═══════════════════════════════════════════

  act(action_id: number, object_idx?: number): EdenTransition {
    const avail = this.available.filter(i => !this.broken.has(i));
    if (avail.length === 0) {
      return { action_id, object_idx: -1, channels: new Array(16).fill(0), speech: SILENCE, valence: 0 };
    }

    const idx = object_idx !== undefined && avail.includes(object_idx)
      ? object_idx : avail[Math.floor(Math.random() * avail.length)];

    this.lastInteracted = idx;
    const act = Math.max(0, Math.min(5, action_id));
    const body = this.bodies[idx];
    const obj = EDEN_OBJECTS[idx];
    if (!body) return { action_id: act, object_idx: idx, channels: new Array(16).fill(0), speech: SILENCE, valence: 0 };

    let impactForce = 0;

    switch (act) {
      case 0: // touch
        body.applyImpulse(new CANNON.Vec3(0.01, 0, 0));
        impactForce = 0.05;
        break;
      case 1: { // push
        const angle = Math.random() * Math.PI * 2;
        const force = 0.2 / Math.max(0.1, obj.mass);
        body.applyImpulse(new CANNON.Vec3(Math.cos(angle) * force, 0.03, Math.sin(angle) * force));
        impactForce = 0.2;
        break;
      }
      case 2: // drop from 25cm
        body.position.y = 0.25;
        body.velocity.set(0, 0, 0);
        for (let i = 0; i < 30; i++) this.world.step(1 / 60);
        impactForce = 0.4 * obj.mass;
        break;
      case 3: // shake
        body.applyImpulse(new CANNON.Vec3((Math.random() - 0.5) * 0.15, 0.1, (Math.random() - 0.5) * 0.15));
        impactForce = 0.15;
        break;
      case 4: // look — no force
        impactForce = 0;
        break;
      case 5: // squeeze
        body.applyImpulse(new CANNON.Vec3(0, -0.05, 0));
        impactForce = 0.2 * (1 - obj.hardness);
        break;
    }

    // Simulate 0.5s
    if (act !== 2) for (let i = 0; i < 30; i++) this.world.step(1 / 60);

    // Reset fallen objects
    for (let i = 0; i < this.bodies.length; i++) {
      if (this.bodies[i] && this.bodies[i].position.y < -1) {
        const col = i % 3, row = Math.floor(i / 3);
        this.bodies[i].position.set((col - 1) * 0.2, 0.1, (row - 0.5) * 0.2);
        this.bodies[i].velocity.set(0, 0, 0);
      }
    }

    const channels = this.buildChannels(idx, impactForce);

    // Valence
    let valence = 0;
    const speed = Math.sqrt(body.velocity.x ** 2 + body.velocity.z ** 2);
    if (speed > 0.3) valence += 0.1; // movement interesting
    if (channels[10] > 0.3) valence += 0.15; // sound = interesting (especially колокольчик)
    if (channels[12] > 0.3) valence = -0.5; // breakage bad

    // Track breakage
    const justBroke = channels[12] > 0.3 && !this.broken.has(idx);
    if (channels[12] > 0.3) this.broken.add(idx);

    // Mama feedback
    if (this.mama_present) {
      if (justBroke) {
        this.pendingFeedback.push({
          action_id: -1, object_idx: idx,
          channels: new Array(16).fill(0), speech: encodeSpeech('нельзя'),
          valence: -0.4, debug_label: 'mama:нельзя',
        });
      } else if (channels[10] > 0.5 && Math.random() < 0.4) {
        // Mama excited by sound
        this.pendingFeedback.push({
          action_id: -1, object_idx: idx,
          channels: new Array(16).fill(0), speech: encodeSpeech('ой'),
          valence: 0.2, debug_label: 'mama:ой',
        });
      } else if (valence > 0.1 && Math.random() < 0.2) {
        this.pendingFeedback.push({
          action_id: -1, object_idx: idx,
          channels: new Array(16).fill(0), speech: encodeSpeech('молодец'),
          valence: 0.3, debug_label: 'mama:молодец',
        });
      }
    }

    return {
      action_id: act, object_idx: idx, channels, speech: SILENCE,
      valence: clamp(valence),
      debug_label: `${['touch','push','drop','shake','look','squeeze'][act]}:${obj.name}`,
      snapshot: this.getSnapshot(),
    };
  }

  tick(): EdenTransition[] {
    this.tick_count++;
    const transitions: EdenTransition[] = [];

    this.world.step(1 / 60);

    // Ambient: look at random available object
    if (Math.random() < 0.3) {
      const avail = this.available.filter(i => !this.broken.has(i));
      if (avail.length > 0) {
        const i = avail[Math.floor(Math.random() * avail.length)];
        transitions.push({
          action_id: 4, object_idx: i,
          channels: this.buildChannels(i, 0), speech: SILENCE, valence: 0,
          debug_label: `ambient:${EDEN_OBJECTS[i].name}`,
          snapshot: this.getSnapshot(),
        });
      }
    }

    // Mama names what baby last touched (contextual speech)
    if (this.mama_present && Math.random() < 0.12) {
      const avail = this.available.filter(i => !this.broken.has(i));
      if (avail.length > 0) {
        const i = (this.lastInteracted >= 0 && avail.includes(this.lastInteracted) && Math.random() < 0.75)
          ? this.lastInteracted
          : avail[Math.floor(Math.random() * avail.length)];
        transitions.push({
          action_id: -1, object_idx: i,
          channels: new Array(16).fill(0), speech: encodeSpeech(EDEN_OBJECTS[i].name),
          valence: 0.1, debug_label: `mama:${EDEN_OBJECTS[i].name}`,
        });
      }
    }

    return transitions;
  }

  drainFeedback(): EdenTransition[] {
    const fb = this.pendingFeedback; this.pendingFeedback = []; return fb;
  }

  getSnapshot(): EdenSnapshot {
    return {
      objects: this.available.map(i => ({
        idx: i,
        name: EDEN_OBJECTS[i].name,
        x: this.bodies[i]?.position.x ?? 0,
        y: this.bodies[i]?.position.y ?? 0,
        z: this.bodies[i]?.position.z ?? 0,
        color: EDEN_OBJECTS[i].color,
        broken: this.broken.has(i),
      })),
      relations: this.computeRelations(),
      stage: this.stage,
      agentPos: this.agentPos,
    };
  }

  advanceStage(): boolean {
    if (this.stage >= 2) return false;
    this.setStage(this.stage + 1);
    return true;
  }

  getStage(): number { return this.stage; }
  getLevel(): number { return this.stage; }
  getObjectCount(): number { return this.available.filter(i => !this.broken.has(i)).length; }
}
