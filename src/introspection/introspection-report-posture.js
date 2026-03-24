const { classifyIntrospectionPosture } = require("../beliefs/belief-policy");

function resolveIntrospectionReportPosture(coherenceScore, lowConfidenceCount) {
  return classifyIntrospectionPosture(coherenceScore, lowConfidenceCount);
}

module.exports = {
  resolveIntrospectionReportPosture,
};
