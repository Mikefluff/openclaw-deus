"use strict";

const {
  DEFAULT_WORKSPACE_TIME_ZONE,
  resolveWorkspaceLocalityProfile,
} = require("./workspace-locality-profile");

function resolveWorkspaceTimeZone(options = {}) {
  return resolveWorkspaceLocalityProfile(options).timeZone;
}

function normalizeInputDate(input = new Date()) {
  if (input instanceof Date) {
    return new Date(input.getTime());
  }

  return new Date(input);
}

function getFormatter(timeZone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
}

function getWorkspaceDateParts(
  input = new Date(),
  timeZone = resolveWorkspaceTimeZone(),
) {
  const date = normalizeInputDate(input);
  const formatter = getFormatter(timeZone);
  const parts = formatter.formatToParts(date);
  const byType = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  return {
    year: byType.year,
    month: byType.month,
    day: byType.day,
    hour: byType.hour,
    minute: byType.minute,
    second: byType.second,
  };
}

function getWorkspaceDayKey(
  input = new Date(),
  timeZone = resolveWorkspaceTimeZone(),
) {
  const parts = getWorkspaceDateParts(input, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function shiftWorkspaceDayKey(
  input = new Date(),
  dayOffset = 0,
  timeZone = resolveWorkspaceTimeZone(),
) {
  const parts = getWorkspaceDateParts(input, timeZone);
  const shiftedDate = new Date(
    Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day) + dayOffset,
      12,
      0,
      0,
    ),
  );

  return getWorkspaceDayKey(shiftedDate, timeZone);
}

function getWorkspaceLocalTimestamp(
  input = new Date(),
  timeZone = resolveWorkspaceTimeZone(),
) {
  const parts = getWorkspaceDateParts(input, timeZone);
  return `${parts.hour}:${parts.minute}:${parts.second}`;
}

function getWorkspaceDateContext(input = new Date(), options = {}) {
  const timeZone = options.timeZone || resolveWorkspaceTimeZone();
  const date = normalizeInputDate(input);

  return {
    timeZone,
    nowIso: date.toISOString(),
    today: getWorkspaceDayKey(date, timeZone),
    yesterday: shiftWorkspaceDayKey(date, -1, timeZone),
    localTimestamp: getWorkspaceLocalTimestamp(date, timeZone),
  };
}

module.exports = {
  DEFAULT_WORKSPACE_TIME_ZONE,
  getWorkspaceDateContext,
  getWorkspaceDateParts,
  getWorkspaceDayKey,
  getWorkspaceLocalTimestamp,
  resolveWorkspaceTimeZone,
  shiftWorkspaceDayKey,
};
