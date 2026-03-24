"use strict";

const {
  resolveWorkspaceLocalityProfile,
} = require("../workspace/workspace-locality-profile");

function buildDailyCronSchedule(localTime, timeZone) {
  const [hour, minute] = String(localTime || "00:00")
    .split(":")
    .map((value) => Number(value));

  return Object.freeze({
    kind: "cron",
    expr: `${minute} ${hour} * * *`,
    tz: timeZone,
  });
}

function buildNightlyJob(id, key, title, localTime, timeZone, scheduleLabel) {
  return Object.freeze({
    id,
    key,
    name: `${title} (${localTime} ${scheduleLabel})`,
    localTime,
    schedule: buildDailyCronSchedule(localTime, timeZone),
  });
}

function buildDeusCronPolicy(options = {}) {
  const locality = resolveWorkspaceLocalityProfile(options);

  return Object.freeze({
    version: 3,
    source: "openclaw-server-jobs-json",
    capturedAt: null,
    timeZone: locality.timeZone,
    quietHours: Object.freeze({
      startLocal: locality.quietHours.startLocal,
      endLocal: locality.quietHours.endLocal,
    }),
    followThrough: Object.freeze({
      id: "a30e029b-49cc-4b0b-87b1-f37921540ced",
      name: "DEUS Status Follow-Through (every 2h)",
      schedule: Object.freeze({
        kind: "cron",
        expr: "0 */2 * * *",
        tz: "UTC",
        staggerMs: 300000,
      }),
    }),
    nightly: Object.freeze({
      windowStartLocal: "02:30",
      windowEndLocal: "05:20",
      jobs: Object.freeze([
        buildNightlyJob(
          "7404ba2b-9bf3-4370-9f8d-829b0e2d43f2",
          "micro_improvement",
          "Nightly DEUS Micro-Improvement",
          "02:30",
          locality.timeZone,
          locality.scheduleLabel,
        ),
        buildNightlyJob(
          "62148f8c-bb2a-4d36-8dfd-daae1a9acf49",
          "introspection",
          "Full-night DEUS Orchestrator",
          "04:00",
          locality.timeZone,
          locality.scheduleLabel,
        ),
        buildNightlyJob(
          "99d95e01-a2d9-47a5-870c-d5a70b6b7521",
          "review_pressure_audit",
          "Post-nightly DEUS Review-Pressure Audit",
          "04:20",
          locality.timeZone,
          locality.scheduleLabel,
        ),
        buildNightlyJob(
          "2b218c5b-ffaa-462e-bc80-da7d94fe473f",
          "constitution_check",
          "Nightly DEUS Constitution Check",
          "04:40",
          locality.timeZone,
          locality.scheduleLabel,
        ),
        buildNightlyJob(
          "c88c4ed5-0443-43dd-93a7-1c160489b9df",
          "backup",
          "Nightly DEUS Backup Finalization",
          "05:00",
          locality.timeZone,
          locality.scheduleLabel,
        ),
      ]),
    }),
  });
}

const DEUS_CRON_POLICY = buildDeusCronPolicy();

module.exports = {
  buildDeusCronPolicy,
  DEUS_CRON_POLICY,
};
