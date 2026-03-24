const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_WORKSPACE_TIME_ZONE,
  getWorkspaceDateContext,
  getWorkspaceDayKey,
} = require("../src/workspace/workspace-date-context");

test("workspace date context maps late UTC evening into the resolved local day", () => {
  const context = getWorkspaceDateContext("2026-03-17T19:30:00.000Z");

  assert.equal(DEFAULT_WORKSPACE_TIME_ZONE, "UTC");
  assert.equal(context.timeZone, "UTC");
  assert.equal(context.today, "2026-03-17");
  assert.equal(context.yesterday, "2026-03-16");
  assert.equal(context.localTimestamp, "19:30:00");
});

test("workspace date context keeps early UTC morning on the same UTC day", () => {
  const context = getWorkspaceDateContext("2026-03-17T02:15:00.000Z");

  assert.equal(context.today, "2026-03-17");
  assert.equal(context.yesterday, "2026-03-16");
  assert.equal(context.localTimestamp, "02:15:00");
});

test("workspace date context preserves UTC day boundaries by default", () => {
  const fixtures = [
    {
      utc: "2026-03-17T16:00:00.000Z",
      today: "2026-03-17",
      yesterday: "2026-03-16",
      localTimestamp: "16:00:00",
    },
    {
      utc: "2026-03-17T16:59:59.000Z",
      today: "2026-03-17",
      yesterday: "2026-03-16",
      localTimestamp: "16:59:59",
    },
    {
      utc: "2026-03-17T17:00:00.000Z",
      today: "2026-03-17",
      yesterday: "2026-03-16",
      localTimestamp: "17:00:00",
    },
    {
      utc: "2026-03-17T19:00:00.000Z",
      today: "2026-03-17",
      yesterday: "2026-03-16",
      localTimestamp: "19:00:00",
    },
  ];

  for (const fixture of fixtures) {
    const context = getWorkspaceDateContext(fixture.utc);

    assert.equal(
      context.today,
      fixture.today,
      `today mismatch for ${fixture.utc}`,
    );
    assert.equal(
      context.yesterday,
      fixture.yesterday,
      `yesterday mismatch for ${fixture.utc}`,
    );
    assert.equal(
      context.localTimestamp,
      fixture.localTimestamp,
      `localTimestamp mismatch for ${fixture.utc}`,
    );
  }
});

test("workspace day key supports explicit timezone overrides", () => {
  const dayKey = getWorkspaceDayKey("2026-03-17T04:00:00.000Z", "UTC");

  assert.equal(dayKey, "2026-03-17");
});

test("workspace day key supports user-specific timezone overrides via explicit input", () => {
  const dayKey = getWorkspaceDayKey(
    "2026-03-17T23:30:00.000Z",
    "Europe/Berlin",
  );

  assert.equal(dayKey, "2026-03-18");
});
