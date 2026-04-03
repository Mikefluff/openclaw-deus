//! Error types for the cognitive runtime.

#[derive(Debug, thiserror::Error)]
pub enum HeartError {
    #[error("persistence: {0}")]
    Persistence(#[from] PersistenceError),

    #[error("config: {0}")]
    Config(String),

    #[error("channel closed")]
    ChannelClosed,
}

#[derive(Debug, thiserror::Error)]
pub enum PersistenceError {
    #[error("connection: {0}")]
    Connection(String),

    #[error("query: {0}")]
    Query(String),

    #[error("deserialize: {0}")]
    Deserialize(String),
}

pub type Result<T> = std::result::Result<T, HeartError>;
