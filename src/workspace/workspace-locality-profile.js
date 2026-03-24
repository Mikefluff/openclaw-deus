"use strict";

const { WORKSPACE_ROOT } = require("./workspace-path");
const { readUserContext } = require("../memory/user-context");

const DEFAULT_WORKSPACE_TIME_ZONE = "UTC";
const DEFAULT_QUIET_HOURS = Object.freeze({
  startLocal: "23:00",
  endLocal: "08:00",
});

function normalizeClockValue(value) {
  const normalized = String(value || "").trim();
  return /^\d{2}:\d{2}$/.test(normalized) ? normalized : null;
}

function parseQuietHoursRange(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{2}:\d{2})\s*[-–]\s*(\d{2}:\d{2})$/);
  if (!match) {
    return {};
  }

  return {
    startLocal: normalizeClockValue(match[1]),
    endLocal: normalizeClockValue(match[2]),
  };
}

function resolveWorkspaceLocalityProfile(options = {}) {
  const workspaceRoot = options.workspaceRoot || WORKSPACE_ROOT;
  const fields =
    options.userFields || readUserContext({ workspaceRoot }).fields || {};
  const envQuietHours = parseQuietHoursRange(process.env.WORKSPACE_QUIET_HOURS);
  const userQuietHours = parseQuietHoursRange(fields.quiet_hours);

  const timeZone =
    options.timeZone ||
    process.env.WORKSPACE_TZ ||
    fields.timezone ||
    DEFAULT_WORKSPACE_TIME_ZONE;

  const quietHours = Object.freeze({
    startLocal:
      normalizeClockValue(options.quietHours?.startLocal) ||
      normalizeClockValue(process.env.WORKSPACE_QUIET_HOURS_START_LOCAL) ||
      envQuietHours.startLocal ||
      userQuietHours.startLocal ||
      DEFAULT_QUIET_HOURS.startLocal,
    endLocal:
      normalizeClockValue(options.quietHours?.endLocal) ||
      normalizeClockValue(process.env.WORKSPACE_QUIET_HOURS_END_LOCAL) ||
      envQuietHours.endLocal ||
      userQuietHours.endLocal ||
      DEFAULT_QUIET_HOURS.endLocal,
  });

  return {
    timeZone,
    quietHours,
    scheduleLabel: options.scheduleLabel || "local time",
    userLanguages: fields.languages || null,
  };
}

module.exports = {
  DEFAULT_QUIET_HOURS,
  DEFAULT_WORKSPACE_TIME_ZONE,
  resolveWorkspaceLocalityProfile,
};
