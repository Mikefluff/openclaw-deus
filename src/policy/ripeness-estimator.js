"use strict";

const runner = require("./ripeness-estimator-runner");
const preconditions = require("./ripeness-preconditions");
const rationale = require("./ripeness-rationale");
const factors = require("./ripeness-score-factors");

module.exports = {
  ...runner,
  ...preconditions,
  ...rationale,
  ...factors,
};
