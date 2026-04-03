//! SurrealDB interface — persistent memory only.

use std::time::Duration;
use surrealdb::engine::remote::ws::{Client, Ws};
use surrealdb::opt::auth::Root;
use surrealdb::Surreal;
use crate::brain::{BrainSnapshot, InitialState, BrainConfig};

pub type Db = Surreal<Client>;

pub async fn connect(url: &str) -> Db {
    loop {
        match Surreal::new::<Ws>(url).await {
            Ok(db) => {
                match db.signin(Root { username: "root".to_string(), password: "root".to_string() }).await {
                    Ok(_) => {}
                    Err(e) => { tracing::warn!("signin: {e}"); tokio::time::sleep(Duration::from_secs(2)).await; continue; }
                }
                match db.use_ns("deus").use_db("runtime").await {
                    Ok(_) => {}
                    Err(e) => { tracing::warn!("use ns/db: {e}"); tokio::time::sleep(Duration::from_secs(2)).await; continue; }
                }
                tracing::info!("SurrealDB connected at {url}");
                return db;
            }
            Err(e) => { tracing::warn!("connect: {e}, retry 2s"); tokio::time::sleep(Duration::from_secs(2)).await; }
        }
    }
}

pub async fn load_state(db: &Db) -> InitialState {
    let result: Result<Vec<serde_json::Value>, _> = db
        .query("SELECT cycle, energy, fatigue, config FROM kernel_state LIMIT 1")
        .await
        .and_then(|mut r| r.take(0));

    match result {
        Ok(rows) => {
            if let Some(row) = rows.into_iter().next() {
                let cfg_val = row.get("config").cloned();
                let mut config = BrainConfig::default();
                if let Some(c) = cfg_val.as_ref().and_then(|v| v.as_object()) {
                    if let Some(v) = c.get("energy_drain_rate").and_then(|v| v.as_f64()) { config.energy_drain = v / 100.0; }
                    if let Some(v) = c.get("fatigue_rate").and_then(|v| v.as_f64()) { config.fatigue_rate = v / 100.0; }
                    if let Some(v) = c.get("sleep_threshold").and_then(|v| v.as_f64()) { config.sleep_threshold = v; }
                    if let Some(v) = c.get("sleep_energy_restore").and_then(|v| v.as_f64()) { config.sleep_restore = v; }
                    if let Some(v) = c.get("accumulator_decay").and_then(|v| v.as_f64()) { config.accumulator_decay = v; }
                    if let Some(v) = c.get("accumulator_cap").and_then(|v| v.as_f64()) { config.accumulator_cap = v; }
                }
                InitialState {
                    cycle: row.get("cycle").and_then(|v| v.as_u64()).unwrap_or(0),
                    energy: row.get("energy").and_then(|v| v.as_f64()).unwrap_or(1.0),
                    fatigue: row.get("fatigue").and_then(|v| v.as_f64()).unwrap_or(0.0),
                    config,
                }
            } else {
                InitialState::default()
            }
        }
        Err(e) => { tracing::warn!("load_state: {e}"); InitialState::default() }
    }
}

pub async fn sync_snapshot(db: &Db, s: &BrainSnapshot) {
    let _ = db.query("UPDATE kernel_state SET cycle = $c, energy = $e, fatigue = $f, running = true")
        .bind(("c", s.cycle as i64))
        .bind(("e", s.energy))
        .bind(("f", s.fatigue))
        .await;

    // Sync hormones
    let h_names = ["hormone:dopamine", "hormone:norepinephrine", "hormone:cortisol", "hormone:serotonin"];
    for (i, name) in h_names.iter().enumerate() {
        let _ = db.query("UPDATE nn_node SET `value` = $v WHERE node_id = $n")
            .bind(("v", s.hormones[i]))
            .bind(("n", *name))
            .await;
    }

    // Sync accumulators
    let a_names = ["acc:pred_error", "acc:tension", "acc:pain", "acc:convergence", "acc:reward", "acc:novelty", "acc:stability"];
    for (i, name) in a_names.iter().enumerate() {
        let _ = db.query("UPDATE nn_node SET `value` = $v WHERE node_id = $n")
            .bind(("v", s.accumulators[i]))
            .bind(("n", *name))
            .await;
    }
}
