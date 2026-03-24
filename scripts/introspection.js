const { main } = require("../src/introspection/introspection-pipeline");

module.exports = {
  main,
};

if (require.main === module) {
  main();
}
