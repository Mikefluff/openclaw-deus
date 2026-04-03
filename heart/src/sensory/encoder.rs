//! Speech encoding — Russian text to phonetic channels.

use super::frame::NUM_SPEECH;

pub fn encode_speech(text: &str) -> [f32; NUM_SPEECH] {
    let mut out = [0.0f32; NUM_SPEECH];
    for (i, ch) in text.chars().take(NUM_SPEECH).enumerate() {
        let cp = ch as u32;
        if (0x0430..=0x044f).contains(&cp) {
            out[i] = (cp - 0x0430 + 1) as f32 / 32.0;
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encodes_russian() {
        let s = encode_speech("мяч");
        assert!(s[0] > 0.0); // м
        assert!(s[1] > 0.0); // я
        assert!(s[2] > 0.0); // ч
        assert_eq!(s[3], 0.0); // padding
    }
}
