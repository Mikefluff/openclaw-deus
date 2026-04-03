//! Pure Rust math backend — no platform dependencies.

pub struct FallbackBackend;

impl super::MathBackend for FallbackBackend {
    fn dot(&self, a: &[f32], b: &[f32]) -> f32 {
        a.iter().zip(b).map(|(x, y)| x * y).sum()
    }

    fn norm(&self, a: &[f32]) -> f32 {
        a.iter().map(|x| x * x).sum::<f32>().sqrt()
    }

    fn cosine_similarity(&self, a: &[f32], b: &[f32]) -> f32 {
        let d = self.dot(a, b);
        let na = self.norm(a);
        let nb = self.norm(b);
        if na < 1e-8 || nb < 1e-8 { 0.0 } else { d / (na * nb) }
    }

    fn tanh_vec(&self, input: &[f32], output: &mut [f32]) {
        for (o, &x) in output.iter_mut().zip(input) { *o = x.tanh(); }
    }

    fn sigmoid_vec(&self, input: &[f32], output: &mut [f32]) {
        for (o, &x) in output.iter_mut().zip(input) { *o = 1.0 / (1.0 + (-x).exp()); }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::math::MathBackend;

    #[test]
    fn cosine_similarity_identical() {
        let backend = FallbackBackend;
        let a = vec![1.0, 0.0, 0.0];
        assert!((backend.cosine_similarity(&a, &a) - 1.0).abs() < 1e-6);
    }

    #[test]
    fn cosine_similarity_orthogonal() {
        let backend = FallbackBackend;
        let a = vec![1.0, 0.0];
        let b = vec![0.0, 1.0];
        assert!(backend.cosine_similarity(&a, &b).abs() < 1e-6);
    }
}
