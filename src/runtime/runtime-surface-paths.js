"use strict";

const base = require("./runtime-surface-base");
const deus = require("./runtime-surface-deus");
const projects = require("./runtime-surface-projects");
const catalog = require("./runtime-surface-catalog");

module.exports = {
  listKnownProjectRuntimeSurfaces: projects.listKnownProjectRuntimeSurfaces,
  listKnownRuntimeSurfacePaths: catalog.listKnownRuntimeSurfacePaths,
  resolveBeliefDecayOverridesPath: deus.resolveBeliefDecayOverridesPath,
  resolveBeliefDecayOverridesWritePath:
    deus.resolveBeliefDecayOverridesWritePath,
  resolveBeliefDriftLogPath: deus.resolveBeliefDriftLogPath,
  resolveBeliefsPath: deus.resolveBeliefsPath,
  resolveBeliefsWritePath: deus.resolveBeliefsWritePath,
  resolveDataDir: deus.resolveDataDir,
  resolveDissensusDir: deus.resolveDissensusDir,
  resolveDissensusEventsDir: deus.resolveDissensusEventsDir,
  resolveDissensusEventsWriteDir: deus.resolveDissensusEventsWriteDir,
  resolveDissensusLogPath: deus.resolveDissensusLogPath,
  resolveDissensusLogWritePath: deus.resolveDissensusLogWritePath,
  resolveDissensusOpenCasesPath: deus.resolveDissensusOpenCasesPath,
  resolveDissensusOpenCasesWritePath: deus.resolveDissensusOpenCasesWritePath,
  resolveDissensusOverridesPath: deus.resolveDissensusOverridesPath,
  resolveDissensusOverridesWritePath: deus.resolveDissensusOverridesWritePath,
  resolveDissensusWriteDir: deus.resolveDissensusWriteDir,
  resolveExtractionMarkerPath: deus.resolveExtractionMarkerPath,
  resolveExtractionMarkerWritePath: deus.resolveExtractionMarkerWritePath,
  resolveIntrospectionDir: deus.resolveIntrospectionDir,
  resolveIntrospectionFollowupLatestPath:
    deus.resolveIntrospectionFollowupLatestPath,
  resolveIntrospectionSummaryPath: deus.resolveIntrospectionSummaryPath,
  resolveIntrospectionSummaryWritePath:
    deus.resolveIntrospectionSummaryWritePath,
  resolveIntrospectionWriteDir: deus.resolveIntrospectionWriteDir,
  resolveLogPath: deus.resolveLogPath,
  resolveLogWritePath: deus.resolveLogWritePath,
  resolveLogsDir: deus.resolveLogsDir,
  resolveLogsWriteDir: deus.resolveLogsWriteDir,
  resolveMemoryDir: deus.resolveMemoryDir,
  resolveMemoryPath: deus.resolveMemoryPath,
  resolveMemoryWriteDir: deus.resolveMemoryWriteDir,
  resolveMemoryWritePath: deus.resolveMemoryWritePath,
  resolveOpenTensionsPath: deus.resolveOpenTensionsPath,
  resolveOpenTensionsWritePath: deus.resolveOpenTensionsWritePath,
  resolveOpsRollupPath: deus.resolveOpsRollupPath,
  resolveOpsRollupWritePath: deus.resolveOpsRollupWritePath,
  resolvePendingBeliefsPath: deus.resolvePendingBeliefsPath,
  resolvePendingBeliefsWritePath: deus.resolvePendingBeliefsWritePath,
  resolveProjectDataDir: projects.resolveProjectDataDir,
  resolveProjectDataPath: projects.resolveProjectDataPath,
  resolveProjectLogsDir: projects.resolveProjectLogsDir,
  resolveProjectLogPath: projects.resolveProjectLogPath,
  resolveProjectStatusPath: projects.resolveProjectStatusPath,
  resolveReportsDir: deus.resolveReportsDir,
  resolveReviewDir: deus.resolveReviewDir,
  resolveRuntimeSurfaceDir: base.resolveRuntimeSurfaceDir,
  resolveRuntimeSurfacePath: base.resolveRuntimeSurfacePath,
  resolveRuntimeSurfaceWriteDir: base.resolveRuntimeSurfaceWriteDir,
  resolveRuntimeSurfaceWritePath: base.resolveRuntimeSurfaceWritePath,
  resolveStatusPath: deus.resolveStatusPath,
  resolveWorldModelLatestPath: deus.resolveWorldModelLatestPath,
};
