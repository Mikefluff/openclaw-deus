//! Math backend — trait + Apple Accelerate / fallback implementations.

pub mod accel;
pub mod fallback;

/// Trait for vectorized math operations.
/// Implementations: AccelerateBackend (macOS AMX), FallbackBackend (pure Rust).
pub trait MathBackend: Send + Sync {
    fn dot(&self, a: &[f32], b: &[f32]) -> f32;
    fn norm(&self, a: &[f32]) -> f32;
    fn cosine_similarity(&self, a: &[f32], b: &[f32]) -> f32;
    fn tanh_vec(&self, input: &[f32], output: &mut [f32]);
    fn sigmoid_vec(&self, input: &[f32], output: &mut [f32]);
}

/// Create the best available math backend for this platform.
pub fn create_backend() -> Box<dyn MathBackend> {
    #[cfg(target_os = "macos")]
    { Box::new(accel::AccelerateBackend) }

    #[cfg(not(target_os = "macos"))]
    { Box::new(fallback::FallbackBackend) }
}
