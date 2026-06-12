const PROJECT_RESOURCE_SCALE = { 1: 1.4, 2: 1.7, 3: 2, 4: 2.4, 5: 2.6 };

function roundBalance(value) {
  return Math.round(value * 10000) / 10000;
}

function scaleCodeMultiplier(value) {
  return roundBalance(1 + (value - 1) * 0.7);
}

function scaleSkill(skillConfig) {
  if (!skillConfig.multipliers || !skillConfig.multipliers.code) return skillConfig;
  return {
    ...skillConfig,
    multipliers: {
      ...skillConfig.multipliers,
      code: scaleCodeMultiplier(skillConfig.multipliers.code)
    }
  };
}

function scaleProjectResources(resources = {}, difficulty = 1) {
  const scale = PROJECT_RESOURCE_SCALE[difficulty] || 1;
  return Object.fromEntries(Object.entries(resources).map(([key, value]) => [key, Math.ceil(value * scale)]));
}

function capProjectActivityLevels(activityLevels = {}, difficulty = 1) {
  const cap = difficulty >= 5 ? 5 : difficulty >= 4 ? 4 : Number.POSITIVE_INFINITY;
  return Object.fromEntries(Object.entries(activityLevels).map(([id, level]) => [id, Math.min(level, cap)]));
}

function scaleProjectRewards(rewards = {}) {
  return {
    ...(rewards.money ? { money: Math.ceil(rewards.money * 0.75) } : {}),
    ...(rewards.reputation ? { reputation: rewards.reputation } : {})
  };
}

function sumResources(entries = []) {
  const result = {};
  for (const resources of entries) {
    for (const [key, value] of Object.entries(resources || {})) {
      result[key] = (result[key] || 0) + Number(value || 0);
    }
  }
  return result;
}

function splitResourceByRatios(resources = {}, ratios = [1]) {
  return ratios.map((ratio, index) => {
    const part = {};
    for (const [key, value] of Object.entries(resources || {})) {
      const total = Number(value) || 0;
      const previous = ratios
        .slice(0, index)
        .reduce((sum, currentRatio) => sum + Math.floor(total * currentRatio), 0);
      part[key] = index === ratios.length - 1
        ? Math.max(0, total - previous)
        : Math.floor(total * ratio);
    }
    return part;
  });
}

function splitWorkHours(totalWorkHours, ratios = [1]) {
  return ratios.map((ratio, index) => {
    if (index === ratios.length - 1) {
      const previous = ratios
        .slice(0, index)
        .reduce((sum, currentRatio) => sum + roundBalance(totalWorkHours * currentRatio), 0);
      return roundBalance(totalWorkHours - previous);
    }
    return roundBalance(totalWorkHours * ratio);
  });
}

function createDefaultProjectStages(totalWorkHours, resources = {}) {
  const ratios = [0.3, 0.5, 0.2];
  const resourceParts = splitResourceByRatios(resources, ratios);
  const workHours = splitWorkHours(totalWorkHours, ratios);
  return [
    { id: "scope", name: "需求校准", workHours: workHours[0], resources: resourceParts[0], successModifier: 0.02 },
    { id: "implementation", name: "实现推进", workHours: workHours[1], resources: resourceParts[1] },
    { id: "acceptance", name: "验收收口", workHours: workHours[2], resources: resourceParts[2], successModifier: -0.01 }
  ];
}

function activity(config) {
  return {
    ...config,
    narrativeStages: config.narrativeStages || [],
    outputsPerHour: config.outputsPerHour || {},
    mitigationPerHour: config.mitigationPerHour || {},
    risksPerHour: config.risksPerHour || {},
    energyCostPerHour: config.energyCostPerHour ?? (config.id === "rest" ? 0 : 8),
    activityExpPerHour: config.activityExpPerHour ?? 30,
    attributeExpPerHour: config.attributeExpPerHour || {}
  };
}

const skillTierDefaults = {
  1: { cost: { knowledge: 80, money: 60 }, learningSeconds: 240 },
  2: { cost: { knowledge: 240, money: 180 }, learningSeconds: 500 },
  3: { cost: { knowledge: 520, money: 420 }, learningSeconds: 900 },
  4: { cost: { knowledge: 900, money: 760 }, learningSeconds: 1500 },
  5: { cost: { knowledge: 1400, money: 1300 }, learningSeconds: 2400 }
};

function roundCost(cost, multiplier) {
  return Object.fromEntries(Object.entries(cost).map(([key, value]) => [key, Math.round(value * multiplier / 10) * 10]));
}

function skill(config) {
  config = scaleSkill(config);
  const defaults = skillTierDefaults[config.tier];
  return {
    ...config,
    cost: config.cost || defaults.cost,
    learningSeconds: config.learningSeconds || defaults.learningSeconds,
    learningLogs: config.learningLogs || [],
    completionReflection: config.completionReflection || "",
    attributeRequirements: config.attributeRequirements || {},
    upgradeResourceBase: config.upgradeResourceBase || { docs: 10, tests: 10 },
    multipliers: config.multipliers || {}
  };
}

const projectTemplates = {
  1: { resources: { codeLines: 120, docs: 8, tests: 8 }, minWorkHours: 2, maxSuccessRate: 0.97, rewards: { money: 120, reputation: 2 } },
  2: { resources: { codeLines: 320, docs: 25, tests: 40, architecture: 10 }, minWorkHours: 4, maxSuccessRate: 0.94, rewards: { money: 300, reputation: 3 } },
  3: { resources: { codeLines: 650, docs: 45, tests: 80, architecture: 40 }, minWorkHours: 8, maxSuccessRate: 0.9, rewards: { money: 650, reputation: 5 } },
  4: { resources: { codeLines: 1100, docs: 70, tests: 130, architecture: 90, leads: 6 }, minWorkHours: 18, maxSuccessRate: 0.84, rewards: { money: 1100, reputation: 8 } },
  5: { resources: { codeLines: 1600, docs: 100, tests: 180, architecture: 140, leads: 10 }, minWorkHours: 30, maxSuccessRate: 0.8, rewards: { money: 1900, reputation: 13 } }
};

function splitSkillExp(skills, amount) {
  return Object.fromEntries(skills.map((id) => [id, Math.ceil(amount / skills.length)]));
}

function defaultProjectDescription(skills = []) {
  const skillNames = skills.length ? skills.join(" / ") : "通用工程栈";
  return `围绕 ${skillNames} 做一轮端到端交付，把上下文梳理、资产沉淀和验收闭环压到同一条链路里。`;
}

function project(config) {
  const template = projectTemplates[config.difficulty];
  const skills = config.skills || [];
  const resources = config.resources || template.resources;
  const rewards = config.rewards || template.rewards;
  const defaultWorkHours = roundBalance(config.minWorkHours || template.minWorkHours);
  const stageSource = Array.isArray(config.stages) && config.stages.length
    ? config.stages.map((stage) => ({
        ...stage,
        resources: scaleProjectResources(stage.resources || {}, config.difficulty)
      }))
    : createDefaultProjectStages(defaultWorkHours, scaleProjectResources(resources, config.difficulty));
  const stages = stageSource.map((stage, index) => ({
    id: stage.id || `stage-${index + 1}`,
    name: stage.name || `阶段 ${index + 1}`,
    workHours: roundBalance(stage.workHours || defaultWorkHours),
    resources: stage.resources || {},
    successModifier: Number(stage.successModifier) || 0,
    failureDeltas: stage.failureDeltas || null
  }));
  const totalWorkHours = roundBalance(stages.reduce((sum, stage) => sum + (Number(stage.workHours) || 0), 0));
  return {
    id: config.id,
    name: config.name,
    description: config.description || defaultProjectDescription(skills),
    kind: config.kind || "milestone",
    tags: Array.isArray(config.tags) ? [...config.tags] : [],
    deadlineDays: Number.isFinite(Number(config.deadlineDays)) ? Math.max(1, Math.floor(Number(config.deadlineDays))) : null,
    difficulty: config.difficulty,
    maxSuccessRate: config.maxSuccessRate || template.maxSuccessRate,
    minWorkHours: totalWorkHours,
    stages,
    requirements: {
      resources: sumResources(stages.map((stage) => stage.resources)),
      skills,
      activityLevels: capProjectActivityLevels(config.activityLevels || {}, config.difficulty)
    },
    rewards: scaleProjectRewards(rewards),
    skillExpRewards: config.skillExpRewards || splitSkillExp(skills, config.skillExp || (config.difficulty * 90)),
    attributeExp: config.attributeExp || {},
    successFeedback: config.successFeedback || [],
    failureFeedback: config.failureFeedback || []
  };
}

function createTrainingProjectBuilder(skills) {
  return function trainingProject(id, name, skillId) {
    const skill = skills.find((item) => item.id === skillId);
    return project({
      id,
      name,
      description: `围绕 ${skillId} 做专项演练，用小范围需求打通实现、验证和复盘，沉淀可复用的手感。`,
      difficulty: Math.max(1, Math.min(3, Math.ceil(((skill && skill.tier) || 1) / 2))),
      minWorkHours: 1,
      skills: [skillId],
      skillExpRewards: { [skillId]: 70 },
      activityLevels: { "feature-coding": 1 },
      attributeExp: { learning: 8 }
    });
  };
}

module.exports = {
  activity,
  createTrainingProjectBuilder,
  project,
  roundCost,
  skill
};
