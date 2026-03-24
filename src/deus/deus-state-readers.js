"use strict";

const projects = require("./deus-state-reader-projects");
const review = require("./deus-state-reader-review");
const status = require("./deus-state-reader-status");
const timeline = require("./deus-state-reader-timeline");

module.exports = {
  ...projects,
  ...review,
  ...status,
  ...timeline,
};
