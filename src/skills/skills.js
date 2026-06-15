const content = require("../content");
const { clamp, formatNumber } = require("../core/math");

// Skill constants
const SKILL_LEVEL_NAMES = ["未学", "入门", "熟练", "精通", "专家", "大师"];
const SKILL_EXP_THRESHOLDS = { 1: 120, 2: 320, 3: 700, 4: 1250 };
const SKILL_UPGRADE_MIN_KNOWLEDGE = { 2: 120, 3: 280, 4: 520, 5: 900 };
const SKILL_UPGRADE_KNOWLEDGE_MULTIPLIERS = { 2: 2, 3: 4, 4: 7, 5: 11 };
const SKILL_UPGRADE_RESOURCE_MULTIPLIERS = { 2: 1, 3: 2, 4: 4, 5: 7 };

// ============================================================================
// Skill Progress
// ============================================================================

function itemById(items, id) {
  return items.find((item) => item.id === id);
}

function getSkillProgress(state, id) {
  const progress = state.skillProgress[id] || {};
  const legacyUnlocked = Array.isArray(state.unlockedSkills) && state.unlockedSkills.includes(id);
  const level = clamp(Math.floor(Number(progress.level) || (legacyUnlocked ? 1 : 0)), 0, 5);
  return {
    level,
    levelName: SKILL_LEVEL_NAMES[level],
    exp: Math.max(0, Number(progress.exp) || 0),
    next: level > 0 && level < 5 ? SKILL_EXP_THRESHOLDS[level] : 0
  };
}

function getSkillLevel(state, id) {
  return getSkillProgress(state, id).level;
}

function ensureSkillProgress(state, id) {
  state.skillProgress[id] = state.skillProgress[id] || { level: 0, exp: 0 };
  state.skillProgress[id].level = clamp(Math.floor(Number(state.skillProgress[id].level) || 0), 0, 5);
  state.skillProgress[id].exp = Math.max(0, Number(state.skillProgress[id].exp) || 0);
  return state.skillProgress[id];
}

function syncUnlockedSkills(state) {
  state.unlockedSkills = content.skills
    .filter((skill) => getSkillLevel(state, skill.id) > 0)
    .map((skill) => skill.id);
}

function addSkillExp(state, rewards = {}, multiplier = 1) {
  const gained = {};
  for (const [id, amount] of Object.entries(rewards || {})) {
    if (!itemById(content.skills, id) || amount <= 0) continue;
    const progress = ensureSkillProgress(state, id);
    const delta = amount * multiplier;
    progress.exp += delta;
    gained[id] = (gained[id] || 0) + delta;
  }
  return gained;
}

function scaleSkillExpRewards(rewards = {}, multiplier = 1) {
  return Object.fromEntries(Object.entries(rewards || {}).map(([id, amount]) => [id, amount * multiplier]));
}

// ============================================================================
// Skill Learning Progress
// ============================================================================

function ensureSkillLearningProgress(state, skillId) {
  state.skillLearningProgress[skillId] = state.skillLearningProgress[skillId] || { workedSeconds: 0, resourcesPaid: false };
  state.skillLearningProgress[skillId].workedSeconds = Math.max(0, Number(state.skillLearningProgress[skillId].workedSeconds) || 0);
  state.skillLearningProgress[skillId].resourcesPaid = Boolean(state.skillLearningProgress[skillId].resourcesPaid);
  return state.skillLearningProgress[skillId];
}

function getSkillLearningProgress(state, skillOrId, attributeBonus) {
  const skill = typeof skillOrId === "string" ? itemById(content.skills, skillOrId) : skillOrId;
  const id = skill && skill.id;
  const progress = id && state.skillLearningProgress[id] ? state.skillLearningProgress[id] : {};
  const workedSeconds = Math.max(0, Number(progress.workedSeconds) || 0);
  const learningRelief = attributeBonus ? attributeBonus(state, "learning", 0.0025, 0.2) : 0;
  const requiredSeconds = Math.max(1, Math.round((Number(skill && skill.learningSeconds) || 600) * (1 - learningRelief)));
  return {
    workedSeconds,
    requiredSeconds,
    remainingSeconds: Math.max(0, requiredSeconds - workedSeconds),
    progressPercent: requiredSeconds > 0 ? Math.min(100, Math.floor(workedSeconds / requiredSeconds * 100)) : 100,
    resourcesPaid: Boolean(progress.resourcesPaid)
  };
}

function clearSkillLearningProgress(state, skillId) {
  delete state.skillLearningProgress[skillId];
  if (state.activeSkillLearningId === skillId) state.activeSkillLearningId = null;
}

function clearCompletedSkillLearning(state) {
  const skillId = state.activeSkillLearningId;
  if (!skillId) return false;
  const skill = itemById(content.skills, skillId);
  if (!skill) {
    state.activeSkillLearningId = null;
    return true;
  }
  if (getSkillLevel(state, skillId) <= 0) return false;
  clearSkillLearningProgress(state, skillId);
  return true;
}

// ============================================================================
// Skill Upgrade
// ============================================================================

function getSkillUpgradeCost(skill, targetLevel) {
  const knowledge = Math.max(
    SKILL_UPGRADE_MIN_KNOWLEDGE[targetLevel] || 0,
    Math.ceil((skill.cost.knowledge || 0) * (SKILL_UPGRADE_KNOWLEDGE_MULTIPLIERS[targetLevel] || 1))
  );
  const resources = { knowledge };
  const multiplier = SKILL_UPGRADE_RESOURCE_MULTIPLIERS[targetLevel] || 1;
  for (const [key, value] of Object.entries(skill.upgradeResourceBase || {})) {
    resources[key] = Math.ceil(value * multiplier);
  }
  return resources;
}

function getSkillUpgradeAttributeRequirements(skill, targetLevel) {
  const extra = 6 * (targetLevel - 1);
  return Object.fromEntries(Object.entries(skill.attributeRequirements || {}).map(([attr, value]) => [attr, value + extra]));
}

// ============================================================================
// Normalization
// ============================================================================

function getNormalizedSkillLevel(skillProgress, id) {
  return clamp(Math.floor(Number(skillProgress && skillProgress[id] && skillProgress[id].level) || 0), 0, 5);
}

function normalizeSkillProgress(raw, unlockedSkills = []) {
  const result = {};
  const unlocked = new Set(Array.isArray(unlockedSkills) ? unlockedSkills : []);
  for (const skill of content.skills || []) {
    const progress = raw && raw[skill.id];
    const migratedLevel = unlocked.has(skill.id) ? 1 : 0;
    const level = clamp(Math.floor(Number(progress && progress.level) || migratedLevel), 0, 5);
    const exp = Math.max(0, Number(progress && progress.exp) || 0);
    if (level > 0 || exp > 0) result[skill.id] = { level, exp };
  }
  return result;
}

function normalizeUnlockedSkills(rawUnlockedSkills, skillProgress) {
  const legacy = new Set(Array.isArray(rawUnlockedSkills) ? rawUnlockedSkills : []);
  for (const [id, progress] of Object.entries(skillProgress || {})) {
    if ((progress.level || 0) > 0) legacy.add(id);
  }
  return [...legacy].filter((id) => itemById(content.skills, id) && getNormalizedSkillLevel(skillProgress, id) > 0);
}

function normalizeSkillLearningProgress(raw) {
  const result = {};
  for (const skill of content.skills || []) {
    const progress = raw && raw[skill.id];
    if (!progress || typeof progress !== "object") continue;
    const workedSeconds = Math.max(0, Number(progress.workedSeconds) || 0);
    const resourcesPaid = Boolean(progress.resourcesPaid);
    if (workedSeconds > 0 || resourcesPaid) result[skill.id] = { workedSeconds, resourcesPaid };
  }
  return result;
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  SKILL_LEVEL_NAMES,
  SKILL_EXP_THRESHOLDS,
  getSkillProgress,
  getSkillLevel,
  ensureSkillProgress,
  syncUnlockedSkills,
  addSkillExp,
  scaleSkillExpRewards,
  ensureSkillLearningProgress,
  getSkillLearningProgress,
  clearSkillLearningProgress,
  clearCompletedSkillLearning,
  getSkillUpgradeCost,
  getSkillUpgradeAttributeRequirements,
  getNormalizedSkillLevel,
  normalizeSkillProgress,
  normalizeUnlockedSkills,
  normalizeSkillLearningProgress
};
