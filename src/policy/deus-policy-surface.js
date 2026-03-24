const intent = require("./deus-policy-surface-intent");
const runtime = require("./deus-policy-surface-runtime");
const summary = require("./deus-policy-surface-summary");

module.exports = {
  ...intent,
  ...runtime,
  ...summary,
};
