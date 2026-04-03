//! DB — SurrealDB interface for persistent memory.
//!
//! Brain runtime is in Rust. This module handles:
//! - Loading initial state from DB
//! - Syncing dirty state back to DB
//! - Future: reading rules, writing traces/edges

use std::sync::{Arc, Mutex};
use std::time::Duration;
use surrealdb::engine::remote::ws::{Client, Ws};
use surrealdb::opt::auth::Root;
use surrealdb::Surreal;

use crate::brain::BrainState;

pub type Db = Surreal<Client>;

pub async fn connect(url: &str) -> Db {
    loop {
        match Surreal::new::<Ws>(url).await {
            Ok(db) => {
                match db
                    .signin(Root {
                        username: "root".to_string(),
                        password: "root".to_string(),
                    })
                    .await
                {
                    Ok(_) => {}
                    Err(e) => {
                        tracing::warn!("signin: {e}");
                        tokio::time::sleep(Duration::from_secs(2)).await;
                        continue;
                    }
                }
                match db.use_ns("deus").use_db("runtime").await {
                    Ok(_) => {}
                    Err(e) => {
                        tracing::warn!("use ns/db: {e}");
                        tokio::time::sleep(Duration::from_secs(2)).await;
                        continue;
                    }
                }
                return db;
            }
            Err(e) => {
                tracing::warn!("connect: {e}, retry 2s");
                tokio::time::sleep(Duration::from_secs(2)).await;
            }
        }
    }
}

pub struct KernelState {
    pub cycle: u64,
    pub energy: f64,
    pub fatigue: f64,
    pub config: Option<serde_json::Value>,
}

pub async fn load_state(db: &Db) -> Option<KernelState> {
    let result: Result<Vec<serde_json::Value>, _> = db
        .query("SELECT cycle, energy, fatigue, config FROM kernel_state LIMIT 1")
        .await
        .and_then(|mut r| r.take(0));

    match result {
        Ok(rows) => {
            let row = rows.into_iter().next()?;
            Some(KernelState {
                cycle: row.get("cycle")?.as_u64().unwrap_or(0),
                energy: row.get("energy")?.as_f64().unwrap_or(1.0),
                fatigue: row.get("fatigue")?.as_f64().unwrap_or(0.0),
                config: row.get("config").cloned(),
            })
        }
        Err(e) => {
            tracing::warn!("load_state: {e}");
            None
        }
    }
}

pub async fn load_counts(db: &Db) -> Option<(u32, u32)> {
    let traces: u32 = db
        .query("SELECT count() AS c FROM trace_state WHERE archived = false GROUP ALL")
        .await
        .and_then(|mut r| r.take::<Vec<serde_json::Value>>(0))
        .ok()
        .and_then(|v| v.first().cloned())
        .and_then(|v| v.get("c")?.as_u64())
        .map(|c| c as u32)
        .unwrap_or(0);

    let edges: u32 = db
        .query("SELECT count() AS c FROM activates WHERE (archived IS NONE OR archived = false) GROUP ALL")
        .await
        .and_then(|mut r| r.take::<Vec<serde_json::Value>>(0))
        .ok()
        .and_then(|v| v.first().cloned())
        .and_then(|v| v.get("c")?.as_u64())
        .map(|c| c as u32)
        .unwrap_or(0);

    Some((traces, edges))
}

/// Sync dirty brain state to SurrealDB.
pub async fn sync_to_db(db: &Db, state: &Arc<Mutex<BrainState>>) {
    let (cycle, energy, fatigue, hormones, accumulators, dirty_v, dirty_h, dirty_a) = {
        let s = state.lock().unwrap();
        (
            s.cycle, s.energy, s.fatigue,
            s.hormones.clone(), s.accumulators.clone(),
            s.dirty_vitals, s.dirty_hormones, s.dirty_accumulators,
        )
    };

    if dirty_v {
        let _ = db
            .query("UPDATE kernel_state SET cycle = $c, energy = $e, fatigue = $f, running = true")
            .bind(("c", cycle as i64))
            .bind(("e", energy))
            .bind(("f", fatigue))
            .await;

        state.lock().unwrap().dirty_vitals = false;
    }

    if dirty_h {
        let _ = db
            .query("UPDATE nn_node SET `value` = $v WHERE node_id = 'hormone:dopamine'")
            .bind(("v", hormones.dopamine))
            .await;
        let _ = db
            .query("UPDATE nn_node SET `value` = $v WHERE node_id = 'hormone:norepinephrine'")
            .bind(("v", hormones.norepinephrine))
            .await;
        let _ = db
            .query("UPDATE nn_node SET `value` = $v WHERE node_id = 'hormone:cortisol'")
            .bind(("v", hormones.cortisol))
            .await;
        let _ = db
            .query("UPDATE nn_node SET `value` = $v WHERE node_id = 'hormone:serotonin'")
            .bind(("v", hormones.serotonin))
            .await;

        state.lock().unwrap().dirty_hormones = false;
    }

    if dirty_a {
        let a = &accumulators;
        let _ = db
            .query("UPDATE nn_node SET `value` = $v WHERE node_id = 'acc:pred_error'")
            .bind(("v", a.pred_error))
            .await;
        let _ = db
            .query("UPDATE nn_node SET `value` = $v WHERE node_id = 'acc:convergence'")
            .bind(("v", a.convergence))
            .await;
        let _ = db
            .query("UPDATE nn_node SET `value` = $v WHERE node_id = 'acc:reward'")
            .bind(("v", a.reward))
            .await;
        let _ = db
            .query("UPDATE nn_node SET `value` = $v WHERE node_id = 'acc:novelty'")
            .bind(("v", a.novelty))
            .await;
        let _ = db
            .query("UPDATE nn_node SET `value` = $v WHERE node_id = 'acc:pain'")
            .bind(("v", a.pain))
            .await;
        let _ = db
            .query("UPDATE nn_node SET `value` = $v WHERE node_id = 'acc:stability'")
            .bind(("v", a.stability))
            .await;
        let _ = db
            .query("UPDATE nn_node SET `value` = $v WHERE node_id = 'acc:tension'")
            .bind(("v", a.tension))
            .await;

        state.lock().unwrap().dirty_accumulators = false;
    }
}
