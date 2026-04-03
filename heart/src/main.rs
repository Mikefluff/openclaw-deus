//! Heart — pacemaker for DEUS cognitive kernel.
//!
//! Pumps only when brain needs it. Checks if chain is alive
//! before kicking. If chain running — does nothing.
//! If chain dead — re-kicks.

use std::time::Duration;
use surrealdb::engine::remote::ws::{Client, Ws};
use surrealdb::opt::auth::Root;
use surrealdb::Surreal;

async fn connect(url: &str) -> Surreal<Client> {
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
                tracing::info!("connected to {url}");
                return db;
            }
            Err(e) => {
                tracing::warn!("connect: {e}, retry 2s");
                tokio::time::sleep(Duration::from_secs(2)).await;
            }
        }
    }
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_target(false)
        .with_timer(tracing_subscriber::fmt::time::uptime())
        .init();

    let url = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "127.0.0.1:8000".into());

    tracing::info!("heart v0.2 — smart pacemaker");

    let mut last_cycle: i64 = 0;

    loop {
        let db = connect(&url).await;

        loop {
            tokio::time::sleep(Duration::from_secs(3)).await;

            // Read current cycle
            let cycle: i64 = match db
                .query("SELECT cycle FROM kernel_state LIMIT 1")
                .await
            {
                Ok(mut res) => {
                    let rows: Vec<serde_json::Value> =
                        res.take(0).unwrap_or_default();
                    rows.first()
                        .and_then(|r| r.get("cycle"))
                        .and_then(|c| c.as_i64())
                        .unwrap_or(0)
                }
                Err(e) => {
                    tracing::warn!("read failed: {e}, reconnecting");
                    break;
                }
            };

            if cycle == last_cycle {
                // Brain stalled — chain exhausted or not started. Kick.
                tracing::info!("brain stalled at cycle={cycle}, kicking");
                if let Err(e) = db
                    .query("DELETE _clk_a; CREATE _clk_a SET t = time::now()")
                    .await
                {
                    tracing::warn!("kick failed: {e}, reconnecting");
                    break;
                }
            }

            last_cycle = cycle;
        }
    }
}
