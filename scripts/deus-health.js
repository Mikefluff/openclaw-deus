const { main } = require("../src/deus/deus-health");

module.exports = {
  main,
};

if (require.main === module) {
  main();
}
