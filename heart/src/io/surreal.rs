//! SurrealDB persistence — remote (WebSocket) or embedded (in-memory).

use std::time::Duration;
use surrealdb::engine::remote::ws::{Client as WsClient, Ws};
use surrealdb::opt::auth::Root;
use surrealdb::Surreal;

use crate::core::state::Snapshot;
use crate::core::config::HeartConfig;
use crate::error::PersistenceError;
use super::persistence::{Persistence, InitialDbState};

/// Connect to remote SurrealDB via WebSocket.
pub async fn connect_remote(url: &str) -> Result<Surreal<WsClient>, PersistenceError> {
    loop {
        match Surreal::new::<Ws>(url).await {
            Ok(db) => {
                db.signin(Root { username: "root".to_string(), password: "root".to_string() })
                    .await.map_err(|e| PersistenceError::Connection(e.to_string()))?;
                db.use_ns("deus").use_db("runtime")
                    .await.map_err(|e| PersistenceError::Connection(e.to_string()))?;
                tracing::info!("SurrealDB connected (remote: {url})");
                return Ok(db);
            }
            Err(e) => {
                tracing::warn!("connect: {e}, retry 2s");
                tokio::time::sleep(Duration::from_secs(2)).await;
            }
        }
    }
}

/// Start embedded in-memory SurrealDB (no Docker needed).
pub async fn connect_embedded() -> Result<Surreal<surrealdb::engine::any::Any>, PersistenceError> {
    let db = surrealdb::engine::any::connect("mem://")
        .await
        .map_err(|e| PersistenceError::Connection(e.to_string()))?;
    db.use_ns("deus").use_db("runtime")
        .await.map_err(|e| PersistenceError::Connection(e.to_string()))?;
    tracing::info!("SurrealDB connected (embedded mem://)");
    Ok(db)
}

/// Generic persistence over any SurrealDB connection type.
pub struct SurrealPersistence<C: surrealdb::Connection> {
    db: Surreal<C>,
}

impl<C: surrealdb::Connection> SurrealPersistence<C> {
    pub fn new(db: Surreal<C>) -> Self { Self { db } }
}

#[async_trait::async_trait]
impl<C: surrealdb::Connection> Persistence for SurrealPersistence<C> {
    async fn load_config(&self) -> Result<HeartConfig, PersistenceError> {
        Ok(HeartConfig::default())
    }

    async fn load_initial_state(&self) -> Result<InitialDbState, PersistenceError> {
        let result: Result<Vec<serde_json::Value>, _> = self.db
            .query("SELECT cycle, energy, fatigue FROM kernel_state LIMIT 1")
            .await
            .and_then(|mut r| r.take(0));

        match result {
            Ok(rows) => {
                if let Some(row) = rows.into_iter().next() {
                    Ok(InitialDbState {
                        cycle: row.get("cycle").and_then(|v| v.as_u64()).unwrap_or(0),
                        energy: row.get("energy").and_then(|v| v.as_f64()).unwrap_or(1.0),
                        fatigue: row.get("fatigue").and_then(|v| v.as_f64()).unwrap_or(0.0),
                    })
                } else {
                    Ok(InitialDbState::default())
                }
            }
            Err(e) => Err(PersistenceError::Query(e.to_string())),
        }
    }

    async fn sync_snapshot(&self, s: &Snapshot) -> Result<(), PersistenceError> {
        let _ = self.db
            .query("UPSERT kernel_state:main SET cycle = $c, energy = $e, fatigue = $f, running = true")
            .bind(("c", s.cycle as i64))
            .bind(("e", s.vitals.energy))
            .bind(("f", s.vitals.fatigue))
            .await;
        Ok(())
    }
}
