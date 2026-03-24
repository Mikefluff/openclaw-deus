"use strict";

const { DEUS_CRON_POLICY } = require("../policy/deus-cron-policy");
const {
  getWorkspaceDateParts,
  shiftWorkspaceDayKey,
} = require("../workspace/workspace-date-context");

function clockToMinutes(clock) {
  const match = String(clock || "").match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

function getLocalMinutes(now = new Date(), timeZone = DEUS_CRON_POLICY.timeZone) {
  const parts = getWorkspaceDateParts(now, timeZone);
  return Number(parts.hour) * 60 + Number(parts.minute);
}

function isWithinWindow(minute, startMinute, endMinute) {
  return minute >= startMinute && minute <= endMinute;
}

function isWithinWrappedWindow(minute, startMinute, endMinute) {
  if (startMinute === null || endMinute === null) {
    return false;
  }

  if (startMinute <= endMinute) {
    return isWithinWindow(minute, startMinute, endMinute);
  }

  return minute >= startMinute || minute <= endMinute;
}

function resolveNextNightlyWindowDayKey(dateContext, localMinutes, startMinute, now) {
  if (localMinutes < startMinute) {
    return dateContext.today;
  }

  return shiftWorkspaceDayKey(now, 1, dateContext.timeZone);
}

function getNextFollowThroughRun(now = new Date(), policy = DEUS_CRON_POLICY) {
  const base = new Date(now);
  base.setUTCSeconds(0, 0);

  const currentUtcHour = base.getUTCHours();
  const currentUtcMinute = base.getUTCMinutes();
  const currentSlotHour = currentUtcHour - (currentUtcHour % 2);
  const next = new Date(base);
  next.setUTCHours(currentSlotHour, 0, 0, 0);

  if (currentUtcMinute > 0 || currentUtcHour !== currentSlotHour) {
    next.setUTCHours(currentSlotHour + 2, 0, 0, 0);
  }

  const staggerMinutes = Math.floor(
    (policy.followThrough.schedule.staggerMs || 0) / 60_000,
  );
  if (staggerMinutes > 0) {
    next.setUTCMinutes(next.getUTCMinutes() + staggerMinutes);
  }

  const localParts = getWorkspaceDateParts(next, policy.timeZone);

  return {
    utc: next.toISOString(),
    localDayKey: `${localParts.year}-${localParts.month}-${localParts.day}`,
    localTime: `${localParts.hour}:${localParts.minute}`,
    staggerMinutes,
  };
}

module.exports = {
  clockToMinutes,
  getLocalMinutes,
  getNextFollowThroughRun,
  isWithinWindow,
  isWithinWrappedWindow,
  resolveNextNightlyWindowDayKey,
};
