const data = require("./introspection-report-data");
const posture = require("./introspection-report-posture");
const render = require("./introspection-report-render");

module.exports = {
  ...data,
  ...posture,
  ...render,
};
