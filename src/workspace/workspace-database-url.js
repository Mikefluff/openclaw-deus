const fs = require("fs");
const path = require("path");
const { WORKSPACE_ROOT } = require("./workspace-path");

const DEFAULT_WORKSPACE_ENV_FILES = [
  path.join(WORKSPACE_ROOT, ".env"),
  path.join(WORKSPACE_ROOT, ".secrets", "supabase-pooler.env"),
];

const LOADED_ENV_FILES = new Set();

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const normalized = trimmed.startsWith("export ")
    ? trimmed.slice("export ".length)
    : trimmed;
  const delimiterIndex = normalized.indexOf("=");
  if (delimiterIndex === -1) {
    return null;
  }

  const key = normalized.slice(0, delimiterIndex).trim();
  if (!key) {
    return null;
  }

  let value = normalized.slice(delimiterIndex + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return { key, value };
}

function loadEnvFile(filePath) {
  const resolvedPath = path.resolve(filePath);
  if (LOADED_ENV_FILES.has(resolvedPath) || !fs.existsSync(resolvedPath)) {
    return false;
  }

  const lines = fs.readFileSync(resolvedPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const parsed = parseEnvLine(line);
    if (!parsed) {
      continue;
    }
    if (!(parsed.key in process.env)) {
      process.env[parsed.key] = parsed.value;
    }
  }

  LOADED_ENV_FILES.add(resolvedPath);
  return true;
}

function loadWorkspaceEnvFiles(extraFiles = []) {
  const files = [...extraFiles, ...DEFAULT_WORKSPACE_ENV_FILES].filter(Boolean);
  for (const filePath of files) {
    loadEnvFile(filePath);
  }
}

function resolveWorkspaceDatabaseUrl(options = {}) {
  loadWorkspaceEnvFiles(options.extraFiles);
  return (
    process.env.DATABASE_URL ||
    process.env.DB ||
    process.env.SUPABASE_POOLER_URL ||
    null
  );
}

function requireWorkspaceDatabaseUrl(options = {}) {
  const url = resolveWorkspaceDatabaseUrl(options);
  if (url) {
    return url;
  }

  const label = options.label || "DATABASE_URL/DB/SUPABASE_POOLER_URL";
  throw new Error(`Missing required config: ${label}`);
}

module.exports = {
  DEFAULT_WORKSPACE_ENV_FILES,
  loadEnvFile,
  loadWorkspaceEnvFiles,
  resolveWorkspaceDatabaseUrl,
  requireWorkspaceDatabaseUrl,
};
