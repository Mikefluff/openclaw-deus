//! Physics world — rapier3d rigid body sandbox.
//! Implements SensorySource trait.

use nalgebra::Vector3 as Vec3;
use rapier3d::prelude::*;
use rand::Rng;

use crate::sensory::frame::{SensoryFrame, ch, NUM_CHANNELS};
use crate::sensory::traits::{SensorySource, WorldSnapshot, ObjectState};
use crate::agency::motor::MotorCommand;
use super::objects::OBJECTS;
use super::mama;

const ROOM_HALF: f32 = 0.6;

pub struct PhysicsWorld {
    pipeline: PhysicsPipeline,
    bodies: RigidBodySet,
    colliders: ColliderSet,
    gravity: Vec3<f32>,
    params: IntegrationParameters,
    islands: IslandManager,
    broad: DefaultBroadPhase,
    narrow: NarrowPhase,
    impulse_joints: ImpulseJointSet,
    multibody_joints: MultibodyJointSet,
    ccd: CCDSolver,
    query: QueryPipeline,

    handles: Vec<RigidBodyHandle>,
    available: Vec<usize>,
    broken: Vec<bool>,
    stage: usize,
    tick_count: u64,
    last_interacted: i32,
    feedback_buf: Vec<SensoryFrame>,
}

impl PhysicsWorld {
    pub fn new() -> Self {
        let mut bodies = RigidBodySet::new();
        let mut colliders = ColliderSet::new();

        // Floor
        let floor = RigidBodyBuilder::fixed().translation(vector![0.0, -0.05, 0.0]);
        let fh = bodies.insert(floor.build());
        colliders.insert_with_parent(ColliderBuilder::cuboid(2.0, 0.05, 2.0).friction(0.5).build(), fh, &mut bodies);

        // Walls
        for &(x, z, hx, hz) in &[(0.0, ROOM_HALF+0.05, ROOM_HALF, 0.05f32), (0.0, -ROOM_HALF-0.05, ROOM_HALF, 0.05), (ROOM_HALF+0.05, 0.0, 0.05, ROOM_HALF), (-ROOM_HALF-0.05, 0.0, 0.05, ROOM_HALF)] {
            let w = bodies.insert(RigidBodyBuilder::fixed().translation(vector![x, 0.3, z]).build());
            colliders.insert_with_parent(ColliderBuilder::cuboid(hx, 0.3, hz).build(), w, &mut bodies);
        }

        // Objects
        let mut handles = Vec::new();
        for (i, obj) in OBJECTS.iter().enumerate() {
            let col = (i % 3) as f32 - 1.0;
            let row = (i / 3) as f32 - 0.5;
            let y = if obj.is_sphere { obj.half_extents[0] } else { obj.half_extents[1] } + 0.01;

            let rb = RigidBodyBuilder::dynamic()
                .translation(vector![col * 0.2, y, row * 0.2])
                .linear_damping(0.4)
                .angular_damping(0.5);
            let rh = bodies.insert(rb.build());

            let shape = if obj.is_sphere {
                ColliderBuilder::ball(obj.half_extents[0])
            } else {
                ColliderBuilder::cuboid(obj.half_extents[0], obj.half_extents[1], obj.half_extents[2])
            };
            colliders.insert_with_parent(
                shape.friction(obj.friction).restitution(obj.elasticity)
                    .density(obj.mass / (obj.half_extents[0] * obj.half_extents[1] * obj.half_extents[2] * 8.0).max(0.001))
                    .build(),
                rh, &mut bodies,
            );
            handles.push(rh);
        }

        Self {
            pipeline: PhysicsPipeline::new(),
            bodies, colliders,
            gravity: vector![0.0, -9.82, 0.0],
            params: IntegrationParameters::default(),
            islands: IslandManager::new(),
            broad: DefaultBroadPhase::new(),
            narrow: NarrowPhase::new(),
            impulse_joints: ImpulseJointSet::new(),
            multibody_joints: MultibodyJointSet::new(),
            ccd: CCDSolver::new(),
            query: QueryPipeline::new(),
            handles,
            available: vec![0, 1], // stage 0
            broken: vec![false; OBJECTS.len()],
            stage: 0,
            tick_count: 0,
            last_interacted: -1,
            feedback_buf: Vec::new(),
        }
    }

    fn step_physics(&mut self) {
        self.pipeline.step(
            &self.gravity, &self.params, &mut self.islands, &mut self.broad, &mut self.narrow,
            &mut self.bodies, &mut self.colliders, &mut self.impulse_joints, &mut self.multibody_joints,
            &mut self.ccd, Some(&mut self.query), &(), &(),
        );
    }

    fn pos(&self, i: usize) -> [f32; 3] {
        let p = self.bodies[self.handles[i]].translation();
        [p.x, p.y, p.z]
    }

    fn vel(&self, i: usize) -> [f32; 3] {
        let v = self.bodies[self.handles[i]].linvel();
        [v.x.clamp(-2.0, 2.0) / 2.0, v.y.clamp(-2.0, 2.0) / 2.0, v.z.clamp(-2.0, 2.0) / 2.0]
    }

    fn channels(&self, idx: usize, impact: f32) -> [f32; NUM_CHANNELS] {
        let obj = &OBJECTS[idx];
        let [px, py, pz] = self.pos(idx);
        let [vx, vy, vz] = self.vel(idx);
        let mut nearest: f32 = 1.0;
        for &j in &self.available {
            if j == idx || self.broken[j] { continue; }
            let [jx, jy, jz] = self.pos(j);
            let d = ((px-jx).powi(2) + (py-jy).powi(2) + (pz-jz).powi(2)).sqrt();
            if d < nearest { nearest = d; }
        }
        let mut c = [0.0f32; NUM_CHANNELS];
        c[ch::POS_X] = (px / ROOM_HALF).clamp(-1.0, 1.0);
        c[ch::POS_Y] = (py / 0.5).clamp(-1.0, 1.0);
        c[ch::POS_Z] = (pz / ROOM_HALF).clamp(-1.0, 1.0);
        c[ch::VEL_X] = vx; c[ch::VEL_Y] = vy; c[ch::VEL_Z] = vz;
        c[ch::CONTACT_FORCE] = impact.clamp(0.0, 1.0);
        c[ch::NEAREST_DIST] = nearest.min(1.0);
        c[ch::HARDNESS] = obj.hardness;
        c[ch::SMOOTHNESS] = 1.0 - obj.friction;
        c[ch::SOUND] = (impact * obj.sound_base * 3.0).min(1.0);
        c[ch::DEFORMATION] = (impact * (1.0 - obj.hardness)).min(1.0);
        c[ch::BREAKAGE] = if obj.fragility > 0.4 && impact > 0.4 { (impact * obj.fragility).min(1.0) } else { 0.0 };
        c
    }

    fn reset_fallen(&mut self) {
        for &i in &self.available {
            let rb = &mut self.bodies[self.handles[i]];
            if rb.translation().y < -1.0 {
                let col = (i % 3) as f32 - 1.0;
                let row = (i / 3) as f32 - 0.5;
                rb.set_translation(vector![col * 0.2, 0.1, row * 0.2], true);
                rb.set_linvel(vector![0.0, 0.0, 0.0], true);
            }
        }
    }

    pub fn advance_stage(&mut self) -> bool {
        if self.stage >= 2 { return false; }
        self.stage += 1;
        self.available = match self.stage { 1 => vec![0,1,2,3], _ => vec![0,1,2,3,4,5] };
        true
    }
}

impl SensorySource for PhysicsWorld {
    fn tick(&mut self) -> Vec<SensoryFrame> {
        self.tick_count += 1;
        self.step_physics();
        self.reset_fallen();
        let mut rng = rand::thread_rng();
        let mut frames = Vec::new();

        // Ambient look
        let avail: Vec<usize> = self.available.iter().copied().filter(|&i| !self.broken[i]).collect();
        if !avail.is_empty() && rng.gen::<f32>() < 0.3 {
            let idx = avail[rng.gen_range(0..avail.len())];
            frames.push(SensoryFrame {
                action_id: 4, object_idx: idx as i32,
                channels: self.channels(idx, 0.0),
                ..Default::default()
            });
        }

        // Mama speech (contextual — names what baby last touched)
        if !avail.is_empty() && rng.gen::<f32>() < 0.12 {
            let idx = if self.last_interacted >= 0 && avail.contains(&(self.last_interacted as usize)) && rng.gen::<f32>() < 0.75 {
                self.last_interacted as usize
            } else {
                avail[rng.gen_range(0..avail.len())]
            };
            frames.push(mama::name_object(idx));
        }

        frames
    }

    fn act(&mut self, cmd: &MotorCommand) -> SensoryFrame {
        let avail: Vec<usize> = self.available.iter().copied().filter(|&i| !self.broken[i]).collect();
        if avail.is_empty() { return SensoryFrame::default(); }

        let mut rng = rand::thread_rng();
        let idx = cmd.target_object.and_then(|t| avail.contains(&(t as usize)).then_some(t as usize))
            .unwrap_or_else(|| avail[rng.gen_range(0..avail.len())]);

        self.last_interacted = idx as i32;
        let obj = &OBJECTS[idx];
        let rb = &mut self.bodies[self.handles[idx]];
        let mut impact: f32 = 0.0;

        match cmd.action_id.min(5) {
            0 => { rb.apply_impulse(vector![0.01, 0.0, 0.0], true); impact = 0.05; }
            1 => {
                let a = rng.gen::<f32>() * std::f32::consts::TAU;
                let f = 0.2 / obj.mass.max(0.1);
                rb.apply_impulse(vector![a.cos()*f, 0.03, a.sin()*f], true);
                impact = 0.2;
            }
            2 => {
                let p = *rb.translation();
                rb.set_translation(vector![p.x, 0.25, p.z], true);
                rb.set_linvel(vector![0.0, 0.0, 0.0], true);
                for _ in 0..30 { self.step_physics(); }
                impact = 0.4 * obj.mass;
            }
            3 => {
                rb.apply_impulse(vector![(rng.gen::<f32>()-0.5)*0.15, 0.1, (rng.gen::<f32>()-0.5)*0.15], true);
                impact = 0.15;
            }
            4 => {}
            5 => { rb.apply_impulse(vector![0.0, -0.05, 0.0], true); impact = 0.2 * (1.0 - obj.hardness); }
            _ => {}
        }

        if cmd.action_id != 2 { for _ in 0..30 { self.step_physics(); } }

        let channels = self.channels(idx, impact);
        let speed = (self.vel(idx)[0].powi(2) + self.vel(idx)[2].powi(2)).sqrt();
        let mut valence: f32 = 0.0;
        if speed > 0.3 { valence += 0.1; }
        if channels[ch::SOUND] > 0.3 { valence += 0.15; }
        if channels[ch::BREAKAGE] > 0.3 { valence = -0.5; }

        let just_broke = channels[ch::BREAKAGE] > 0.3 && !self.broken[idx];
        if channels[ch::BREAKAGE] > 0.3 { self.broken[idx] = true; }

        if just_broke {
            self.feedback_buf.push(mama::feedback("нельзя", idx, -0.4));
        } else if valence > 0.1 && rng.gen::<f32>() < 0.2 {
            self.feedback_buf.push(mama::feedback("молодец", idx, 0.3));
        }

        SensoryFrame {
            action_id: cmd.action_id as i32, object_idx: idx as i32,
            channels, valence: valence.clamp(-1.0, 1.0), is_consequence: true,
            ..Default::default()
        }
    }

    fn drain_feedback(&mut self) -> Vec<SensoryFrame> {
        std::mem::take(&mut self.feedback_buf)
    }

    fn snapshot(&self) -> WorldSnapshot {
        WorldSnapshot {
            objects: self.available.iter().map(|&i| {
                let [x, y, z] = self.pos(i);
                ObjectState { idx: i as i32, name: OBJECTS[i].name.to_string(), x, y, z, color: OBJECTS[i].color.to_string(), broken: self.broken[i] }
            }).collect(),
            relations: Vec::new(),
        }
    }
}
