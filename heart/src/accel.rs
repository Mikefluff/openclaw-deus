//! Apple Accelerate framework FFI — BLAS + vDSP for neural math.
//!
//! Uses AMX (Apple Matrix eXtensions) automatically on Apple Silicon.
//! No Metal needed for our matrix sizes (7×4, 4×10).

#[cfg(target_os = "macos")]
#[link(name = "Accelerate", kind = "framework")]
extern "C" {
    // BLAS: matrix multiply C = alpha*A*B + beta*C
    fn cblas_sgemm(
        order: i32, transA: i32, transB: i32,
        m: i32, n: i32, k: i32,
        alpha: f32,
        a: *const f32, lda: i32,
        b: *const f32, ldb: i32,
        beta: f32,
        c: *mut f32, ldc: i32,
    );

    // BLAS: dot product
    fn cblas_sdot(n: i32, x: *const f32, incx: i32, y: *const f32, incy: i32) -> f32;

    // BLAS: vector norm
    fn cblas_snrm2(n: i32, x: *const f32, incx: i32) -> f32;

    // vDSP: vector tanh
    fn vvtanhf(result: *mut f32, input: *const f32, count: *const i32);

    // vDSP: vector sigmoid (1 / (1 + exp(-x)))
    // Note: no direct sigmoid in vDSP, use vvrecf(1 + vvexpf(-x))
}

const CBLAS_ROW_MAJOR: i32 = 101;
const CBLAS_NO_TRANS: i32 = 111;

/// Matrix multiply: C[m×n] = A[m×k] × B[k×n]
#[cfg(target_os = "macos")]
pub fn matmul(a: &[f32], b: &[f32], c: &mut [f32], m: usize, k: usize, n: usize) {
    unsafe {
        cblas_sgemm(
            CBLAS_ROW_MAJOR, CBLAS_NO_TRANS, CBLAS_NO_TRANS,
            m as i32, n as i32, k as i32,
            1.0,
            a.as_ptr(), k as i32,
            b.as_ptr(), n as i32,
            0.0,
            c.as_mut_ptr(), n as i32,
        );
    }
}

/// Dot product of two vectors.
#[cfg(target_os = "macos")]
pub fn dot(a: &[f32], b: &[f32]) -> f32 {
    let n = a.len().min(b.len());
    unsafe { cblas_sdot(n as i32, a.as_ptr(), 1, b.as_ptr(), 1) }
}

/// Vector L2 norm.
#[cfg(target_os = "macos")]
pub fn norm(a: &[f32]) -> f32 {
    unsafe { cblas_snrm2(a.len() as i32, a.as_ptr(), 1) }
}

/// Cosine similarity between two vectors.
pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    #[cfg(target_os = "macos")]
    {
        let d = dot(a, b);
        let na = norm(a);
        let nb = norm(b);
        if na < 1e-8 || nb < 1e-8 { return 0.0; }
        d / (na * nb)
    }
    #[cfg(not(target_os = "macos"))]
    {
        // Fallback for non-macOS
        let d: f32 = a.iter().zip(b).map(|(x, y)| x * y).sum();
        let na: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
        let nb: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
        if na < 1e-8 || nb < 1e-8 { 0.0 } else { d / (na * nb) }
    }
}

/// Tanh activation (vectorized via Accelerate).
#[cfg(target_os = "macos")]
pub fn tanh_vec(input: &[f32], output: &mut [f32]) {
    let n = input.len().min(output.len()) as i32;
    unsafe { vvtanhf(output.as_mut_ptr(), input.as_ptr(), &n); }
}

/// Sigmoid activation: 1 / (1 + exp(-x)).
pub fn sigmoid(x: f32) -> f32 {
    1.0 / (1.0 + (-x).exp())
}

/// Sigmoid vectorized.
pub fn sigmoid_vec(input: &[f32], output: &mut [f32]) {
    for (o, &x) in output.iter_mut().zip(input) {
        *o = sigmoid(x);
    }
}

// Non-macOS fallbacks
#[cfg(not(target_os = "macos"))]
pub fn matmul(a: &[f32], b: &[f32], c: &mut [f32], m: usize, k: usize, n: usize) {
    for i in 0..m {
        for j in 0..n {
            let mut sum = 0.0f32;
            for p in 0..k { sum += a[i * k + p] * b[p * n + j]; }
            c[i * n + j] = sum;
        }
    }
}

#[cfg(not(target_os = "macos"))]
pub fn dot(a: &[f32], b: &[f32]) -> f32 {
    a.iter().zip(b).map(|(x, y)| x * y).sum()
}

#[cfg(not(target_os = "macos"))]
pub fn norm(a: &[f32]) -> f32 {
    a.iter().map(|x| x * x).sum::<f32>().sqrt()
}

#[cfg(not(target_os = "macos"))]
pub fn tanh_vec(input: &[f32], output: &mut [f32]) {
    for (o, &x) in output.iter_mut().zip(input) { *o = x.tanh(); }
}
