const content = require("./review-queue-content");
const identity = require("./review-queue-identity");
const normalize = require("./review-queue-normalize");

module.exports = {
  ...content,
  ...identity,
  ...normalize,
};
