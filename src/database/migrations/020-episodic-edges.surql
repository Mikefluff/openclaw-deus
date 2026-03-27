-- Migration 020: Episodic edges + empowerment tracking
-- AriGraph-inspired dual-edge architecture: semantic (permanent) + episodic (timestamped, decaying)

-- Episodic edges: time-stamped, decaying traces of specific interactions
-- "At tick 47, pushing мячик activated the rolling trace"
-- Frequent episodic patterns consolidate into permanent semantic edges (activates)
DEFINE TABLE episodic SCHEMAFULL TYPE RELATION FROM trace TO trace;
DEFINE FIELD weight ON episodic TYPE float DEFAULT 0.5;
DEFINE FIELD cycle ON episodic TYPE int;
DEFINE FIELD action ON episodic TYPE option<string>;
DEFINE FIELD context ON episodic TYPE option<string>;

-- Empowerment per action-region: how much control the agent has
-- High empowerment = actions produce diverse, predictable outcomes
DEFINE FIELD empowerment ON cluster TYPE float DEFAULT 0;
