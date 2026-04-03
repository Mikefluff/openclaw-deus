//! Mama — speech + social feedback.

use crate::sensory::frame::SensoryFrame;
use crate::sensory::encoder::encode_speech;
use super::objects::OBJECTS;

/// Generate mama speech event for an object.
pub fn name_object(object_idx: usize) -> SensoryFrame {
    SensoryFrame {
        action_id: -1,
        object_idx: object_idx as i32,
        speech: encode_speech(OBJECTS[object_idx].name),
        valence: 0.1,
        ..Default::default()
    }
}

/// Generate mama feedback.
pub fn feedback(word: &str, object_idx: usize, valence: f32) -> SensoryFrame {
    SensoryFrame {
        action_id: -1,
        object_idx: object_idx as i32,
        speech: encode_speech(word),
        valence,
        ..Default::default()
    }
}
