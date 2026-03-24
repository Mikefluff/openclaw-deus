"use strict";

const thresholds = require("./belief-policy-thresholds");
const decaySchema = require("./belief-policy-decay-schema");
const decayProfile = require("./belief-policy-decay-profile");

module.exports = {
  ...thresholds,
  ...decaySchema,
  ...decayProfile,
};
