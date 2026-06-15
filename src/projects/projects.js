const content = require("../content");
const { clamp } = require("../core/math");
const { RESOURCE_ORDER } = require("../core/constants");

// ============================================================================
// Project Lookup
// ============================================================================

function itemById(items, id) {
  return items.find((item) => item.id === id);
}

function projectById(id) {
  return itemById(content.projects || [], id);
}

function milestoneProjects() {
  return (content.projects || []).filter((project) => (project.kind || "milestone") === "milestone");
}

function commissionProjects() {
  return (content.projects || []).filter((project) => project.kind === "commission");
}

// ============================================================================
// Project Stages
// ============================================================================

function getProjectStages(projectOrId) {
  const project = typeof projectOrId === "string" ? projectById(projectOrId) : projectOrId;
  if (!project) return [];
  if (Array.isArray(project.stages) && project.stages.length) return project.stages;
  return [{
    id: "delivery",
    name: "交付",
    workHours: Number(project.minWorkHours) || 1,
    resources: project.requirements && project.requirements.resources || {},
    successModifier: 0,
    failureDeltas: null
  }];
}

function getStageRequiredSeconds(stage) {
  return Math.max(1, Math.round((Number(stage && stage.workHours) || 0) * 3600));
}

function getProjectTotalStageSeconds(projectOrId) {
  return getProjectStages(projectOrId).reduce((sum, stage) => sum + getStageRequiredSeconds(stage), 0);
}

function getProjectRequiredSeconds(projectOrId) {
  return getProjectTotalStageSeconds(projectOrId);
}

// ============================================================================
// Project Progress
// ============================================================================

function normalizeSpentResources(raw) {
  const result = {};
  if (!raw || typeof raw !== "object") return result;
  for (const key of RESOURCE_ORDER) {
    const value = Number(raw[key]);
    if (Number.isFinite(value) && value > 0) result[key] = value;
  }
  return result;
}

function createProjectProgressFromWorkedSeconds(project, rawProgress, workedSeconds) {
  const stages = getProjectStages(project);
  const totalRequiredSeconds = getProjectTotalStageSeconds(project);
  let remaining = Math.max(0, Math.min(Number(workedSeconds) || 0, totalRequiredSeconds));
  let stageIndex = 0;
  let stageWorkedSeconds = 0;
  for (let index = 0; index < stages.length; index += 1) {
    const required = getStageRequiredSeconds(stages[index]);
    if (remaining >= required && index < stages.length - 1) {
      remaining -= required;
      stageIndex = index + 1;
      stageWorkedSeconds = 0;
    } else {
      stageIndex = index;
      stageWorkedSeconds = Math.min(required, remaining);
      break;
    }
  }
  const result = {
    stageIndex,
    stageWorkedSeconds,
    workedSeconds: Math.max(0, Number(workedSeconds) || 0),
    spentResources: normalizeSpentResources(rawProgress && (rawProgress.spentResources || rawProgress.investedResources)),
    failureCount: Math.max(0, Math.floor(Number(rawProgress && rawProgress.failureCount) || 0))
  };
  const acceptedAtWorldMinute = Number(rawProgress && rawProgress.acceptedAtWorldMinute);
  const dueWorldMinute = Number(rawProgress && rawProgress.dueWorldMinute);
  if (Number.isFinite(acceptedAtWorldMinute)) result.acceptedAtWorldMinute = Math.max(0, Math.floor(acceptedAtWorldMinute));
  if (Number.isFinite(dueWorldMinute)) result.dueWorldMinute = Math.max(0, Math.floor(dueWorldMinute));
  if (rawProgress && (rawProgress.legacyPrepaid || rawProgress.resourcesPaid)) result.legacyPrepaid = true;
  if (rawProgress && rawProgress.deadlineWarned) result.deadlineWarned = true;
  return result;
}

function getProjectProgress(state, projectOrId) {
  const project = typeof projectOrId === "string" ? projectById(projectOrId) : projectOrId;
  if (!project) return null;
  const progress = state.projectProgress[project.id];
  if (!progress) return null;
  const stages = getProjectStages(project);
  const stage = stages[progress.stageIndex];
  const stageRequiredSeconds = getStageRequiredSeconds(stage);
  const totalRequiredSeconds = getProjectTotalStageSeconds(project);
  const stageProgressPercent = stageRequiredSeconds > 0 ? Math.min(100, Math.floor(progress.stageWorkedSeconds / stageRequiredSeconds * 100)) : 100;
  const progressPercent = totalRequiredSeconds > 0 ? Math.min(100, Math.floor(progress.workedSeconds / totalRequiredSeconds * 100)) : 100;
  return {
    stageIndex: progress.stageIndex,
    stageCount: stages.length,
    stage,
    stageProgressPercent,
    progressPercent,
    workedSeconds: progress.workedSeconds,
    spentResources: progress.spentResources || {},
    failureCount: progress.failureCount || 0,
    acceptedAtWorldMinute: progress.acceptedAtWorldMinute,
    dueWorldMinute: progress.dueWorldMinute,
    deadlineWarned: progress.deadlineWarned
  };
}

function snapshotProjectProgress(state) {
  return Object.fromEntries(
    Object.entries(state.projectProgress || {})
      .filter(([id, progress]) => projectById(id) && progress && Number(progress.workedSeconds) > 0)
      .map(([id, progress]) => [id, Math.max(0, Number(progress.workedSeconds) || 0)])
  );
}

function ensureProjectProgress(state, projectId) {
  const project = projectById(projectId);
  const existing = state.projectProgress[projectId] || {};
  const progress = createProjectProgressFromWorkedSeconds(project, existing, existing.workedSeconds || 0);
  const stages = getProjectStages(project);
  const existingStageIndex = Number(existing.stageIndex);
  const existingStageWorkedSeconds = Number(existing.stageWorkedSeconds);
  const existingWorkedSeconds = Number(existing.workedSeconds);
  const hasStageFields = Number.isFinite(existingStageIndex) && Number.isFinite(existingStageWorkedSeconds);
  const stageIndex = hasStageFields ? clamp(Math.floor(existingStageIndex || 0), 0, Math.max(0, stages.length - 1)) : 0;
  const stageDerivedWorkedSeconds = hasStageFields
    ? stages.slice(0, stageIndex).reduce((sum, item) => sum + getStageRequiredSeconds(item), 0) + Math.max(0, existingStageWorkedSeconds || 0)
    : 0;
  const shouldTrustStageFields = hasStageFields && (!Number.isFinite(existingWorkedSeconds) || existingWorkedSeconds <= 0 || Math.abs(existingWorkedSeconds - stageDerivedWorkedSeconds) < 0.000001);
  if (shouldTrustStageFields) {
    progress.stageIndex = stageIndex;
  }
  const stage = stages[progress.stageIndex];
  progress.stageWorkedSeconds = Math.max(0, Math.min(getStageRequiredSeconds(stage), shouldTrustStageFields ? existingStageWorkedSeconds : progress.stageWorkedSeconds || 0));
  progress.workedSeconds = stages
    .slice(0, progress.stageIndex)
    .reduce((sum, item) => sum + getStageRequiredSeconds(item), 0) + progress.stageWorkedSeconds;
  if (!Number.isFinite(Number(progress.acceptedAtWorldMinute))) {
    progress.acceptedAtWorldMinute = Math.max(0, Math.floor(Number(state.worldTimeMinutes) || 0));
  }
  Object.assign(existing, progress);
  delete existing.resourcesPaid;
  state.projectProgress[projectId] = existing;
  return existing;
}

function clearProjectProgress(state, projectId) {
  delete state.projectProgress[projectId];
  if (state.activeProjectId === projectId) state.activeProjectId = null;
  if (state.activeProjectDeadlines) delete state.activeProjectDeadlines[projectId];
}

// ============================================================================
// Normalization
// ============================================================================

function normalizeProjectProgress(raw) {
  const result = {};
  for (const project of content.projects || []) {
    const progress = raw && raw[project.id];
    if (!progress || typeof progress !== "object") continue;
    const workedSeconds = Math.max(0, Number(progress.workedSeconds) || 0);
    const hasProgress = workedSeconds > 0 ||
      Boolean(progress.resourcesPaid || progress.legacyPrepaid) ||
      Number.isFinite(Number(progress.stageIndex)) ||
      Number.isFinite(Number(progress.stageWorkedSeconds));
    if (hasProgress) {
      const next = createProjectProgressFromWorkedSeconds(project, progress, workedSeconds);
      if (Number.isFinite(Number(progress.stageIndex))) {
        const stages = getProjectStages(project);
        next.stageIndex = clamp(Math.floor(Number(progress.stageIndex) || 0), 0, Math.max(0, stages.length - 1));
        next.stageWorkedSeconds = Math.max(0, Math.min(getStageRequiredSeconds(stages[next.stageIndex]), Number(progress.stageWorkedSeconds) || 0));
      }
      result[project.id] = next;
    }
  }
  return result;
}

function normalizeProjectDeadlines(raw) {
  const result = {};
  for (const project of content.projects || []) {
    const deadline = raw && raw[project.id];
    const dueWorldMinute = Number(deadline && deadline.dueWorldMinute);
    const failed = Boolean(deadline && deadline.failed);
    if (Number.isFinite(dueWorldMinute) || failed) {
      result[project.id] = {
        dueWorldMinute: Number.isFinite(dueWorldMinute) ? Math.max(0, Math.floor(dueWorldMinute)) : null,
        failed,
        warned: Boolean(deadline && deadline.warned)
      };
    }
  }
  return result;
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  projectById,
  milestoneProjects,
  commissionProjects,
  getProjectStages,
  getStageRequiredSeconds,
  getProjectTotalStageSeconds,
  getProjectRequiredSeconds,
  createProjectProgressFromWorkedSeconds,
  getProjectProgress,
  snapshotProjectProgress,
  ensureProjectProgress,
  clearProjectProgress,
  normalizeProjectProgress,
  normalizeProjectDeadlines
};
