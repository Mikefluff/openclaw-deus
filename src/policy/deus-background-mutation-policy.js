const path = require("path");
const { WORKSPACE_ROOT } = require("../workspace/workspace-path");
const { relativizeKnownWorkspacePath } = require("../workspace/workspace-roots");
const { appendDeusOpsLog, resolveDeusOpsLogPath } = require("../deus/deus-ops-log");

const BACKGROUND_MUTATION_POLICY = Object.freeze({
  version: 1,
  origins: Object.freeze(["background", "sleep", "idle", "cron"]),
  allowedPrefixes: Object.freeze([
    ".tmp/diagnostics/",
    "logs/",
    "memory/",
    "review/",
    "docs/introspection/",
  ]),
  forbiddenPaths: Object.freeze([
    "DEUS.md",
    "docs/AXIOMS_AND_AGENCY.md",
    "beliefs/core.jsonl",
  ]),
});
const BACKGROUND_MUTATION_AUDIT_COMPONENT = "background-mutation-guard";

function normalizeSlashes(value) {
  return String(value || "").replace(/\\/g, "/");
}

function normalizeWorkspaceRelativePath(targetPath, options = {}) {
  const rawTargetPath = String(targetPath || "").trim();

  if (!rawTargetPath) {
    return "";
  }

  if (path.isAbsolute(rawTargetPath)) {
    return normalizeSlashes(
      relativizeKnownWorkspacePath(rawTargetPath, {
        workspaceRoot: options.workspaceRoot || WORKSPACE_ROOT,
        runtimeRoot: options.runtimeRoot,
      }),
    );
  }

  return normalizeSlashes(path.normalize(rawTargetPath)).replace(/^\.\//, "");
}

function findAllowedPrefix(relativePath) {
  return BACKGROUND_MUTATION_POLICY.allowedPrefixes.find((prefix) =>
    relativePath.startsWith(prefix),
  );
}

function evaluateBackgroundMutationTarget(targetPath, options = {}) {
  const origin = options.origin || "background";
  const relativePath = normalizeWorkspaceRelativePath(targetPath, options);
  const forbidden =
    BACKGROUND_MUTATION_POLICY.forbiddenPaths.includes(relativePath);
  const allowedPrefix = findAllowedPrefix(relativePath);

  if (!BACKGROUND_MUTATION_POLICY.origins.includes(origin)) {
    return {
      allowed: false,
      origin,
      relativePath,
      reason: "unknown_background_origin",
      matchedPrefix: null,
    };
  }

  if (!relativePath || relativePath.startsWith("../")) {
    return {
      allowed: false,
      origin,
      relativePath,
      reason: "outside_workspace_boundary",
      matchedPrefix: null,
    };
  }

  if (forbidden) {
    return {
      allowed: false,
      origin,
      relativePath,
      reason: "forbidden_identity_or_belief_surface",
      matchedPrefix: null,
    };
  }

  if (!allowedPrefix) {
    return {
      allowed: false,
      origin,
      relativePath,
      reason: "background_surface_not_whitelisted",
      matchedPrefix: null,
    };
  }

  return {
    allowed: true,
    origin,
    relativePath,
    reason: "allowed_background_surface",
    matchedPrefix: allowedPrefix,
  };
}

function assertBackgroundMutationTarget(targetPath, options = {}) {
  const evaluation = evaluateBackgroundMutationTarget(targetPath, options);

  if (evaluation.allowed) {
    return evaluation;
  }

  if (options.auditOnBlock !== false) {
    auditBlockedBackgroundMutation({
      ...options,
      targetPath,
      evaluation,
    });
  }

  const error = new Error(
    `Background mutation blocked for ${evaluation.relativePath || "<empty>"}: ${evaluation.reason}`,
  );
  error.code = "E_BACKGROUND_MUTATION_FORBIDDEN";
  error.evaluation = evaluation;
  throw error;
}

function assertBackgroundMutationTargets(targetPaths = [], options = {}) {
  return targetPaths.map((targetPath) =>
    assertBackgroundMutationTarget(targetPath, options),
  );
}

function resolveBackgroundMutationAuditLogPath(options = {}) {
  return resolveDeusOpsLogPath(BACKGROUND_MUTATION_AUDIT_COMPONENT, options);
}

function auditBlockedBackgroundMutation(options = {}) {
  const evaluation =
    options.evaluation ||
    evaluateBackgroundMutationTarget(options.targetPath, options);
  const { entry, logPath } = appendDeusOpsLog({
    component: BACKGROUND_MUTATION_AUDIT_COMPONENT,
    event: "background_mutation_blocked",
    message: `Blocked ${evaluation.origin} mutation for ${evaluation.relativePath || "<empty>"}`,
    details: {
      origin: evaluation.origin,
      targetPath: options.targetPath || null,
      relativePath: evaluation.relativePath,
      reason: evaluation.reason,
      matchedPrefix: evaluation.matchedPrefix,
    },
    workspaceRoot: options.workspaceRoot,
    echo: options.echo ?? false,
  });

  return {
    entry,
    logPath,
  };
}

module.exports = {
  BACKGROUND_MUTATION_POLICY,
  BACKGROUND_MUTATION_AUDIT_COMPONENT,
  auditBlockedBackgroundMutation,
  assertBackgroundMutationTarget,
  assertBackgroundMutationTargets,
  evaluateBackgroundMutationTarget,
  normalizeWorkspaceRelativePath,
  resolveBackgroundMutationAuditLogPath,
};
