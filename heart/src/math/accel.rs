//! Apple Accelerate FFI — uses AMX coprocessor on Apple Silicon.

#[cfg(target_os = "macos")]
#[link(name = "Accelerate", kind = "framework")]
extern "C" {
    fn cblas_sdot(n: i32, x: *const f32, incx: i32, y: *const f32, incy: i32) -> f32;
    fn cblas_snrm2(n: i32, x: *const f32, incx: i32) -> f32;
    fn vvtanhf(result: *mut f32, input: *const f32, count: *const i32);
}

pub struct AccelerateBackend;

#[cfg(target_os = "macos")]
impl super::MathBackend for AccelerateBackend {
    fn dot(&self, a: &[f32], b: &[f32]) -> f32 {
        let n = a.len().min(b.len());
        unsafe { cblas_sdot(n as i32, a.as_ptr(), 1, b.as_ptr(), 1) }
    }

    fn norm(&self, a: &[f32]) -> f32 {
        unsafe { cblas_snrm2(a.len() as i32, a.as_ptr(), 1) }
    }

    fn cosine_similarity(&self, a: &[f32], b: &[f32]) -> f32 {
        let d = self.dot(a, b);
        let na = self.norm(a);
        let nb = self.norm(b);
        if na < 1e-8 || nb < 1e-8 { return 0.0; }
        d / (na * nb)
    }

    fn tanh_vec(&self, input: &[f32], output: &mut [f32]) {
        let n = input.len().min(output.len()) as i32;
        unsafe { vvtanhf(output.as_mut_ptr(), input.as_ptr(), &n); }
    }

    fn sigmoid_vec(&self, input: &[f32], output: &mut [f32]) {
        for (o, &x) in output.iter_mut().zip(input) {
            *o = 1.0 / (1.0 + (-x).exp());
        }
    }
}

#[cfg(not(target_os = "macos"))]
impl super::MathBackend for AccelerateBackend {
    fn dot(&self, a: &[f32], b: &[f32]) -> f32 { super::fallback::FallbackBackend.dot(a, b) }
    fn norm(&self, a: &[f32]) -> f32 { super::fallback::FallbackBackend.norm(a) }
    fn cosine_similarity(&self, a: &[f32], b: &[f32]) -> f32 { super::fallback::FallbackBackend.cosine_similarity(a, b) }
    fn tanh_vec(&self, input: &[f32], output: &mut [f32]) { super::fallback::FallbackBackend.tanh_vec(input, output) }
    fn sigmoid_vec(&self, input: &[f32], output: &mut [f32]) { super::fallback::FallbackBackend.sigmoid_vec(input, output) }
}
