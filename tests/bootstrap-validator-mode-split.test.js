const test = require("node:test");
const assert = require("node:assert/strict");

const { BootstrapValidator } = require("../scripts/bootstrap-validator");

function createValidator({ repair }) {
  const validateCalls = [];
  const validator = new BootstrapValidator({
    workspaceRoot: "/tmp/bootstrap-validator-mode-test",
    repair,
    memoryFactory: () => ({
      validateFormat: async (options) => {
        validateCalls.push(options);
        return {
          valid: true,
          exists: !repair,
          created: repair,
          missing: [],
        };
      },
      search: async () => [],
      get: async () => "fixture",
    }),
  });

  validator.fileExists = async () => true;
  validator.validateBeliefs = async () => true;
  validator.checkOpenClawIntegration = async () => {};
  validator.saveResults = async () => {
    throw new Error("saveResults should not run in this test");
  };

  return { validateCalls, validator };
}

test("bootstrap validator routes check mode through a non-mutating memory validation path", async () => {
  const { validator, validateCalls } = createValidator({ repair: false });

  await validator.validate();

  assert.deepEqual(validateCalls, [
    {
      createIfMissing: false,
      allowMissing: true,
    },
  ]);
  assert.equal(validator.results.mode, "check");
});

test("bootstrap validator routes repair mode through an explicit mutating memory validation path", async () => {
  const { validator, validateCalls } = createValidator({ repair: true });

  await validator.validate();

  assert.deepEqual(validateCalls, [
    {
      createIfMissing: true,
      allowMissing: false,
    },
  ]);
  assert.equal(validator.results.mode, "repair");
});
