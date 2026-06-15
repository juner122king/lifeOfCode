const content = require("../content");
const { clamp } = require("../core/math");

// ============================================================================
// Activity Lookup
// ============================================================================

function activityById(id) {
  return content.activities.find((activity) => activity.id === id);
}

function createActivityMap(valueFactory) {
  return Object.fromEntries(content.activities.map((activity) => [activity.id, valueFactory(activity)]));
}

// ============================================================================
// Activity Level and Experience
// ============================================================================

function getActivityLevel(state, id) {
  return Math.max(1, Math.floor(Number(state.activityLevels[id]) || 1));
}

function activityLevelCost(level) {
  return 120 + level * 80;
}

function addActivityExp(state, id, amount) {
  if (!activityById(id) || amount <= 0) return 0;
  let gained = 0;
  state.activityExp[id] = (state.activityExp[id] || 0) + amount;
  while (state.activityExp[id] >= activityLevelCost(getActivityLevel(state, id))) {
    state.activityExp[id] -= activityLevelCost(getActivityLevel(state, id));
    state.activityLevels[id] = getActivityLevel(state, id) + 1;
    gained += 1;
  }
  return gained;
}

function applyActivityExpDelta(state, id, amount) {
  if (!activityById(id) || !amount) return { applied: 0, levelUps: 0 };
  const before = Math.floor(Number(state.activityExp[id]) || 0);
  if (amount > 0) {
    const gained = Math.floor(Number(amount) || 0);
    const levelUps = addActivityExp(state, id, amount);
    return {
      applied: gained,
      levelUps
    };
  }
  state.activityExp[id] = Math.max(0, before + Math.floor(Number(amount) || 0));
  return { applied: state.activityExp[id] - before, levelUps: 0 };
}

function getActivityProgress(state, id) {
  const level = getActivityLevel(state, id);
  return {
    level,
    exp: state.activityExp[id] || 0,
    next: activityLevelCost(level)
  };
}

// ============================================================================
// Activity Requirements
// ============================================================================

function activityUnlocked(state, activity, requirementsMet) {
  return requirementsMet(state, activity.requirements || {});
}

// ============================================================================
// Activity State Management
// ============================================================================

function startActivity(state, id) {
  const activity = activityById(id);
  if (!activity) return `没有这个活动：${id}`;

  state.activeActivityId = id;
  state.activeProjectId = null;
  state.activeSkillLearningId = null;

  return `开始活动：${activity.name}。`;
}

function stopActivity(state) {
  if (!state.activeActivityId) return "当前没有活动。";

  const activity = activityById(state.activeActivityId);
  state.activeActivityId = null;

  return activity ? `停止活动：${activity.name}。` : "已停止活动。";
}

// ============================================================================
// Normalization
// ============================================================================

function normalizeActivityMap(raw, fallback) {
  const result = {};
  for (const activity of content.activities) {
    const value = Number(raw && raw[activity.id]);
    result[activity.id] = Number.isFinite(value) ? Math.max(0, value) : fallback;
  }
  return result;
}

function normalizeActivityStats(raw) {
  return {
    totalActiveSeconds: Math.max(0, Number(raw && raw.totalActiveSeconds) || 0),
    byActivity: normalizeActivityMap(raw && raw.byActivity, 0)
  };
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  activityById,
  createActivityMap,
  getActivityLevel,
  activityLevelCost,
  addActivityExp,
  applyActivityExpDelta,
  getActivityProgress,
  activityUnlocked,
  startActivity,
  stopActivity,
  normalizeActivityMap,
  normalizeActivityStats
};
