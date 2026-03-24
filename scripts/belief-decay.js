const beliefDecay = require("../src/beliefs/belief-decay");

if (require.main === module) {
  beliefDecay.main();
}

module.exports = beliefDecay;
