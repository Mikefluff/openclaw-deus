//! SurrealDB persistence implementation.

use std::time::Duration;
use surrealdb::engine::remote::ws::{Client, Ws};
use surrealdb::opt::auth::Root;
use surrealdb::Surreal;

use crate::core::state::Snapshot;
use crate::core::config::HeartConfig;
use crate::error::PersistenceError;
use super::persistence::{Persistence, InitialDbState};

pub type Db = Surreal<Client>;

pub async fn connect(url: &str) -> Result<Db, PersistenceError> {
    loop {
        match Surreal::new::<Ws>(url).await {
            Ok(db) => {
                db.signin(Root { username: "root".to_string(), password: "root".to_string() })
                    .await.map_err(|e| PersistenceError::Connection(e.to_string()))?;
                db.use_ns("deus").use_db("runtime")
                    .await.map_err(|e| PersistenceError::Connection(e.to_string()))?;
                return Ok(db);
            }
            Err(e) => {
                tracing::warn!("connect: {e}, retry 2s");
                tokio::time::sleep(Duration::from_secs(2)).await;
            }
        }
    }
}

pub struct SurrealPersistence {
    db: Db,
}

impl SurrealPersistence {
    pub fn new(db: Db) -> Self { Self { db } }
}

#[async_trait::async_trait]
impl Persistence for SurrealPersistence {
    async fn load_config(&self) -> Result<HeartConfig, PersistenceError> {
        // For now return defaults — config loading from DB is TODO
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
            .query("UPDATE kernel_state SET cycle = $c, energy = $e, fatigue = $f, running = true")
            .bind(("c", s.cycle as i64))
            .bind(("e", s.vitals.energy))
            .bind(("f", s.vitals.fatigue))
            .await;

        let h = s.hormones.combined();
        let names = ["hormone:dopamine", "hormone:norepinephrine", "hormone:cortisol", "hormone:serotonin"];
        for (i, name) in names.iter().enumerate() {
            let _ = self.db.query("UPDATE nn_node SET `value` = $v WHERE node_id = $n")
                .bind(("v", h[i])).bind(("n", *name)).await;
        }

        let a_names = ["acc:pred_error","acc:tension","acc:pain","acc:convergence","acc:reward","acc:novelty","acc:stability"];
        for (i, name) in a_names.iter().enumerate() {
            let _ = self.db.query("UPDATE nn_node SET `value` = $v WHERE node_id = $n")
                .bind(("v", s.accumulators.values[i])).bind(("n", *name)).await;
        }

        Ok(())
    }
}
