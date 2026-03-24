const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  getHumanInteractionSectionTitle,
  readUserContext,
} = require("../src/memory/user-context");

function writeFile(workspaceRoot, relativePath, content) {
  const fullPath = path.join(workspaceRoot, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

test("user context resolves display name and interaction section title from USER.md", (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "user-context-"));
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));

  writeFile(
    workspaceRoot,
    "USER.md",
    [
      "# USER",
      "",
      "- **Name:** Human Operator",
      "- **What to call them:** Human",
      "- **Timezone:** UTC",
      "",
    ].join("\n"),
  );

  const context = readUserContext({ workspaceRoot });
  assert.equal(context.displayName, "Human");
  assert.equal(
    getHumanInteractionSectionTitle({ workspaceRoot }),
    "Interactions with Human",
  );
});

test("user context falls back to a generic human label when USER.md is sparse", (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "user-context-"));
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));

  writeFile(workspaceRoot, "USER.md", "# USER\n");

  const context = readUserContext({ workspaceRoot });
  assert.equal(context.displayName, "Human");
  assert.equal(
    getHumanInteractionSectionTitle({ workspaceRoot }),
    "Interactions with Human",
  );
});
