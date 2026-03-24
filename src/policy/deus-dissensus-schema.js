"use strict";

const constants = require("./deus-dissensus-constants");
const ids = require("./deus-dissensus-ids");
const entries = require("./deus-dissensus-entry-schema");
const normalize = require("./deus-dissensus-normalize");

module.exports = {
  ...constants,
  ...ids,
  ...entries,
  ...normalize,
};
