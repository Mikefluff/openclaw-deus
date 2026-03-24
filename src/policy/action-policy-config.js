const profiles = require("./action-policy-profiles");
const thresholds = require("./action-policy-thresholds");

module.exports = {
  ...profiles,
  ...thresholds,
};
