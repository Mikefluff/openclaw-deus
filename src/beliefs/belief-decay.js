"use strict";

const profile = require("./belief-decay-profile");
const runner = require("./belief-decay-runner");
const store = require("./belief-decay-store");
const transitions = require("./belief-decay-transitions");

module.exports = {
  ...profile,
  ...runner,
  ...store,
  ...transitions,
};
