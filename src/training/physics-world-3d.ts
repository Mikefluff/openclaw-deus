/**
 * 3D Physics World: rigid body simulation with cannon-es.
 *
 * Brain receives 3D sensory channels:
 *   [0-2]  target position (x, y, z) relative to agent
 *   [3-5]  target velocity (dx, dy, dz) after action
 *   [6]    collision force (impact strength)
 *   [7]    distance to nearest other object
 *   [8]    surface hardness (from material)
 *   [9]    surface smoothness (1 - friction)
 *   [10]   sound amplitude (from impact)
 *   [11]   deformation (soft objects)
 *   [12]   breakage (fragile objects)
 *
 * 13 channels — same count as flat world, but spatially meaningful.
 */

import * as CANNON from 'cannon-es';

// ═══════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════

export interface Object3D {
  name: string;
  mass: number;
  size: [number, number, number]; // x, y, z dimensions
  shape: 'sphere' | 'box' | 'cylinder';
  hardness: number;    // 0-1
  friction: number;    // 0-1
  fragility: number;   // 0-1
  elasticity: number;  // 0-1 (bounciness)
  sound_base: number;
  color: string;       // for visualization
}

export interface SensoryTransition3D {
  action_id: number;
  object_idx: number;
  channels: number[];   // 13 sensory channels
  speech: number[];     // 16 speech channels
  valence: number;
  debug_label?: string;
  // 3D state for visualization
  positions?: { idx: number; x: number; y: number; z: number }[];
}

// ═══════════════════════════════════════════
// OBJECTS
// ═══════════════════════════════════════════

const OBJECTS_3D: Object3D[] = [
  { name: 'мячик',    mass: 0.3,  size: [0.15, 0.15, 0.15], shape: 'sphere',   hardness: 0.3, friction: 0.3,  fragility: 0.05, elasticity: 0.9,  sound_base: 0.6, color: '#f44336' },
  { name: 'кубик',    mass: 0.4,  size: [0.12, 0.12, 0.12], shape: 'box',      hardness: 0.9, friction: 0.5,  fragility: 0.1,  elasticity: 0.1,  sound_base: 0.3, color: '#2196f3' },
  { name: 'книжка',   mass: 0.5,  size: [0.2, 0.03, 0.15],  shape: 'box',      hardness: 0.4, friction: 0.6,  fragility: 0.3,  elasticity: 0.05, sound_base: 0.2, color: '#795548' },
  { name: 'подушка',  mass: 0.2,  size: [0.2, 0.1, 0.2],    shape: 'box',      hardness: 0.05,friction: 0.7,  fragility: 0.0,  elasticity: 0.3,  sound_base: 0.1, color: '#e0e0e0' },
  { name: 'кукла',    mass: 0.3,  size: [0.08, 0.2, 0.08],   shape: 'cylinder', hardness: 0.2, friction: 0.5,  fragility: 0.2,  elasticity: 0.1,  sound_base: 0.1, color: '#ff9800' },
  { name: 'машинка',  mass: 0.5,  size: [0.15, 0.08, 0.08],  shape: 'box',      hardness: 0.7, friction: 0.15, fragility: 0.15, elasticity: 0.05, sound_base: 0.4, color: '#4caf50' },
  { name: 'тарелка',  mass: 0.3,  size: [0.2, 0.02, 0.2],    shape: 'cylinder', hardness: 0.8, friction: 0.2,  fragility: 0.85, elasticity: 0.0,  sound_base: 0.5, color: '#ffffff' },
  { name: 'стакан',   mass: 0.25, size: [0.06, 0.12, 0.06],   shape: 'cylinder', hardness: 0.85,friction: 0.15, fragility: 0.9,  elasticity: 0.0,  sound_base: 0.5, color: '#b2ebf2' },
];

// Speech encoding (same as flat world)
const SILENCE = new Array(16).fill(0);
function encodeSpeech(text: string): number[] {
  const codes: number[] = [];
  for (const ch of text.toLowerCase()) {
    const cp = ch.charCodeAt(0);
    if (cp >= 0x430 && cp <= 0x44f) codes.push((cp - 0x430 + 1) / 32);
    else if (ch === ' ') codes.push(0);
    else codes.push(0);
  }
  while (codes.length < 16) codes.push(0);
  return codes.slice(0, 16);
}

// ═══════════════════════════════════════════
// 3D PHYSICS WORLD
// ═══════════════════════════════════════════

export class PhysicsWorld3D {
  private world: CANNON.World;
  private bodies: CANNON.Body[] = [];
  private objects: Object3D[] = [];
  private ground!: CANNON.Body;
  private broken = new Set<number>();
  private tick_count = 0;
  private mama_present = true;
  private level = 0;
  private available: number[] = [];
  pendingFeedback: SensoryTransition3D[] = [];

  constructor() {
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });

    // Ground plane
    this.ground = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Plane(),
    });
    this.ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(this.ground);

    // Walls (playpen: 2m × 2m)
    const wallMat = new CANNON.Material({ friction: 0.5, restitution: 0.3 });
    for (const [px, pz, rx, rz] of [[1, 0, 0, 0], [-1, 0, 0, 0], [0, 1, 0, Math.PI / 2], [0, -1, 0, Math.PI / 2]] as [number, number, number, number][]) {
      const wall = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane(), material: wallMat });
      wall.position.set(px, 0.5, pz);
      wall.quaternion.setFromEuler(0, rz || (px > 0 ? -Math.PI / 2 : Math.PI / 2), 0);
      this.world.addBody(wall);
    }

    // Spawn objects on a table (y=0.5)
    this.available = [0, 1, 2, 3, 4];
    for (let i = 0; i < OBJECTS_3D.length; i++) {
      this.spawnObject(i);
    }
    this.objects = OBJECTS_3D;
  }

  private spawnObject(idx: number) {
    const obj = OBJECTS_3D[idx];
    let shape: CANNON.Shape;
    if (obj.shape === 'sphere') {
      shape = new CANNON.Sphere(obj.size[0]);
    } else if (obj.shape === 'cylinder') {
      // Approximate cylinder as box (cannon-es cylinder is complex)
      shape = new CANNON.Box(new CANNON.Vec3(obj.size[0], obj.size[1] / 2, obj.size[2]));
    } else {
      shape = new CANNON.Box(new CANNON.Vec3(obj.size[0] / 2, obj.size[1] / 2, obj.size[2] / 2));
    }

    const body = new CANNON.Body({
      mass: obj.mass,
      shape,
      position: new CANNON.Vec3(
        (idx % 4 - 1.5) * 0.4,  // spread on table
        0.5 + obj.size[1],       // on table surface
        (Math.floor(idx / 4) - 0.5) * 0.4,
      ),
      material: new CANNON.Material({
        friction: obj.friction,
        restitution: obj.elasticity,
      }),
    });
    this.world.addBody(body);
    this.bodies[idx] = body;
  }

  private getRelativePosition(idx: number): [number, number, number] {
    const b = this.bodies[idx];
    if (!b) return [0, 0, 0];
    // Normalized: divide by table size (~2m)
    return [b.position.x / 2, b.position.y / 2, b.position.z / 2];
  }

  private getVelocity(idx: number): [number, number, number] {
    const b = this.bodies[idx];
    if (!b) return [0, 0, 0];
    return [
      Math.min(1, Math.max(-1, b.velocity.x / 5)),
      Math.min(1, Math.max(-1, b.velocity.y / 5)),
      Math.min(1, Math.max(-1, b.velocity.z / 5)),
    ];
  }

  private nearestDistance(idx: number): number {
    const b = this.bodies[idx];
    if (!b) return 1;
    let minDist = 10;
    for (let i = 0; i < this.bodies.length; i++) {
      if (i === idx || !this.available.includes(i) || this.broken.has(i)) continue;
      const other = this.bodies[i];
      if (!other) continue;
      const d = b.position.distanceTo(other.position);
      if (d < minDist) minDist = d;
    }
    return Math.min(1, minDist / 2);
  }

  private clamp(v: number): number { return Math.max(-1, Math.min(1, v)); }

  private buildChannels(idx: number, impactForce: number): number[] {
    const obj = this.objects[idx];
    const [px, py, pz] = this.getRelativePosition(idx);
    const [vx, vy, vz] = this.getVelocity(idx);
    const nearest = this.nearestDistance(idx);
    const sound = impactForce * obj.sound_base;
    const deformation = impactForce * (1 - obj.hardness) * 0.5;
    const breakage = obj.fragility > 0.6 && impactForce > 0.5 ? impactForce * obj.fragility : 0;

    return [
      this.clamp(px), this.clamp(py), this.clamp(pz),        // 0-2: position
      this.clamp(vx), this.clamp(vy), this.clamp(vz),        // 3-5: velocity
      this.clamp(impactForce),                                 // 6: collision force
      this.clamp(nearest),                                     // 7: nearest object distance
      this.clamp(obj.hardness),                                // 8: surface hardness
      this.clamp(1 - obj.friction),                            // 9: smoothness
      this.clamp(sound),                                       // 10: sound
      this.clamp(deformation),                                 // 11: deformation
      this.clamp(breakage),                                    // 12: breakage
    ];
  }

  // ═══════════════════════════════════════════
  // ACTIONS (6 actions, now in 3D)
  // ═══════════════════════════════════════════

  private applyAction(idx: number, action: number): number {
    const body = this.bodies[idx];
    if (!body) return 0;

    let impactForce = 0;
    const strength = 0.5; // gentle forces — baby hands

    switch (action) {
      case 0: // touch — minimal force, sense surface
        body.applyImpulse(new CANNON.Vec3(0.1, 0, 0));
        impactForce = 0.05;
        break;
      case 1: // push — horizontal force
        const dir = Math.random() * Math.PI * 2;
        body.applyImpulse(new CANNON.Vec3(
          Math.cos(dir) * strength,
          0.2,
          Math.sin(dir) * strength,
        ));
        impactForce = 0.3;
        break;
      case 2: // drop — lift and release
        body.position.y += 1.5;
        body.velocity.set(0, 0, 0);
        impactForce = 0.6; // will impact on landing
        break;
      case 3: // shake — oscillate
        body.applyImpulse(new CANNON.Vec3(
          (Math.random() - 0.5) * strength * 2,
          strength,
          (Math.random() - 0.5) * strength * 2,
        ));
        impactForce = 0.4;
        break;
      case 4: // look — no force, just observe
        impactForce = 0;
        break;
      case 5: // squeeze — compress (apply opposing forces)
        body.applyImpulse(new CANNON.Vec3(0, -0.5, 0));
        impactForce = 0.3 * (1 - this.objects[idx].hardness);
        break;
    }

    return impactForce;
  }

  // ═══════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════

  tick(): SensoryTransition3D[] {
    this.tick_count++;
    const transitions: SensoryTransition3D[] = [];

    // Step physics (60Hz, 1 step)
    this.world.step(1 / 60);

    // Reset fallen objects (below y=-2)
    for (let i = 0; i < this.bodies.length; i++) {
      if (this.bodies[i] && this.bodies[i].position.y < -2) {
        this.bodies[i].position.set((i % 4 - 1.5) * 0.4, 0.5, (Math.floor(i / 4) - 0.5) * 0.4);
        this.bodies[i].velocity.set(0, 0, 0);
      }
    }

    // Ambient: brain sees a random object (look)
    if (this.available.length > 0 && Math.random() < 0.5) {
      const idx = this.available[Math.floor(Math.random() * this.available.length)];
      if (!this.broken.has(idx)) {
        transitions.push({
          action_id: 4,
          object_idx: idx,
          channels: this.buildChannels(idx, 0),
          speech: SILENCE,
          valence: 0,
          debug_label: `ambient:${this.objects[idx].name}`,
          positions: this.getAllPositions(),
        });
      }
    }

    // Mama speech
    if (this.mama_present && Math.random() < 0.2) {
      const idx = this.available[Math.floor(Math.random() * this.available.length)];
      transitions.push({
        action_id: -1,
        object_idx: idx,
        channels: new Array(13).fill(0),
        speech: encodeSpeech(this.objects[idx].name),
        valence: 0.1,
        debug_label: `mama:${this.objects[idx].name}`,
      });
    }

    return transitions;
  }

  act(action_id: number, object_idx?: number): SensoryTransition3D {
    const avail = this.available.filter(i => !this.broken.has(i));
    if (avail.length === 0) {
      return { action_id, object_idx: -1, channels: new Array(13).fill(0), speech: SILENCE, valence: 0 };
    }

    const idx = object_idx !== undefined && avail.includes(object_idx)
      ? object_idx : avail[Math.floor(Math.random() * avail.length)];

    const act = Math.max(0, Math.min(5, action_id));

    // Apply action and step physics
    const impactForce = this.applyAction(idx, act);
    for (let i = 0; i < 30; i++) this.world.step(1 / 60); // simulate 0.5s

    const channels = this.buildChannels(idx, impactForce);

    // Valence from physics
    let valence = 0;
    if (channels[12] > 0.3) valence = -0.5; // breakage = bad
    if (Math.abs(channels[3]) > 0.3 || Math.abs(channels[5]) > 0.3) valence += 0.1; // movement = interesting
    if (channels[6] > 0.5) valence -= 0.1; // hard impact = slight pain

    // Track breakage
    const justBroke = channels[12] > 0.3 && !this.broken.has(idx);
    if (channels[12] > 0.3) this.broken.add(idx);

    // Mama feedback
    if (this.mama_present) {
      if (justBroke) {
        this.pendingFeedback.push({
          action_id: -1, object_idx: idx,
          channels: new Array(13).fill(0),
          speech: encodeSpeech('нельзя'),
          valence: -0.4,
          debug_label: 'mama:нельзя',
        });
      } else if (valence > 0.15 && Math.random() < 0.3) {
        this.pendingFeedback.push({
          action_id: -1, object_idx: idx,
          channels: new Array(13).fill(0),
          speech: encodeSpeech('молодец'),
          valence: 0.3,
          debug_label: 'mama:молодец',
        });
      }
    }

    return {
      action_id: act, object_idx: idx, channels,
      speech: SILENCE,
      valence: Math.max(-1, Math.min(1, valence)),
      debug_label: `${['touch','push','drop','shake','look','squeeze'][act]}:${this.objects[idx].name}`,
      positions: this.getAllPositions(),
    };
  }

  drainFeedback(): SensoryTransition3D[] {
    const fb = this.pendingFeedback;
    this.pendingFeedback = [];
    return fb;
  }

  getAllPositions(): { idx: number; x: number; y: number; z: number }[] {
    return this.available
      .filter(i => !this.broken.has(i) && this.bodies[i])
      .map(i => ({
        idx: i,
        x: this.bodies[i].position.x,
        y: this.bodies[i].position.y,
        z: this.bodies[i].position.z,
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
