const content = require("../content");
const { RESOURCE_NAMES } = require("../core/constants");

// ============================================================================
// Goal Lookup
// ============================================================================

function goalById(id) {
  return (content.goals || []).find((goal) => goal.id === id);
}

// ============================================================================
// Goal Status
// ============================================================================

function isGoalClaimed(state, goal) {
  return state.claimedGoals.includes(goal.id);
}

function areGoalPrerequisitesMet(state, goal) {
  return (goal.requiresGoals || []).every((id) => state.claimedGoals.includes(id));
}

function getGoalRequirementChecks(state, goal, getters) {
  const req = goal.requirements || {};
  const checks = [];
  const { activityById, getActivityLevel, roleById, roleMeets } = getters;

  for (const [key, target] of Object.entries(req.stats || {})) {
    const labels = { totalCodeLines: "累计代码", totalBugsFixed: "累计修复 Bug", totalProjects: "累计项目" };
    checks.push({ label: labels[key] || key, current: state.stats[key] || 0, target, met: (state.stats[key] || 0) >= target });
  }
  for (const [key, target] of Object.entries(req.activityStats || {})) {
    const current = key === "totalActiveSeconds" ? state.activityStats.totalActiveSeconds : state.activityStats.byActivity[key] || 0;
    checks.push({ label: key === "totalActiveSeconds" ? "累计活动秒数" : `${activityById(key)?.name || key} 秒数`, current, target, met: current >= target });
  }
  for (const [id, level] of Object.entries(req.activityLevels || {})) {
    checks.push({ label: `${activityById(id)?.name || id} 等级`, current: getActivityLevel(state, id), target: level, met: getActivityLevel(state, id) >= level });
  }
  for (const [key, target] of Object.entries(req.resources || {})) {
    checks.push({ label: RESOURCE_NAMES[key] || key, current: state.resources[key] || 0, target, met: (state.resources[key] || 0) >= target });
  }
  if (Array.isArray(req.skills) && req.skills.length) {
    const current = req.skills.filter((id) => state.unlockedSkills.includes(id)).length;
    checks.push({ label: `技能 ${req.skills.join(", ")}`, current, target: req.skills.length, met: current >= req.skills.length });
  }
  if (Array.isArray(req.completedProjects) && req.completedProjects.length) {
    const current = req.completedProjects.filter((id) => state.completedProjects.includes(id)).length;
    checks.push({ label: `项目 ${req.completedProjects.join(", ")}`, current, target: req.completedProjects.length, met: current >= req.completedProjects.length });
  }
  if (Number.isFinite(req.ownedToolCount)) {
    checks.push({ label: "拥有工具", current: state.ownedTools.length, target: req.ownedToolCount, met: state.ownedTools.length >= req.ownedToolCount });
  }
  if (req.currentRole) {
    const role = roleById(req.currentRole);
    checks.push({ label: `职位 ${role ? role.name : req.currentRole}`, current: roleById(state.currentRole)?.name || state.currentRole, target: role ? role.name : req.currentRole, met: roleMeets(state.currentRole, req.currentRole), textOnly: true });
  }

  return checks;
}

function isGoalCompleted(state, goal, getters) {
  return getGoalRequirementChecks(state, goal, getters).every((check) => check.met);
}

function getGoalStatus(state, goal, getters) {
  if (isGoalClaimed(state, goal)) return "已领取";
  if (!areGoalPrerequisitesMet(state, goal)) return "未解锁";
  if (isGoalCompleted(state, goal, getters)) return "可领取";
  return "进行中";
}

function getClaimableGoals(state, getters) {
  return (content.goals || []).filter((goal) => getGoalStatus(state, goal, getters) === "可领取");
}

function getCurrentMainGoal(state) {
  const mainGoals = (content.goals || []).filter((goal) => goal.type === "main");
  return mainGoals.find((goal) => !isGoalClaimed(state, goal) && areGoalPrerequisitesMet(state, goal))
    || mainGoals.find((goal) => !isGoalClaimed(state, goal))
    || null;
}

// ============================================================================
// Goal Rewards
// ============================================================================

function mergeRewards(target, rewards = {}) {
  target.money = (target.money || 0) + (rewards.money || 0);
  target.reputation = (target.reputation || 0) + (rewards.reputation || 0);
  target.attributeExp = target.attributeExp || {};
  for (const [attr, amount] of Object.entries(rewards.attributeExp || {})) {
    target.attributeExp[attr] = (target.attributeExp[attr] || 0) + amount;
  }
}

function applyGoalRewards(state, rewards = {}, applyAttributeExpRewards) {
  state.resources.money += rewards.money || 0;
  state.resources.reputation += rewards.reputation || 0;
  if (applyAttributeExpRewards) {
    applyAttributeExpRewards(state, rewards.attributeExp);
  }
}

function claimSingleGoal(state, goal, applyAttributeExpRewards) {
  applyGoalRewards(state, goal.rewards, applyAttributeExpRewards);
  state.claimedGoals.push(goal.id);
}

function claimGoal(state, id, applyAttributeExpRewards) {
  const goal = goalById(id);
  if (!goal) return `没有这个目标：${id}`;
  if (isGoalClaimed(state, goal)) return `目标 ${goal.name} 已领取过奖励。`;
  if (!areGoalPrerequisitesMet(state, goal)) return `目标 ${goal.name} 前置目标未完成。`;

  // Note: isGoalCompleted check requires getters, handled by caller
  claimSingleGoal(state, goal, applyAttributeExpRewards);
  return `领取目标：${goal.name}。`;
}

function claimAllGoals(state, getters, applyAttributeExpRewards) {
  const claimable = getClaimableGoals(state, getters);
  if (!claimable.length) return "没有可领取的目标。";

  const accumulated = { money: 0, reputation: 0, attributeExp: {} };
  for (const goal of claimable) {
    mergeRewards(accumulated, goal.rewards);
    state.claimedGoals.push(goal.id);
  }

  applyGoalRewards(state, accumulated, applyAttributeExpRewards);
  return `领取了 ${claimable.length} 个目标。`;
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  goalById,
  isGoalClaimed,
  areGoalPrerequisitesMet,
  getGoalRequirementChecks,
  isGoalCompleted,
  getGoalStatus,
  getClaimableGoals,
  getCurrentMainGoal,
  mergeRewards,
  applyGoalRewards,
  claimSingleGoal,
  claimGoal,
  claimAllGoals
};
