const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { execFileSync } = require("child_process");

const scriptPath = path.resolve(
  __dirname,
  "..",
  "scripts",
  "doctor-workspace.js",
);

test("workspace doctor verifies the official focus and sleep package entrypoints", () => {
  const output = execFileSync(process.execPath, [scriptPath], {
    cwd: path.resolve(__dirname, ".."),
    encoding: "utf8",
  });

  assert.match(output, /\[PASS\] root script deus:focus exists/);
  assert.match(output, /\[PASS\] root script deus:sleep exists/);
  assert.match(output, /\[PASS\] root script deus:sleep:dry exists/);
  assert.match(
    output,
    /\[PASS\] root script deus:introspection:followup exists/,
  );
  assert.match(output, /\[PASS\] root script deus:decay:tune exists/);
  assert.match(output, /\[PASS\] root script deus:decay:tune:dry exists/);
  assert.match(output, /\[PASS\] root script workspace:authority exists/);
  assert.match(
    output,
    /\[PASS\] workspace authority classifies STATUS\.md as live runtime/,
  );
  assert.match(
    output,
    /\[PASS\] workspace authority classifies \.tmp diagnostics as ephemeral runtime/,
  );
  assert.match(output, /Workspace doctor completed successfully/);
});
