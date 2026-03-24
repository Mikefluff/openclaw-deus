#!/usr/bin/env node

const { main } = require("../src/deus/deus-focus-state");

module.exports = {
  main,
};

if (require.main === module) {
  main({
    now: process.env.DEUS_NOW || process.env.WORKSPACE_NOW,
  });
}
