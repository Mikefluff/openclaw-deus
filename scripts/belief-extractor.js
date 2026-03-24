const beliefExtractor = require("../src/beliefs/belief-extractor");

if (require.main === module) {
  beliefExtractor.main();
}

module.exports = beliefExtractor;
