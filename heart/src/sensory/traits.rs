//! Traits for sensory sources (world adapters).
//! Implement for: rapier3d, Unreal Engine, test harness.

use serde::{Deserialize, Serialize};
use super::frame::SensoryFrame;
use crate::agency::motor::MotorCommand;

pub trait SensorySource {
    fn tick(&mut self) -> Vec<SensoryFrame>;
    fn act(&mut self, cmd: &MotorCommand) -> SensoryFrame;
    fn drain_feedback(&mut self) -> Vec<SensoryFrame>;
    fn snapshot(&self) -> WorldSnapshot;
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct WorldSnapshot {
    pub objects: Vec<ObjectState>,
    pub relations: Vec<Relation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ObjectState {
    pub idx: i32,
    pub name: String,
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub color: String,
    pub broken: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Relation {
    pub subject: i32,
    pub relation: String,
    pub object: i32,
}
