/**
 * DEUS Activity Logger
 * Logs DEUS's own actions throughout the day for memory reconstruction
 */

const {
  appendWorkspaceActivityLogEntry,
} = require("../src/deus/deus-activity-log");

/**
 * Log a DEUS activity
 * @param {string} type - Event type: command|decision|error|interaction|policy|system|git
 * @param {string} description - What happened
 * @param {object} context - Additional details
 */
function logActivity(type, description, context = {}) {
  return appendWorkspaceActivityLogEntry({
    type,
    description,
    context,
  });
}

// Export for use in other scripts
module.exports = { logActivity };

// CLI usage: node deus-logger.js <type> "<description>"
if (require.main === module) {
  const [, , type, description] = process.argv;
  if (type && description) {
    logActivity(type, description);
  } else {
    console.log('Usage: node deus-logger.js <type> "<description>"');
    console.log(
      "Types: command, decision, error, interaction, policy, system, git",
    );
  }
}
