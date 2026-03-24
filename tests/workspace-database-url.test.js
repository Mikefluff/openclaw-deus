const test = require("node:test");
const assert = require("node:assert/strict");

const {
  requireWorkspaceDatabaseUrl,
  resolveWorkspaceDatabaseUrl,
} = require("../src/workspace/workspace-database-url");

function withEnv(overrides, fn) {
  const snapshot = {
    DB: process.env.DB,
    DATABASE_URL: process.env.DATABASE_URL,
    SUPABASE_POOLER_URL: process.env.SUPABASE_POOLER_URL,
  };

  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(snapshot)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("workspace database resolver accepts DB as the shared DSN alias", () => {
  withEnv(
    {
      DB: "postgresql://from-db",
      DATABASE_URL: "",
      SUPABASE_POOLER_URL: "",
    },
    () => {
      assert.equal(resolveWorkspaceDatabaseUrl(), "postgresql://from-db");
      assert.equal(requireWorkspaceDatabaseUrl(), "postgresql://from-db");
    },
  );
});

test("workspace database resolver prefers DATABASE_URL over DB and pooler env", () => {
  withEnv(
    {
      DB: "postgresql://from-db",
      DATABASE_URL: "postgresql://from-database-url",
      SUPABASE_POOLER_URL: "postgresql://from-pooler",
    },
    () => {
      assert.equal(
        resolveWorkspaceDatabaseUrl(),
        "postgresql://from-database-url",
      );
    },
  );
});
