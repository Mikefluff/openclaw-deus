"use strict";

const { normalizePolicyStringArray } = require("./action-policy-helpers");

function buildPolicyFrictionTokens(input = {}) {
  const blockers = normalizePolicyStringArray(input.blockers).map(
    (value) => `blocker:${value}`,
  );
  const missingPreconditions = normalizePolicyStringArray(
    input.missingPreconditions,
  ).map((value) => `precondition:${value}`);
  const hardBlocks = normalizePolicyStringArray(input.hardBlocks).map(
    (value) => `hard_block:${value}`,
  );
  const maintenanceTail =
    input.maintenanceTailObserved === "high" ? ["maintenance_tail:high"] : [];
  const followupRequired = input.followupRequired ? ["followup_required"] : [];
  const failedOutcome = input.success === false ? ["outcome:failed"] : [];

  return [
    ...new Set([
      ...blockers,
      ...missingPreconditions,
      ...hardBlocks,
      ...maintenanceTail,
      ...followupRequired,
      ...failedOutcome,
    ]),
  ];
}

module.exports = {
  buildPolicyFrictionTokens,
};
