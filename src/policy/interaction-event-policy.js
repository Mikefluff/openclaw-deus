"use strict";

const constants = require("./interaction-event-policy-constants");
const normalize = require("./interaction-event-policy-normalize");
const salience = require("./interaction-event-policy-salience");
const logHelpers = require("./interaction-event-policy-log");

module.exports = {
  ...constants,
  ...normalize,
  ...salience,
  ...logHelpers,
};
