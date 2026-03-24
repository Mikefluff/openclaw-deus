const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  DEFAULT_WORKSPACE_TIME_ZONE,
  resolveWorkspaceLocalityProfile,
} = require("../src/workspace/workspace-locality-profile");

function writeUser(workspaceRoot, content) {
  fs.writeFileSync(path.join(workspaceRoot, "USER.md"), content);
}

test("workspace locality profile stays neutral by default", (t) => {
  const workspaceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "deus-locality-profile-"),
  );
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));

  writeUser(workspaceRoot, "# USER\n");
  const profile = resolveWorkspaceLocalityProfile({ workspaceRoot });

  assert.equal(DEFAULT_WORKSPACE_TIME_ZONE, "UTC");
  assert.equal(profile.timeZone, "UTC");
  assert.deepEqual(profile.quietHours, {
    startLocal: "23:00",
    endLocal: "08:00",
  });
  assert.equal(profile.scheduleLabel, "local time");
});

test("workspace locality profile resolves user-specific timezone and quiet hours", (t) => {
  const workspaceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "deus-locality-profile-"),
  );
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));

  writeUser(
    workspaceRoot,
    [
      "# USER",
      "",
      "- **Timezone:** Europe/Berlin",
      "- **Quiet Hours:** 22:30-07:30",
      "",
    ].join("\n"),
  );

  const profile = resolveWorkspaceLocalityProfile({ workspaceRoot });

  assert.equal(profile.timeZone, "Europe/Berlin");
  assert.deepEqual(profile.quietHours, {
    startLocal: "22:30",
    endLocal: "07:30",
  });
});
