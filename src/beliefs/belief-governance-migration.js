"use strict";

const annotate = require("./belief-governance-annotate");
const directives = require("./belief-governance-directives");
const repair = require("./belief-governance-repair");

module.exports = {
  ...annotate,
  ...directives,
  ...repair,
};
