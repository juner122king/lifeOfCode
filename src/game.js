const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const content = require("./content");

const SAVE_PATH = path.join(process.cwd(), ".save", "code-life.json");
const OFFLINE_CAP_SECONDS = 8 * 60 * 60;
const ATTRIBUTE_IDS = ["logic", "focus", "learning", "communication", "resilience", "creativity"];
const ATTRIBUTE_NAMES = {
  logic: "逻辑",
  focus: "专注",
  learning: "学习",
  communication: "沟通",
  resilience: "抗压",
  creativity: "创造"
};
const DEFAULT_ATTRIBUTES = {
  logic: 22,
  focus: 24,
  learning: 28,
  communication: 18,
  resilience: 20,
  creativity: 16
};
const RESOURCE_NAMES = {
  codeLines: "代码",
  exp: "经验",
  money: "金钱",
  energy: "精力",
  bugs: "Bug",
  techDebt: "技术债",
  pressure: "压力",
  reputation: "声望",
  knowledge: "知识",
  tests: "测试",
  docs: "文档",
  architecture: "架构",
  leads: "线索"
};
const RESOURCE_ORDER = ["codeLines", "exp", "money", "knowledge", "tests", "docs", "architecture", "leads", "energy", "pressure", "bugs", "techDebt", "reputation"];

function roleById(id) {
  return content.roles.find((role) => role.id === id);
}

function activityById(id) {
  return content.activities.find((activity) => activity.id === id);
}

function itemById(items, id) {
  return items.find((item) => item.id === id);
}

function goalById(id) {
  return itemById(content.goals || [], id);
}

function roleRank(id) {
  return content.roles.findIndex((role) => role.id === id);
}

function createActivityMap(valueFactory) {
  return Object.fromEntries(content.activities.map((activity) => [activity.id, valueFactory(activity)]));
}

function createNewState(now = Date.now()) {
  const role = content.roles[0];
  return {
    resources: {
      codeLines: 0,
      exp: 0,
      money: 30,
      energy: role.maxEnergy,
      bugs: 0,
      techDebt: 0,
      pressure: 0,
      reputation: 0,
      knowledge: 0,
      tests: 0,
      docs: 0,
      architecture: 0,
      leads: 0
    },
    activeActivityId: null,
    activityLevels: createActivityMap(() => 1),
    activityExp: createActivityMap(() => 0),
    activityStats: {
      totalActiveSeconds: 0,
      byActivity: createActivityMap(() => 0)
    },
    unlockedSkills: [],
    ownedTools: [],
    completedProjects: [],
    claimedGoals: [],
    attributes: { ...DEFAULT_ATTRIBUTES },
    attributeBreakthroughs: Object.fromEntries(ATTRIBUTE_IDS.map((id) => [id, 0])),
    attributeExp: Object.fromEntries(ATTRIBUTE_IDS.map((id) => [id, 0])),
    currentRole: role.id,
    lastTick: now,
    stats: {
      totalCodeLines: 0,
      totalBugsFixed: 0,
      totalProjects: 0
    }
  };
}

function normalizeState(raw, now = Date.now()) {
  const fresh = createNewState(now);
  const normalized = {
    ...fresh,
    ...raw,
    resources: { ...fresh.resources, ...(raw && raw.resources) },
    activeActivityId: activityById(raw && raw.activeActivityId) ? raw.activeActivityId : null,
    activityLevels: normalizeActivityMap(raw && raw.activityLevels, 1),
    activityExp: normalizeActivityMap(raw && raw.activityExp, 0),
    activityStats: normalizeActivityStats(raw && raw.activityStats),
    unlockedSkills: Array.isArray(raw && raw.unlockedSkills) ? raw.unlockedSkills : [],
    ownedTools: Array.isArray(raw && raw.ownedTools) ? raw.ownedTools : [],
    completedProjects: Array.isArray(raw && raw.completedProjects) ? raw.completedProjects : [],
    claimedGoals: Array.isArray(raw && raw.claimedGoals) ? raw.claimedGoals : [],
    attributes: normalizeAttributes(raw && raw.attributes, DEFAULT_ATTRIBUTES, 1, 100),
    attributeBreakthroughs: normalizeAttributes(raw && raw.attributeBreakthroughs, {}, 0, Number.POSITIVE_INFINITY),
    attributeExp: normalizeAttributes(raw && raw.attributeExp, {}, 0, Number.POSITIVE_INFINITY),
    currentRole: raw && raw.currentRole ? raw.currentRole : fresh.currentRole,
    lastTick: Number.isFinite(raw && raw.lastTick) ? raw.lastTick : now,
    stats: { ...fresh.stats, ...(raw && raw.stats) }
  };
  clampState(normalized);
  return normalized;
}

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

function normalizeAttributes(raw, defaults, min, max) {
  const result = {};
  for (const id of ATTRIBUTE_IDS) {
    const value = raw && Number(raw[id]);
    const fallback = defaults[id] ?? 0;
    result[id] = clamp(Number.isFinite(value) ? value : fallback, min, max);
  }
  return result;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clampState(state) {
  for (const key of ["bugs", "techDebt", "pressure", "reputation", "knowledge", "tests", "docs", "architecture", "leads", "codeLines", "exp", "money"]) {
    state.resources[key] = Math.max(0, Number(state.resources[key]) || 0);
  }
  state.resources.pressure = clamp(state.resources.pressure, 0, 100);
  const role = roleById(state.currentRole) || content.roles[0];
  state.resources.energy = clamp(Number(state.resources.energy) || 0, 0, role.maxEnergy);
}

function getBaseAttribute(state, attr) {
  if (!ATTRIBUTE_IDS.includes(attr)) return 1;
  return clamp(Number(state.attributes && state.attributes[attr]) || DEFAULT_ATTRIBUTES[attr], 1, 100);
}

function getBreakthrough(state, attr) {
  if (!ATTRIBUTE_IDS.includes(attr)) return 0;
  return Math.max(0, Number(state.attributeBreakthroughs && state.attributeBreakthroughs[attr]) || 0);
}

function getEffectiveAttribute(state, attr) {
  return getBaseAttribute(state, attr) + getBreakthrough(state, attr) * 0.2;
}

function addAttributeExp(state, attr, amount) {
  if (!ATTRIBUTE_IDS.includes(attr) || amount <= 0) return 0;
  let gained = 0;
  state.attributeExp[attr] = Math.max(0, Number(state.attributeExp[attr]) || 0) + amount;

  while (getBaseAttribute(state, attr) < 100) {
    const current = getBaseAttribute(state, attr);
    const cost = 50 + current * 5;
    if (state.attributeExp[attr] < cost) break;
    state.attributeExp[attr] -= cost;
    state.attributes[attr] = current + 1;
    gained += 1;
  }

  return gained;
}

function applyAttributeExpRewards(state, rewards = {}) {
  for (const [attr, amount] of Object.entries(rewards || {})) {
    addAttributeExp(state, attr, amount);
  }
}

function attributeBonus(state, attr, perPoint, maxBonus) {
  const aboveBaseline = Math.max(0, getEffectiveAttribute(state, attr) - 20);
  return Math.min(maxBonus, aboveBaseline * perPoint);
}

function getActivityLevel(state, id) {
  return Math.max(1, Math.floor(Number(state.activityLevels[id]) || 1));
}

function activityLevelCost(level) {
  return 60 + level * 40;
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

function getActivityProgress(state, id) {
  const level = getActivityLevel(state, id);
  return {
    level,
    exp: state.activityExp[id] || 0,
    next: activityLevelCost(level)
  };
}

function getMultipliers(state) {
  const multipliers = { code: 1, exp: 1, money: 1, bug: 1, debt: 1, pressure: 1 };
  const apply = (item) => {
    for (const [key, value] of Object.entries(item.multipliers || {})) {
      multipliers[key] *= value;
    }
  };

  state.unlockedSkills.map((id) => itemById(content.skills, id)).filter(Boolean).forEach(apply);
  state.ownedTools.map((id) => itemById(content.tools, id)).filter(Boolean).forEach(apply);
  return multipliers;
}

function getProductionRisk(state) {
  const pressureRelief = attributeBonus(state, "resilience", 0.003, 0.2);
  const pressurePenalty = clamp((state.resources.pressure || 0) / 100 * 0.35 * (1 - pressureRelief), 0, 0.35);
  const debtPenalty = clamp((state.resources.techDebt || 0) / 240 * 0.25, 0, 0.25);
  const logicBugRelief = attributeBonus(state, "logic", 0.003, 0.22);
  const bugDebtBoost = 1 + clamp((state.resources.techDebt || 0) / 240 * 0.5 * (1 - logicBugRelief), 0, 0.5);
  return {
    codeEfficiency: (1 - pressurePenalty) * (1 - debtPenalty),
    bugDebtBoost,
    pressurePenalty,
    debtPenalty
  };
}

function roleMeets(currentRole, requiredRole) {
  const currentRank = roleRank(currentRole);
  const requiredRank = roleRank(requiredRole);
  return currentRank >= 0 && requiredRank >= 0 && currentRank >= requiredRank;
}

function resourcesMeet(resources, required = {}) {
  return Object.entries(required).every(([key, value]) => (resources[key] || 0) >= value);
}

function activityLevelsMeet(state, required = {}) {
  return Object.entries(required).every(([id, level]) => getActivityLevel(state, id) >= level);
}

function requirementsMet(state, requirements = {}) {
  if (!resourcesMeet(state.resources, requirements.resources)) return false;
  if (!activityLevelsMeet(state, requirements.activityLevels)) return false;
  if (requirements.skills && !requirements.skills.every((id) => state.unlockedSkills.includes(id))) return false;
  if (requirements.ownedTools && !requirements.ownedTools.every((id) => state.ownedTools.includes(id))) return false;
  if (Number.isFinite(requirements.ownedToolCount) && state.ownedTools.length < requirements.ownedToolCount) return false;
  if (requirements.completedProjects && !requirements.completedProjects.every((id) => state.completedProjects.includes(id))) return false;
  if (Number.isFinite(requirements.completedProjectCount) && state.completedProjects.length < requirements.completedProjectCount) return false;
  if (requirements.currentRole && !roleMeets(state.currentRole, requirements.currentRole)) return false;
  for (const [key, value] of Object.entries(requirements.stats || {})) {
    if ((state.stats[key] || 0) < value) return false;
  }
  for (const [key, value] of Object.entries(requirements.activityStats || {})) {
    if (key === "totalActiveSeconds" && (state.activityStats.totalActiveSeconds || 0) < value) return false;
    if (key !== "totalActiveSeconds" && (state.activityStats.byActivity[key] || 0) < value) return false;
  }
  return true;
}

function activityUnlocked(state, activity) {
  return requirementsMet(state, activity.requirements || {});
}

function formatNumber(value) {
  return Math.floor(value).toString();
}

function formatLines(lines) {
  return lines.filter((line) => line && line.trim()).join("\n");
}

function formatResourceList(values = {}) {
  const entries = Object.entries(values)
    .filter(([, value]) => value)
    .map(([key, value]) => `${RESOURCE_NAMES[key] || key} ${value > 0 ? "+" : ""}${formatNumber(value)}`);
  return entries.length ? entries.join("，") : "无";
}

function snapshotResources(resources) {
  return Object.fromEntries(RESOURCE_ORDER.map((key) => [key, Math.floor(Number(resources[key]) || 0)]));
}

function formatChangedResources(beforeResources, afterResources) {
  const entries = RESOURCE_ORDER
    .map((key) => {
      const before = Math.floor(Number(beforeResources[key]) || 0);
      const after = Math.floor(Number(afterResources[key]) || 0);
      const change = after - before;
      if (change === 0) return "";
      return `${RESOURCE_NAMES[key] || key} ${change > 0 ? "+" : ""}${change}（${after}）`;
    })
    .filter(Boolean);
  return entries.join("，");
}

function formatAttribute(state, attr) {
  const base = formatNumber(getBaseAttribute(state, attr));
  const breakthrough = getBreakthrough(state, attr);
  return breakthrough > 0 ? `${ATTRIBUTE_NAMES[attr]} ${base}(+${formatNumber(breakthrough)})` : `${ATTRIBUTE_NAMES[attr]} ${base}`;
}

function formatAttributes(state) {
  return ATTRIBUTE_IDS.map((attr) => formatAttribute(state, attr)).join("  ");
}

function formatAttributeExpRewards(rewards = {}) {
  const entries = Object.entries(rewards || {})
    .filter(([, amount]) => amount > 0)
    .map(([attr, amount]) => `${ATTRIBUTE_NAMES[attr] || attr} +${formatNumber(amount)}`);
  return entries.length ? `属性经验：${entries.join("，")}` : "";
}

function formatActivityRequirements(requirements = {}) {
  const parts = [];
  for (const [id, level] of Object.entries(requirements.activityLevels || {})) {
    const activity = activityById(id);
    parts.push(`${activity ? activity.name : id} Lv.${level}`);
  }
  for (const skill of requirements.skills || []) parts.push(`技能 ${skill}`);
  if (requirements.currentRole) {
    const role = roleById(requirements.currentRole);
    parts.push(`职位 ${role ? role.name : requirements.currentRole}`);
  }
  return parts.length ? parts.join("，") : "无";
}

function formatActivities(state) {
  return formatLines([
    "活动：",
    ...content.activities.map((activity) => {
      const progress = getActivityProgress(state, activity.id);
      const status = state.activeActivityId === activity.id
        ? "进行中"
        : activityUnlocked(state, activity) ? "可开始" : "未解锁";
      return `${activity.id} - ${activity.name} [${status}] Lv.${progress.level} ${formatNumber(progress.exp)}/${formatNumber(progress.next)}，解锁：${formatActivityRequirements(activity.requirements)}。${activity.description}`;
    })
  ]);
}

function applyResourceDelta(state, key, rawDelta) {
  if (!rawDelta) return 0;
  const before = state.resources[key] || 0;
  if (key === "energy") {
    const role = roleById(state.currentRole) || content.roles[0];
    state.resources.energy = clamp(before + rawDelta, 0, role.maxEnergy);
  } else if (key === "pressure") {
    state.resources.pressure = clamp(before + rawDelta, 0, 100);
  } else {
    state.resources[key] = Math.max(0, before + rawDelta);
  }
  return state.resources[key] - before;
}

function settleActivity(state, activity, seconds) {
  const level = getActivityLevel(state, activity.id);
  const activityMultiplier = 1 + (level - 1) * 0.08;
  const attributeMultiplier = 1 + attributeBonus(state, activity.primaryAttribute, 0.0025, 0.22);
  const multipliers = getMultipliers(state);
  const risk = getProductionRisk(state);
  const lowEnergy = activity.id !== "rest" && state.resources.energy <= 0;
  const energyFactor = lowEnergy ? 0.35 : 1;
  const positiveFactor = activityMultiplier * attributeMultiplier * energyFactor;
  const deltas = {};

  if (activity.energyCostPerSecond > 0) {
    deltas.energy = applyResourceDelta(state, "energy", -activity.energyCostPerSecond * seconds);
  }

  for (const [key, value] of Object.entries(activity.effectsPerSecond || {})) {
    let delta = value * seconds;
    if (delta > 0) delta *= positiveFactor;
    if (key === "codeLines" && delta > 0) delta *= multipliers.code * risk.codeEfficiency;
    if (key === "exp" && delta > 0) delta *= multipliers.exp;
    if (key === "money" && delta > 0) delta *= multipliers.money;
    if (key === "bugs" && delta < 0) delta *= 1 + attributeBonus(state, "logic", 0.004, 0.32);
    if (key === "techDebt" && delta < 0) delta *= 1 + attributeBonus(state, "logic", 0.003, 0.24);
    if (key === "pressure" && delta < 0) delta *= 1 + attributeBonus(state, "resilience", 0.004, 0.32);
    const applied = applyResourceDelta(state, key, delta);
    deltas[key] = (deltas[key] || 0) + applied;
  }

  for (const [key, value] of Object.entries(activity.risksPerSecond || {})) {
    let delta = value * seconds;
    if (key === "bugs") delta *= multipliers.bug * risk.bugDebtBoost;
    if (key === "techDebt") delta *= multipliers.debt;
    if (key === "pressure") delta *= multipliers.pressure;
    if (lowEnergy && key === "pressure") delta *= 1.8;
    const applied = applyResourceDelta(state, key, delta);
    deltas[key] = (deltas[key] || 0) + applied;
  }

  if (lowEnergy) {
    deltas.pressure = (deltas.pressure || 0) + applyResourceDelta(state, "pressure", seconds * 0.006);
  }

  state.stats.totalCodeLines += Math.max(0, deltas.codeLines || 0);
  state.stats.totalBugsFixed += Math.max(0, -(deltas.bugs || 0));
  state.activityStats.totalActiveSeconds += seconds;
  state.activityStats.byActivity[activity.id] = (state.activityStats.byActivity[activity.id] || 0) + seconds;

  const levelUps = addActivityExp(state, activity.id, activity.activityExpPerSecond * seconds * attributeMultiplier);
  for (const [attr, amount] of Object.entries(activity.attributeExpPerMinute || {})) {
    addAttributeExp(state, attr, amount * seconds / 60);
  }

  return { deltas, levelUps, lowEnergy };
}

function settleTime(state, now = Date.now(), options = {}) {
  const maxSeconds = options.maxSeconds ?? OFFLINE_CAP_SECONDS;
  const elapsedSeconds = Math.max(0, Math.floor((now - state.lastTick) / 1000));
  const seconds = Math.min(elapsedSeconds, maxSeconds);
  const messages = [];

  if (seconds <= 0) {
    state.lastTick = now;
    return { seconds: 0, messages };
  }

  const activity = activityById(state.activeActivityId);
  if (!activity) {
    state.lastTick = now;
    return { seconds, messages };
  }

  const beforeResources = snapshotResources(state.resources);
  const result = settleActivity(state, activity, seconds);
  const changedResources = formatChangedResources(beforeResources, state.resources);
  if (changedResources) {
    messages.push(`${activity.name} ${seconds} 秒：${changedResources}。`);
  }
  if (result.levelUps > 0) {
    messages.push(`${activity.name}提升到 Lv.${getActivityLevel(state, activity.id)}。`);
  }
  if (result.lowEnergy) {
    messages.push("精力耗尽，当前活动收益下降，压力额外上升。");
  }

  if (options.randomEvents && seconds > 0) {
    const eventChance = Math.min(0.35, seconds / 3600 * 0.12);
    const rng = options.rng || Math.random;
    if (rng() < eventChance) {
      const event = content.randomEvents[Math.floor(rng() * content.randomEvents.length)];
      event.apply(state);
      applyAttributeExpRewards(state, event.attributeExp);
      clampState(state);
      messages.push(`随机事件：${event.name}。${event.message}`);
    }
  }

  state.lastTick = now;
  clampState(state);
  return { seconds, messages };
}

function startActivity(state, id) {
  const activity = activityById(id);
  if (!activity) return `没有这个活动：${id}`;
  if (!activityUnlocked(state, activity)) {
    return formatLines([
      `${activity.name} 还未解锁。`,
      `需要：${formatActivityRequirements(activity.requirements)}`
    ]);
  }
  if (state.activeActivityId === id) return `${activity.name} 已经在进行中。`;
  state.activeActivityId = id;
  return formatLines([
    `开始活动：${activity.name}。`,
    `主要产出：${formatResourceList(activity.effectsPerSecond || {})}`,
    formatNextAdvice(state)
  ]);
}

function stopActivity(state) {
  if (!state.activeActivityId) return "当前没有正在进行的活动。";
  const activity = activityById(state.activeActivityId);
  state.activeActivityId = null;
  return `停止活动：${activity ? activity.name : "未知活动"}。`;
}

function formatGoalRewards(rewards = {}) {
  const entries = [];
  if (rewards.exp) entries.push(`经验 +${formatNumber(rewards.exp)}`);
  if (rewards.money) entries.push(`金钱 +${formatNumber(rewards.money)}`);
  if (rewards.reputation) entries.push(`声望 +${formatNumber(rewards.reputation)}`);
  const attributeRewards = formatAttributeExpRewards(rewards.attributeExp);
  if (attributeRewards) entries.push(attributeRewards);
  return entries.length ? entries.join("；") : "无";
}

function mergeRewards(target, rewards = {}) {
  target.exp = (target.exp || 0) + (rewards.exp || 0);
  target.money = (target.money || 0) + (rewards.money || 0);
  target.reputation = (target.reputation || 0) + (rewards.reputation || 0);
  target.attributeExp = target.attributeExp || {};
  for (const [attr, amount] of Object.entries(rewards.attributeExp || {})) {
    target.attributeExp[attr] = (target.attributeExp[attr] || 0) + amount;
  }
}

function applyGoalRewards(state, rewards = {}) {
  state.resources.exp += rewards.exp || 0;
  state.resources.money += rewards.money || 0;
  state.resources.reputation += rewards.reputation || 0;
  applyAttributeExpRewards(state, rewards.attributeExp);
}

function isGoalClaimed(state, goal) {
  return state.claimedGoals.includes(goal.id);
}

function areGoalPrerequisitesMet(state, goal) {
  return (goal.requiresGoals || []).every((id) => state.claimedGoals.includes(id));
}

function getGoalRequirementChecks(state, goal) {
  const req = goal.requirements || {};
  const checks = [];

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

function isGoalCompleted(state, goal) {
  return getGoalRequirementChecks(state, goal).every((check) => check.met);
}

function getGoalStatus(state, goal) {
  if (isGoalClaimed(state, goal)) return "已领取";
  if (!areGoalPrerequisitesMet(state, goal)) return "未解锁";
  if (isGoalCompleted(state, goal)) return "可领取";
  return "进行中";
}

function getClaimableGoals(state) {
  return (content.goals || []).filter((goal) => getGoalStatus(state, goal) === "可领取");
}

function getCurrentMainGoal(state) {
  const mainGoals = (content.goals || []).filter((goal) => goal.type === "main");
  return mainGoals.find((goal) => !isGoalClaimed(state, goal) && areGoalPrerequisitesMet(state, goal))
    || mainGoals.find((goal) => !isGoalClaimed(state, goal))
    || null;
}

function formatGoalProgress(state, goal) {
  if (!areGoalPrerequisitesMet(state, goal)) {
    const missing = (goal.requiresGoals || []).filter((id) => !state.claimedGoals.includes(id));
    return `前置目标：${missing.join(", ")}`;
  }

  const checks = getGoalRequirementChecks(state, goal);
  if (!checks.length) return "已满足";
  return checks.map((check) => {
    if (check.textOnly) return `${check.label}：${check.met ? "已满足" : `当前 ${check.current}`}`;
    return `${check.label} ${formatNumber(check.current)}/${formatNumber(check.target)}`;
  }).join("，");
}

function formatGoalSummary(state) {
  const claimable = getClaimableGoals(state);
  const current = getCurrentMainGoal(state);
  if (!current) return `目标：可领取 ${claimable.length} 个；主线已完成`;
  return `目标：可领取 ${claimable.length} 个；当前主线 [${getGoalStatus(state, current)}] ${current.name} - ${formatGoalProgress(state, current)}`;
}

function formatGoals(state) {
  return formatLines([
    "目标：",
    ...content.goals.map((goal) => formatLines([
      `[${getGoalStatus(state, goal)}] ${goal.id} - ${goal.name}（${goal.type === "main" ? "主线" : "支线"}）`,
      `  ${goal.description}`,
      `  进度：${formatGoalProgress(state, goal)}`,
      `  奖励：${formatGoalRewards(goal.rewards)}`
    ]))
  ]);
}

function claimSingleGoal(state, goal) {
  applyGoalRewards(state, goal.rewards);
  state.claimedGoals.push(goal.id);
}

function claimGoal(state, id) {
  if (id === "all") return claimAllGoals(state);
  const goal = id ? goalById(id) : getClaimableGoals(state)[0];
  if (!goal) return id ? `没有这个目标：${id}` : "没有可领取的目标。输入 goals 查看当前进度。";
  const status = getGoalStatus(state, goal);
  if (status === "已领取") return `目标 ${goal.name} 已经领取过了。`;
  if (status === "未解锁") return `目标 ${goal.name} 还未解锁。${formatGoalProgress(state, goal)}`;
  if (status !== "可领取") return formatLines([`目标 ${goal.name} 还未完成。`, `进度：${formatGoalProgress(state, goal)}`]);
  claimSingleGoal(state, goal);
  return formatLines([
    `领取目标：${goal.name}。`,
    `奖励：${formatGoalRewards(goal.rewards)}`,
    formatGoalSummary(state),
    formatNextAdvice(state)
  ]);
}

function claimAllGoals(state) {
  const claimed = [];
  const totalRewards = {};
  while (true) {
    const goal = getClaimableGoals(state)[0];
    if (!goal) break;
    claimSingleGoal(state, goal);
    claimed.push(goal);
    mergeRewards(totalRewards, goal.rewards);
  }
  if (!claimed.length) return "没有可领取的目标。输入 goals 查看当前进度。";
  return formatLines([
    `领取了 ${claimed.length} 个目标：${claimed.map((goal) => goal.name).join("、")}。`,
    `奖励合计：${formatGoalRewards(totalRewards)}`,
    formatGoalSummary(state),
    formatNextAdvice(state)
  ]);
}

function formatNextAdvice(state) {
  const claimable = getClaimableGoals(state);
  if (claimable.length) return `建议：目标 ${claimable[0].name} 已完成，先 claim ${claimable[0].id} 领取奖励。`;
  if (!state.activeActivityId) return "建议：先 start feature-coding 或 start study，选择当前要推进的活动。";
  if (state.resources.energy < 15 && state.activeActivityId !== "rest") return "建议：精力偏低，切到 start rest 恢复后再产出。";
  if ((state.resources.pressure || 0) >= 70 && state.activeActivityId !== "rest") return "建议：压力偏高，切到 start rest 降压。";
  if ((state.resources.bugs || 0) >= 25) return "建议：Bug 偏多，切到 start bug-hunting。";
  if ((state.resources.techDebt || 0) >= 50) return "建议：技术债偏高，切到 start refactoring 或 start architecture。";
  return "建议：查看 activities 选择当前最缺的资源，再用 goals 确认主线目标。";
}

function formatState(state) {
  const role = roleById(state.currentRole);
  const active = activityById(state.activeActivityId);
  return [
    `职位：${role ? role.name : state.currentRole}`,
    `当前活动：${active ? `${active.name} Lv.${getActivityLevel(state, active.id)}` : "无"}`,
    `代码：${formatNumber(state.resources.codeLines)}  经验：${formatNumber(state.resources.exp)}  金钱：${formatNumber(state.resources.money)}  知识：${formatNumber(state.resources.knowledge)}`,
    `测试：${formatNumber(state.resources.tests)}  文档：${formatNumber(state.resources.docs)}  架构：${formatNumber(state.resources.architecture)}  线索：${formatNumber(state.resources.leads)}`,
    `精力：${formatNumber(state.resources.energy)}  压力：${formatNumber(state.resources.pressure)}  Bug：${formatNumber(state.resources.bugs)}  技术债：${formatNumber(state.resources.techDebt)}  声望：${formatNumber(state.resources.reputation)}`,
    `属性：${formatAttributes(state)}`,
    `技能：${state.unlockedSkills.length ? state.unlockedSkills.join(", ") : "暂无"}`,
    `工具：${state.ownedTools.length ? state.ownedTools.join(", ") : "暂无"}`,
    `已完成项目：${state.completedProjects.length ? state.completedProjects.join(", ") : "暂无"}`,
    formatGoalSummary(state)
  ].join("\n");
}

function formatLiveStatus(state, spinner, changeSummary = "") {
  const active = activityById(state.activeActivityId);
  if (!active || !changeSummary) return "";
  return `${spinner} ${active.name}：${changeSummary}`;
}

function helpText() {
  return [
    "命令：",
    "  status                 查看状态",
    "  activities             查看活动列表",
    "  start <id>             开始一个持续活动",
    "  stop                   停止当前活动",
    "  learn <id>             学技能",
    "  buy <id>               买工具",
    "  project <id>           提交项目",
    "  promote                申请晋升",
    "  goals                  查看目标链",
    "  claim [id|all]         领取已完成目标奖励",
    "  wait <seconds>         快进调试",
    "  list skills|tools|projects 查看可购买/可提交内容",
    "  save                   保存",
    "  help                   帮助",
    "  quit                   保存并退出"
  ].join("\n");
}

function listContent(type) {
  if (type === "skills") {
    return content.skills.map((skill) => `${skill.id} - ${skill.name}，花费：${formatResourceList(skill.cost)}。${skill.description}`).join("\n");
  }
  if (type === "tools") {
    return content.tools.map((tool) => `${tool.id} - ${tool.name}，花费：${formatResourceList(tool.cost)}。${tool.description}`).join("\n");
  }
  if (type === "projects") {
    return content.projects.map((project) => {
      const skills = project.requirements.skills?.length ? project.requirements.skills.join(", ") : "无";
      return `${project.id} - ${project.name}，技能 ${skills}，资源 ${formatResourceList(project.requirements.resources)}，活动 ${formatActivityRequirements({ activityLevels: project.requirements.activityLevels })}`;
    }).join("\n");
  }
  return "可查看：list skills、list tools、list projects";
}

function canAfford(resources, cost) {
  return Object.entries(cost || {}).every(([key, value]) => (resources[key] || 0) >= value);
}

function pay(resources, cost) {
  for (const [key, value] of Object.entries(cost || {})) {
    resources[key] -= value;
  }
}

function formatShortfall(resources, cost = {}) {
  const entries = Object.entries(cost)
    .map(([key, value]) => [RESOURCE_NAMES[key] || key, Math.max(0, value - (resources[key] || 0))])
    .filter(([, missing]) => missing > 0)
    .map(([label, missing]) => `${label} ${formatNumber(missing)}`);
  return entries.length ? `缺口：${entries.join("，")}` : "";
}

function learnSkill(state, id) {
  const skill = itemById(content.skills, id);
  if (!skill) return `没有这个技能：${id}`;
  if (state.unlockedSkills.includes(id)) return formatLines([`你已经学会了 ${skill.name}。`, formatNextAdvice(state)]);
  if (!canAfford(state.resources, skill.cost)) {
    return formatLines([
      `资源不足，学习 ${skill.name} 需要 ${formatResourceList(skill.cost)}。`,
      formatShortfall(state.resources, skill.cost),
      "建议：start study 产出知识，再回来 learn。"
    ]);
  }
  pay(state.resources, skill.cost);
  state.unlockedSkills.push(id);
  applyAttributeExpRewards(state, skill.attributeExp);
  return formatLines([
    `学会了 ${skill.name}。${skill.description}`,
    `消耗：${formatResourceList(Object.fromEntries(Object.entries(skill.cost).map(([key, value]) => [key, -value])))}`,
    formatAttributeExpRewards(skill.attributeExp),
    formatNextAdvice(state)
  ]);
}

function buyTool(state, id) {
  const tool = itemById(content.tools, id);
  if (!tool) return `没有这个工具：${id}`;
  if (state.ownedTools.includes(id)) return formatLines([`你已经拥有 ${tool.name}。`, formatNextAdvice(state)]);
  if (!canAfford(state.resources, tool.cost)) {
    return formatLines([
      `金钱不足，购买 ${tool.name} 需要 ${formatResourceList(tool.cost)}。`,
      formatShortfall(state.resources, tool.cost),
      "建议：start freelancing 产出金钱和线索。"
    ]);
  }
  pay(state.resources, tool.cost);
  state.ownedTools.push(id);
  return formatLines([`买到了 ${tool.name}。${tool.description}`, formatNextAdvice(state)]);
}

function missingProjectRequirements(state, project) {
  const missing = [];
  for (const [key, value] of Object.entries(project.requirements.resources || {})) {
    if ((state.resources[key] || 0) < value) missing.push(`${RESOURCE_NAMES[key] || key} ${formatNumber(value - (state.resources[key] || 0))}`);
  }
  for (const [id, level] of Object.entries(project.requirements.activityLevels || {})) {
    if (getActivityLevel(state, id) < level) missing.push(`${activityById(id)?.name || id} Lv.${level}`);
  }
  for (const skill of project.requirements.skills || []) {
    if (!state.unlockedSkills.includes(skill)) missing.push(`技能 ${skill}`);
  }
  return missing;
}

function qualityPenalty(state) {
  const bugPenalty = clamp((state.resources.bugs || 0) / 100 * 0.16, 0, 0.16);
  const debtPenalty = clamp((state.resources.techDebt || 0) / 180 * 0.16, 0, 0.16);
  const pressurePenalty = clamp((state.resources.pressure || 0) / 100 * 0.12, 0, 0.12);
  const communicationRelief = attributeBonus(state, "communication", 0.003, 0.22);
  return clamp((bugPenalty + debtPenalty + pressurePenalty) * (1 - communicationRelief), 0, 0.4);
}

function submitProject(state, id) {
  const project = itemById(content.projects, id);
  if (!project) return `没有这个项目：${id}`;
  if (state.completedProjects.includes(id)) return formatLines([`项目 ${project.name} 已经完成过了。`, formatNextAdvice(state)]);
  const missing = missingProjectRequirements(state, project);
  if (missing.length) {
    return formatLines([
      `项目条件不足，还需要：${missing.join("、")}。`,
      "建议：根据缺口切换 activities 积累对应产物。"
    ]);
  }

  pay(state.resources, project.requirements.resources);
  const penalty = qualityPenalty(state);
  const rewardMultiplier = 1 - penalty;
  const expReward = project.rewards.exp * rewardMultiplier;
  const moneyReward = project.rewards.money * rewardMultiplier;
  const reputationReward = project.rewards.reputation * rewardMultiplier;
  state.resources.exp += expReward;
  state.resources.money += moneyReward;
  state.resources.reputation += reputationReward;
  state.completedProjects.push(id);
  state.stats.totalProjects += 1;
  applyAttributeExpRewards(state, project.attributeExp);
  return formatLines([
    `提交了 ${project.name}，${penalty > 0 ? `质量折损 ${Math.round(penalty * 100)}%，` : ""}获得 ${formatNumber(expReward)} 经验、${formatNumber(moneyReward)} 金钱、${formatNumber(reputationReward)} 声望。`,
    `消耗：${formatResourceList(Object.fromEntries(Object.entries(project.requirements.resources || {}).map(([key, value]) => [key, -value])))}`,
    formatAttributeExpRewards(project.attributeExp),
    formatNextAdvice(state)
  ]);
}

function promote(state) {
  const role = roleById(state.currentRole);
  if (!role || !role.promoteTo) return "你已经是当前版本的最高职位了。";
  const req = role.promoteRequirements;
  const missing = [];
  if ((state.resources.exp || 0) < req.exp) missing.push(`${req.exp} 经验`);
  if ((state.resources.reputation || 0) < req.reputation) missing.push(`${req.reputation} 声望`);
  if (state.completedProjects.length < req.completedProjects) missing.push(`${req.completedProjects} 个完成项目`);
  for (const skill of req.skills || []) if (!state.unlockedSkills.includes(skill)) missing.push(`技能 ${skill}`);
  for (const [id, level] of Object.entries(req.activityLevels || {})) if (getActivityLevel(state, id) < level) missing.push(`${activityById(id)?.name || id} Lv.${level}`);
  if (missing.length) return formatLines([`晋升失败，还需要：${missing.join("、")}。`, formatNextAdvice(state)]);

  state.currentRole = role.promoteTo;
  const nextRole = roleById(state.currentRole);
  state.resources.energy = Math.min(nextRole.maxEnergy, state.resources.energy + 20);
  applyAttributeExpRewards(state, nextRole.attributeExp);
  return formatLines([
    `晋升成功！当前职位：${nextRole.name}。`,
    `精力：职位上限 ${nextRole.maxEnergy}，本次恢复到 ${formatNumber(state.resources.energy)}。`,
    formatAttributeExpRewards(nextRole.attributeExp),
    formatNextAdvice(state)
  ]);
}

function removedCommandHint(command) {
  const hints = {
    code: "旧命令 code 已移除。使用 start feature-coding 开始持续写功能。",
    fix: "旧命令 fix 已移除。使用 start bug-hunting 开始持续排查 Bug。",
    refactor: "旧命令 refactor 已移除。使用 start refactoring 开始持续重构。",
    rest: "旧命令 rest 已移除。使用 start rest 开始持续恢复。"
  };
  return hints[command] || "旧命令已移除。输入 activities 查看可开始的活动。";
}

function processCommand(state, input, options = {}) {
  const now = options.now ?? Date.now();
  const messages = [];
  const trimmed = input.trim();
  if (!trimmed) return { messages, exit: false };

  const [command, arg] = trimmed.split(/\s+/, 2);
  if (!trimmed.startsWith("wait ")) {
    messages.push(...settleTime(state, now, { randomEvents: options.randomEvents, rng: options.rng }).messages);
  }

  switch (command) {
    case "status":
      messages.push(formatState(state));
      break;
    case "activities":
      messages.push(formatActivities(state));
      break;
    case "start":
      messages.push(arg ? startActivity(state, arg) : "用法：start <activityId>");
      break;
    case "stop":
      messages.push(stopActivity(state));
      break;
    case "learn":
      messages.push(arg ? learnSkill(state, arg) : "用法：learn <id>");
      break;
    case "buy":
      messages.push(arg ? buyTool(state, arg) : "用法：buy <id>");
      break;
    case "project":
      messages.push(arg ? submitProject(state, arg) : "用法：project <id>");
      break;
    case "promote":
      messages.push(promote(state));
      break;
    case "goals":
      messages.push(formatGoals(state));
      break;
    case "claim":
      messages.push(claimGoal(state, arg));
      break;
    case "wait": {
      const seconds = Number(arg);
      if (!Number.isFinite(seconds) || seconds <= 0) {
        messages.push("用法：wait <seconds>，seconds 必须是正数。");
      } else {
        const waitNow = state.lastTick + Math.floor(seconds) * 1000;
        const result = settleTime(state, waitNow, { maxSeconds: Math.floor(seconds), randomEvents: options.randomEvents, rng: options.rng });
        messages.push(`快进了 ${result.seconds} 秒。`);
        messages.push(...result.messages);
      }
      break;
    }
    case "list":
      messages.push(listContent(arg));
      break;
    case "help":
      messages.push(helpText());
      break;
    case "save":
      saveGame(state, options.savePath);
      messages.push("已保存。");
      break;
    case "quit":
    case "exit":
      saveGame(state, options.savePath);
      messages.push("已保存，下次继续写。");
      return { messages, exit: true };
    case "code":
    case "fix":
    case "refactor":
    case "rest":
      messages.push(removedCommandHint(command));
      break;
    default:
      messages.push("未知命令。输入 help 查看可用命令。");
  }

  return { messages, exit: false };
}

function loadGame(savePath = SAVE_PATH, now = Date.now()) {
  if (!fs.existsSync(savePath)) return createNewState(now);
  const raw = JSON.parse(fs.readFileSync(savePath, "utf8"));
  return normalizeState(raw, now);
}

function saveGame(state, savePath = SAVE_PATH) {
  fs.mkdirSync(path.dirname(savePath), { recursive: true });
  fs.writeFileSync(savePath, JSON.stringify(state, null, 2));
}

function startCli() {
  const state = loadGame();
  const offline = settleTime(state, Date.now(), { randomEvents: true });
  saveGame(state);

  console.log("《代码人生》CLI");
  console.log("输入 help 查看命令。");
  if (offline.seconds > 0) {
    console.log(`离线结算 ${offline.seconds} 秒。`);
    for (const message of offline.messages) console.log(message);
  }
  console.log(formatState(state));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "code-life> "
  });

  let closed = false;
  let liveTicks = 0;

  const printLines = (messages) => {
    for (const message of messages) console.log(message);
    if (!closed) rl.prompt();
  };

  if (process.stdin.isTTY && process.stdout.isTTY) {
    console.log("活动会每 3 秒结算一次。使用 start <id> 选择当前活动。");
  }

  const liveTicker = process.stdin.isTTY && process.stdout.isTTY
    ? setInterval(() => {
        if (closed) return;
        if (!state.activeActivityId) return;
        const result = settleTime(state, Date.now(), { randomEvents: true });
        liveTicks += 1;
        if (liveTicks % 10 === 0) saveGame(state);
        if (rl.line.length > 0) return;
        if (!result.messages.length) return;
        readline.clearLine(process.stdout, 0);
        readline.cursorTo(process.stdout, 0);
        printLines(result.messages);
      }, 3000)
    : null;

  rl.prompt();
  rl.on("line", (line) => {
    if (closed) return;
    const result = processCommand(state, line, { randomEvents: true });
    if (result.exit) {
      for (const message of result.messages) console.log(message);
      closed = true;
      if (liveTicker) clearInterval(liveTicker);
      rl.close();
      return;
    }
    printLines(result.messages);
  });
  rl.on("close", () => {
    closed = true;
    if (liveTicker) clearInterval(liveTicker);
    saveGame(state);
  });
}

if (require.main === module) {
  startCli();
}

module.exports = {
  ATTRIBUTE_IDS,
  ATTRIBUTE_NAMES,
  DEFAULT_ATTRIBUTES,
  OFFLINE_CAP_SECONDS,
  SAVE_PATH,
  addAttributeExp,
  buyTool,
  claimGoal,
  createNewState,
  formatActivities,
  formatChangedResources,
  formatGoals,
  formatGoalSummary,
  formatLiveStatus,
  formatState,
  getActivityLevel,
  getActivityProgress,
  getBaseAttribute,
  getBreakthrough,
  getEffectiveAttribute,
  getMultipliers,
  getProductionRisk,
  helpText,
  learnSkill,
  listContent,
  loadGame,
  normalizeState,
  processCommand,
  promote,
  qualityPenalty,
  saveGame,
  settleTime,
  startActivity,
  stopActivity,
  submitProject
};
