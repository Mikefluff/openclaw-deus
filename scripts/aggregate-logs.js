const { aggregateAll } = require("../src/memory/daily-memory-aggregation");

if (require.main === module) {
  const result = aggregateAll();
  console.log(JSON.stringify(result, null, 2));
}

module.exports = { aggregateAll };
