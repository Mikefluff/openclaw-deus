//! Physics World — rapier3d rigid body sandbox.
//!
//! Implements SensorySource trait. Replaceable with UE5 adapter.
//! 1.2m playpen, gravity, objects with mass/friction/elasticity.

use nalgebra::Vector3;
use rand::Rng;
use rapier3d::prelude::*;

use crate::sensory::*;

/// Object definition — physics properties brain must discover.
struct ObjectDef {
    name: &'static str,
    mass: f32,
    half_extents: [f32; 3],
    is_sphere: bool,
    hardness: f32,
    friction: f32,
    fragility: f32,
    elasticity: f32,
    sound_base: f32,
    color: &'static str,
}

const OBJECTS: &[ObjectDef] = &[
    ObjectDef { name: "мячик",       mass: 0.2,  half_extents: [0.06, 0.06, 0.06], is_sphere: true,  hardness: 0.3, friction: 0.2, fragility: 0.0,  elasticity: 0.85, sound_base: 0.5, color: "#f44336" },
    ObjectDef { name: "кубик",       mass: 0.3,  half_extents: [0.05, 0.05, 0.05], is_sphere: false, hardness: 0.9, friction: 0.5, fragility: 0.1,  elasticity: 0.1,  sound_base: 0.4, color: "#2196f3" },
    ObjectDef { name: "подушка",     mass: 0.15, half_extents: [0.08, 0.03, 0.08], is_sphere: false, hardness: 0.05,friction: 0.7, fragility: 0.0,  elasticity: 0.3,  sound_base: 0.05,color: "#e0e0e0" },
    ObjectDef { name: "колокольчик", mass: 0.1,  half_extents: [0.03, 0.03, 0.03], is_sphere: true,  hardness: 0.8, friction: 0.2, fragility: 0.3,  elasticity: 0.6,  sound_base: 0.9, color: "#ffd700" },
    ObjectDef { name: "чашка",       mass: 0.2,  half_extents: [0.04, 0.05, 0.04], is_sphere: false, hardness: 0.7, friction: 0.3, fragility: 0.5,  elasticity: 0.0,  sound_base: 0.5, color: "#ff9800" },
    ObjectDef { name: "коробка",     mass: 0.3,  half_extents: [0.08, 0.04, 0.08], is_sphere: false, hardness: 0.5, friction: 0.5, fragility: 0.1,  elasticity: 0.0,  sound_base: 0.3, color: "#795548" },
];

const ROOM_HALF: f32 = 0.6;

pub struct PhysicsWorld {
    bodies: RigidBodySet,
    colliders: ColliderSet,
    gravity: Vector3<f32>,
    integration_params: IntegrationParameters,
    island_manager: IslandManager,
    broad_phase: DefaultBroadPhase,
    narrow_phase: NarrowPhase,
    impulse_joints: ImpulseJointSet,
    multibody_joints: MultibodyJointSet,
    ccd_solver: CCDSolver,
    query_pipeline: QueryPipeline,

    obj_handles: Vec<RigidBodyHandle>,
    available: Vec<usize>,
    broken: Vec<bool>,
    stage: usize,
    tick_count: u64,
    last_interacted: i32,
    mama_present: bool,
    pending_feedback: Vec<SensoryFrame>,
}

impl PhysicsWorld {
    pub fn new() -> Self {
        let mut bodies = RigidBodySet::new();
        let mut colliders = ColliderSet::new();

        // Floor
        let floor = RigidBodyBuilder::fixed().translation(vector![0.0, -0.05, 0.0]).build();
        let floor_h = bodies.insert(floor);
        let floor_c = ColliderBuilder::cuboid(2.0, 0.05, 2.0).friction(0.5).build();
        colliders.insert_with_parent(floor_c, floor_h, &mut bodies);

        // Walls
        for (x, z, hx, hz) in &[
            (0.0f32, ROOM_HALF + 0.05, ROOM_HALF, 0.05f32),
            (0.0, -ROOM_HALF - 0.05, ROOM_HALF, 0.05),
            (ROOM_HALF + 0.05, 0.0, 0.05, ROOM_HALF),
            (-ROOM_HALF - 0.05, 0.0, 0.05, ROOM_HALF),
        ] {
            let wall = RigidBodyBuilder::fixed().translation(vector![*x, 0.3, *z]).build();
            let wh = bodies.insert(wall);
            let wc = ColliderBuilder::cuboid(*hx, 0.3, *hz).friction(0.3).build();
            colliders.insert_with_parent(wc, wh, &mut bodies);
        }

        // Spawn objects
        let mut obj_handles = Vec::new();
        for (i, obj) in OBJECTS.iter().enumerate() {
            let col = (i % 3) as f32 - 1.0;
            let row = (i / 3) as f32 - 0.5;
            let y = if obj.is_sphere { obj.half_extents[0] } else { obj.half_extents[1] } + 0.01;

            let rb = RigidBodyBuilder::dynamic()
                .translation(vector![col * 0.2, y, row * 0.2])
                .linear_damping(0.4)
                .angular_damping(0.5)
                .build();
            let rh = bodies.insert(rb);

            let col_shape = if obj.is_sphere {
                ColliderBuilder::ball(obj.half_extents[0])
            } else {
                ColliderBuilder::cuboid(obj.half_extents[0], obj.half_extents[1], obj.half_extents[2])
            };
            let col_built = col_shape
                .friction(obj.friction)
                .restitution(obj.elasticity)
                .density(obj.mass / (obj.half_extents[0] * obj.half_extents[1] * obj.half_extents[2] * 8.0).max(0.001))
                .build();
            colliders.insert_with_parent(col_built, rh, &mut bodies);
            obj_handles.push(rh);
        }

        Self {
            bodies,
            colliders,
            gravity: vector![0.0, -9.82, 0.0],
            integration_params: IntegrationParameters::default(),
            island_manager: IslandManager::new(),
            broad_phase: DefaultBroadPhase::new(),
            narrow_phase: NarrowPhase::new(),
            impulse_joints: ImpulseJointSet::new(),
            multibody_joints: MultibodyJointSet::new(),
            ccd_solver: CCDSolver::new(),
            query_pipeline: QueryPipeline::new(),

            obj_handles,
            available: vec![0, 1],  // stage 0: 2 objects
            broken: vec![false; OBJECTS.len()],
            stage: 0,
            tick_count: 0,
            last_interacted: -1,
            mama_present: true,
            pending_feedback: Vec::new(),
        }
    }

    fn step(&mut self) {
        let physics_hooks = ();
        let event_handler = ();
        PhysicsWorld::step_physics(
            &self.gravity,
            &self.integration_params,
            &mut self.island_manager,
            &mut self.broad_phase,
            &mut self.narrow_phase,
            &mut self.bodies,
            &mut self.colliders,
            &mut self.impulse_joints,
            &mut self.multibody_joints,
            &mut self.ccd_solver,
            Some(&mut self.query_pipeline),
            &physics_hooks,
            &event_handler,
        );
    }

    fn step_physics(
        gravity: &Vector3<f32>,
        params: &IntegrationParameters,
        islands: &mut IslandManager,
        broad: &mut DefaultBroadPhase,
        narrow: &mut NarrowPhase,
        bodies: &mut RigidBodySet,
        colliders: &mut ColliderSet,
        impulse_joints: &mut ImpulseJointSet,
        multibody_joints: &mut MultibodyJointSet,
        ccd: &mut CCDSolver,
        query: Option<&mut QueryPipeline>,
        _hooks: &(),
        _events: &(),
    ) {
        let mut pipeline = PhysicsPipeline::new();
        pipeline.step(gravity, params, islands, broad, narrow, bodies, colliders, impulse_joints, multibody_joints, ccd, query, &(), &());
    }

    fn clamp(v: f32) -> f32 { v.max(-1.0).min(1.0) }

    fn get_pos(&self, idx: usize) -> [f32; 3] {
        let rb = &self.bodies[self.obj_handles[idx]];
        let p = rb.translation();
        [p.x, p.y, p.z]
    }

    fn get_vel(&self, idx: usize) -> [f32; 3] {
        let rb = &self.bodies[self.obj_handles[idx]];
        let v = rb.linvel();
        [(v.x / 2.0).max(-1.0).min(1.0), (v.y / 2.0).max(-1.0).min(1.0), (v.z / 2.0).max(-1.0).min(1.0)]
    }

    fn build_channels(&self, idx: usize, impact: f32) -> [f32; NUM_CHANNELS] {
        let obj = &OBJECTS[idx];
        let [px, py, pz] = self.get_pos(idx);
        let [vx, vy, vz] = self.get_vel(idx);

        // Nearest distance
        let mut min_dist: f32 = 1.0;
        for &j in &self.available {
            if j == idx || self.broken[j] { continue; }
            let [jx, jy, jz] = self.get_pos(j);
            let d = ((px-jx).powi(2) + (py-jy).powi(2) + (pz-jz).powi(2)).sqrt();
            if d < min_dist { min_dist = d; }
        }

        let sound = (impact * obj.sound_base * 3.0).min(1.0);
        let deform = (impact * (1.0 - obj.hardness)).min(1.0);
        let breakage = if obj.fragility > 0.4 && impact > 0.4 { (impact * obj.fragility).min(1.0) } else { 0.0 };

        let mut ch = [0.0f32; NUM_CHANNELS];
        ch[ch::POS_X] = Self::clamp(px / ROOM_HALF);
        ch[ch::POS_Y] = Self::clamp(py / 0.5);
        ch[ch::POS_Z] = Self::clamp(pz / ROOM_HALF);
        ch[ch::VEL_X] = Self::clamp(vx);
        ch[ch::VEL_Y] = Self::clamp(vy);
        ch[ch::VEL_Z] = Self::clamp(vz);
        ch[ch::CONTACT_FORCE] = Self::clamp(impact);
        ch[ch::NEAREST_DIST] = min_dist.min(1.0);
        ch[ch::HARDNESS] = obj.hardness;
        ch[ch::SMOOTHNESS] = 1.0 - obj.friction;
        ch[ch::SOUND] = sound;
        ch[ch::DEFORMATION] = deform;
        ch[ch::BREAKAGE] = breakage;
        ch
    }

    pub fn advance_stage(&mut self) -> bool {
        if self.stage >= 2 { return false; }
        self.stage += 1;
        self.available = match self.stage {
            1 => vec![0, 1, 2, 3],
            _ => vec![0, 1, 2, 3, 4, 5],
        };
        true
    }

    pub fn drain_feedback(&mut self) -> Vec<SensoryFrame> {
        std::mem::take(&mut self.pending_feedback)
    }
}

impl SensorySource for PhysicsWorld {
    fn tick(&mut self) -> Vec<SensoryFrame> {
        self.tick_count += 1;
        let mut frames = Vec::new();
        self.step();

        // Reset fallen objects
        for &i in &self.available {
            let rb = &mut self.bodies[self.obj_handles[i]];
            if rb.translation().y < -1.0 {
                let col = (i % 3) as f32 - 1.0;
                let row = (i / 3) as f32 - 0.5;
                rb.set_translation(vector![col * 0.2, 0.1, row * 0.2], true);
                rb.set_linvel(vector![0.0, 0.0, 0.0], true);
            }
        }

        let mut rng = rand::thread_rng();

        // Ambient look
        if rng.gen::<f32>() < 0.3 {
            let avail: Vec<usize> = self.available.iter().copied().filter(|&i| !self.broken[i]).collect();
            if let Some(&idx) = avail.get(rng.gen_range(0..avail.len().max(1))) {
                frames.push(SensoryFrame {
                    action_id: 4,
                    object_idx: idx as i32,
                    channels: self.build_channels(idx, 0.0),
                    ..Default::default()
                });
            }
        }

        // Mama speech
        if self.mama_present && rng.gen::<f32>() < 0.12 {
            let avail: Vec<usize> = self.available.iter().copied().filter(|&i| !self.broken[i]).collect();
            if !avail.is_empty() {
                let idx = if self.last_interacted >= 0 && avail.contains(&(self.last_interacted as usize)) && rng.gen::<f32>() < 0.75 {
                    self.last_interacted as usize
                } else {
                    avail[rng.gen_range(0..avail.len())]
                };
                frames.push(SensoryFrame {
                    action_id: -1,
                    object_idx: idx as i32,
                    speech: encode_speech(OBJECTS[idx].name),
                    valence: 0.1,
                    ..Default::default()
                });
            }
        }

        frames
    }

    fn act(&mut self, cmd: &MotorCommand) -> SensoryFrame {
        let avail: Vec<usize> = self.available.iter().copied().filter(|&i| !self.broken[i]).collect();
        if avail.is_empty() {
            return SensoryFrame::default();
        }

        let mut rng = rand::thread_rng();
        let idx = cmd.target_object
            .and_then(|t| if avail.contains(&(t as usize)) { Some(t as usize) } else { None })
            .unwrap_or_else(|| avail[rng.gen_range(0..avail.len())]);

        self.last_interacted = idx as i32;
        let obj = &OBJECTS[idx];
        let rb = &mut self.bodies[self.obj_handles[idx]];

        let mut impact: f32 = 0.0;
        let action = cmd.action_id.min(5);

        match action {
            0 => { // touch
                rb.apply_impulse(vector![0.01, 0.0, 0.0], true);
                impact = 0.05;
            }
            1 => { // push
                let angle = rng.gen::<f32>() * std::f32::consts::PI * 2.0;
                let force = 0.2 / obj.mass.max(0.1);
                rb.apply_impulse(vector![angle.cos() * force, 0.03, angle.sin() * force], true);
                impact = 0.2;
            }
            2 => { // drop
                let pos = rb.translation().clone();
                rb.set_translation(vector![pos.x, 0.25, pos.z], true);
                rb.set_linvel(vector![0.0, 0.0, 0.0], true);
                for _ in 0..30 { self.step(); }
                impact = 0.4 * obj.mass;
            }
            3 => { // shake
                rb.apply_impulse(vector![(rng.gen::<f32>()-0.5)*0.15, 0.1, (rng.gen::<f32>()-0.5)*0.15], true);
                impact = 0.15;
            }
            4 => {} // look
            5 => { // squeeze
                rb.apply_impulse(vector![0.0, -0.05, 0.0], true);
                impact = 0.2 * (1.0 - obj.hardness);
            }
            _ => {}
        }

        // Simulate 0.5s
        if action != 2 {
            for _ in 0..30 { self.step(); }
        }

        let channels = self.build_channels(idx, impact);

        // Valence
        let vel = self.get_vel(idx);
        let speed = (vel[0].powi(2) + vel[2].powi(2)).sqrt();
        let mut valence: f32 = 0.0;
        if speed > 0.3 { valence += 0.1; }
        if channels[ch::SOUND] > 0.3 { valence += 0.15; }
        if channels[ch::BREAKAGE] > 0.3 { valence = -0.5; }

        // Breakage
        let just_broke = channels[ch::BREAKAGE] > 0.3 && !self.broken[idx];
        if channels[ch::BREAKAGE] > 0.3 { self.broken[idx] = true; }

        // Mama feedback
        if self.mama_present {
            if just_broke {
                self.pending_feedback.push(SensoryFrame {
                    action_id: -1,
                    object_idx: idx as i32,
                    speech: encode_speech("нельзя"),
                    valence: -0.4,
                    ..Default::default()
                });
            } else if valence > 0.1 && rng.gen::<f32>() < 0.2 {
                self.pending_feedback.push(SensoryFrame {
                    action_id: -1,
                    object_idx: idx as i32,
                    speech: encode_speech("молодец"),
                    valence: 0.3,
                    ..Default::default()
                });
            }
        }

        SensoryFrame {
            action_id: action as i32,
            object_idx: idx as i32,
            channels,
            valence: valence.max(-1.0).min(1.0),
            is_consequence: true,
            ..Default::default()
        }
    }

    fn snapshot(&self) -> WorldSnapshot {
        let objects = self.available.iter().map(|&i| {
            let [x, y, z] = self.get_pos(i);
            ObjectState {
                idx: i as i32,
                name: OBJECTS[i].name.to_string(),
                x, y, z,
                color: OBJECTS[i].color.to_string(),
                broken: self.broken[i],
            }
        }).collect();

        WorldSnapshot { objects, relations: Vec::new() }
    }
}
