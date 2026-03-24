"use strict";

function normalizeString(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function normalizeStringArray(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return [
    ...new Set(values.map((value) => normalizeString(value)).filter(Boolean)),
  ];
}

function normalizeEnum(value, allowedValues, fallback) {
  const normalized = normalizeString(value, fallback);
  return allowedValues.includes(normalized) ? normalized : fallback;
}

module.exports = {
  normalizeEnum,
  normalizeString,
  normalizeStringArray,
};
