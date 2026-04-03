//! Object definitions — physics properties brain must discover.

pub struct ObjectDef {
    pub name: &'static str,
    pub mass: f32,
    pub half_extents: [f32; 3],
    pub is_sphere: bool,
    pub hardness: f32,
    pub friction: f32,
    pub fragility: f32,
    pub elasticity: f32,
    pub sound_base: f32,
    pub color: &'static str,
}

pub const OBJECTS: &[ObjectDef] = &[
    ObjectDef { name: "мячик",       mass: 0.2,  half_extents: [0.06, 0.06, 0.06], is_sphere: true,  hardness: 0.3, friction: 0.2, fragility: 0.0,  elasticity: 0.85, sound_base: 0.5, color: "#f44336" },
    ObjectDef { name: "кубик",       mass: 0.3,  half_extents: [0.05, 0.05, 0.05], is_sphere: false, hardness: 0.9, friction: 0.5, fragility: 0.1,  elasticity: 0.1,  sound_base: 0.4, color: "#2196f3" },
    ObjectDef { name: "подушка",     mass: 0.15, half_extents: [0.08, 0.03, 0.08], is_sphere: false, hardness: 0.05,friction: 0.7, fragility: 0.0,  elasticity: 0.3,  sound_base: 0.05,color: "#e0e0e0" },
    ObjectDef { name: "колокольчик", mass: 0.1,  half_extents: [0.03, 0.03, 0.03], is_sphere: true,  hardness: 0.8, friction: 0.2, fragility: 0.3,  elasticity: 0.6,  sound_base: 0.9, color: "#ffd700" },
    ObjectDef { name: "чашка",       mass: 0.2,  half_extents: [0.04, 0.05, 0.04], is_sphere: false, hardness: 0.7, friction: 0.3, fragility: 0.5,  elasticity: 0.0,  sound_base: 0.5, color: "#ff9800" },
    ObjectDef { name: "коробка",     mass: 0.3,  half_extents: [0.08, 0.04, 0.08], is_sphere: false, hardness: 0.5, friction: 0.5, fragility: 0.1,  elasticity: 0.0,  sound_base: 0.3, color: "#795548" },
];
