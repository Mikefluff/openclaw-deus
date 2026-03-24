#!/usr/bin/env node

const {
  decide,
  parseReviewQueue,
  runBeliefPromotionReview,
} = require("../src/beliefs/belief-promotion-review");

function main(options = {}) {
  const result = runBeliefPromotionReview(options);
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (require.main === module) {
  main();
}

module.exports = { decide, main, parseReviewQueue };
