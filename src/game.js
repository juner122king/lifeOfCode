const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const content = require("./content");
const {
  ATTRIBUTE_IDS,
  ATTRIBUTE_NAMES,
  DEFAULT_ATTRIBUTES,
  DEFAULT_PROFILE_ID,
  DEFAULT_PROFILE_NAME,
  ENERGY_MAX,
  EVENT_LABELS,
  GAME_MINUTES_PER_HOUR,
  MINUTES_PER_DAY,
  OFFLINE_CAP_SECONDS,
  RESOURCE_NAMES,
  RESOURCE_ORDER,
  RISK_RESOURCE_IDS,
  SAVE_PATH,
  SAVE_VERSION,
  SCHEDULE_PHASE_BY_ID,
  SCHEDULE_PHASES,
  SCHEDULE_SLOT_TYPES,
  WORLD_START_MINUTES
} = require("./core/constants");
const { getEnergyStatus } = require("./core/energy");
const { clamp, formatNumber, formatRateNumber } = require("./core/math");
const {
  getPressureRecoveryMultiplier,
  getPressureThresholdEffects,
  checkPressureOverload
} = require("./core/pressure");
const {
  formatWorldCalendar,
  getWorldCalendar,
  normalizeWorldTimeMinutes
} = require("./core/time");

const QUALITY_ACTIVITY_IDS = new Set(["bug-hunting", "refactoring", "testing", "code-review", "incident-response"]);
const BUG_RISK_THRESHOLDS = [25, 50, 75];
const AMBIENT_EVENT_INTERVAL_MINUTES = 8;
const AMBIENT_EVENT_MAX_PER_SETTLE = 4;
const MULTIPLIER_NAMES = {
  code: "代码产出",
  money: "金钱获取",
  bug: "Bug 风险",
  debt: "技术债风险",
  pressure: "压力增长"
};
const SKILL_LEVEL_NAMES = ["未学", "入门", "熟练", "精通", "专家", "大师"];
const SKILL_EXP_THRESHOLDS = { 1: 120, 2: 320, 3: 700, 4: 1250 };
const SKILL_UPGRADE_MIN_KNOWLEDGE = { 2: 120, 3: 280, 4: 520, 5: 900 };
const SKILL_UPGRADE_KNOWLEDGE_MULTIPLIERS = { 2: 2, 3: 4, 4: 7, 5: 11 };
const SKILL_UPGRADE_RESOURCE_MULTIPLIERS = { 2: 1, 3: 2, 4: 4, 5: 7 };
const ACTIVITY_ENERGY_COST_PER_HOUR = {
  study: 8.4,
  documentation: 8.4,
  "prompt-engineering": 8.4,
  "feature-coding": 11.2,
  "bug-hunting": 11.2,
  refactoring: 11.2,
  testing: 11.2,
  "open-source": 11.2,
  "code-review": 11.2,
  freelancing: 14,
  architecture: 14,
  "performance-tuning": 14,
  "incident-response": 16.8
};
const SKILL_ENERGY_COST_PER_HOUR = 7;
const PROJECT_ENERGY_COST_PER_HOUR_BY_DIFFICULTY = { 1: 8, 2: 8, 3: 10, 4: 12, 5: 14 };
const PROJECT_BOARD_REFRESH_HOUR = 9;
const PROJECT_BOARD_COMMISSION_COUNT = 6;
const PROJECT_FAILURE_DELTAS_BY_DIFFICULTY = {
  1: { bugs: 1, techDebt: 1, pressure: 2 },
  2: { bugs: 2, techDebt: 2, pressure: 4 },
  3: { bugs: 4, techDebt: 4, pressure: 7 },
  4: { bugs: 6, techDebt: 7, pressure: 10 },
  5: { bugs: 9, techDebt: 10, pressure: 14 }
};
const RESOURCE_EPSILON = 1e-9;
const REST_RECOVERY_PER_HOUR = {
  active: 4,
  rest_noon: 4,
  rest_evening: 6,
  rest_night: 8
};
const SIDE_HUSTLE_ENERGY_COST_PER_HOUR = 8;
const WEEKLY_FOCUS_CONFIG = {
  learning: { name: "学习周", learning: 1.3, project: 0.8, skill: 1.3, activity: 1 },
  project: { name: "项目周", learning: 0.8, project: 1.3, skill: 0.8, activity: 1 },
  freelance: { name: "外包周", money: 1.3, pressure: 1.2, activity: 1 },
  quality: { name: "质量周", quality: 1.3, code: 0.85, money: 0.85, project: 1, activity: 1 },
  balanced: { name: "均衡周", activity: 1, project: 1, skill: 1, learning: 1 }
};
const LIFESTYLE_STANCES = {
  health: {
    id: "health",
    name: "Health First",
    description: "把恢复、睡眠和抗压当作长期生产力。"
  },
  tech_surfing: {
    id: "tech_surfing",
    name: "Tech Surfing",
    description: "休整时刷技术内容，换来知识，但不恢复精力。"
  },
  cyber_gaming: {
    id: "cyber_gaming",
    name: "Cyber Gaming",
    description: "用赛博娱乐快速降压，但恢复精力较慢。"
  },
  side_hustle: {
    id: "side_hustle",
    name: "Indie Side-Hustle",
    description: "白天写公司的代码，晚上写改命的代码。"
  }
};
const WORLD_EVENTS = [
  {
    id: "ai-boom",
    name: "AI 热潮",
    startDay: 29,
    endDay: 84,
    message: "Y1 M2-M3 AI 热潮，LLM Agent 学习与项目技能经验 x2。",
    skillExpMultipliers: { "llm-agent": 2 },
    projectRewardMultiplier: 1.1
  },
  {
    id: "hiring-freeze",
    name: "招聘冻结",
    startDay: 113,
    endDay: 140,
    message: "市场招聘冻结，项目金钱奖励 -20%，压力 +5。",
    projectRewardMultiplier: 0.8,
    pressure: 5
  },
  {
    id: "open-source-season",
    name: "开源季",
    startDay: 169,
    endDay: 196,
    message: "开源季开始，开源协作和文档类产出更容易获得声望。",
    reputation: 1
  }
];

function roleById(id) {
  return content.roles.find((role) => role.id === id);
}

function activityById(id) {
  return content.activities.find((activity) => activity.id === id);
}

function characterCardById(id) {
  return content.characterCards.find((card) => card.id === id);
}

function itemById(items, id) {
  return items.find((item) => item.id === id);
}

function goalById(id) {
  return itemById(content.goals || [], id);
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

function roleRank(id) {
  return content.roles.findIndex((role) => role.id === id);
}

function createActivityMap(valueFactory) {
  return Object.fromEntries(content.activities.map((activity) => [activity.id, valueFactory(activity)]));
}

function normalizeProfileId(id) {
  if (typeof id !== "string") return "";
  const trimmed = id.trim();
  return /^[A-Za-z0-9_-]+$/.test(trimmed) ? trimmed : "";
}

function normalizeProfileName(name, fallbackId = DEFAULT_PROFILE_ID) {
  if (typeof name === "string" && name.trim()) return name.trim().slice(0, 40);
  const id = normalizeProfileId(fallbackId) || DEFAULT_PROFILE_ID;
  return id === DEFAULT_PROFILE_ID ? DEFAULT_PROFILE_NAME : id;
}

function normalizeTimestamp(value, fallback) {
  if (typeof value !== "string") return fallback;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : fallback;
}

function createEmptyScheduleSlots() {
  return Object.fromEntries(SCHEDULE_PHASES.map((phase) => [phase.id, null]));
}

function createScheduleDraft(day = 1) {
  return { day, slots: createEmptyScheduleSlots() };
}

function createLockedSchedule(day = 1) {
  return { day, slots: createEmptyScheduleSlots(), confirmedAtWorldMinute: null };
}

function applyCharacterCard(state, characterCardId) {
  const card = characterCardById(characterCardId);
  if (!card) throw new Error(`没有这个人物卡：${characterCardId}`);

  state.characterCardId = card.id;
  state.attributes = normalizeAttributes(card.attributes, DEFAULT_ATTRIBUTES, 1, 100);

  for (const [key, delta] of Object.entries(card.resources || {})) {
    state.resources[key] = Math.max(0, (Number(state.resources[key]) || 0) + Number(delta || 0));
  }

  for (const [id, level] of Object.entries(card.skills || {})) {
    if (!itemById(content.skills, id)) continue;
    const progress = ensureSkillProgress(state, id);
    progress.level = clamp(Math.floor(Number(level) || 1), 1, 5);
    progress.exp = Math.max(0, Number(progress.exp) || 0);
  }

  for (const [id, level] of Object.entries(card.activityLevels || {})) {
    if (activityById(id)) state.activityLevels[id] = Math.max(1, Math.floor(Number(level) || 1));
  }

  state.ownedTools = (card.ownedTools || []).filter((id) => itemById(content.tools, id));
  syncUnlockedSkills(state);
  clampState(state);
  return state;
}

function createNewState(now = Date.now(), options = {}) {
  const role = content.roles[0];
  const timestamp = new Date(now).toISOString();
  const state = {
    saveVersion: SAVE_VERSION,
    profileId: DEFAULT_PROFILE_ID,
    profileName: DEFAULT_PROFILE_NAME,
    characterCardId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    resources: {
      codeLines: 0,
      money: 30,
      energy: ENERGY_MAX,
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
    activeProjectId: null,
    projectProgress: {},
    projectBoard: null,
    dayStartProjectProgress: {},
    worldTimeMinutes: WORLD_START_MINUTES,
    scheduleDraft: createScheduleDraft(1),
    lockedSchedule: null,
    scheduleCompletedPhases: [],
    waitingForSchedule: true,
    lastSchedulePromptDay: null,
    weeklyFocus: "balanced",
    lifestyleStanceId: "health",
    pendingLifestyleStanceId: null,
    lastMorningTransitionDay: 1,
    lastDayEndSummaryDay: null,
    dayEndSummaryPending: null,
    dayPhaseEvents: [],
    triggeredNarrativeKeys: [],
    dayStartResources: null,
    triggeredWorldEvents: [],
    activeProjectDeadlines: {},
    warnedBugRiskThresholds: [],
    activityLevels: createActivityMap(() => 1),
    activityExp: createActivityMap(() => 0),
    activityStats: {
      totalActiveSeconds: 0,
      byActivity: createActivityMap(() => 0)
    },
    skillProgress: {},
    activeSkillLearningId: null,
    skillLearningProgress: {},
    unlockedSkills: [],
    ownedTools: [],
    completedProjects: [],
    claimedGoals: [],
    attributes: { ...DEFAULT_ATTRIBUTES },
    attributeBreakthroughs: Object.fromEntries(ATTRIBUTE_IDS.map((id) => [id, 0])),
    attributeExp: Object.fromEntries(ATTRIBUTE_IDS.map((id) => [id, 0])),
    currentRole: role.id,
    lastTick: now,
    lastHourlySummaryHour: Math.floor((WORLD_START_MINUTES % MINUTES_PER_DAY) / 60),
    hourlySummarySnapshot: {
      resources: {},
      activityLevels: {},
      attributeExp: {},
      worldMinute: WORLD_START_MINUTES
    },
    stats: {
      totalCodeLines: 0,
      totalBugsFixed: 0,
      totalProjects: 0
    }
  };
  if (options.characterCardId) applyCharacterCard(state, options.characterCardId);
  state.dayStartResources = snapshotResources(state.resources);

  // 初始化每小时汇总快照
  state.hourlySummarySnapshot.resources = snapshotResources(state.resources);
  state.hourlySummarySnapshot.activityLevels = Object.fromEntries(
    Object.entries(state.activityLevels).map(([id, level]) => [id, { level, exp: state.activityExp[id] || 0 }])
  );
  state.hourlySummarySnapshot.attributeExp = { ...state.attributeExp };

  return state;
}

function normalizeScheduleSlot(raw, phaseId) {
  if (!raw || typeof raw !== "object") return null;
  const type = raw.type;
  const id = typeof raw.id === "string" ? raw.id : null;
  if (!SCHEDULE_SLOT_TYPES.includes(type)) return null;
  if (type === "none") return phaseId === "evening" ? { type: "none", id: null } : null;
  if (type === "activity" && activityById(id)) return { type, id };
  if (type === "skill" && itemById(content.skills, id)) return { type, id };
  if (type === "project" && projectById(id)) return { type, id };
  return null;
}

function normalizeSchedule(raw, fallbackDay, options = {}) {
  const day = Math.max(1, Math.floor(Number(raw && raw.day) || fallbackDay || 1));
  const schedule = options.locked ? createLockedSchedule(day) : createScheduleDraft(day);
  const rawSlots = raw && raw.slots;
  for (const phase of SCHEDULE_PHASES) {
    schedule.slots[phase.id] = normalizeScheduleSlot(rawSlots && rawSlots[phase.id], phase.id);
  }
  if (options.locked) {
    const confirmed = Number(raw && raw.confirmedAtWorldMinute);
    schedule.confirmedAtWorldMinute = Number.isFinite(confirmed) ? Math.max(0, Math.floor(confirmed)) : null;
  }
  return schedule;
}

function normalizeCompletedSchedulePhases(raw) {
  const valid = new Set(SCHEDULE_PHASES.map((phase) => phase.id));
  return Array.isArray(raw) ? [...new Set(raw.filter((id) => valid.has(id)))] : [];
}

function normalizeState(raw, now = Date.now()) {
  const fresh = createNewState(now);
  if (!raw || raw.saveVersion !== SAVE_VERSION) {
    return {
      ...fresh,
      profileId: normalizeProfileId(raw && raw.profileId) || DEFAULT_PROFILE_ID,
      profileName: normalizeProfileName(raw && raw.profileName, raw && raw.profileId),
      createdAt: normalizeTimestamp(raw && raw.createdAt, fresh.createdAt),
      updatedAt: normalizeTimestamp(raw && raw.updatedAt, raw && raw.lastTick ? new Date(raw.lastTick).toISOString() : fresh.updatedAt),
      lastTick: Number.isFinite(raw && raw.lastTick) ? raw.lastTick : now
    };
  }
  const calendarDay = getWorldCalendar(raw && raw.worldTimeMinutes).day;
  const normalized = {
    ...fresh,
    ...raw,
    saveVersion: SAVE_VERSION,
    profileId: normalizeProfileId(raw && raw.profileId) || DEFAULT_PROFILE_ID,
    profileName: normalizeProfileName(raw && raw.profileName, raw && raw.profileId),
    characterCardId: characterCardById(raw && raw.characterCardId) ? raw.characterCardId : null,
    createdAt: normalizeTimestamp(raw && raw.createdAt, fresh.createdAt),
    updatedAt: normalizeTimestamp(raw && raw.updatedAt, raw && raw.lastTick ? new Date(raw.lastTick).toISOString() : fresh.updatedAt),
    resources: normalizeResources(raw && raw.resources, fresh.resources),
    activeActivityId: activityById(raw && raw.activeActivityId) ? raw.activeActivityId : null,
    activeProjectId: projectById(raw && raw.activeProjectId) ? raw.activeProjectId : null,
    projectProgress: normalizeProjectProgress(raw && raw.projectProgress),
    projectBoard: normalizeProjectBoard(raw && raw.projectBoard, raw),
    worldTimeMinutes: normalizeWorldTimeMinutes(raw && raw.worldTimeMinutes),
    scheduleDraft: normalizeSchedule(raw && raw.scheduleDraft, calendarDay),
    lockedSchedule: raw && raw.lockedSchedule ? normalizeSchedule(raw.lockedSchedule, calendarDay, { locked: true }) : null,
    scheduleCompletedPhases: normalizeCompletedSchedulePhases(raw && raw.scheduleCompletedPhases),
    waitingForSchedule: Boolean(raw && raw.waitingForSchedule),
    weeklyFocus: normalizeWeeklyFocus(raw && raw.weeklyFocus),
    lifestyleStanceId: normalizeLifestyleStanceId(raw && raw.lifestyleStanceId),
    pendingLifestyleStanceId: normalizePendingLifestyleStanceId(raw && raw.pendingLifestyleStanceId),
    lastMorningTransitionDay: normalizeLastMorningTransitionDay(raw && raw.lastMorningTransitionDay, raw && raw.worldTimeMinutes),
    triggeredWorldEvents: Array.isArray(raw && raw.triggeredWorldEvents) ? raw.triggeredWorldEvents.filter((id) => WORLD_EVENTS.some((event) => event.id === id)) : [],
    activeProjectDeadlines: normalizeProjectDeadlines(raw && raw.activeProjectDeadlines),
    warnedBugRiskThresholds: normalizeBugRiskThresholds(raw && raw.warnedBugRiskThresholds),
    triggeredNarrativeKeys: Array.isArray(raw && raw.triggeredNarrativeKeys) ? [...new Set(raw.triggeredNarrativeKeys.filter((key) => typeof key === "string"))] : [],
    activityLevels: normalizeActivityMap(raw && raw.activityLevels, 1),
    activityExp: normalizeActivityMap(raw && raw.activityExp, 0),
    activityStats: normalizeActivityStats(raw && raw.activityStats),
    skillProgress: normalizeSkillProgress(raw && raw.skillProgress, raw && raw.unlockedSkills),
    activeSkillLearningId: itemById(content.skills, raw && raw.activeSkillLearningId) ? raw.activeSkillLearningId : null,
    skillLearningProgress: normalizeSkillLearningProgress(raw && raw.skillLearningProgress),
    unlockedSkills: [],
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
  normalized.unlockedSkills = normalizeUnlockedSkills(raw && raw.unlockedSkills, normalized.skillProgress);
  clearCompletedSkillLearning(normalized);
  if (normalized.activeSkillLearningId) {
    normalized.activeActivityId = null;
    normalized.activeProjectId = null;
  }
  if (normalized.activeProjectId) normalized.activeActivityId = null;
  normalized.dayStartResources = normalized.dayStartResources && typeof normalized.dayStartResources === "object"
    ? normalizeResources(normalized.dayStartResources, snapshotResources(normalized.resources))
    : snapshotResources(normalized.resources);
  normalized.dayStartProjectProgress = normalized.dayStartProjectProgress && typeof normalized.dayStartProjectProgress === "object"
    ? Object.fromEntries(Object.entries(normalized.dayStartProjectProgress)
      .filter(([id, value]) => projectById(id) && Number.isFinite(Number(value)))
      .map(([id, value]) => [id, Math.max(0, Number(value) || 0)]))
    : snapshotProjectProgress(normalized);
  normalized.dayPhaseEvents = Array.isArray(normalized.dayPhaseEvents)
    ? normalized.dayPhaseEvents.filter((event) => event && typeof event === "object" && event.id && event.phaseId)
    : [];
  for (const [id, deadline] of Object.entries(normalized.activeProjectDeadlines || {})) {
    if (!normalized.projectProgress[id] || !Number.isFinite(Number(deadline && deadline.dueWorldMinute))) continue;
    if (!Number.isFinite(Number(normalized.projectProgress[id].dueWorldMinute))) {
      normalized.projectProgress[id].dueWorldMinute = Math.max(0, Math.floor(Number(deadline.dueWorldMinute)));
    }
    if (deadline && deadline.warned) normalized.projectProgress[id].deadlineWarned = true;
  }
  ensureProjectBoard(normalized);
  if (!normalized.lockedSchedule) normalized.waitingForSchedule = true;
  if (normalized.lockedSchedule) normalized.scheduleDraft = normalizeSchedule(normalized.scheduleDraft, normalized.lockedSchedule.day);
  delete normalized.dailyActionMinutesUsed;
  delete normalized.currentDailyActionMinutesLimit;
  delete normalized.dailyEnergyCapMultiplier;
  delete normalized.pendingMorningEnergyCapMultiplier;
  delete normalized.pendingMorningEnergyPenalty;
  clampState(normalized);
  return normalized;
}

function normalizeWeeklyFocus(value) {
  return WEEKLY_FOCUS_CONFIG[value] ? value : "balanced";
}

function normalizeLifestyleStanceId(value) {
  return LIFESTYLE_STANCES[value] ? value : "health";
}

function normalizePendingLifestyleStanceId(value) {
  return value && LIFESTYLE_STANCES[value] ? value : null;
}

function normalizeLastMorningTransitionDay(value, worldTimeMinutes) {
  const explicit = Number(value);
  if (Number.isFinite(explicit) && explicit >= 1) return Math.floor(explicit);
  const calendar = getWorldCalendar(worldTimeMinutes);
  return Math.max(1, calendar.hour >= 9 ? calendar.day : calendar.day - 1);
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

function normalizeBugRiskThresholds(raw) {
  const source = Array.isArray(raw) ? raw : [];
  return BUG_RISK_THRESHOLDS.filter((threshold) => source.includes(threshold));
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

function normalizeResources(raw, defaults) {
  const result = {};
  for (const key of RESOURCE_ORDER) {
    const value = Number(raw && raw[key]);
    result[key] = Number.isFinite(value) ? value : defaults[key];
  }
  return result;
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

function getProjectTotalStageSeconds(projectOrId) {
  return getProjectStages(projectOrId).reduce((sum, stage) => sum + Math.max(1, Math.round((Number(stage.workHours) || 0) * 3600)), 0);
}

function getStageRequiredSeconds(stage) {
  return Math.max(1, Math.round((Number(stage && stage.workHours) || 0) * 3600));
}

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

function stableHash(value) {
  const text = String(value || "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  let value = stableHash(seed) || 1;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function normalizeProjectBoard(raw, stateLike = {}) {
  const calendar = getWorldCalendar(stateLike.worldTimeMinutes);
  const day = Math.max(1, Math.floor(Number(raw && raw.day) || calendar.day || 1));
  const validIds = new Set((content.projects || []).map((project) => project.id));
  const offerIds = Array.isArray(raw && raw.offerIds)
    ? [...new Set(raw.offerIds.filter((id) => validIds.has(id)))]
    : [];
  return { day, offerIds };
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

function getNormalizedSkillLevel(skillProgress, id) {
  return clamp(Math.floor(Number(skillProgress && skillProgress[id] && skillProgress[id].level) || 0), 0, 5);
}

function getWeeklyFocus(state) {
  const id = normalizeWeeklyFocus(state.weeklyFocus);
  return { id, ...WEEKLY_FOCUS_CONFIG[id] };
}

function formatWeeklyFocus(state) {
  return getWeeklyFocus(state).name;
}

function setWeeklyFocus(state, id) {
  if (!WEEKLY_FOCUS_CONFIG[id]) return `没有这个周重点：${id}。可选：learning、project、freelance、quality、balanced。`;
  state.weeklyFocus = id;
  return `本周重点已设为：${WEEKLY_FOCUS_CONFIG[id].name}。`;
}

function getEffectiveMaxEnergy(state) {
  return ENERGY_MAX;
}

function formatEnergyStatus(state) {
  return getEnergyStatus(state).name;
}

function getActiveWorldEvents(state) {
  const day = getWorldCalendar(state.worldTimeMinutes).day;
  return WORLD_EVENTS.filter((event) => day >= event.startDay && day <= event.endDay);
}

function formatWorldEvents(state) {
  const events = getActiveWorldEvents(state);
  return formatLines([
    `世界日历：${formatWorldCalendar(state)}`,
    events.length ? "当前事件：" : "当前事件：暂无",
    ...events.map((event) => `${event.id} - ${event.name}：${event.message}`)
  ]);
}

function getSkillExpMultiplier(state, skillId) {
  return getActiveWorldEvents(state).reduce((multiplier, event) => multiplier * (event.skillExpMultipliers && event.skillExpMultipliers[skillId] || 1), 1);
}

function getProjectRewardMultiplier(state) {
  return getActiveWorldEvents(state).reduce((multiplier, event) => multiplier * (event.projectRewardMultiplier || 1), 1);
}

function getLifestyleStance(id) {
  return LIFESTYLE_STANCES[normalizeLifestyleStanceId(id)];
}

function getLifestyleStatus(state) {
  const current = getLifestyleStance(state.lifestyleStanceId);
  const pending = state.pendingLifestyleStanceId ? getLifestyleStance(state.pendingLifestyleStanceId) : null;
  return {
    current,
    pending,
    text: pending
      ? `当前作息：${current.name}；明日：${pending.name}（待生效）`
      : `当前作息：${current.name}；明日：沿用当前`
  };
}

function getLifestyleOptions(state) {
  return Object.values(LIFESTYLE_STANCES).map((stance) => ({
    id: stance.id,
    name: stance.name,
    description: stance.description,
    current: normalizeLifestyleStanceId(state.lifestyleStanceId) === stance.id,
    pending: state.pendingLifestyleStanceId === stance.id,
    command: `lifestyle ${stance.id}`
  }));
}

function formatLifestyleEffectSummary(id) {
  const stanceId = normalizeLifestyleStanceId(id);
  if (stanceId === "health") return "休整恢复精力并降低压力，精力恢复受当前压力抑制。";
  if (stanceId === "tech_surfing") return "休整以 40% 速度恢复精力，并获得知识；精力恢复受当前压力抑制。";
  if (stanceId === "cyber_gaming") return "休整以 60% 速度恢复精力，并更强降低压力；精力恢复受当前压力抑制。";
  if (stanceId === "side_hustle") return "深夜休整改为消耗精力，产出金钱和声望并增加压力；非深夜恢复受当前压力抑制。";
  return "";
}

function formatLifestyle(state) {
  const status = getLifestyleStatus(state);
  return formatLines([
    status.text,
    "可选作息：",
    ...getLifestyleOptions(state).map((stance) => {
      const marker = stance.current ? "当前" : stance.pending ? "明日" : "可选";
      return `${stance.id} - ${stance.name} [${marker}]：${stance.description}`;
    }),
    "命令：lifestyle <id>（切换将于次日 09:00 生效）"
  ]);
}

function setLifestyleStance(state, id) {
  if (!LIFESTYLE_STANCES[id]) return `没有这个作息基调：${id}。可选：${Object.keys(LIFESTYLE_STANCES).join("、")}。`;
  const effect = `作息效果：${formatLifestyleEffectSummary(id)}`;
  if (normalizeLifestyleStanceId(state.lifestyleStanceId) === id) {
    state.pendingLifestyleStanceId = null;
    return formatLines([
      `明日沿用当前作息：${LIFESTYLE_STANCES[id].name}。`,
      effect
    ]);
  }
  state.pendingLifestyleStanceId = id;
  return formatLines([
    `明日作息已设为：${LIFESTYLE_STANCES[id].name}。将在次日 09:00 生效。`,
    effect
  ]);
}

function getRestWindow(state, worldTimeMinutes) {
  const minuteOfDay = normalizeWorldTimeMinutes(worldTimeMinutes) % MINUTES_PER_DAY;
  if (minuteOfDay >= 12 * 60 && minuteOfDay < 14 * 60) return "rest_noon";
  if (minuteOfDay >= 18 * 60 && minuteOfDay < 21 * 60) {
    const eveningSlot = state.lockedSchedule && state.lockedSchedule.slots && state.lockedSchedule.slots.evening;
    return eveningSlot && eveningSlot.type === "none" ? "rest_evening" : null;
  }
  if (minuteOfDay >= 21 * 60 || minuteOfDay < 9 * 60) return "rest_night";
  return null;
}

function mergeDeltas(target, source = {}) {
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] || 0) + value;
  }
}

function settleLifestyleRest(state, windowId, seconds) {
  const stance = getLifestyleStance(state.lifestyleStanceId);
  const deltas = {};
  const duration = Math.max(0, seconds);
  if (!stance || !windowId || duration <= 0) return deltas;
  const baseRecoveryPerGameMinute = perHourToPerGameMinute(REST_RECOVERY_PER_HOUR[windowId] || 0);
  const pressureRecoveryMultiplier = getPressureRecoveryMultiplier(state);
  const applyRecovery = (multiplier = 1) => {
    const energyDelta = baseRecoveryPerGameMinute * Math.max(0, multiplier) * pressureRecoveryMultiplier * duration;
    if (energyDelta > 0) deltas.energy = applyResourceDelta(state, "energy", energyDelta);
  };

  if (stance.id === "health") {
    const resilienceRelief = 1 + attributeBonus(state, "resilience", 0.004, 0.32);
    applyRecovery(1);
    deltas.pressure = applyResourceDelta(state, "pressure", -duration * 0.008 * resilienceRelief);
    return deltas;
  }

  if (stance.id === "tech_surfing") {
    const learningBoost = 1 + attributeBonus(state, "learning", 0.003, 0.24);
    const focusRelief = attributeBonus(state, "focus", 0.003, 0.18);
    applyRecovery(0.4);
    deltas.knowledge = applyResourceDelta(state, "knowledge", duration * 0.06 * learningBoost);
    if (focusRelief > 0) deltas.pressure = applyResourceDelta(state, "pressure", -duration * 0.003 * focusRelief);
    return deltas;
  }

  if (stance.id === "cyber_gaming") {
    const resilienceRelief = 1 + attributeBonus(state, "resilience", 0.004, 0.32);
    applyRecovery(0.6);
    deltas.pressure = applyResourceDelta(state, "pressure", -duration * 0.015 * resilienceRelief);
    return deltas;
  }

  if (stance.id === "side_hustle" && windowId === "rest_night") {
    const creativityBoost = 1 + attributeBonus(state, "creativity", 0.004, 0.32);
    const communicationBoost = 1 + attributeBonus(state, "communication", 0.003, 0.24);
    const resilienceRelief = attributeBonus(state, "resilience", 0.004, 0.3);
    const energyCostPerGameMinute = perHourToPerGameMinute(SIDE_HUSTLE_ENERGY_COST_PER_HOUR);
    const workSeconds = getAffordableWorkSeconds(state, energyCostPerGameMinute, duration);
    if (workSeconds <= 0) return deltas;
    deltas.energy = consumeWorkEnergy(state, energyCostPerGameMinute, workSeconds);
    deltas.money = applyResourceDelta(state, "money", workSeconds * 0.035 * creativityBoost);
    deltas.reputation = applyResourceDelta(state, "reputation", workSeconds * 0.0008 * communicationBoost);
    deltas.pressure = applyResourceDelta(state, "pressure", workSeconds * 0.018 * (1 - resilienceRelief));
    return deltas;
  }

  if (stance.id === "side_hustle") {
    applyRecovery(1);
    return deltas;
  }

  return deltas;
}

function getLifestyleRestTickerMeta(state, windowId) {
  const stance = getLifestyleStance(state.lifestyleStanceId);
  if (!stance) {
    return { name: "休整", defaultSummary: "暂无可见产出", sideEffectSummary: "" };
  }
  if (stance.id === "health") {
    return { name: "健康休整", defaultSummary: "恢复精力，降低压力", sideEffectSummary: "" };
  }
  if (stance.id === "tech_surfing") {
    return { name: "技术浏览", defaultSummary: "缓慢恢复精力，获得知识", sideEffectSummary: "" };
  }
  if (stance.id === "cyber_gaming") {
    return {
      name: "赛博娱乐",
      defaultSummary: "缓慢恢复精力，并降低压力",
      sideEffectSummary: ""
    };
  }
  if (stance.id === "side_hustle") {
    if (windowId === "rest_night") {
      return {
        name: "独立副业",
        defaultSummary: "消耗精力，获得金钱和声望，并增加压力",
        sideEffectSummary: ""
      };
    }
    return { name: "副业前休整", defaultSummary: "恢复精力", sideEffectSummary: "" };
  }
  return { name: "休整", defaultSummary: "暂无可见产出", sideEffectSummary: "" };
}

function mergeRestTicker(result, state, windowId, seconds, deltas = {}) {
  if (!result || !windowId || seconds <= 0) return;
  const meta = getLifestyleRestTickerMeta(state, windowId);
  if (!result.restTick || result.restTick.name !== meta.name || result.restTick.defaultSummary !== meta.defaultSummary) {
    result.restTick = { ...meta, seconds: 0, deltas: {} };
  }
  result.restTick.seconds += seconds;
  mergeDeltas(result.restTick.deltas, deltas);
}

function applyMorningTransitionIfDue(state, messages = [], events = []) {
  const calendar = getWorldCalendar(state.worldTimeMinutes);
  if (calendar.hour !== 9 || calendar.minute !== 0) return false;
  if (state.lastMorningTransitionDay === calendar.day) return false;

  state.lastMorningTransitionDay = calendar.day;

  // 记录一天开始的资源快照
  state.dayStartResources = snapshotResources(state.resources);
  state.dayStartProjectProgress = snapshotProjectProgress(state);
  state.dayPhaseEvents = [];

  clampState(state);

  if (state.pendingLifestyleStanceId) {
    state.lifestyleStanceId = normalizeLifestyleStanceId(state.pendingLifestyleStanceId);
    state.pendingLifestyleStanceId = null;
  }

  pushMessageEvent(messages, events, "system", `09:00：${formatLifestyle(state).split("\n")[0]}。`);
  return true;
}

function getProjectBoardDay(state) {
  const calendar = getWorldCalendar(state.worldTimeMinutes);
  const beforeRefresh = calendar.hour < PROJECT_BOARD_REFRESH_HOUR;
  return Math.max(1, calendar.day - (beforeRefresh ? 1 : 0));
}

function pickStableProjects(pool, count, seed) {
  const rng = seededRandom(seed);
  const items = pool
    .map((project) => ({ project, score: rng() }))
    .sort((a, b) => a.score - b.score)
    .map((entry) => entry.project);
  return items.slice(0, Math.max(0, count));
}

function generateProjectBoardOfferIds(state, day) {
  const profileSeed = `${state.profileId || DEFAULT_PROFILE_ID}:${day}`;
  const byDifficulty = new Map();
  for (const project of commissionProjects()) {
    const difficulty = clamp(Math.floor(Number(project.difficulty) || 1), 1, 5);
    byDifficulty.set(difficulty, [...(byDifficulty.get(difficulty) || []), project]);
  }
  const selected = [];
  for (const difficulty of [1, 2, 3, 4, 5]) {
    const pool = byDifficulty.get(difficulty) || [];
    const pickCount = difficulty <= 2 ? 2 : 1;
    selected.push(...pickStableProjects(pool, pickCount, `${profileSeed}:${difficulty}`));
  }
  if (selected.length < PROJECT_BOARD_COMMISSION_COUNT) {
    const used = new Set(selected.map((project) => project.id));
    const rest = commissionProjects().filter((project) => !used.has(project.id));
    selected.push(...pickStableProjects(rest, PROJECT_BOARD_COMMISSION_COUNT - selected.length, `${profileSeed}:rest`));
  }
  return selected.slice(0, PROJECT_BOARD_COMMISSION_COUNT).map((project) => project.id);
}

function ensureProjectBoard(state) {
  const day = getProjectBoardDay(state);
  const board = normalizeProjectBoard(state.projectBoard, state);
  if (board.day !== day || !board.offerIds.length) {
    state.projectBoard = { day, offerIds: generateProjectBoardOfferIds(state, day) };
  } else {
    state.projectBoard = board;
  }
  const knownIds = new Set((content.projects || []).map((project) => project.id));
  const offerIds = new Set((state.projectBoard.offerIds || []).filter((id) => knownIds.has(id)));
  const completed = new Set(state.completedProjects || []);
  for (const project of milestoneProjects()) {
    if (!completed.has(project.id) || state.projectProgress[project.id]) offerIds.add(project.id);
  }
  for (const id of Object.keys(state.projectProgress || {})) {
    if (knownIds.has(id)) offerIds.add(id);
  }
  state.projectBoard.offerIds = [...offerIds];
  return state.projectBoard;
}

function getProjectBoardProjects(state) {
  const board = ensureProjectBoard(state);
  const projects = [];
  const seen = new Set();
  for (const id of board.offerIds || []) {
    const project = projectById(id);
    if (!project || seen.has(id)) continue;
    projects.push(project);
    seen.add(id);
  }
  return projects;
}

function getNearestDeadline(state) {
  const entries = Object.entries(state.projectProgress || {})
    .map(([id, progress]) => {
      const project = projectById(id);
      if (!project || !Number.isFinite(Number(progress.dueWorldMinute))) return null;
      const daysRemaining = Math.ceil((progress.dueWorldMinute - state.worldTimeMinutes) / MINUTES_PER_DAY);
      return {
        id,
        name: project.name,
        dueWorldMinute: progress.dueWorldMinute,
        dueDay: getWorldCalendar(progress.dueWorldMinute).day,
        daysRemaining,
        overdue: progress.dueWorldMinute < state.worldTimeMinutes
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.dueWorldMinute - b.dueWorldMinute);
  return entries[0] || null;
}

function formatNearestDeadline(state) {
  const deadline = getNearestDeadline(state);
  if (!deadline) return "最近 Deadline：暂无";
  const remaining = deadline.overdue ? `已逾期 ${Math.abs(deadline.daysRemaining)} 天` : `剩余 ${deadline.daysRemaining} 天`;
  return `最近 Deadline：${deadline.name} D${String(deadline.dueDay).padStart(3, "0")}（${remaining}）`;
}

function clampState(state) {
  for (const key of RESOURCE_ORDER) {
    const value = Math.max(0, Number(state.resources[key]) || 0);
    state.resources[key] = Math.abs(value) < RESOURCE_EPSILON ? 0 : value;
  }
  state.resources.pressure = clamp(state.resources.pressure, 0, 100);
  delete state.dailyEnergyCapMultiplier;
  delete state.pendingMorningEnergyCapMultiplier;
  delete state.pendingMorningEnergyPenalty;
  const energy = clamp(Number(state.resources.energy) || 0, 0, getEffectiveMaxEnergy(state));
  state.resources.energy = Math.abs(energy) < RESOURCE_EPSILON ? 0 : energy;
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

function addAttributeExp(state, attr, amount, options = {}) {
  if (!ATTRIBUTE_IDS.includes(attr) || amount <= 0) return 0;
  let gained = 0;
  const beforeValue = getBaseAttribute(state, attr);
  state.attributeExp[attr] = Math.max(0, Number(state.attributeExp[attr]) || 0) + amount;

  while (getBaseAttribute(state, attr) < 100) {
    const current = getBaseAttribute(state, attr);
    const cost = 50 + current * 5;
    if (state.attributeExp[attr] < cost) break;
    state.attributeExp[attr] -= cost;
    state.attributes[attr] = current + 1;
    gained += 1;
  }

  if (gained > 0) collectAttributeGrowthEvents(state, attr, beforeValue, getBaseAttribute(state, attr), options.events);
  return gained;
}

function applyAttributeExpRewards(state, rewards = {}, options = {}) {
  for (const [attr, amount] of Object.entries(rewards || {})) {
    addAttributeExp(state, attr, amount, options);
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

function formatSkillProgress(state, id) {
  const skill = itemById(content.skills, id);
  const progress = getSkillProgress(state, id);
  const next = progress.next ? `${formatNumber(progress.exp)}/${formatNumber(progress.next)}` : formatNumber(progress.exp);
  return `${skill ? skill.name : id} ${progress.levelName} ${next}`;
}

function formatSkillExpRewards(gained = {}) {
  const entries = Object.entries(gained)
    .filter(([, amount]) => amount > 0)
    .map(([id, amount]) => {
      const skill = itemById(content.skills, id);
      return `${skill ? skill.name : id} +${formatNumber(amount)}`;
    });
  return entries.length ? `技能经验：${entries.join("，")}` : "";
}

function formatDifficultyLabel(difficulty) {
  const value = clamp(Math.floor(Number(difficulty) || 1), 1, 5);
  return `${"★".repeat(value)}${"☆".repeat(5 - value)}（难度 ${value}）`;
}

function getMultipliers(state) {
  const multipliers = { code: 1, money: 1, bug: 1, debt: 1, pressure: 1 };
  const apply = (item, level = 1) => {
    for (const [key, value] of Object.entries(item.multipliers || {})) {
      multipliers[key] *= Math.pow(value, level);
    }
  };

  content.skills.forEach((skill) => {
    const level = getSkillLevel(state, skill.id);
    if (level > 0) apply(skill, level);
  });
  state.ownedTools.map((id) => itemById(content.tools, id)).filter(Boolean).forEach(apply);
  multipliers.code = Math.min(1.8, multipliers.code);
  multipliers.money = Math.min(1.6, multipliers.money);
  multipliers.bug = Math.max(0.55, multipliers.bug);
  multipliers.debt = Math.max(0.55, multipliers.debt);
  multipliers.pressure = Math.max(0.55, multipliers.pressure);
  return multipliers;
}

function getProductionRisk(state) {
  const pressureRelief = attributeBonus(state, "resilience", 0.003, 0.2);
  const pressurePenalty = clamp((state.resources.pressure || 0) / 100 * 0.35 * (1 - pressureRelief), 0, 0.35);
  const debtPenalty = clamp((state.resources.techDebt || 0) / 240 * 0.25, 0, 0.25);
  const logicBugRelief = attributeBonus(state, "logic", 0.003, 0.22);
  const bugDebtBoost = 1 + clamp((state.resources.techDebt || 0) / 240 * 0.5 * (1 - logicBugRelief), 0, 0.5);

  const thresholdEffects = getPressureThresholdEffects(state);

  return {
    codeEfficiency: (1 - pressurePenalty) * (1 - debtPenalty) * (1 - thresholdEffects.codeEfficiencyPenalty),
    bugDebtBoost,
    pressurePenalty,
    debtPenalty,
    thresholdEffects
  };
}

function getProjectRiskScore(state) {
  const bugRisk = clamp((state.resources.bugs || 0) / 100, 0, 1) * 0.4;
  const debtRisk = clamp((state.resources.techDebt || 0) / 180, 0, 1) * 0.35;
  const communicationRelief = attributeBonus(state, "communication", 0.003, 0.22);
  const pressureRisk = clamp((state.resources.pressure || 0) / 100, 0, 1) * 0.25 * (1 - communicationRelief);
  return bugRisk + debtRisk + pressureRisk;
}

function getProjectSuccessRate(state, projectOrId) {
  const project = typeof projectOrId === "string" ? projectById(projectOrId) : projectOrId;
  if (!project) return 0;
  const maxSuccessRate = clamp(Number(project.maxSuccessRate) || 0.9, 0.15, 1);
  const difficulty = clamp(Number(project.difficulty) || 1, 1, 5);
  let rate = maxSuccessRate - getProjectRiskScore(state) * difficulty * 0.12;
  const progress = state.projectProgress && state.projectProgress[project.id];
  const dueWorldMinute = Number(progress && progress.dueWorldMinute);
  if (Number.isFinite(dueWorldMinute) && dueWorldMinute < Number(state.worldTimeMinutes || WORLD_START_MINUTES)) {
    rate -= 0.12;
  }
  return clamp(rate, 0.15, maxSuccessRate);
}

function getProjectRequiredSeconds(projectOrId) {
  const project = typeof projectOrId === "string" ? projectById(projectOrId) : projectOrId;
  if (!project) return 0;
  return Math.max(1, getProjectTotalStageSeconds(project) || Math.round((Number(project.minWorkHours) || 0) * 3600));
}

function getProjectProgress(state, projectOrId) {
  const project = typeof projectOrId === "string" ? projectById(projectOrId) : projectOrId;
  const id = project && project.id;
  const progress = id && state.projectProgress[id] ? state.projectProgress[id] : {};
  const stages = getProjectStages(project);
  const stageIndex = clamp(Math.floor(Number(progress.stageIndex) || 0), 0, Math.max(0, stages.length - 1));
  const stage = stages[stageIndex] || null;
  const stageRequiredSeconds = stage ? getStageRequiredSeconds(stage) : 0;
  const stageWorkedSeconds = Math.max(0, Math.min(stageRequiredSeconds || Number.POSITIVE_INFINITY, Number(progress.stageWorkedSeconds) || 0));
  const completedSeconds = stages
    .slice(0, stageIndex)
    .reduce((sum, item) => sum + getStageRequiredSeconds(item), 0);
  const workedSeconds = Math.max(0, Number(progress.workedSeconds) || completedSeconds + stageWorkedSeconds);
  const requiredSeconds = getProjectRequiredSeconds(project);
  return {
    stage,
    stageIndex,
    stageCount: stages.length,
    stageWorkedSeconds,
    stageRequiredSeconds,
    stageProgressPercent: stageRequiredSeconds > 0 ? Math.min(100, Math.floor(stageWorkedSeconds / stageRequiredSeconds * 100)) : 100,
    workedSeconds,
    requiredSeconds,
    remainingSeconds: Math.max(0, requiredSeconds - workedSeconds),
    progressPercent: requiredSeconds > 0 ? Math.min(100, Math.floor(workedSeconds / requiredSeconds * 100)) : 100,
    spentResources: normalizeSpentResources(progress.spentResources),
    failureCount: Math.max(0, Math.floor(Number(progress.failureCount) || 0)),
    acceptedAtWorldMinute: Number.isFinite(Number(progress.acceptedAtWorldMinute)) ? Math.floor(Number(progress.acceptedAtWorldMinute)) : null,
    dueWorldMinute: Number.isFinite(Number(progress.dueWorldMinute)) ? Math.floor(Number(progress.dueWorldMinute)) : null,
    legacyPrepaid: Boolean(progress.legacyPrepaid),
    resourcesPaid: Boolean(progress.resourcesPaid || progress.legacyPrepaid)
  };
}

function snapshotProjectProgress(state) {
  const snapshot = {};
  for (const project of content.projects || []) {
    const progress = getProjectProgress(state, project);
    if (progress.workedSeconds > 0) snapshot[project.id] = progress.workedSeconds;
  }
  return snapshot;
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
  if (requirements.skills && !requirements.skills.every((id) => getSkillLevel(state, id) >= 1)) return false;
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

function formatLines(lines) {
  return lines.filter((line) => line && line.trim()).join("\n");
}

function formatResourceList(values = {}) {
  const entries = Object.entries(values)
    .filter(([, value]) => value)
    .map(([key, value]) => `${RESOURCE_NAMES[key] || key} ${value > 0 ? "+" : ""}${formatNumber(value)}`);
  return entries.length ? entries.join("，") : "无";
}

function roundRate(value) {
  const rounded = Math.round((Number(value) || 0) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function formatResourceRateEntries(entries = []) {
  const formatted = entries
    .map(([key, value]) => [key, roundRate(value)])
    .filter(([, value]) => value !== 0)
    .map(([key, value]) => `${RESOURCE_NAMES[key] || key} ${value > 0 ? "+" : ""}${formatRateNumber(value)}`);
  return formatted.length ? formatted.join("，") : "无";
}

function getActivityRateSections(state, activity, options = {}) {
  const estimate = estimateActivityPerHour(state, activity, options);
  const entries = Object.entries(estimate.deltas || {});
  const gains = entries.filter(([key, value]) => value > 0 && !RISK_RESOURCE_IDS.has(key));
  const improvements = entries.filter(([key, value]) => value < 0 && RISK_RESOURCE_IDS.has(key));
  const riskCosts = entries.filter(([key, value]) => value > 0 && RISK_RESOURCE_IDS.has(key));
  const energyCost = entries.filter(([key, value]) => key === "energy" && value < 0);
  return {
    gains: gains.length ? formatResourceRateEntries(gains) : "",
    improvements: improvements.length ? formatResourceRateEntries(improvements) : "",
    risks: riskCosts.length ? formatResourceRateEntries(riskCosts) : "",
    energy: energyCost.length ? formatResourceRateEntries(energyCost) : "",
    lowEnergy: estimate.lowEnergy ? "精力不足：只能推进部分时间" : ""
  };
}

function formatActivityRateSummary(state, activity, options = {}) {
  const rateSections = getActivityRateSections(state, activity, options);
  const sections = [];
  if (rateSections.gains) sections.push(`收益/游戏小时：${rateSections.gains}`);
  if (rateSections.improvements) sections.push(`改善/游戏小时：${rateSections.improvements}`);
  if (rateSections.risks) sections.push(`风险/游戏小时：${rateSections.risks}`);
  if (rateSections.energy) sections.push(`精力消耗/游戏小时：${rateSections.energy}`);
  if (rateSections.lowEnergy) sections.push(rateSections.lowEnergy);
  return sections.length ? sections.join("；") : "当前无可见变化";
}

function getActivityRoleSummary(activity) {
  const roles = {
    "feature-coding": "核心产出",
    "bug-hunting": "质量治理",
    refactoring: "结构治理",
    study: "学习积累",
    testing: "质量验证",
    documentation: "知识沉淀",
    freelancing: "商业变现",
    "open-source": "影响力经营",
    architecture: "架构建设",
    "code-review": "评审把关",
    "performance-tuning": "性能攻坚",
    "prompt-engineering": "AI 协作",
    "incident-response": "事故止血",
    rest: "恢复节奏"
  };
  return roles[activity && activity.id] || "行动推进";
}

function getActivityUseCase(activity) {
  const useCases = {
    "feature-coding": "适合推进项目素材和主要产出。",
    "bug-hunting": "适合质量风险升温时压低缺陷。",
    refactoring: "适合维护成本变高时收束结构。",
    study: "适合缺知识、缺技能前置时积累基础。",
    testing: "适合交付前加固验证回路。",
    documentation: "适合降低交接成本并沉淀上下文。",
    freelancing: "适合需要现金流或客户线索时使用。",
    "open-source": "适合长期积累声望和外部影响力。",
    architecture: "适合复杂项目开工前打地基。",
    "code-review": "适合在合并前发现隐性问题。",
    "performance-tuning": "适合性能指标拖累交付时使用。",
    "prompt-engineering": "适合把模糊需求整理成可执行上下文。",
    "incident-response": "适合线上局面失控时先止血。",
    rest: "适合状态下滑时恢复行动节奏。"
  };
  return useCases[activity && activity.id] || "适合在当前阶段推进这类行动。";
}

function formatActivityAttributeGrowth(activity) {
  const entries = Object.entries((activity && activity.attributeExpPerHour) || {})
    .filter(([, value]) => Number(value) > 0)
    .map(([attr, value]) => `${ATTRIBUTE_NAMES[attr] || attr} +${formatNumber(value)}/h`);
  return entries.length ? entries.join("，") : "";
}

function formatProjectResourceList(values = {}) {
  const entries = Object.entries(values)
    .filter(([, value]) => value)
    .map(([key, value]) => `${RESOURCE_NAMES[key] || key} ${formatNumber(value)}`);
  return entries.length ? entries.join("，") : "无";
}

function getCharacterCardName(characterCardId) {
  const card = characterCardById(characterCardId);
  return card ? card.name : "未选择人物卡/旧档案";
}

function formatCharacterCardAttributes(card) {
  return ATTRIBUTE_IDS
    .map((id) => `${ATTRIBUTE_NAMES[id]} ${card.attributes[id]}`)
    .join("，");
}

function formatCharacterCardSkills(card) {
  const entries = Object.entries(card.skills || {}).map(([id, level]) => {
    const skill = itemById(content.skills, id);
    return `${skill ? skill.name : id} Lv.${level}`;
  });
  return entries.length ? entries.join("，") : "无";
}

function formatCharacterCardActivityLevels(card) {
  const entries = Object.entries(card.activityLevels || {}).map(([id, level]) => {
    const activity = activityById(id);
    return `${activity ? activity.name : id} Lv.${level}`;
  });
  return entries.length ? entries.join("，") : "无";
}

function formatCharacterCard(card) {
  return formatLines([
    `${card.id} - ${card.name}`,
    `  ${card.description}`,
    `  属性：${formatCharacterCardAttributes(card)}`,
    `  资源：${formatResourceList(card.resources)}`,
    `  技能：${formatCharacterCardSkills(card)}`,
    `  活动等级：${formatCharacterCardActivityLevels(card)}`
  ]);
}

function formatCharacterCards() {
  return content.characterCards.map(formatCharacterCard).join("\n");
}

function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

function formatDuration(seconds) {
  const rounded = Math.max(0, Math.ceil(seconds));
  if (rounded < 3600) return `${Math.ceil(rounded / 60)} 分钟`;
  const hours = rounded / 3600;
  return `${Number.isInteger(hours) ? hours.toFixed(0) : hours.toFixed(1)} 小时`;
}

function formatGameDuration(seconds) {
  const minutes = Math.max(0, Math.floor(seconds));
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours.toFixed(0) : hours.toFixed(1)} 小时`;
}

function formatMultiplierList(multipliers = {}) {
  const entries = Object.entries(multipliers)
    .filter(([, value]) => value && value !== 1)
    .map(([key, value]) => `${MULTIPLIER_NAMES[key] || key} x${Number(value).toFixed(2)}`);
  return entries.length ? entries.join("，") : "无";
}

function snapshotResources(resources) {
  return Object.fromEntries(RESOURCE_ORDER.map((key) => [key, Math.floor(Number(resources[key]) || 0)]));
}

function updateHourlySummarySnapshot(state) {
  state.hourlySummarySnapshot.resources = snapshotResources(state.resources);
  state.hourlySummarySnapshot.activityLevels = Object.fromEntries(
    Object.entries(state.activityLevels).map(([id, level]) => [id, { level, exp: state.activityExp[id] || 0 }])
  );
  state.hourlySummarySnapshot.attributeExp = { ...state.attributeExp };
  state.hourlySummarySnapshot.worldMinute = state.worldTimeMinutes;
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

function formatRestDeltaNumber(value) {
  const numeric = Number(value) || 0;
  const rounded = Math.round(numeric * 100) / 100;
  if (Object.is(rounded, -0)) return "0";
  return Number.isInteger(rounded) ? rounded.toString() : rounded.toString();
}

function formatRestChangedResources(deltas = {}) {
  const entries = RESOURCE_ORDER
    .map((key) => {
      const change = Number(deltas[key]) || 0;
      if (Math.abs(change) < 0.005) return "";
      return `${RESOURCE_NAMES[key] || key} ${change > 0 ? "+" : ""}${formatRestDeltaNumber(change)}`;
    })
    .filter(Boolean);
  return entries.join("，");
}

function createGameEvent(category, text, severity = "info") {
  return {
    category: EVENT_LABELS[category] ? category : "system",
    severity,
    text: String(text || "").trim()
  };
}

function pushGameEvent(events, category, text, severity = "info") {
  if (!Array.isArray(events) || !String(text || "").trim()) return;
  events.push(createGameEvent(category, text, severity));
}

function formatGameEvent(event) {
  if (!event || typeof event !== "object") return String(event || "");
  const category = EVENT_LABELS[event.category] ? event.category : "system";
  const text = String(event.text || "").trim();
  return `[${EVENT_LABELS[category]}] ${text}`;
}

function formatGameEvents(events = []) {
  return events.map(formatGameEvent);
}

function pushMessageEvent(messages, events, category, text, severity = "info") {
  if (Array.isArray(messages)) messages.push(text);
  pushGameEvent(events, category, text, severity);
}

function chooseNarrativeText(source, rng = Math.random) {
  const messages = Array.isArray(source && source.messages) ? source.messages.filter(Boolean) : [];
  if (messages.length) return String(messages[Math.min(messages.length - 1, Math.floor(rng() * messages.length))] || "");
  return String(source && source.message || "");
}

function chooseTextVariant(values = [], rng = Math.random) {
  const items = Array.isArray(values) ? values.filter(Boolean) : [];
  if (!items.length) return "";
  return String(items[Math.min(items.length - 1, Math.floor(rng() * items.length))] || "");
}

function markNarrativeTriggered(state, key) {
  if (!key) return false;
  state.triggeredNarrativeKeys = Array.isArray(state.triggeredNarrativeKeys) ? state.triggeredNarrativeKeys : [];
  if (state.triggeredNarrativeKeys.includes(key)) return false;
  state.triggeredNarrativeKeys.push(key);
  return true;
}

function pushActivityNarrativeEvents(state, activity, beforeSeconds, afterSeconds, events, options = {}) {
  const stages = Array.isArray(activity && activity.narrativeStages) ? activity.narrativeStages : [];
  if (!Array.isArray(events) || !stages.length) return;
  const rng = options.rng || Math.random;
  const day = getWorldCalendar(state.worldTimeMinutes).day;
  for (const stage of stages) {
    const threshold = Math.max(1, Math.floor(Number(stage.seconds) || 0));
    if (beforeSeconds >= threshold || afterSeconds < threshold) continue;
    const key = `activity:${day}:${activity.id}:${threshold}`;
    if (!markNarrativeTriggered(state, key)) continue;
    const text = chooseTextVariant(stage.texts, rng);
    if (text) pushGameEvent(events, "random", `活动片段：${activity.name}。${text}`);
  }
}

function pushSkillLearningLogEvents(state, skill, beforeSeconds, currentProgress, events, options = {}) {
  const logs = Array.isArray(skill && skill.learningLogs) ? skill.learningLogs : [];
  if (!Array.isArray(events) || !logs.length) return;
  const rng = options.rng || Math.random;
  const day = getWorldCalendar(state.worldTimeMinutes).day;
  const required = Math.max(1, Number(currentProgress && currentProgress.requiredSeconds) || Number(skill.learningSeconds) || 1);
  for (let index = 0; index < logs.length; index += 1) {
    const log = logs[index];
    const threshold = Math.max(1, Math.floor(Number(log && log.seconds) || required * (index + 1) / (logs.length + 1)));
    if (beforeSeconds >= threshold || currentProgress.workedSeconds < threshold) continue;
    const key = `skill:${day}:${skill.id}:log:${index}`;
    if (!markNarrativeTriggered(state, key)) continue;
    const text = typeof log === "string" ? log : chooseTextVariant(log.texts || [log.text], rng);
    if (text) pushGameEvent(events, "skill", `学习日志：${skill.name}。${text}`);
  }
}

function getAmbientModeTags(mode) {
  if (!mode || mode.type === "idle") return ["general", "rest", "recovery"];
  if (mode.type === "activity") {
    const id = mode.item && mode.item.id;
    return ["general", "work", "activity", id].filter(Boolean);
  }
  if (mode.type === "skill") return ["general", "work", "skill", "learning"];
  if (mode.type === "project") return ["general", "work", "project", "delivery"];
  return ["general", "work"];
}

function ambientEventMatchesMode(event, tags) {
  const eventTags = Array.isArray(event && event.tags) ? event.tags : [];
  return eventTags.some((tag) => tags.includes(tag));
}

function chooseAmbientEvent(state, mode, rng = Math.random) {
  const pool = Array.isArray(content.ambientEvents) ? content.ambientEvents : [];
  const tags = getAmbientModeTags(mode);
  const matches = pool.filter((event) => ambientEventMatchesMode(event, tags));
  const candidates = matches.length ? matches : pool;
  const weighted = candidates
    .map((event) => ({ event, weight: Math.max(1, Math.floor(Number(event && event.weight) || 1)) }))
    .filter((entry) => entry.event);
  const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  if (!totalWeight) return null;
  let roll = rng() * totalWeight;
  for (const entry of weighted) {
    roll -= entry.weight;
    if (roll < 0) return entry.event;
  }
  return weighted.at(-1).event;
}

function formatAmbientResourceName(key) {
  const labels = {
    energy: "状态",
    pressure: "紧绷",
    bugs: "缺陷",
    techDebt: "债务"
  };
  return labels[key] || RESOURCE_NAMES[key] || key;
}

function formatSignedDelta(label, value) {
  const rounded = Math.round(Number(value) || 0);
  if (!rounded) return "";
  return `${label} ${rounded > 0 ? "+" : ""}${rounded}`;
}

function formatAmbientSummary(summary = {}) {
  return [
    ...Object.entries(summary.resources || {})
      .map(([key, value]) => formatSignedDelta(formatAmbientResourceName(key), value)),
    ...Object.entries(summary.attributeExp || {})
      .map(([key, value]) => formatSignedDelta(`${ATTRIBUTE_NAMES[key] || key}经验`, value)),
    summary.activityExp
      ? formatSignedDelta(`${summary.activityName || "活动"}熟练度`, summary.activityExp)
      : ""
  ].filter(Boolean).join("，");
}

function applyAmbientEvent(state, event, mode, options = {}) {
  const effects = event && event.effects ? event.effects : {};
  const summary = { resources: {}, attributeExp: {}, activityExp: 0, activityName: "" };
  for (const [key, rawDelta] of Object.entries(effects.resources || {})) {
    if (!RESOURCE_ORDER.includes(key)) continue;
    const applied = applyResourceDelta(state, key, Math.floor(Number(rawDelta) || 0));
    if (applied) summary.resources[key] = (summary.resources[key] || 0) + applied;
  }
  if (mode && mode.type === "activity" && mode.item && effects.activityExp) {
    const applied = applyActivityExpDelta(state, mode.item.id, Math.floor(Number(effects.activityExp) || 0));
    summary.activityExp = applied.applied;
    summary.activityName = mode.item.name;
    if (applied.levelUps > 0) {
      pushGameEvent(options.events, "skill", `${mode.item.name}提升到 Lv.${getActivityLevel(state, mode.item.id)}。`, "good");
    }
  }
  for (const [attr, rawAmount] of Object.entries(effects.attributeExp || {})) {
    if (!ATTRIBUTE_IDS.includes(attr)) continue;
    const amount = Math.floor(Number(rawAmount) || 0);
    if (amount > 0) {
      addAttributeExp(state, attr, amount, { events: options.events });
      summary.attributeExp[attr] = (summary.attributeExp[attr] || 0) + amount;
    } else if (amount < 0) {
      const before = Math.floor(Number(state.attributeExp[attr]) || 0);
      state.attributeExp[attr] = Math.max(0, before + amount);
      const applied = state.attributeExp[attr] - before;
      if (applied) summary.attributeExp[attr] = (summary.attributeExp[attr] || 0) + applied;
    }
  }
  clampState(state);
  return summary;
}

function formatAmbientEvent(event, message, summary) {
  const summaryText = formatAmbientSummary(summary);
  return `工作插曲：${event && event.name ? `${event.name}。` : ""}${message}${summaryText ? ` 变化：${summaryText}。` : ""}`;
}

function maybeApplyAmbientEvents(state, mode, processedSeconds, events, options = {}) {
  if (options.randomEvents === false || processedSeconds <= 0) return 0;
  const rng = options.rng || Math.random;
  const expected = processedSeconds / (AMBIENT_EVENT_INTERVAL_MINUTES * 60);
  let count = Math.floor(expected);
  if (count < AMBIENT_EVENT_MAX_PER_SETTLE && rng() < expected - count) count += 1;
  count = Math.min(AMBIENT_EVENT_MAX_PER_SETTLE, Math.max(0, count));
  let appliedCount = 0;
  for (let index = 0; index < count; index += 1) {
    const event = chooseAmbientEvent(state, mode, rng);
    if (!event) continue;
    const message = chooseNarrativeText(event, rng);
    const summary = applyAmbientEvent(state, event, mode, { events });
    pushGameEvent(events, "random", formatAmbientEvent(event, message, summary), event.severity || "info");
    appliedCount += 1;
  }
  return appliedCount;
}

function formatProjectFeedback(project, success, rng = Math.random) {
  const pool = success ? project.successFeedback : project.failureFeedback;
  const fallback = success
    ? [`客户反馈：“${project.name} 可以上线了，先让真实用户检验它。”`, "个人感悟：这次交付把想法变成了可以验收的成果。"]
    : [`复盘记录：“${project.name} 暂时没能扛住验收，但暴露的问题足够具体。”`, "个人感悟：失败没有返还投入，却留下了下一轮更清楚的边界。"];
  return chooseTextVariant(pool && pool.length ? pool : fallback, rng);
}

const ATTRIBUTE_GROWTH_LINES = {
  logic: "你开始更早发现边界条件，方案评审里的问题也变得更尖锐。",
  focus: "你能在更长的上下文里保持清醒，杂音不再轻易打断思路。",
  learning: "你学会了把陌生概念拆成练习路径，吸收新技术不再全靠硬扛。",
  communication: "你开始把技术判断翻译成人能听懂的取舍，协作成本明显下降。",
  resilience: "线上抖动和临时变更不再立刻击穿心态，你能先止血再复盘。",
  creativity: "你更擅长把零散想法拼成可交付的形状，方案里有了自己的味道。"
};

function collectAttributeGrowthEvents(state, attr, beforeValue, afterValue, events) {
  if (!Array.isArray(events)) return;
  for (const threshold of [20, 40, 60, 80]) {
    if (beforeValue >= threshold || afterValue < threshold) continue;
    const key = `attribute:${attr}:${threshold}`;
    if (!markNarrativeTriggered(state, key)) continue;
    pushGameEvent(events, "career", `成长：${ATTRIBUTE_NAMES[attr] || attr} 达到 ${threshold}。${ATTRIBUTE_GROWTH_LINES[attr] || "你感觉自己变得更可靠了一点。"}`, "good");
  }
  const card = characterCardById(state.characterCardId);
  for (const node of card && Array.isArray(card.growthNodes) ? card.growthNodes : []) {
    const threshold = Math.max(1, Math.floor(Number(node.threshold) || 0));
    if (node.attr !== attr || beforeValue >= threshold || afterValue < threshold) continue;
    const key = `card:${card.id}:${attr}:${threshold}`;
    if (!markNarrativeTriggered(state, key)) continue;
    pushGameEvent(events, "career", `人物成长：${card.name}。${node.text}`, "good");
  }
}

function getTodaySummary(state) {
  // 统计今日已完成的活动（从当天 09:00 开始算起）
  const todayStartMinutes = Math.floor(state.worldTimeMinutes / (24 * 60)) * (24 * 60) + 9 * 60;
  const elapsedMinutes = Math.max(0, state.worldTimeMinutes - todayStartMinutes);

  // 简化版：显示总活动时长（未来可以按活动类型细分）
  const activeHours = Math.floor(elapsedMinutes / 60);
  const activeMinutes = elapsedMinutes % 60;

  if (activeHours > 0 || activeMinutes > 0) {
    return `已工作 ${activeHours}h${activeMinutes}m`;
  }
  return "刚开始新的一天";
}

function getProgressPreview(state) {
  const energy = Math.floor(state.resources.energy || 0);
  const maxEnergy = 100;
  const claimableGoals = content.goals.filter((g) => isGoalCompleted(state, g) && !isGoalClaimed(state, g));
  const parts = [];

  parts.push(`精力 ${energy}/${maxEnergy}`);

  if (state.activeProjectId) {
    const project = projectById(state.activeProjectId);
    if (project) {
      const progress = getProjectProgress(state, project);
      parts.push(`项目进度 ${Math.floor(progress * 100)}%`);
    }
  }

  if (claimableGoals.length > 0) {
    parts.push(`待办：${claimableGoals.length}个目标可领取`);
  }

  return parts.join(" | ");
}

function getNextMilestone(state) {
  const minutes = state.worldTimeMinutes % (24 * 60);

  // 下个关键时间点
  if (minutes < 9 * 60) return "09:00 开始工作";
  if (minutes < 12 * 60) return "12:00 午间休整";
  if (minutes < 14 * 60) return "14:00 下午工作";
  if (minutes < 18 * 60) return "18:00 晚间时段";
  if (minutes < 21 * 60) return "21:00 深夜休整";
  return "次日 09:00 开始工作";
}

function createTuiTicker(state, result = null, changedResources = "") {
  // 检测一天结束状态
  if (state.dayEndSummaryPending) {
    const summary = state.dayEndSummaryPending.summary;
    const totalMinutes = summary.workTime.morning + summary.workTime.afternoon + summary.workTime.evening;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    const resourceStr = summary.resources && Object.keys(summary.resources).length > 0
      ? formatChangedResources({}, summary.resources)
      : "无明显变化";

    return [
      `[一天结束] D${summary.day} ${summary.weekday}`,
      `[工作时长] ${hours}h${minutes}m | ${summary.activities.length}个活动`,
      `[资源变化] ${resourceStr}`
    ];
  }

  syncScheduledActiveMode(state);

  // 检测阶段转换状态
  if (state.phaseTransitionPending) {
    const pending = state.phaseTransitionPending;
    const fromPhase = SCHEDULE_PHASE_BY_ID[pending.fromPhase];
    const toPhase = SCHEDULE_PHASE_BY_ID[pending.toPhase];
    const nextSlot = state.lockedSchedule?.slots[pending.toPhase];
    const nextTaskName = nextSlot
      ? nextSlot.type === "activity"
        ? activityById(nextSlot.id)?.name
        : nextSlot.type === "skill"
          ? itemById(content.skills, nextSlot.id)?.name
          : nextSlot.type === "project"
            ? projectById(nextSlot.id)?.name
            : "休息"
      : "未安排";

    return [
      `[阶段转换] ${fromPhase.name} 已结束`,
      `[本阶段总结] ${pending.summary.outputSummary}`,
      `[下阶段] ${toPhase.name} (${formatScheduleTimeRange(toPhase)}) - 原计划：${nextTaskName}`
    ];
  }

  // 检测提前完成状态（只显示一次）
  if (state.earlyCompletionPending && !state.earlyCompletionPending.displayed) {
    const pending = state.earlyCompletionPending;
    const phase = SCHEDULE_PHASE_BY_ID[pending.phaseId];
    const completedTaskName = pending.completedTask.type === "activity"
      ? activityById(pending.completedTask.id)?.name
      : pending.completedTask.type === "skill"
        ? itemById(content.skills, pending.completedTask.id)?.name
        : pending.completedTask.type === "project"
          ? projectById(pending.completedTask.id)?.name
          : "任务";
    const remainingHours = Math.floor(pending.remainingMinutes / 60);
    const remainingMinutes = pending.remainingMinutes % 60;

    // 标记为已显示，避免重复提示
    state.earlyCompletionPending.displayed = true;

    return [
      `[提前完成] ${completedTaskName} 已完成！`,
      `[阶段剩余] ${phase.name} 还剩 ${remainingHours}h${remainingMinutes}m`,
      `[当前时间] ${formatWorldCalendar(state, "short")}`
    ];
  }

  const activeSeconds = result && Number(result.activeSeconds) > 0 ? Math.floor(Number(result.activeSeconds)) : 0;
  const activeName = result && result.activeName;
  if (activeSeconds > 0 && activeName) {
    const summary = changedResources || "进度推进";
    const todaySummary = getTodaySummary(state);
    const progressPreview = getProgressPreview(state);
    const phaseStatus = formatPhaseStatus(state);
    return [
      `[当前行动] ${activeName} ${activeSeconds} 秒：${summary} | ${todaySummary}`,
      phaseStatus,
      `[进度预览] ${progressPreview}`,
      `[当前时间] ${formatWorldCalendar(state, "short")} | 下次节点：${getNextMilestone(state)}`
    ];
  }

  const restTick = result && result.restTick;
  const restSeconds = restTick && Number(restTick.seconds) > 0 ? Math.floor(Number(restTick.seconds)) : 0;
  if (restSeconds > 0 && restTick.name) {
    const resourceSummary = formatRestChangedResources(restTick.deltas);
    const sideEffect = resourceSummary && restTick.sideEffectSummary ? `，${restTick.sideEffectSummary}` : "";
    const summary = `${resourceSummary || restTick.defaultSummary}${sideEffect}`;
    const todaySummary = getTodaySummary(state);
    const progressPreview = getProgressPreview(state);
    const phaseStatus = formatPhaseStatus(state);
    return [
      `[当前行动] ${restTick.name} ${restSeconds} 秒：${summary} | ${todaySummary}`,
      phaseStatus,
      `[进度预览] ${progressPreview}`,
      `[当前时间] ${formatWorldCalendar(state, "short")} | 下次节点：${getNextMilestone(state)}`
    ];
  }

  const phase = getCurrentSchedulePhase(state.worldTimeMinutes);
  const mode = getActiveMode(state);
  const restWindow = getRestWindow(state, state.worldTimeMinutes);
  const restStatus = restWindow ? getLifestyleRestTickerMeta(state, restWindow) : null;
  const status = mode.type !== "idle"
    ? mode.type === "project"
      ? `项目 ${mode.item.name}`
      : mode.type === "skill"
        ? `学习 ${mode.item.name}`
        : `活动 ${mode.item.name}`
    : state.waitingForSchedule
      ? "等待排程"
      : restStatus
        ? `${restStatus.name}：${restStatus.defaultSummary}`
      : phase
        ? `${phase.name}休整`
        : "休整";
  const todaySummary = getTodaySummary(state);
  const progressPreview = getProgressPreview(state);
  const phaseStatus = formatPhaseStatus(state);
  return [
    `[当前状态] ${status} | ${todaySummary}`,
    phaseStatus,
    `[进度预览] ${progressPreview}`,
    `[当前时间] ${formatWorldCalendar(state, "short")} | 下次节点：${getNextMilestone(state)}`
  ];
}

function formatPhaseStatus(state) {
  if (!state.lockedSchedule) return "[阶段进度] 未安排日程";

  const progress = state.currentPhaseProgress;
  if (!progress) return "[阶段进度] 非工作时段";

  const phase = SCHEDULE_PHASE_BY_ID[progress.phaseId];
  const percent = Math.floor((progress.elapsedMinutes / progress.totalMinutes) * 100);
  const barLength = 10;
  const filledLength = Math.floor(barLength * percent / 100);
  const bar = "█".repeat(filledLength) + "░".repeat(barLength - filledLength);

  let status = `[阶段进度] ${phase.name} ${bar} ${percent}%`;

  // 显示任务完成预期
  if (progress.taskEstimatedCompletion) {
    const minuteOfDay = state.worldTimeMinutes % MINUTES_PER_DAY;
    const phaseRemaining = progress.endMinute - minuteOfDay;
    const taskRemaining = progress.taskEstimatedCompletion - state.worldTimeMinutes;

    if (taskRemaining <= 0) {
      status += ` | 任务已完成`;
    } else if (taskRemaining <= phaseRemaining) {
      const remainingHours = Math.floor(taskRemaining / 60);
      const remainingMinutes = taskRemaining % 60;
      if (remainingHours > 0) {
        status += ` | 预计 ${remainingHours}h${remainingMinutes}m 后完成`;
      } else {
        status += ` | 预计 ${remainingMinutes}m 后完成`;
      }
    } else {
      const overMinutes = taskRemaining - phaseRemaining;
      const overHours = Math.floor(overMinutes / 60);
      if (overHours > 0) {
        status += ` | 需要额外 ${overHours}h`;
      } else {
        status += ` | 需要额外 ${overMinutes}m`;
      }
    }
  }

  return status;
}

function collectBugRiskEvents(state, beforeResources, afterResources, events) {
  state.warnedBugRiskThresholds = normalizeBugRiskThresholds(state.warnedBugRiskThresholds);
  const before = Math.floor(Number(beforeResources && beforeResources.bugs) || 0);
  const after = Math.floor(Number(afterResources && afterResources.bugs) || 0);
  for (const threshold of BUG_RISK_THRESHOLDS) {
    if (state.warnedBugRiskThresholds.includes(threshold)) continue;
    if (before < threshold && after >= threshold) {
      state.warnedBugRiskThresholds.push(threshold);
      pushGameEvent(events, "warning", `Bug 风险升至 ${threshold}+，建议安排排查 Bug 或写测试。`, threshold >= 75 ? "danger" : "warn");
    }
  }
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

function formatAttributeRequirements(requirements = {}) {
  const entries = Object.entries(requirements || {})
    .filter(([, value]) => value > 0)
    .map(([attr, value]) => `${ATTRIBUTE_NAMES[attr] || attr} ${formatNumber(value)}`);
  return entries.length ? entries.join("，") : "无";
}

function missingAttributeRequirements(state, requirements = {}) {
  return Object.entries(requirements || {})
    .filter(([attr, value]) => getBaseAttribute(state, attr) < value)
    .map(([attr, value]) => `${ATTRIBUTE_NAMES[attr] || attr} ${formatNumber(value - getBaseAttribute(state, attr))}`);
}

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

function formatSkillUpgradeCost(state, skill) {
  const progress = getSkillProgress(state, skill.id);
  if (progress.level <= 0) return "需先学习";
  if (progress.level >= 5) return "满级";
  const targetLevel = progress.level + 1;
  return `${SKILL_LEVEL_NAMES[targetLevel]}：经验 ${formatNumber(progress.exp)}/${formatNumber(SKILL_EXP_THRESHOLDS[progress.level])}，资源 ${formatResourceList(getSkillUpgradeCost(skill, targetLevel))}，属性 ${formatAttributeRequirements(getSkillUpgradeAttributeRequirements(skill, targetLevel))}`;
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
      return `${activity.id} - ${activity.name} [${status}] Lv.${progress.level} 等级经验 ${formatNumber(progress.exp)}/${formatNumber(progress.next)}，解锁：${formatActivityRequirements(activity.requirements)}，产出：${formatActivityRateSummary(state, activity)}。${activity.description}`;
    })
  ]);
}

function applyResourceDelta(state, key, rawDelta) {
  if (!rawDelta) return 0;
  const before = state.resources[key] || 0;
  if (key === "energy") {
    state.resources.energy = clamp(before + rawDelta, 0, getEffectiveMaxEnergy(state));
  } else if (key === "pressure") {
    state.resources.pressure = clamp(before + rawDelta, 0, 100);
  } else {
    state.resources[key] = Math.max(0, before + rawDelta);
  }
  if (Math.abs(state.resources[key]) < RESOURCE_EPSILON) state.resources[key] = 0;
  return state.resources[key] - before;
}

function applyResourceDeltaTo(resources, key, rawDelta, maxEnergy = ENERGY_MAX) {
  if (!rawDelta) return 0;
  const before = resources[key] || 0;
  if (key === "energy") {
    resources.energy = clamp(before + rawDelta, 0, maxEnergy);
  } else if (key === "pressure") {
    resources.pressure = clamp(before + rawDelta, 0, 100);
  } else {
    resources[key] = Math.max(0, before + rawDelta);
  }
  if (Math.abs(resources[key]) < RESOURCE_EPSILON) resources[key] = 0;
  return resources[key] - before;
}

function mergeDelta(target, key, value) {
  if (!value) return;
  target[key] = (target[key] || 0) + value;
}

function applyActivityDeltaEntries(state, entries = []) {
  const deltas = {};
  for (const [key, rawDelta] of entries) {
    const applied = applyResourceDelta(state, key, rawDelta);
    mergeDelta(deltas, key, applied);
  }
  return deltas;
}

function previewActivityDeltaEntries(state, entries = []) {
  const resources = { ...state.resources };
  const deltas = {};
  const maxEnergy = getEffectiveMaxEnergy(state);
  for (const [key, rawDelta] of entries) {
    const applied = applyResourceDeltaTo(resources, key, rawDelta, maxEnergy);
    mergeDelta(deltas, key, applied);
  }
  return deltas;
}

function perHourToPerGameMinute(value) {
  return (Number(value) || 0) / GAME_MINUTES_PER_HOUR;
}

function getProjectEnergyCostPerHour(project) {
  const difficulty = clamp(Math.floor(Number(project && project.difficulty) || 1), 1, 5);
  return PROJECT_ENERGY_COST_PER_HOUR_BY_DIFFICULTY[difficulty] || PROJECT_ENERGY_COST_PER_HOUR_BY_DIFFICULTY[1];
}

function getActivityEnergyCostPerHour(activity) {
  if (!activity) return 0;
  return Number(activity.energyCostPerHour ?? ACTIVITY_ENERGY_COST_PER_HOUR[activity.id] ?? 8) || 0;
}

function getWorkEnergyCostPerGameMinute(mode, overtime = false) {
  if (!mode || !mode.item) return 0;
  let perHour = 0;
  if (mode.type === "activity") perHour = getActivityEnergyCostPerHour(mode.item);
  if (mode.type === "skill") perHour = SKILL_ENERGY_COST_PER_HOUR;
  if (mode.type === "project") perHour = getProjectEnergyCostPerHour(mode.item);
  return perHourToPerGameMinute(perHour) * (overtime ? 1.25 : 1);
}

function getAffordableWorkSeconds(state, costPerGameMinute, seconds) {
  const duration = Math.max(0, Number(seconds) || 0);
  const cost = Math.max(0, Number(costPerGameMinute) || 0);
  if (duration <= 0 || cost <= 0) return duration;
  const energy = Math.max(0, Number(state.resources.energy) || 0);
  if (energy <= 0) return 0;
  return Math.min(duration, energy / cost);
}

function consumeWorkEnergy(state, costPerGameMinute, seconds) {
  const cost = Math.max(0, Number(costPerGameMinute) || 0) * Math.max(0, Number(seconds) || 0);
  return cost > 0 ? applyResourceDelta(state, "energy", -cost) : 0;
}

function getActivityRateContext(state, activity, options = {}) {
  const energyStatus = getEnergyStatus(state);
  const level = getActivityLevel(state, activity.id);
  const activityMultiplier = 1 + (level - 1) * 0.08;
  const attributeMultiplier = 1 + attributeBonus(state, activity.primaryAttribute, 0.0025, 0.22);
  const overtimeRelief = options.overtime ? attributeBonus(state, "focus", 0.003, 0.24) : 0;
  const overtimeFactor = options.overtime ? 0.45 + overtimeRelief * 0.5 : 1;
  const focus = getWeeklyFocus(state);
  const learningFocusFactor = focus.id === "learning" && activity.id === "study" ? focus.learning : 1;
  const qualityFactor = focus.id === "quality" && QUALITY_ACTIVITY_IDS.has(activity.id) ? focus.quality : 1;
  const productivityFactor = activity.id === "rest" ? 1 : energyStatus.productivityMultiplier;
  const maintenanceFactor = getMaintenanceActivityFactor(state, activity);
  return {
    activityMultiplier,
    attributeMultiplier,
    energyStatus,
    focus,
    learningFocusFactor,
    multipliers: getMultipliers(state),
    outputFactor: activityMultiplier * attributeMultiplier * productivityFactor * overtimeFactor * learningFocusFactor * qualityFactor * maintenanceFactor,
    mitigationFactor: activityMultiplier * attributeMultiplier * productivityFactor * overtimeFactor * qualityFactor,
    maintenanceFactor,
    overtimeFactor,
    qualityFactor,
    pressureRecoveryMultiplier: getPressureRecoveryMultiplier(state),
    risk: getProductionRisk(state)
  };
}

function getMaintenanceActivityFactor(state, activity) {
  const id = activity && activity.id;
  const bugs = Number(state.resources.bugs) || 0;
  const techDebt = Number(state.resources.techDebt) || 0;
  if (id === "bug-hunting") return clamp(bugs / 30, 0.4, 1);
  if (id === "refactoring") return clamp(techDebt / 30, 0.4, 1);
  if (id === "code-review") return clamp(Math.max(bugs, techDebt) / 30, 0.4, 1);
  if (id === "incident-response") return clamp(bugs / 50, 0.25, 1);
  return 1;
}

function activityRateToDelta(ratePerHour, gameMinutes) {
  return perHourToPerGameMinute(ratePerHour) * Math.max(0, Number(gameMinutes) || 0);
}

function calculateActivityDeltaEntries(state, activity, gameMinutes, options = {}) {
  const context = getActivityRateContext(state, activity, options);
  const entries = [];
  const energyCostPerGameMinute = Number(options.energyCostPerGameMinute) || 0;
  const duration = Math.max(0, Number(gameMinutes) || 0);
  if (energyCostPerGameMinute > 0) entries.push(["energy", -energyCostPerGameMinute * duration]);

  for (const [key, rate] of Object.entries(activity.outputsPerHour || {})) {
    let delta = activityRateToDelta(rate, duration);
    if (key === "energy" && activity.id === "rest") delta *= context.pressureRecoveryMultiplier;
    else delta *= context.outputFactor;
    if (key === "codeLines" && delta > 0) delta *= context.multipliers.code * context.risk.codeEfficiency;
    if (key === "money" && delta > 0) delta *= context.multipliers.money;
    if (key === "money" && delta > 0 && context.focus.id === "freelance") delta *= context.focus.money;
    if (key === "codeLines" && delta > 0 && context.focus.id === "quality") delta *= context.focus.code;
    if (key === "money" && delta > 0 && context.focus.id === "quality") delta *= context.focus.money;
    entries.push([key, delta]);
  }

  for (const [key, rate] of Object.entries(activity.mitigationPerHour || {})) {
    let delta = -activityRateToDelta(rate, duration) * context.mitigationFactor;
    if (key === "bugs") delta *= 1 + attributeBonus(state, "logic", 0.004, 0.32);
    if (key === "techDebt") delta *= 1 + attributeBonus(state, "logic", 0.003, 0.24);
    if (key === "pressure") delta *= 1 + attributeBonus(state, "resilience", 0.004, 0.32);
    entries.push([key, delta]);
  }

  for (const [key, rate] of Object.entries(activity.risksPerHour || {})) {
    let delta = activityRateToDelta(rate, duration);
    if (key === "bugs") delta *= context.multipliers.bug * context.risk.bugDebtBoost * (1 + (context.risk.thresholdEffects?.bugRiskIncrease || 0));
    if (key === "techDebt") delta *= context.multipliers.debt;
    if (key === "pressure") delta *= context.multipliers.pressure;
    if (RISK_RESOURCE_IDS.has(key)) delta *= context.energyStatus.riskMultiplier;
    if (key === "pressure" && context.focus.id === "freelance") delta *= context.focus.pressure;
    if (options.overtime && (key === "bugs" || key === "techDebt")) delta *= 1.8 * (1 - attributeBonus(state, "logic", 0.004, 0.3));
    if (options.overtime && key === "pressure") delta *= 1.5 * (1 - attributeBonus(state, "resilience", 0.004, 0.3));
    entries.push([key, delta]);
  }

  if (options.overtime) {
    const resilienceRelief = attributeBonus(state, "resilience", 0.004, 0.3);
    entries.push(["pressure", duration * 0.003 * context.energyStatus.riskMultiplier * (1 - resilienceRelief)]);
  }
  return { entries, context };
}

function estimateActivityPerHour(state, activity, options = {}) {
  const energyCostPerGameMinute = perHourToPerGameMinute(getActivityEnergyCostPerHour(activity)) * (options.overtime ? 1.25 : 1);
  const workMinutes = getAffordableWorkSeconds(state, energyCostPerGameMinute, GAME_MINUTES_PER_HOUR);
  const { entries } = calculateActivityDeltaEntries(state, activity, workMinutes, { ...options, energyCostPerGameMinute });
  return {
    deltas: previewActivityDeltaEntries(state, entries),
    lowEnergy: energyCostPerGameMinute > 0 && workMinutes < GAME_MINUTES_PER_HOUR,
    minutes: workMinutes
  };
}

function settleActivity(state, activity, seconds, options = {}) {
  const energyCostPerGameMinute = Number(options.energyCostPerGameMinute) || 0;
  if (activity.id !== "rest" && energyCostPerGameMinute > 0 && seconds <= 0) {
    return { deltas: {}, levelUps: 0, lowEnergy: true };
  }
  const beforeActivitySeconds = Number(state.activityStats.byActivity[activity.id]) || 0;
  const { entries, context } = calculateActivityDeltaEntries(state, activity, seconds, options);
  const deltas = applyActivityDeltaEntries(state, entries);
  state.stats.totalCodeLines += Math.max(0, deltas.codeLines || 0);
  state.stats.totalBugsFixed += Math.max(0, -(deltas.bugs || 0));
  state.activityStats.totalActiveSeconds += seconds;
  state.activityStats.byActivity[activity.id] = (state.activityStats.byActivity[activity.id] || 0) + seconds;
  pushActivityNarrativeEvents(state, activity, beforeActivitySeconds, state.activityStats.byActivity[activity.id], options.events, options);

  const levelUps = addActivityExp(state, activity.id, activityRateToDelta(activity.activityExpPerHour, seconds) * context.attributeMultiplier * context.overtimeFactor * context.learningFocusFactor * context.qualityFactor * context.maintenanceFactor);
  for (const [attr, amount] of Object.entries(activity.attributeExpPerHour || {})) {
    addAttributeExp(state, attr, activityRateToDelta(amount, seconds), { events: options.events });
  }

  return { deltas, levelUps, lowEnergy: activity.id !== "rest" && energyCostPerGameMinute > 0 && state.resources.energy <= 0 };
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
  if (!Number.isFinite(Number(progress.acceptedAtWorldMinute))) progress.acceptedAtWorldMinute = Math.max(0, Math.floor(Number(state.worldTimeMinutes) || WORLD_START_MINUTES));
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

function ensureSkillLearningProgress(state, skillId) {
  state.skillLearningProgress[skillId] = state.skillLearningProgress[skillId] || { workedSeconds: 0, resourcesPaid: false };
  state.skillLearningProgress[skillId].workedSeconds = Math.max(0, Number(state.skillLearningProgress[skillId].workedSeconds) || 0);
  state.skillLearningProgress[skillId].resourcesPaid = Boolean(state.skillLearningProgress[skillId].resourcesPaid);
  return state.skillLearningProgress[skillId];
}

function getSkillLearningProgress(state, skillOrId) {
  const skill = typeof skillOrId === "string" ? itemById(content.skills, skillOrId) : skillOrId;
  const id = skill && skill.id;
  const progress = id && state.skillLearningProgress[id] ? state.skillLearningProgress[id] : {};
  const workedSeconds = Math.max(0, Number(progress.workedSeconds) || 0);
  const learningRelief = attributeBonus(state, "learning", 0.0025, 0.2);
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

function settleSkillLearning(state, skill, seconds, options = {}) {
  const progress = ensureSkillLearningProgress(state, skill.id);
  const beforeSeconds = Number(progress.workedSeconds) || 0;
  progress.workedSeconds += seconds * (options.workMultiplier || 1);
  const currentProgress = getSkillLearningProgress(state, skill);
  pushSkillLearningLogEvents(state, skill, beforeSeconds, currentProgress, options.events, options);
  if (currentProgress.workedSeconds < currentProgress.requiredSeconds) return [];

  const skillProgress = ensureSkillProgress(state, skill.id);
  skillProgress.level = Math.max(skillProgress.level, 1);
  clearSkillLearningProgress(state, skill.id);
  syncUnlockedSkills(state);
  const completionText = skill.completionReflection ? `学习总结：${skill.completionReflection}` : "";
  const message = formatLines([
    `技能 ${skill.name} 学习完成，达到 ${SKILL_LEVEL_NAMES[1]}。`,
    completionText,
    formatNextAdvice(state)
  ]);
  pushGameEvent(options.events, "skill", `技能 ${skill.name} 学习完成，达到 ${SKILL_LEVEL_NAMES[1]}。${completionText ? completionText : ""}`, "good");
  return [message];
}

function scaleSkillExpRewards(rewards = {}, multiplier = 1) {
  return Object.fromEntries(Object.entries(rewards || {}).map(([id, amount]) => [id, amount * multiplier]));
}

function applyProjectRewards(state, project, options = {}) {
  const kind = project.kind || "milestone";
  const firstSuccess = !state.completedProjects.includes(project.id);
  const rewardScale = kind === "commission" || firstSuccess ? 1 : 0.05;
  const rewardMultiplier = options.rewardMultiplier || 1;
  const moneyReward = (project.rewards.money || 0) * rewardScale * rewardMultiplier;
  state.resources.money += moneyReward;
  const reputationReward = kind === "commission" || firstSuccess ? project.rewards.reputation || 0 : 0;
  state.resources.reputation += reputationReward;
  if (firstSuccess) {
    state.completedProjects.push(project.id);
  }
  if (kind === "commission" || firstSuccess) {
    state.stats.totalProjects += 1;
  }
  if (firstSuccess) applyAttributeExpRewards(state, project.attributeExp, { events: options.events });
  return {
    firstSuccess,
    rewards: {
      money: moneyReward,
      reputation: reputationReward
    },
    skillExp: addSkillExp(state, scaleSkillExpRewards(project.skillExpRewards, rewardScale), options.skillExpMultiplier || 1)
  };
}

function getStageResourceCost(stage, stageRequiredSeconds, seconds) {
  const ratio = stageRequiredSeconds > 0 ? Math.max(0, Number(seconds) || 0) / stageRequiredSeconds : 0;
  return Object.fromEntries(Object.entries(stage.resources || {}).map(([key, value]) => [key, (Number(value) || 0) * ratio]));
}

function getAffordableProjectStageSeconds(state, progress, stage, stageRequiredSeconds, requestedSeconds) {
  const requested = Math.max(0, Number(requestedSeconds) || 0);
  if (requested <= 0 || progress.legacyPrepaid) return requested;
  let affordable = requested;
  for (const [key, total] of Object.entries(stage.resources || {})) {
    const costPerSecond = (Number(total) || 0) / Math.max(1, stageRequiredSeconds);
    if (costPerSecond <= 0) continue;
    const available = Math.max(0, Number(state.resources[key]) || 0);
    affordable = Math.min(affordable, available / costPerSecond);
  }
  return Math.max(0, affordable);
}

function consumeProjectStageResources(state, progress, stage, stageRequiredSeconds, seconds, deltas = null) {
  if (progress.legacyPrepaid) return {};
  const cost = getStageResourceCost(stage, stageRequiredSeconds, seconds);
  const spent = {};
  progress.spentResources = progress.spentResources || {};
  for (const [key, value] of Object.entries(cost)) {
    if (!value) continue;
    const applied = applyResourceDelta(state, key, -value);
    spent[key] = -applied;
    progress.spentResources[key] = (progress.spentResources[key] || 0) + (-applied);
    if (deltas && applied) deltas[key] = (deltas[key] || 0) + applied;
  }
  return spent;
}

function formatProjectMaterialShortfall(state, stage) {
  return formatShortfall(state.resources, stage && stage.resources || {});
}

function getStageSuccessRate(state, project, stage) {
  const maxSuccessRate = clamp(Number(project.maxSuccessRate) || 0.9, 0.15, 1);
  return clamp(getProjectSuccessRate(state, project) + (Number(stage && stage.successModifier) || 0), 0.15, maxSuccessRate);
}

function applyProjectStageFailure(state, project, stage, progress, options = {}) {
  progress.failureCount = Math.max(0, Number(progress.failureCount) || 0) + 1;
  const deltas = stage.failureDeltas || PROJECT_FAILURE_DELTAS_BY_DIFFICULTY[clamp(Math.floor(Number(project.difficulty) || 1), 1, 5)] || {};
  const appliedDeltas = {};
  for (const [key, value] of Object.entries(deltas || {})) {
    const applied = applyResourceDelta(state, key, value);
    if (applied) {
      appliedDeltas[key] = applied;
      if (options.deltas) options.deltas[key] = (options.deltas[key] || 0) + applied;
    }
  }
  const stageRatio = getStageRequiredSeconds(stage) / Math.max(1, getProjectRequiredSeconds(project));
  const failedSkillExp = addSkillExp(state, scaleSkillExpRewards(project.skillExpRewards, stageRatio * 0.1), options.skillExpMultiplier || 1);
  progress.stageWorkedSeconds = getStageRequiredSeconds(stage) * 0.5;
  progress.workedSeconds = getProjectStages(project)
    .slice(0, progress.stageIndex)
    .reduce((sum, item) => sum + getStageRequiredSeconds(item), 0) + progress.stageWorkedSeconds;
  return { appliedDeltas, failedSkillExp };
}

function settleProject(state, project, seconds, options = {}) {
  const progress = ensureProjectProgress(state, project.id);
  ensureProjectDeadline(state, project);
  let remainingWork = Math.max(0, Number(seconds) || 0) * (options.workMultiplier || 1);
  let actualWorkedSeconds = 0;
  const messages = [];
  const rng = options.rng || Math.random;
  let blocked = false;

  while (remainingWork > 0 && state.projectProgress[project.id]) {
    const stages = getProjectStages(project);
    const stage = stages[progress.stageIndex];
    if (!stage) break;
    const stageRequiredSeconds = getStageRequiredSeconds(stage);
    const stageRemaining = Math.max(0, stageRequiredSeconds - progress.stageWorkedSeconds);

    if (stageRemaining > 0.000001) {
      const requested = Math.min(remainingWork, stageRemaining);
      const affordable = getAffordableProjectStageSeconds(state, progress, stage, stageRequiredSeconds, requested);

      if (affordable <= 0.000001) {
        blocked = true;
        messages.push(formatLines([
          `项目素材不足：${project.name} / ${stage.name} 无法继续推进。`,
          formatProjectMaterialShortfall(state, stage),
          formatNextAdvice(state)
        ]));
        break;
      }

      consumeProjectStageResources(state, progress, stage, stageRequiredSeconds, affordable, options.deltas);
      progress.stageWorkedSeconds += affordable;
      progress.workedSeconds += affordable;
      actualWorkedSeconds += affordable;
      remainingWork -= affordable;

      if (affordable < requested - 0.000001) {
        blocked = true;
        messages.push(formatLines([
          `项目素材不足：${project.name} / ${stage.name} 只推进了可负担部分。`,
          formatProjectMaterialShortfall(state, stage),
          formatNextAdvice(state)
        ]));
        break;
      }

      if (progress.stageWorkedSeconds < stageRequiredSeconds - 0.000001) continue;
    } else {
      remainingWork = Math.max(0, remainingWork - 0.000001);
    }

    const successRate = getStageSuccessRate(state, project, stage);
    const roll = rng();
    if (roll <= successRate) {
      const lastStage = progress.stageIndex >= stages.length - 1;
      if (!lastStage) {
        messages.push(`项目 ${project.name} 阶段完成：${stage.name}（成功率 ${formatPercent(successRate)}），进入 ${stages[progress.stageIndex + 1].name}。`);
        pushGameEvent(options.events, "project", `项目 ${project.name} 阶段完成：${stage.name}。`, "good");
        progress.stageIndex += 1;
        progress.stageWorkedSeconds = 0;
        progress.workedSeconds = stages.slice(0, progress.stageIndex).reduce((sum, item) => sum + getStageRequiredSeconds(item), 0);
        continue;
      }

      const feedback = formatProjectFeedback(project, true, rng);
      const rewardResult = applyProjectRewards(state, project, {
        rewardMultiplier: options.rewardMultiplier || 1,
        skillExpMultiplier: options.skillExpMultiplier || 1,
        events: options.events
      });
      clearProjectProgress(state, project.id);
      messages.push(formatLines([
        `项目 ${project.name} 最终交付：成功率 ${formatPercent(successRate)}，交付成功。`,
        feedback,
        `获得：${formatResourceList(rewardResult.rewards)}`,
        rewardResult.firstSuccess ? formatAttributeExpRewards(project.attributeExp) : (project.kind === "commission" ? "委托交付：本次照常结算奖励。" : "重复交付：声望、属性经验和完成计数不重复获得。"),
        formatSkillExpRewards(rewardResult.skillExp),
        formatNextAdvice(state)
      ]));
      pushGameEvent(options.events, "project", `项目 ${project.name} 交付成功。${feedback} 获得：${formatResourceList(rewardResult.rewards)}。`, "good");
      break;
    }

    const feedback = formatProjectFeedback(project, false, rng);
    const failure = applyProjectStageFailure(state, project, stage, progress, options);
    messages.push(formatLines([
      `项目 ${project.name} 阶段验收失败：${stage.name}（成功率 ${formatPercent(successRate)}），当前阶段回退到 50%。`,
      feedback,
      `风险变化：${formatResourceList(failure.appliedDeltas)}`,
      formatSkillExpRewards(failure.failedSkillExp),
      formatNextAdvice(state)
    ]));
    pushGameEvent(options.events, "project", `项目 ${project.name} 阶段失败：${stage.name}。${feedback}`, "danger");
    break;
  }

  return { messages, workedSeconds: actualWorkedSeconds, blocked };
}

function getActiveMode(state) {
  const activeSkill = itemById(content.skills, state.activeSkillLearningId);
  if (activeSkill && getSkillLevel(state, activeSkill.id) <= 0) return { type: "skill", item: activeSkill };
  clearCompletedSkillLearning(state);

  const activeProject = projectById(state.activeProjectId);
  if (activeProject) return { type: "project", item: activeProject };
  if (state.activeProjectId && !activeProject) state.activeProjectId = null;

  const activity = activityById(state.activeActivityId);
  if (activity) return { type: "activity", item: activity };
  if (state.activeActivityId && !activity) state.activeActivityId = null;
  return { type: "idle", item: null };
}

function startNewWorldDay(state, messages = [], events = []) {
  pushMessageEvent(messages, events, "system", `世界日历进入新的一天：${formatWorldCalendar(state, "short")}。日常重置将在 09:00 结算。`);
}

function getCurrentSchedulePhase(worldTimeMinutes) {
  const minuteOfDay = normalizeWorldTimeMinutes(worldTimeMinutes) % MINUTES_PER_DAY;
  return SCHEDULE_PHASES.find((phase) => minuteOfDay >= phase.start && minuteOfDay < phase.end) || null;
}

function minutesToNextScheduleBoundary(worldTimeMinutes) {
  const minuteOfDay = normalizeWorldTimeMinutes(worldTimeMinutes) % MINUTES_PER_DAY;
  const boundaries = [
    ...SCHEDULE_PHASES.flatMap((phase) => [phase.start, phase.end]),
    MINUTES_PER_DAY + SCHEDULE_PHASES[0].start
  ].filter((minute) => minute > minuteOfDay);
  return Math.max(1, Math.min(...boundaries) - minuteOfDay);
}

function getScheduleDay(state) {
  return getWorldCalendar(state.worldTimeMinutes).day;
}

function clearActiveWork(state) {
  state.activeActivityId = null;
  state.activeSkillLearningId = null;
  state.activeProjectId = null;
}

function hasManualActiveWork(state) {
  return !state.lockedSchedule && Boolean(state.activeActivityId || state.activeSkillLearningId || state.activeProjectId);
}

function resetScheduleForCurrentDay(state) {
  const day = getScheduleDay(state);
  state.scheduleDraft = createScheduleDraft(day);
  state.lockedSchedule = null;
  state.scheduleCompletedPhases = [];
  state.waitingForSchedule = true;
  clearActiveWork(state);
}

function ensureScheduleForCurrentDay(state) {
  const day = getScheduleDay(state);
  if (!state.scheduleDraft || state.scheduleDraft.day !== day) state.scheduleDraft = createScheduleDraft(day);
  if (state.lockedSchedule && state.lockedSchedule.day !== day) {
    resetScheduleForCurrentDay(state);
    return;
  }
  if (!state.lockedSchedule) state.waitingForSchedule = true;
}

function isSchedulePauseMinute(state) {
  const calendar = getWorldCalendar(state.worldTimeMinutes);
  return calendar.hour === 9 && calendar.minute === 0 && !state.lockedSchedule;
}

function describeScheduleSlot(slot) {
  if (!slot) return "未安排";
  if (slot.type === "none") return "晚间放松";
  if (slot.type === "activity") {
    const activity = activityById(slot.id);
    return activity ? `活动：${activity.name}` : `活动：${slot.id}`;
  }
  if (slot.type === "skill") {
    const skill = itemById(content.skills, slot.id);
    return skill ? `学习：${skill.name}` : `学习：${slot.id}`;
  }
  if (slot.type === "project") {
    const project = projectById(slot.id);
    return project ? `项目：${project.name}` : `项目：${slot.id}`;
  }
  return "未安排";
}

function formatSchedule(state) {
  ensureScheduleForCurrentDay(state);
  const schedule = state.lockedSchedule || state.scheduleDraft;
  const confirmed = Boolean(state.lockedSchedule);
  const currentPhase = getCurrentSchedulePhase(state.worldTimeMinutes);
  return formatLines([
    `今日日程：D${String(schedule.day).padStart(3, "0")} [${confirmed ? "已确认" : "草稿"}]${state.waitingForSchedule ? "，等待确认" : ""}`,
    ...SCHEDULE_PHASES.map((phase) => {
      const marker = currentPhase && currentPhase.id === phase.id ? "*" : " ";
      const done = state.scheduleCompletedPhases.includes(phase.id) ? "，已完成" : "";
      return `${marker} ${phase.name} ${formatScheduleTimeRange(phase)}：${describeScheduleSlot(schedule.slots[phase.id])}${done}`;
    }),
    "命令：plan <morning|afternoon|evening> <activity|skill|project> <id>；plan evening none；plan confirm；plan clear"
  ]);
}

function formatScheduleTimeRange(phase) {
  const format = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return `${format(phase.start)}-${format(phase.end)}`;
}

function setScheduleSlot(state, phaseId, type, id) {
  ensureScheduleForCurrentDay(state);
  const phase = SCHEDULE_PHASE_BY_ID[phaseId];
  if (!phase) return "阶段只能是 morning、afternoon、evening。";
  if (state.lockedSchedule) return "今日日程已确认，不能修改。";
  if (type === "none") {
    if (phase.id !== "evening") return "只有晚上可以安排 none。";
    state.scheduleDraft.slots[phase.id] = { type: "none", id: null };
    return `已安排 ${phase.name}：晚间放松。`;
  }
  if (!["activity", "skill", "project"].includes(type)) return "类型只能是 activity、skill、project，晚上还可 none。";
  const slot = normalizeScheduleSlot({ type, id }, phase.id);
  if (!slot) return `没有这个${type === "activity" ? "活动" : type === "skill" ? "技能" : "项目"}：${id}`;
  if (type === "activity") {
    const activity = activityById(id);
    if (!activityUnlocked(state, activity)) {
      return formatLines([
        `${activity.name} 还未解锁。`,
        `需要：${formatActivityRequirements(activity.requirements)}`
      ]);
    }
  }
  state.scheduleDraft.slots[phase.id] = slot;
  return `已安排 ${phase.name}：${describeScheduleSlot(slot)}。`;
}

function getScheduleResourcePlan(state, slots) {
  const errors = [];
  const nextResources = { ...state.resources };
  const skillsToPay = new Set();

  for (const phase of SCHEDULE_PHASES) {
    const slot = slots[phase.id];
    if (phase.required && !slot) errors.push(`${phase.name} 必须安排任务。`);
    if (!slot || slot.type === "none") continue;

    if (slot.type === "activity") {
      const activity = activityById(slot.id);
      if (!activity || !activityUnlocked(state, activity)) errors.push(`${phase.name} 活动不可用：${slot.id}。`);
      continue;
    }

    if (slot.type === "skill") {
      const skill = itemById(content.skills, slot.id);
      if (!skill) {
        errors.push(`${phase.name} 技能不存在：${slot.id}。`);
        continue;
      }
      if (getSkillLevel(state, skill.id) > 0) {
        errors.push(`${phase.name} 技能已学会：${skill.name}。`);
        continue;
      }
      const missingAttributes = missingAttributeRequirements(state, skill.attributeRequirements);
      if (missingAttributes.length) errors.push(`${phase.name} 学习 ${skill.name} 属性不足：${missingAttributes.join("、")}。`);
      const progress = ensureSkillLearningProgress(state, skill.id);
      if (!progress.resourcesPaid && !skillsToPay.has(skill.id)) {
        if (!canAfford(nextResources, skill.cost)) {
          errors.push(`${phase.name} 学习 ${skill.name} 资源不足：${formatShortfall(nextResources, skill.cost)}。`);
        } else {
          pay(nextResources, skill.cost);
          skillsToPay.add(skill.id);
        }
      }
      continue;
    }

    if (slot.type === "project") {
      const project = projectById(slot.id);
      if (!project) {
        errors.push(`${phase.name} 项目不存在：${slot.id}。`);
        continue;
      }
      const missing = missingProjectRequirements(state, project, { skipResources: true });
      if (missing.length) errors.push(`${phase.name} 项目 ${project.name} 条件不足：${missing.join("、")}。`);
    }
  }

  return { errors, nextResources, skillsToPay };
}

function confirmSchedule(state) {
  ensureScheduleForCurrentDay(state);
  if (state.lockedSchedule) return "今日日程已确认，不能修改。";
  if (!state.waitingForSchedule) return "当前不在排程时间。每天 09:00 才能确认今日日程。";
  const plan = getScheduleResourcePlan(state, state.scheduleDraft.slots);
  if (plan.errors.length) {
    return formatLines(["日程确认失败：", ...plan.errors]);
  }

  state.resources = plan.nextResources;
  for (const id of plan.skillsToPay) ensureSkillLearningProgress(state, id).resourcesPaid = true;
  state.lockedSchedule = normalizeSchedule({
    day: getScheduleDay(state),
    slots: state.scheduleDraft.slots,
    confirmedAtWorldMinute: state.worldTimeMinutes
  }, getScheduleDay(state), { locked: true });
  state.scheduleCompletedPhases = [];
  state.waitingForSchedule = false;
  syncScheduledActiveMode(state);
  return formatLines([
    "今日日程已确认，今天不可再修改。",
    formatSchedule(state)
  ]);
}

function clearScheduleDraft(state) {
  ensureScheduleForCurrentDay(state);
  if (state.lockedSchedule) return "今日日程已确认，不能清空。";
  state.scheduleDraft = createScheduleDraft(getScheduleDay(state));
  return "已清空今日日程草稿。";
}

function processPlanCommand(state, args) {
  const [subcommand, type, id] = args;
  if (!subcommand) return formatSchedule(state);
  if (subcommand === "lifestyle") return type ? setLifestyleStance(state, type) : formatLifestyle(state);
  if (subcommand === "confirm") return confirmSchedule(state);
  if (subcommand === "clear") return clearScheduleDraft(state);
  if (!SCHEDULE_PHASE_BY_ID[subcommand]) return "用法：plan [morning|afternoon|evening] <activity|skill|project> <id>，或 plan evening none、plan confirm、plan clear。";
  if (type === "none") return setScheduleSlot(state, subcommand, "none", null);
  if (!type || !id) return "用法：plan <morning|afternoon|evening> <activity|skill|project> <id>。";
  return setScheduleSlot(state, subcommand, type, id);
}

function isScheduledSlotFinished(state, phaseId, slot) {
  if (!slot) return true;
  if (slot.type === "none") return true;
  if (state.scheduleCompletedPhases.includes(phaseId)) return true;
  if (slot.type === "skill") return getSkillLevel(state, slot.id) > 0;
  if (slot.type === "project") return false;
  return false;
}

function shouldTriggerDayEndSummary(state, endedDay = null) {
  // 检查是否到达 24:00 跨日边界
  const minuteOfDay = state.worldTimeMinutes % MINUTES_PER_DAY;
  if (minuteOfDay !== 0) return false;

  // 检查是否已经触发过今天的总结
  const currentDay = endedDay || getWorldCalendar(Math.max(0, state.worldTimeMinutes - 1)).day;
  if (state.lastDayEndSummaryDay === currentDay) return false;

  // 只在有锁定日程的情况下触发（避免影响手动模式和测试）
  if (!state.lockedSchedule) return false;

  return true;
}

function getScheduleSlotDisplayName(slot) {
  if (!slot) return "未安排";
  if (slot.type === "none") return "晚间放松";
  if (slot.type === "activity") return activityById(slot.id)?.name || slot.id;
  if (slot.type === "skill") return itemById(content.skills, slot.id)?.name || slot.id;
  if (slot.type === "project") return projectById(slot.id)?.name || slot.id;
  return slot.id || "未知任务";
}

function getProjectProgressDeltas(state) {
  const start = state.dayStartProjectProgress && typeof state.dayStartProjectProgress === "object" ? state.dayStartProjectProgress : {};
  return content.projects
    .map((project) => {
      const progress = getProjectProgress(state, project);
      const startWorkedSeconds = Math.max(0, Number(start[project.id]) || 0);
      const deltaSeconds = Math.max(0, progress.workedSeconds - startWorkedSeconds);
      if (deltaSeconds <= 0) return null;
      const startPercent = progress.requiredSeconds > 0 ? Math.min(100, startWorkedSeconds / progress.requiredSeconds * 100) : 100;
      const endPercent = progress.requiredSeconds > 0 ? Math.min(100, progress.workedSeconds / progress.requiredSeconds * 100) : 100;
      return {
        id: project.id,
        name: project.name,
        startPercent,
        endPercent,
        deltaPercent: Math.max(0, endPercent - startPercent),
        deltaSeconds
      };
    })
    .filter(Boolean);
}

function getDayEndHealthTags(state) {
  const tags = [];
  const energy = Number(state.resources.energy) || 0;
  const pressure = Number(state.resources.pressure) || 0;
  const bugs = Number(state.resources.bugs) || 0;
  const techDebt = Number(state.resources.techDebt) || 0;
  if (energy <= 20) tags.push("极度疲劳");
  else if (energy <= 45) tags.push("需要休息");
  else tags.push("尚可");
  if (pressure >= 75) tags.push("高压预警");
  else if (pressure >= 45) tags.push("中度焦虑");
  if (bugs >= 25) tags.push("线上火苗");
  if (techDebt >= 50) tags.push("技术债压顶");
  if (energy <= 25 && pressure >= 45) tags.push("颈椎僵硬");
  return [...new Set(tags)];
}

function generateDayEndCommentary(state, resourceDeltas = {}) {
  const code = Number(resourceDeltas.codeLines) || 0;
  const bugs = Number(resourceDeltas.bugs) || 0;
  const docs = Number(resourceDeltas.docs) || 0;
  const techDebt = Number(resourceDeltas.techDebt) || 0;
  const pressure = Number(state.resources.pressure) || 0;
  if (code >= 150 && bugs >= 3) {
    return "小张啊，今天代码产出挺高，但测试那边说缺陷也没少冒头。明天先把质量口子补上，不然绩效故事不好讲。";
  }
  if (techDebt >= 10) {
    return "今天交付看着顺，但技术债的账本又厚了一页。早点还债，不然以后每次改需求都像拆炸弹。";
  }
  if (docs >= 10 && bugs <= 0) {
    return "今天像个靠谱工程师：文档留痕、缺陷可控。保持这个节奏，Leader 暂时不会在群里点你名。";
  }
  if (pressure >= 70) {
    return "你今天扛住了不少事，但精神缓存已经报警。睡前别再刷需求群，明天先安排一个低压阶段。";
  }
  return "今天没有惊天动地，但资产在增长，坑也还看得见。明天继续把能交付的东西往前推。";
}

function generateDayEndSummary(state, options = {}) {
  const calendar = options.calendar || getWorldCalendar(state.worldTimeMinutes);
  const schedule = state.lockedSchedule;

  // 工作统计
  const workTime = {
    morning: 180,
    afternoon: 240,
    evening: schedule && schedule.slots.evening && schedule.slots.evening.type !== "none" ? 180 : 0
  };

  // 活动统计（从 schedule 中获取）
  const activities = [];
  const phaseActions = [];
  if (schedule && schedule.slots) {
    for (const phase of SCHEDULE_PHASES) {
      const slot = schedule.slots[phase.id];
      phaseActions.push({
        phaseId: phase.id,
        phaseName: phase.name,
        timeRange: formatScheduleTimeRange(phase),
        type: slot ? slot.type : null,
        id: slot ? slot.id : null,
        label: getScheduleSlotDisplayName(slot),
        completed: state.scheduleCompletedPhases.includes(phase.id)
      });
      if (slot && slot.type === "activity") activities.push({ id: slot.id, phase: phase.id });
    }
  }

  // 资源变化（从 dayStartResources 对比当前资源）
  const resourceDeltas = {};
  if (state.dayStartResources) {
    for (const [key, value] of Object.entries(state.resources)) {
      const start = state.dayStartResources[key] || 0;
      const delta = value - start;
      if (Math.abs(delta) >= 1) {
        resourceDeltas[key] = delta;
      }
    }
  }

  // 明日提醒
  const tomorrowReminders = [];
  const claimableGoals = content.goals.filter((g) =>
    isGoalCompleted(state, g) && !isGoalClaimed(state, g)
  );
  if (claimableGoals.length > 0) {
    tomorrowReminders.push(`${claimableGoals.length}个目标待领取`);
  }

  // 检查明日生效的作息
  if (state.pendingLifestyleStanceId) {
    const stance = getLifestyleStance(state.pendingLifestyleStanceId);
    if (stance) {
      tomorrowReminders.push(`明日作息：${stance.name}`);
    }
  }
  const projectProgressDeltas = getProjectProgressDeltas(state);
  const healthTags = getDayEndHealthTags(state);
  const phaseEvents = Array.isArray(state.dayPhaseEvents) ? state.dayPhaseEvents.slice() : [];

  return {
    day: calendar.day,
    weekday: calendar.weekday,
    calendar,
    workTime,
    activities,
    phaseActions,
    phaseEvents,
    resources: resourceDeltas,
    resourceDeltas,
    currentResources: snapshotResources(state.resources),
    projectProgressDeltas,
    healthTags,
    commentary: generateDayEndCommentary(state, resourceDeltas),
    tomorrowReminders
  };
}

function syncScheduledActiveMode(state) {
  ensureScheduleForCurrentDay(state);
  clearCompletedSkillLearning(state);
  if (state.waitingForSchedule || !state.lockedSchedule) {
    if (hasManualActiveWork(state)) return null;
    clearActiveWork(state);
    state.currentPhaseProgress = null;
    return null;
  }
  const phase = getCurrentSchedulePhase(state.worldTimeMinutes);
  if (!phase) {
    clearActiveWork(state);
    state.currentPhaseProgress = null;
    return null;
  }

  // 计算当前阶段进度
  const minuteOfDay = state.worldTimeMinutes % MINUTES_PER_DAY;
  const elapsedMinutes = minuteOfDay - phase.start;
  const totalMinutes = phase.end - phase.start;

  const slot = state.lockedSchedule.slots[phase.id];
  const taskEstimatedCompletion = estimateTaskCompletion(state, phase, slot);

  state.currentPhaseProgress = {
    phaseId: phase.id,
    startMinute: phase.start,
    endMinute: phase.end,
    elapsedMinutes: elapsedMinutes,
    totalMinutes: totalMinutes,
    taskEstimatedCompletion: taskEstimatedCompletion
  };

  if (isScheduledSlotFinished(state, phase.id, slot)) {
    // 检查是否阶段内提前完成
    const phaseRemaining = phase.end - minuteOfDay;

    // none 类型不触发提前完成提示
    if (slot && slot.type !== "none" && phaseRemaining > 30 && !state.earlyCompletionPending) {
      // 剩余时间超过30分钟，触发提前完成提示
      state.earlyCompletionPending = {
        phaseId: phase.id,
        completedTask: slot,
        completionMinute: state.worldTimeMinutes,
        remainingMinutes: phaseRemaining
      };
      clearActiveWork(state);
      return { phase, slot: null, earlyCompletion: true };
    }

    clearActiveWork(state);
    return { phase, slot: null };
  }
  clearActiveWork(state);
  if (slot.type === "activity") state.activeActivityId = slot.id;
  if (slot.type === "skill") state.activeSkillLearningId = slot.id;
  if (slot.type === "project") {
    const project = projectById(slot.id);
    if (project) {
      ensureProjectProgress(state, project.id);
      ensureProjectDeadline(state, project);
    }
    state.activeProjectId = slot.id;
  }
  return { phase, slot };
}

function shouldTriggerPhaseTransition(state, phase) {
  // 默认关闭阶段转换暂停功能
  if (!state.scheduleInteractionMode || !state.scheduleInteractionMode.phaseTransition) {
    return false;
  }
  // 只在上午->午休、下午->晚上时触发
  return phase.id === "morning" || phase.id === "afternoon";
}

function getNextPhaseId(phaseId) {
  if (phaseId === "morning") return "afternoon";
  if (phaseId === "afternoon") return "evening";
  return null;
}

function generatePhaseSummary(state, phase, result) {
  const worked = result && result.activeSeconds > 0;
  const energyConsumed = worked ? Math.abs(result.deltas?.energy || 0) : 0;
  const outputSummary = worked ? formatChangedResources({}, result.deltas || {}) : "休整";

  return {
    worked: worked,
    energyConsumed: energyConsumed,
    outputSummary: outputSummary
  };
}

function estimateTaskCompletion(state, phase, slot) {
  if (!slot || slot.type === "none") return null;

  if (slot.type === "skill") {
    const skill = itemById(content.skills, slot.id);
    if (!skill) return null;
    const progress = state.skillLearningProgress[slot.id];
    if (!progress) return null;
    const remaining = skill.learningSeconds - progress.seconds;
    if (remaining <= 0) return null;
    return state.worldTimeMinutes + Math.ceil(remaining / 60);
  }

  if (slot.type === "project") {
    const project = projectById(slot.id);
    if (!project) return null;
    const progress = state.projectProgress[slot.id];
    if (!progress) return null;
    const workedMinutes = Math.floor(progress.workedSeconds / 60);
    const requiredMinutes = project.minWorkHours * 60;
    const remaining = requiredMinutes - workedMinutes;
    if (remaining <= 0) return null;
    return state.worldTimeMinutes + remaining;
  }

  // 活动无法预估完成时间
  return null;
}

function markSchedulePhaseDone(state, phaseId) {
  if (!phaseId || state.scheduleCompletedPhases.includes(phaseId)) return;
  state.scheduleCompletedPhases.push(phaseId);
}

function getPhaseEventName(phaseId) {
  if (phaseId === "night") return "深夜";
  return SCHEDULE_PHASE_BY_ID[phaseId]?.name || phaseId;
}

function maybeApplyPhaseEvent(state, phaseId, messages = [], events = [], options = {}) {
  if (options.randomEvents === false) return {};
  const pool = content.phaseEvents && content.phaseEvents[phaseId];
  if (!Array.isArray(pool) || !pool.length) return {};
  const rng = options.rng || Math.random;
  if (rng() >= 0.4) return {};
  const event = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
  if (!event) return {};
  const deltas = {};
  for (const [key, value] of Object.entries(event.resources || {})) {
    const delta = applyResourceDelta(state, key, value);
    if (delta) {
      deltas[key] = delta;
      if (key === "codeLines" && delta > 0) state.stats.totalCodeLines = (state.stats.totalCodeLines || 0) + delta;
    }
  }
  clampState(state);
  const summary = formatChangedResources({}, deltas);
  const record = {
    id: event.id,
    phaseId,
    phaseName: getPhaseEventName(phaseId),
    name: event.name,
    message: event.message,
    resourceDeltas: deltas
  };
  state.dayPhaseEvents = Array.isArray(state.dayPhaseEvents) ? state.dayPhaseEvents : [];
  state.dayPhaseEvents.push(record);
  pushMessageEvent(
    messages,
    events,
    "random",
    `阶段小事：${event.name}。${event.message}${summary ? ` 本次变化：${summary}。` : ""}`
  );
  return deltas;
}

function applyWorldEventTriggers(state, fromDay, toDay, messages = [], events = []) {
  if (toDay < fromDay) return;
  state.triggeredWorldEvents = Array.isArray(state.triggeredWorldEvents) ? state.triggeredWorldEvents : [];
  for (const event of WORLD_EVENTS) {
    if (state.triggeredWorldEvents.includes(event.id)) continue;
    if (event.startDay >= fromDay && event.startDay <= toDay) {
      state.triggeredWorldEvents.push(event.id);
      if (event.pressure) applyResourceDelta(state, "pressure", event.pressure);
      if (event.reputation) applyResourceDelta(state, "reputation", event.reputation);
      pushMessageEvent(messages, events, "world", `世界事件：${event.name}。${event.message}`);
    }
  }
}

function ensureProjectDeadline(state, project) {
  if (!project) return null;
  state.activeProjectDeadlines = state.activeProjectDeadlines || {};
  const progress = ensureProjectProgress(state, project.id);
  if (progress && Number.isFinite(Number(progress.dueWorldMinute))) {
    state.activeProjectDeadlines[project.id] = {
      dueWorldMinute: progress.dueWorldMinute,
      failed: false,
      warned: Boolean(progress.deadlineWarned)
    };
    return state.activeProjectDeadlines[project.id];
  }
  const existing = state.activeProjectDeadlines[project.id];
  if (existing && Number.isFinite(Number(existing.dueWorldMinute))) {
    progress.dueWorldMinute = Math.max(0, Math.floor(Number(existing.dueWorldMinute)));
    progress.deadlineWarned = Boolean(existing.warned);
    return existing;
  }
  const acceptedAt = Number.isFinite(Number(progress.acceptedAtWorldMinute))
    ? Math.floor(Number(progress.acceptedAtWorldMinute))
    : Math.floor(Number(state.worldTimeMinutes) || WORLD_START_MINUTES);
  const acceptedDay = getWorldCalendar(acceptedAt).day;
  const deadlineDays = Math.max(2, Math.ceil(Number(project.deadlineDays) || (3 + Number(project.difficulty || 1) * 2)));
  const deadlineDay = Number.isFinite(Number(project.deadlineDay))
    ? Math.max(acceptedDay, Math.floor(Number(project.deadlineDay)))
    : acceptedDay + deadlineDays;
  const dueWorldMinute = (deadlineDay - 1) * MINUTES_PER_DAY + 18 * 60;
  state.activeProjectDeadlines[project.id] = { dueWorldMinute, failed: false, warned: false };
  progress.dueWorldMinute = dueWorldMinute;
  return state.activeProjectDeadlines[project.id];
}

function checkProjectDeadlines(state, messages = [], events = []) {
  state.activeProjectDeadlines = state.activeProjectDeadlines || {};
  for (const [id, progress] of Object.entries(state.projectProgress || {})) {
    const dueWorldMinute = Number(progress && progress.dueWorldMinute);
    if (!Number.isFinite(dueWorldMinute)) continue;
    const project = projectById(id);
    if (!project) continue;
    if ((project.kind || "milestone") === "milestone" && state.completedProjects.includes(id) && !state.projectProgress[id]) {
      delete state.activeProjectDeadlines[id];
      continue;
    }
    const overdueMinutes = state.worldTimeMinutes - dueWorldMinute;
    if (overdueMinutes < 0) continue;
    const graceMinutes = 2 * MINUTES_PER_DAY;
    if (!progress.deadlineWarned) {
      progress.deadlineWarned = true;
      state.activeProjectDeadlines[id] = { dueWorldMinute, failed: false, warned: true };
      applyResourceDelta(state, "pressure", 10);
      pushMessageEvent(messages, events, "warning", `Deadline 逾期：${project.name} 已超过 D${getWorldCalendar(dueWorldMinute).day}，成功率和奖励将受惩罚。`, "warn");
    }
    if (overdueMinutes >= graceMinutes) {
      clearProjectProgress(state, id);
      state.resources.reputation = Math.max(0, state.resources.reputation - 2);
      applyResourceDelta(state, "pressure", 18);
      pushMessageEvent(messages, events, "project", `项目失败：${project.name} 超过宽限期，投入损失，声望下降。`, "danger");
    }
  }
}

function getWorkModifiers(state, type, item, overtime) {
  const focus = getWeeklyFocus(state);
  const overtimeRelief = overtime ? attributeBonus(state, "focus", 0.003, 0.24) : 0;
  let workMultiplier = (overtime ? 0.5 + overtimeRelief * 0.5 : 1) * getEnergyStatus(state).productivityMultiplier;
  let rewardMultiplier = getProjectRewardMultiplier(state);
  let skillExpMultiplier = 1;
  if (type === "project") {
    if (focus.id === "project") workMultiplier *= focus.project;
    if (focus.id === "learning") workMultiplier *= focus.project;
    const deadline = ensureProjectDeadline(state, item);
    if (deadline && Number(deadline.dueWorldMinute) < state.worldTimeMinutes) {
      workMultiplier *= 0.85;
      rewardMultiplier *= 0.75;
    }
    for (const skillId of Object.keys(item.skillExpRewards || {})) {
      skillExpMultiplier = Math.max(skillExpMultiplier, getSkillExpMultiplier(state, skillId));
    }
  }
  if (type === "skill") {
    if (focus.id === "learning") workMultiplier *= focus.skill;
    if (focus.id === "project") workMultiplier *= focus.skill;
  }
  return { workMultiplier, rewardMultiplier, skillExpMultiplier };
}

function settleTime(state, now = Date.now(), options = {}) {
  if (state.dayEndSummaryPending) {
    state.lastTick = now;
    return { seconds: 0, messages: [], events: [], ticker: createTuiTicker(state), deltas: {}, activeSeconds: 0 };
  }
  ensureScheduleForCurrentDay(state);
  clearCompletedSkillLearning(state);
  const maxSeconds = options.maxSeconds ?? OFFLINE_CAP_SECONDS;
  const lastTick = state.lastTick;
  const elapsedSeconds = Math.max(0, Math.floor((now - state.lastTick) / 1000));
  const seconds = Math.min(elapsedSeconds, maxSeconds);
  const messages = [];
  const events = [];
  const applyWorldEffects = options.randomEvents !== false;

  applyMorningTransitionIfDue(state, messages, events);
  if (isSchedulePauseMinute(state) && !hasManualActiveWork(state)) {
    state.waitingForSchedule = true;
    clearActiveWork(state);
    state.lastTick = now;
    const currentDay = getWorldCalendar(state.worldTimeMinutes).day;
    if (state.lastSchedulePromptDay !== currentDay) {
      state.lastSchedulePromptDay = currentDay;
      pushMessageEvent(messages, events, "system", "09:00 到了，请先用 plan 安排并确认今日日程。");
    }
    return { seconds: 0, messages, events, ticker: createTuiTicker(state), deltas: {}, activeSeconds: 0 };
  }

  syncScheduledActiveMode(state);
  if (seconds <= 0) {
    return { seconds: 0, messages, events, ticker: createTuiTicker(state), deltas: {}, activeSeconds: 0 };
  }

  const beforeResources = snapshotResources(state.resources);
  const result = { deltas: {}, levelUps: 0, lowEnergy: false, overtime: false, activityName: null, activeName: null, activeSeconds: 0, restTick: null };
  let remainingMinutes = seconds;
  let processedSeconds = 0;
  let ambientMode = null;
  if (applyWorldEffects) applyWorldEventTriggers(state, getWorldCalendar(state.worldTimeMinutes).day, getWorldCalendar(state.worldTimeMinutes).day, messages, events);

  while (remainingMinutes > 0) {
    ensureScheduleForCurrentDay(state);
    if (isSchedulePauseMinute(state) && !hasManualActiveWork(state)) {
      state.waitingForSchedule = true;
      clearActiveWork(state);
      const currentDay = getWorldCalendar(state.worldTimeMinutes).day;
      if (state.lastSchedulePromptDay !== currentDay) {
        state.lastSchedulePromptDay = currentDay;
        pushMessageEvent(messages, events, "system", "09:00 到了，请先用 plan 安排并确认今日日程。");
      }
      break;
    }
    const currentCalendar = getWorldCalendar(state.worldTimeMinutes);
    const minutesToNextDay = MINUTES_PER_DAY - (state.worldTimeMinutes % MINUTES_PER_DAY);
    const scheduleContext = state.lockedSchedule ? syncScheduledActiveMode(state) : null;
    const minutesToNextBoundary = minutesToNextScheduleBoundary(state.worldTimeMinutes);
    const segmentMinutes = Math.min(60, remainingMinutes, minutesToNextDay, minutesToNextBoundary);
    const beforeDay = currentCalendar.day;
    const mode = getActiveMode(state);
    ambientMode = mode;
    const hasActiveWork = state.lockedSchedule ? Boolean(scheduleContext && scheduleContext.slot) && mode.type !== "idle" : mode.type !== "idle";
    const overtime = Boolean(scheduleContext && scheduleContext.phase && scheduleContext.phase.overtime && hasActiveWork);
    if (hasActiveWork) {
      result.overtime = result.overtime || overtime;
      const energyCostPerGameMinute = getWorkEnergyCostPerGameMinute(mode, overtime);
      const workSeconds = getAffordableWorkSeconds(state, energyCostPerGameMinute, segmentMinutes);
      if (energyCostPerGameMinute > 0 && workSeconds < segmentMinutes) result.lowEnergy = true;
      if (workSeconds > 0) result.activeSeconds += workSeconds;
      if (mode.type === "activity") {
        result.activityName = mode.item.name;
        result.activeName = mode.item.name;
        const segment = settleActivity(state, mode.item, workSeconds, { overtime, energyCostPerGameMinute, events, rng: options.rng });
        for (const [key, value] of Object.entries(segment.deltas || {})) {
          result.deltas[key] = (result.deltas[key] || 0) + value;
        }
        result.levelUps += segment.levelUps || 0;
        result.lowEnergy = result.lowEnergy || segment.lowEnergy;
      } else if (mode.type === "skill") {
        result.activeName = `学习 ${mode.item.name}`;
        if (workSeconds > 0) {
          const modifiers = getWorkModifiers(state, "skill", mode.item, overtime);
          const energyDelta = consumeWorkEnergy(state, energyCostPerGameMinute, workSeconds);
          if (energyDelta) result.deltas.energy = (result.deltas.energy || 0) + energyDelta;
          messages.push(...settleSkillLearning(state, mode.item, workSeconds, { ...modifiers, events, rng: options.rng }));
          if (scheduleContext && getSkillLevel(state, mode.item.id) > 0) markSchedulePhaseDone(state, scheduleContext.phase.id);
        }
      } else if (mode.type === "project") {
        result.activeName = `项目 ${mode.item.name}`;
        if (workSeconds > 0) {
          const modifiers = getWorkModifiers(state, "project", mode.item, overtime);
          const projectSegment = settleProject(state, mode.item, workSeconds, { ...options, ...modifiers, events, deltas: result.deltas });
          const progressedSeconds = Math.max(0, projectSegment.workedSeconds || 0);
          const actualWorkedSeconds = Math.min(workSeconds, progressedSeconds / Math.max(0.000001, modifiers.workMultiplier || 1));
          const energyDelta = consumeWorkEnergy(state, energyCostPerGameMinute, actualWorkedSeconds);
          if (energyDelta) result.deltas.energy = (result.deltas.energy || 0) + energyDelta;
          result.activeSeconds += actualWorkedSeconds - workSeconds;
          messages.push(...(projectSegment.messages || []));
          if (scheduleContext && !state.activeProjectId && !state.projectProgress[mode.item.id]) markSchedulePhaseDone(state, scheduleContext.phase.id);
        }
      }
    } else {
      const restWindow = getRestWindow(state, state.worldTimeMinutes);
      if (restWindow) {
        const restDeltas = settleLifestyleRest(state, restWindow, segmentMinutes);
        mergeDeltas(result.deltas, restDeltas);
        mergeRestTicker(result, state, restWindow, segmentMinutes, restDeltas);
      }
    }

    state.worldTimeMinutes += segmentMinutes;
    remainingMinutes -= segmentMinutes;
    processedSeconds += segmentMinutes;

    checkPressureOverload(
      state,
      messages,
      events,
      (state, key, value) => {
        const delta = applyResourceDelta(state, key, value);
        if (delta) result.deltas[key] = (result.deltas[key] || 0) + delta;
        return delta;
      },
      pushMessageEvent
    );
    if (scheduleContext && scheduleContext.phase) {
      const minuteOfDay = state.worldTimeMinutes % MINUTES_PER_DAY;
      if (minuteOfDay === scheduleContext.phase.end) {
        // 检查是否触发阶段转换窗口
        if (shouldTriggerPhaseTransition(state, scheduleContext.phase)) {
          markSchedulePhaseDone(state, scheduleContext.phase.id);
          mergeDeltas(result.deltas, maybeApplyPhaseEvent(state, scheduleContext.phase.id, messages, events, options));
          const nextPhaseId = getNextPhaseId(scheduleContext.phase.id);
          state.phaseTransitionPending = {
            fromPhase: scheduleContext.phase.id,
            toPhase: nextPhaseId,
            triggerMinute: state.worldTimeMinutes,
            summary: generatePhaseSummary(state, scheduleContext.phase, result)
          };
          clearActiveWork(state);
          pushMessageEvent(messages, events, "system", `${scheduleContext.phase.name}阶段结束，请确认下阶段安排。`);
          break; // 暂停时间推进
        } else {
          markSchedulePhaseDone(state, scheduleContext.phase.id);
          mergeDeltas(result.deltas, maybeApplyPhaseEvent(state, scheduleContext.phase.id, messages, events, options));
        }
      }
    }

    // 检查是否触发一天结束总结（在日期跨越之前）
    if (shouldTriggerDayEndSummary(state, beforeDay)) {
      mergeDeltas(result.deltas, maybeApplyPhaseEvent(state, "night", messages, events, options));
      const endedCalendar = getWorldCalendar(Math.max(0, state.worldTimeMinutes - 1));
      state.lastDayEndSummaryDay = beforeDay;
      state.dayEndSummaryPending = {
        day: beforeDay,
        triggerMinute: state.worldTimeMinutes,
        summary: generateDayEndSummary(state, { calendar: endedCalendar })
      };
      clearActiveWork(state);
      pushMessageEvent(messages, events, "system", "24:00 到了，请查看今日审计报告，确认后进入睡眠。");
      break; // 暂停时间推进
    }

    const afterDay = getWorldCalendar(state.worldTimeMinutes).day;
    if (afterDay !== beforeDay) {
      if (applyWorldEffects) {
        startNewWorldDay(state, messages, events);
        applyWorldEventTriggers(state, beforeDay + 1, afterDay, messages, events);
      }
    }
    applyMorningTransitionIfDue(state, messages, events);
    if (applyWorldEffects) checkProjectDeadlines(state, messages, events);
    const calendar = getWorldCalendar(state.worldTimeMinutes);
    if (calendar.hour === 9 && calendar.minute === 0 && !hasManualActiveWork(state)) {
      resetScheduleForCurrentDay(state);
      const currentDay = calendar.day;
      if (state.lastSchedulePromptDay !== currentDay) {
        state.lastSchedulePromptDay = currentDay;
        pushMessageEvent(messages, events, "system", "新的一天 09:00 到了，请先用 plan 安排并确认今日日程。");
      }
      break;
    }
  }

  const changedResources = formatChangedResources(beforeResources, state.resources);
  if (result.activityName && changedResources) {
    messages.push(`${result.activityName} ${result.activeSeconds} 秒：${changedResources}。`);
  }
  if (result.levelUps > 0) {
    const activity = activityById(state.activeActivityId);
    const levelUpMessage = `${result.activityName}提升到 Lv.${activity ? getActivityLevel(state, activity.id) : ""}。`;
    messages.push(levelUpMessage);
    pushGameEvent(events, "skill", levelUpMessage, "good");
  }
  if (result.lowEnergy) {
    pushMessageEvent(messages, events, "warning", "精力耗尽，消耗精力的行动已停止推进。", "danger");
  }
  collectBugRiskEvents(state, beforeResources, snapshotResources(state.resources), events);

  if (options.randomEvents && processedSeconds > 0) {
    const eventChance = Math.min(0.35, processedSeconds / 3600 * 0.12);
    const rng = options.rng || Math.random;
    if (rng() < eventChance) {
      const event = content.randomEvents[Math.floor(rng() * content.randomEvents.length)];
      const eventText = chooseNarrativeText(event, rng);
      const beforeRandom = snapshotResources(state.resources);
      event.apply(state);
      applyAttributeExpRewards(state, event.attributeExp, { events });
      clampState(state);
      messages.push(`随机事件：${event.name}。${eventText}`);
      const randomSummary = formatChangedResources(beforeRandom, state.resources);
      pushGameEvent(events, "random", `随机事件：${event.name}。${eventText}${randomSummary ? ` 本次变化：${randomSummary}。` : ""}`);
      collectBugRiskEvents(state, beforeRandom, snapshotResources(state.resources), events);
    }
  }
  maybeApplyAmbientEvents(state, ambientMode || getActiveMode(state), processedSeconds, events, options);

  state.lastTick = seconds < elapsedSeconds ? now : lastTick + processedSeconds * 1000;
  clampState(state);
  clearCompletedSkillLearning(state);
  syncScheduledActiveMode(state);
  return { seconds: processedSeconds, messages, events, ticker: createTuiTicker(state, result, changedResources), deltas: result.deltas, activeSeconds: result.activeSeconds };
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
  state.activeSkillLearningId = null;
  state.activeProjectId = null;
  state.activeActivityId = id;
  return formatLines([
    `开始活动：${activity.name}。`,
    `主要产出：${formatActivityRateSummary(state, activity)}`,
    formatNextAdvice(state)
  ]);
}

function stopActivity(state) {
  if (state.activeSkillLearningId) {
    const skill = itemById(content.skills, state.activeSkillLearningId);
    state.activeSkillLearningId = null;
    return `暂停学习：${skill ? skill.name : "未知技能"}。`;
  }
  if (state.activeProjectId) {
    const project = projectById(state.activeProjectId);
    state.activeProjectId = null;
    return `暂停项目：${project ? project.name : "未知项目"}。`;
  }
  if (!state.activeActivityId) return "当前没有正在进行的活动。";
  const activity = activityById(state.activeActivityId);
  state.activeActivityId = null;
  return `停止活动：${activity ? activity.name : "未知活动"}。`;
}

function formatGoalRewards(rewards = {}) {
  const entries = [];
  if (rewards.money) entries.push(`金钱 +${formatNumber(rewards.money)}`);
  if (rewards.reputation) entries.push(`声望 +${formatNumber(rewards.reputation)}`);
  const attributeRewards = formatAttributeExpRewards(rewards.attributeExp);
  if (attributeRewards) entries.push(attributeRewards);
  return entries.length ? entries.join("；") : "无";
}

function mergeRewards(target, rewards = {}) {
  target.money = (target.money || 0) + (rewards.money || 0);
  target.reputation = (target.reputation || 0) + (rewards.reputation || 0);
  target.attributeExp = target.attributeExp || {};
  for (const [attr, amount] of Object.entries(rewards.attributeExp || {})) {
    target.attributeExp[attr] = (target.attributeExp[attr] || 0) + amount;
  }
}

function applyGoalRewards(state, rewards = {}) {
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

function getGoalOptions(state) {
  return (content.goals || []).map((goal) => {
    const status = getGoalStatus(state, goal);
    return {
      id: goal.id,
      name: goal.name,
      description: goal.description,
      type: goal.type,
      status,
      claimable: status === "可领取",
      claimed: status === "已领取",
      locked: status === "未解锁",
      progress: formatGoalProgress(state, goal),
      rewards: formatGoalRewards(goal.rewards),
      command: status === "可领取" ? `claim ${goal.id}` : null
    };
  });
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

function getAdviceList(state) {
  clearCompletedSkillLearning(state);
  const advices = [];

  // 🔴 紧急级：阻断进度的问题
  if (state.resources.energy <= 10 && state.activeActivityId && state.activeActivityId !== "rest") {
    advices.push({
      level: "danger",
      emoji: "🔴",
      text: "精力耗尽，活动已停止推进",
      reason: `精力 ${Math.floor(state.resources.energy)}/100`,
      action: "明天安排 rest 或切换 lifestyle"
    });
  }

  // 🟡 重要级：高价值机会
  const claimable = getClaimableGoals(state);
  if (claimable.length > 0) {
    const totalMoney = claimable.reduce((sum, g) => sum + ((g.rewards && g.rewards.money) || 0), 0);
    const totalReputation = claimable.reduce((sum, g) => sum + ((g.rewards && g.rewards.reputation) || 0), 0);
    const rewards = [];
    if (totalMoney > 0) rewards.push(`+${totalMoney}金钱`);
    if (totalReputation > 0) rewards.push(`+${totalReputation}声望`);
    advices.push({
      level: "warn",
      emoji: "🟡",
      text: `${claimable.length}个目标可领取`,
      reason: rewards.length > 0 ? rewards.join("，") : "获得奖励",
      action: "claim all"
    });
  }

  if (state.waitingForSchedule) {
    advices.push({
      level: "warn",
      emoji: "🟡",
      text: "需要安排今日日程",
      reason: "09:00 已到，等待排程"
    });
  }

  // 🔵 提示级：风险预警
  if (state.resources.bugs >= 70) {
    advices.push({
      level: "info",
      emoji: "🔵",
      text: "Bug 风险偏高",
      reason: `当前 ${Math.floor(state.resources.bugs)}/100，接近危险`,
      action: "明天安排 bug-hunting 或 code-review"
    });
  } else if (state.resources.bugs >= 50) {
    advices.push({
      level: "info",
      emoji: "🔵",
      text: "Bug 开始累积",
      reason: `当前 ${Math.floor(state.resources.bugs)}/100`,
      action: "考虑安排质量活动"
    });
  }

  if (state.resources.techDebt >= 70) {
    advices.push({
      level: "info",
      emoji: "🔵",
      text: "技术债偏高",
      reason: `当前 ${Math.floor(state.resources.techDebt)}/100`,
      action: "明天安排 refactoring 或 architecture"
    });
  }

  if (state.resources.pressure >= 70) {
    advices.push({
      level: "info",
      emoji: "🔵",
      text: "压力偏高",
      reason: `当前 ${Math.floor(state.resources.pressure)}/100，影响精力恢复`,
      action: "明天安排 rest 或调整 lifestyle"
    });
  }

  if (state.resources.energy < 25 && state.activeActivityId && state.activeActivityId !== "rest") {
    advices.push({
      level: "info",
      emoji: "🔵",
      text: "精力偏低",
      reason: `当前 ${Math.floor(state.resources.energy)}/100`,
      action: "明天安排 rest 恢复"
    });
  }

  // 💡 推荐级：优化建议
  if (!state.activeActivityId && !state.activeSkillLearningId && !state.activeProjectId && !state.waitingForSchedule) {
    const phase = getCurrentSchedulePhase(state.worldTimeMinutes);
    if (phase) {
      advices.push({
        level: "hint",
        emoji: "💡",
        text: "当前空闲",
        reason: `${phase.name}时段可安排活动`,
        action: "plan 或 start 开始活动"
      });
    }
  }

  if (state.activeProjectId) {
    const project = projectById(state.activeProjectId);
    if (project) {
      const successRate = getProjectSuccessRate(state, project);
      if (successRate < 0.8) {
        advices.push({
          level: "hint",
          emoji: "💡",
          text: "项目成功率偏低",
          reason: `当前 ${Math.floor(successRate * 100)}%，可提升`,
          action: "降低 Bug 和技术债可提高成功率"
        });
      }
    }
  }

  // 最多返回3条建议，优先级高的在前
  return advices.slice(0, 3);
}

function formatAdviceList(advices) {
  if (!advices || advices.length === 0) {
    return "建议：查看 plan 确认日程，或用 goals 查看目标进度。";
  }

  return advices.map((advice) =>
    `${advice.emoji} ${advice.text}：${advice.reason} → ${advice.action}`
  ).join("\n");
}

function formatNextAdvice(state) {
  clearCompletedSkillLearning(state);
  const claimable = getClaimableGoals(state);
  if (claimable.length) return `建议：目标 ${claimable[0].name} 已完成，先 claim ${claimable[0].id} 领取奖励。`;
  if (state.waitingForSchedule) return "建议：安排今日日程并确认。";
  if (state.activeSkillLearningId) return "建议：技能学习中，wait 或保持在线完成学习。";
  if (state.activeProjectId) return "建议：项目进行中，降低 Bug、技术债和压力可以提高交付成功率。";
  if (!state.activeActivityId) return "建议：当前阶段在休整或任务已完成，等待下个阶段。";
  if (state.resources.energy < 15 && state.activeActivityId !== "rest") return "建议：精力偏低，明天给某个阶段安排 rest。";
  if ((state.resources.pressure || 0) >= 70 && state.activeActivityId !== "rest") return "建议：压力偏高，明天给某个阶段安排 rest。";
  if ((state.resources.bugs || 0) >= 25) return "建议：Bug 偏多，明天安排 bug-hunting。";
  if ((state.resources.techDebt || 0) >= 50) return "建议：技术债偏高，明天安排 refactoring 或 architecture。";
  return "建议：查看 plan 确认今日阶段，或用 goals 确认主线目标。";
}

function formatState(state) {
  syncScheduledActiveMode(state);
  clearCompletedSkillLearning(state);
  const role = roleById(state.currentRole);
  const active = activityById(state.activeActivityId);
  const activeProject = projectById(state.activeProjectId);
  const activeSkill = itemById(content.skills, state.activeSkillLearningId);
  const projectProgress = activeProject ? getProjectProgress(state, activeProject) : null;
  const skillLearningProgress = activeSkill ? getSkillLearningProgress(state, activeSkill) : null;
  const learnedSkills = content.skills.filter((skill) => getSkillLevel(state, skill.id) > 0).map((skill) => formatSkillProgress(state, skill.id));
  const activeEvents = getActiveWorldEvents(state);
  const currentPhase = getCurrentSchedulePhase(state.worldTimeMinutes);
  return [
    `档案：${state.profileId} - ${state.profileName}`,
    `人物卡：${getCharacterCardName(state.characterCardId)}`,
    `职位：${role ? role.name : state.currentRole}`,
    `世界时间：${formatWorldCalendar(state)}`,
    `当前阶段：${currentPhase ? `${currentPhase.name} ${formatScheduleTimeRange(currentPhase)}` : "休整"}`,
    `日程状态：${state.lockedSchedule ? "已确认" : "等待确认"}`,
    formatSchedule(state),
    `本周重点：${formatWeeklyFocus(state)}`,
    getLifestyleStatus(state).text,
    `当前事件：${activeEvents.length ? activeEvents.map((event) => event.name).join("，") : "暂无"}`,
    formatNearestDeadline(state),
    `当前活动：${active ? `${active.name} Lv.${getActivityLevel(state, active.id)}` : "无"}`,
    `当前项目：${activeProject ? `${activeProject.name} 阶段 ${projectProgress.stageIndex + 1}/${projectProgress.stageCount} ${projectProgress.stage ? projectProgress.stage.name : ""} ${projectProgress.stageProgressPercent}%（总进度 ${projectProgress.progressPercent}%，成功率 ${formatPercent(getProjectSuccessRate(state, activeProject))}）` : "无"}`,
    `当前学习：${activeSkill ? `${activeSkill.name} 学习 ${skillLearningProgress.progressPercent}%` : "无"}`,
    `代码：${formatNumber(state.resources.codeLines)}  金钱：${formatNumber(state.resources.money)}  知识：${formatNumber(state.resources.knowledge)}`,
    `测试：${formatNumber(state.resources.tests)}  文档：${formatNumber(state.resources.docs)}  架构：${formatNumber(state.resources.architecture)}  线索：${formatNumber(state.resources.leads)}`,
    `精力：${formatNumber(state.resources.energy)} ${formatEnergyStatus(state)}  压力：${formatNumber(state.resources.pressure)}  Bug：${formatNumber(state.resources.bugs)}  技术债：${formatNumber(state.resources.techDebt)}  声望：${formatNumber(state.resources.reputation)}`,
    `属性：${formatAttributes(state)}`,
    `技能：${learnedSkills.length ? learnedSkills.join("，") : "暂无"}`,
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
    "  plan                   查看今日日程",
    "  plan morning activity <id>   安排上午活动",
    "  plan afternoon skill <id>    安排下午学习",
    "  plan evening project <id>    安排晚上项目（加班）",
    "  plan evening none            晚间放松",
    "  plan confirm           确认今日日程，确认后不可修改",
    "  plan clear             清空未确认的日程草稿",
    "  activities             查看活动列表",
    "  events                 查看当前世界事件",
    "  start <id>             旧入口：提示改用 plan",
    "  stop                   暂停当前底层任务（调试用）",
    "  week <focus>           设置本周重点：learning|project|freelance|quality|balanced",
    "  lifestyle [id]         查看或设置明日作息：health|tech_surfing|cyber_gaming|side_hustle",
    "  learn <id>             旧入口：提示改用 plan",
    "  upgrade <id>           消耗技能经验和资源升级技能",
    "  buy <id>               买工具",
    "  projects               查看当前委托板",
    "  project <id>           接取或继续项目",
    "  promote                申请晋升",
    "  goals                  查看目标链",
    "  claim [id|all]         领取已完成目标奖励",
    "  cards                  查看人物卡列表",
    "  profiles               查看角色档案",
    "  profile new <id> --card <cardId> [name] 创建档案并切换",
    "  profile load <id>      保存当前并切换档案",
    "  profile save [id]      保存当前档案或另存为档案",
    "  profile rename <id> <name> 重命名档案",
    "  profile delete <id> confirm 删除档案",
    "  wait <seconds>         快进调试",
    "  list skills|tools|projects|cards 查看可购买/可提交内容",
    "  save                   保存",
    "  help                   帮助",
    "  quit                   保存并退出"
  ].join("\n");
}

function formatProjectBoard(state) {
  const board = ensureProjectBoard(state);
  const projects = getProjectBoardProjects(state);
  return formatLines([
    `项目委托板：D${String(board.day).padStart(3, "0")} 09:00 刷新`,
    ...projects.map((project) => {
      const progress = getProjectProgress(state, project);
      const inProgress = Boolean(state.projectProgress[project.id]);
      const kind = project.kind === "commission" ? "委托" : "里程碑";
      const stage = inProgress && progress.stage ? `，阶段 ${progress.stageIndex + 1}/${progress.stageCount} ${progress.stage.name} ${progress.stageProgressPercent}%` : "";
      return `${project.id} - ${project.name} [${kind}] ${formatDifficultyLabel(project.difficulty)}${stage}`;
    })
  ]);
}

function listContent(type) {
  if (type === "cards") return formatCharacterCards();
  if (type === "skills") {
    return content.skills.map((skill) => {
      const progress = getSkillProgress({ skillProgress: {}, unlockedSkills: [], skillLearningProgress: {} }, skill.id);
      return `${skill.id} - ${skill.name}，学习花费：${formatResourceList(skill.cost)}，耗时 ${formatDuration(skill.learningSeconds)}，属性 ${formatAttributeRequirements(skill.attributeRequirements)}，等级 ${progress.levelName}，升级 ${formatSkillUpgradeCost({ skillProgress: {}, resources: {}, attributes: DEFAULT_ATTRIBUTES }, skill)}，倍率/级：${formatMultiplierList(skill.multipliers)}。${skill.description}`;
    }).join("\n");
  }
  if (type === "tools") {
    return content.tools.map((tool) => `${tool.id} - ${tool.name}，花费：${formatResourceList(tool.cost)}。${tool.description}`).join("\n");
  }
  if (type === "projects") {
    return content.projects.map((project) => {
      const skills = project.requirements.skills?.length ? project.requirements.skills.join(", ") : "无";
      return `${project.id} - ${project.name}，${project.kind === "commission" ? "委托" : "里程碑"}，${formatDifficultyLabel(project.difficulty)}，最少工时 ${formatDuration(getProjectRequiredSeconds(project))}，最高成功率 ${formatPercent(project.maxSuccessRate)}，技能 ${skills}，素材预算 ${formatProjectResourceList(project.requirements.resources)}，活动 ${formatActivityRequirements({ activityLevels: project.requirements.activityLevels })}，奖励 ${formatSkillExpRewards(project.skillExpRewards)}。${project.description}`;
    }).join("\n");
  }
  return "可查看：list skills、list tools、list projects、list cards";
}

function getResourceEntries(state) {
  return RESOURCE_ORDER.map((id) => ({
    id,
    name: RESOURCE_NAMES[id] || id,
    value: Math.floor(Number(state.resources[id]) || 0),
    ...(id === "energy" ? { status: formatEnergyStatus(state), max: getEffectiveMaxEnergy(state) } : {})
  }));
}

function getAttributeEntries(state) {
  return ATTRIBUTE_IDS.map((id) => ({
    id,
    name: ATTRIBUTE_NAMES[id],
    value: Math.floor(getBaseAttribute(state, id)),
    breakthrough: Math.floor(getBreakthrough(state, id)),
    effective: getEffectiveAttribute(state, id),
    exp: state.attributeExp[id] || 0
  }));
}

function getInitialCharacterCardAttributeEntries(card) {
  if (!card) return [];
  return ATTRIBUTE_IDS.map((id) => ({
    id,
    name: ATTRIBUTE_NAMES[id],
    value: Math.floor(Number(card.attributes[id]) || 0)
  }));
}

function getCharacterCardInitialBonuses(card) {
  if (!card) return null;
  return {
    resources: formatResourceList(card.resources),
    skills: formatCharacterCardSkills(card),
    activityLevels: formatCharacterCardActivityLevels(card)
  };
}

function getActivityOptions(state) {
  return content.activities.map((activity) => {
    const progress = getActivityProgress(state, activity.id);
    const unlocked = activityUnlocked(state, activity);
    const active = state.activeActivityId === activity.id;
    const rateSections = getActivityRateSections(state, activity);
    const output = formatActivityRateSummary(state, activity);
    return {
      id: activity.id,
      name: activity.name,
      detailKind: "activity",
      description: activity.description,
      tier: activity.tier,
      primaryAttribute: activity.primaryAttribute,
      primaryAttributeName: ATTRIBUTE_NAMES[activity.primaryAttribute] || activity.primaryAttribute,
      roleSummary: getActivityRoleSummary(activity),
      attributeGrowthSummary: formatActivityAttributeGrowth(activity),
      growthSummary: `Lv.${progress.level} ${formatNumber(progress.exp)}/${formatNumber(progress.next)}  ${formatActivityAttributeGrowth(activity)}`,
      rateSections,
      useCase: getActivityUseCase(activity),
      active,
      unlocked,
      locked: !unlocked,
      status: active ? "进行中" : unlocked ? "可开始" : "未解锁",
      level: progress.level,
      exp: progress.exp,
      nextExp: progress.next,
      progressPercent: progress.next > 0 ? Math.min(100, Math.floor(progress.exp / progress.next * 100)) : 100,
      progressLabel: "等级进度",
      progressActive: active,
      progressText: `${formatNumber(progress.exp)}/${formatNumber(progress.next)}`,
      requirements: formatActivityRequirements(activity.requirements),
      output,
      command: unlocked ? `start ${activity.id}` : null
    };
  });
}

function getScheduleOptions(state) {
  ensureScheduleForCurrentDay(state);
  const schedule = state.lockedSchedule || state.scheduleDraft;
  const currentPhase = getCurrentSchedulePhase(state.worldTimeMinutes);
  const phaseOptions = SCHEDULE_PHASES.map((phase) => {
    const slot = schedule.slots[phase.id];
    const confirmed = Boolean(state.lockedSchedule);
    return {
      id: phase.id,
      name: phase.name,
      description: `${formatScheduleTimeRange(phase)}${phase.overtime ? "，加班阶段" : ""}`,
      status: currentPhase && currentPhase.id === phase.id ? "当前阶段" : state.scheduleCompletedPhases.includes(phase.id) ? "已完成" : slot ? "已安排" : phase.required ? "必填" : "可选",
      phaseId: phase.id,
      slot,
      effects: describeScheduleSlot(slot),
      progress: confirmed ? "已确认，今日不可修改" : "选中阶段后，到活动/技能/项目面板按 Enter 写入草稿。",
      command: null
    };
  });
  const lifestyleOptions = getLifestyleOptions(state).map((stance) => ({
    id: `lifestyle-${stance.id}`,
    name: `作息：${stance.name}`,
    description: stance.description,
    status: stance.current ? "当前" : stance.pending ? "明日生效" : "可设为明日",
    effects: formatLifestyleEffectSummary(stance.id),
    command: stance.command
  }));

  return [
    ...phaseOptions,
    {
      id: "evening-none",
      name: "晚间放松",
      description: "晚上不安排任务，避免加班压力，并按当前作息基调进行轻量恢复。",
      status: state.lockedSchedule ? "已锁定" : "可选择",
      command: state.lockedSchedule ? null : "plan evening none"
    },
    {
      id: "confirm",
      name: "确认日程",
      description: "确认后扣除学习资源并锁定今日安排，项目素材会随阶段推进消耗。",
      status: state.lockedSchedule ? "已确认" : "待确认",
      command: state.lockedSchedule ? null : "plan confirm"
    },
    {
      id: "clear",
      name: "清空草稿",
      description: "只影响未确认的今日日程草稿。",
      status: state.lockedSchedule ? "已锁定" : "可清空",
      command: state.lockedSchedule ? null : "plan clear"
    },
    ...lifestyleOptions
  ];
}

function getCharacterCardOptions(options = {}) {
  const now = options.now ?? Date.now();
  return content.characterCards.map((card) => {
    const nextId = `profile-${new Date(now).toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${card.id}`;
    return {
      id: card.id,
      name: card.name,
      description: card.description,
      status: "可选择",
      attributes: formatCharacterCardAttributes(card),
      resources: formatResourceList(card.resources),
      skills: formatCharacterCardSkills(card),
      activityLevels: formatCharacterCardActivityLevels(card),
      command: `profile new ${nextId} --card ${card.id} ${card.name}`
    };
  });
}

function getSkillLevelEntries(state) {
  clearCompletedSkillLearning(state);
  return content.skills.map((skill) => {
    const progress = getSkillProgress(state, skill.id);
    return {
      id: skill.id,
      name: skill.name,
      level: progress.level,
      levelName: progress.levelName,
      exp: progress.exp,
      nextExp: progress.next,
      learned: progress.level > 0,
      maxed: progress.level >= 5,
      learning: state.activeSkillLearningId === skill.id
    };
  });
}

function getActivityLevelEntries(state) {
  return content.activities.map((activity) => {
    const progress = getActivityProgress(state, activity.id);
    return {
      id: activity.id,
      name: activity.name,
      level: progress.level,
      exp: progress.exp,
      nextExp: progress.next,
      unlocked: activityUnlocked(state, activity),
      active: state.activeActivityId === activity.id
    };
  });
}

function getManagementOptions(state, type) {
  clearCompletedSkillLearning(state);
  if (type === "skills") {
    return content.skills.map((skill) => {
      const progress = getSkillProgress(state, skill.id);
      const learning = state.activeSkillLearningId === skill.id;
      const learningProgress = getSkillLearningProgress(state, skill);
      const learned = progress.level > 0;
      const paid = learningProgress.resourcesPaid;
      const resourceAffordable = paid || canAfford(state.resources, skill.cost);
      const missingAttributes = learned ? [] : missingAttributeRequirements(state, skill.attributeRequirements);
      const learnable = !learned && resourceAffordable && missingAttributes.length === 0;
      const canUpgrade = learned && progress.level < 5 && progress.exp >= SKILL_EXP_THRESHOLDS[progress.level] && canAfford(state.resources, getSkillUpgradeCost(skill, progress.level + 1)) && missingAttributeRequirements(state, getSkillUpgradeAttributeRequirements(skill, progress.level + 1)).length === 0;
      const progressFields = !learned && (learning || paid || learningProgress.workedSeconds > 0)
        ? {
            progressLabel: "学习进度",
            progressPercent: learningProgress.progressPercent,
            progressActive: learning,
            progressText: `${formatDuration(learningProgress.workedSeconds)}/${formatDuration(learningProgress.requiredSeconds)}`
          }
        : learned && progress.next > 0
          ? {
              progressLabel: "升级经验",
              progressPercent: Math.min(100, Math.floor(progress.exp / progress.next * 100)),
              progressActive: false,
              progressText: `${formatNumber(progress.exp)}/${formatNumber(progress.next)}`
            }
          : {};
      const status = learned
        ? progress.level >= 5 ? "满级" : canUpgrade ? "可升级" : "已学习"
        : learning ? "学习中" : missingAttributes.length ? "属性不足" : resourceAffordable ? "可学习" : "资源不足";
      return {
        id: skill.id,
        name: skill.name,
        description: skill.description,
        status,
        done: progress.level >= 5,
        available: learnable || canUpgrade,
        cost: formatResourceList(skill.cost),
        effects: [
          `${progress.levelName} ${progress.next ? `${formatNumber(progress.exp)}/${formatNumber(progress.next)}` : formatNumber(progress.exp)}`,
          `学习 ${formatDuration(learningProgress.workedSeconds)}/${formatDuration(learningProgress.requiredSeconds)}（${learningProgress.progressPercent}%）`,
          `升级 ${formatSkillUpgradeCost(state, skill)}`,
          `倍率/级 ${formatMultiplierList(skill.multipliers)}`
        ].join("；"),
        missing: learned
          ? (progress.level >= 5 ? "" : [
              progress.exp < SKILL_EXP_THRESHOLDS[progress.level] ? `技能经验 ${formatNumber(SKILL_EXP_THRESHOLDS[progress.level] - progress.exp)}` : "",
              formatShortfall(state.resources, getSkillUpgradeCost(skill, progress.level + 1)),
              missingAttributeRequirements(state, getSkillUpgradeAttributeRequirements(skill, progress.level + 1)).join("，")
            ].filter(Boolean).join("；"))
          : [
              paid || resourceAffordable ? "" : formatShortfall(state.resources, skill.cost),
              missingAttributes.length ? `属性缺口：${missingAttributes.join("，")}` : ""
            ].filter(Boolean).join("；"),
        level: progress.level,
        levelName: progress.levelName,
        exp: progress.exp,
        nextExp: progress.next,
        learningProgress,
        ...progressFields,
        command: learned ? (canUpgrade ? `upgrade ${skill.id}` : null) : `learn ${skill.id}`
      };
    });
  }

  if (type === "tools") {
    return content.tools.map((tool) => {
      const owned = state.ownedTools.includes(tool.id);
      const affordable = canAfford(state.resources, tool.cost);
      return {
        id: tool.id,
        name: tool.name,
        description: tool.description,
        status: owned ? "已拥有" : affordable ? "可购买" : "金钱不足",
        done: owned,
        available: !owned && affordable,
        cost: formatResourceList(tool.cost),
        effects: formatMultiplierList(tool.multipliers),
        missing: owned || affordable ? "" : formatShortfall(state.resources, tool.cost),
        command: !owned ? `buy ${tool.id}` : null
      };
    });
  }

  if (type === "projects") {
    const projectOptions = getProjectBoardProjects(state).map((project) => {
      const completed = state.completedProjects.includes(project.id);
      const progress = getProjectProgress(state, project);
      const active = state.activeProjectId === project.id;
      const inProgress = Boolean(state.projectProgress[project.id]);
      const missing = missingProjectRequirements(state, project, { skipResources: true });
      const successRate = getProjectSuccessRate(state, project);
      const deadlineText = Number.isFinite(Number(progress.dueWorldMinute))
        ? `D${String(getWorldCalendar(progress.dueWorldMinute).day).padStart(3, "0")} ${getWorldCalendar(progress.dueWorldMinute).hhmm}`
        : "";
      const deadlineCritical = Number.isFinite(Number(progress.dueWorldMinute)) && Number(progress.dueWorldMinute) < Number(state.worldTimeMinutes || WORLD_START_MINUTES);
      return {
        id: project.id,
        name: project.name,
        description: project.description,
        kind: project.kind || "milestone",
        kindLabel: project.kind === "commission" ? "委托" : "里程碑",
        status: active ? "进行中" : inProgress ? "已暂停" : completed ? "已完成/可重复" : missing.length ? "条件不足" : project.kind === "commission" ? "可接委托" : "可开始",
        done: completed,
        available: missing.length === 0,
        rewards: formatSkillExpRewards(project.skillExpRewards),
        cost: `总素材 ${formatProjectResourceList(project.requirements.resources || {})}`,
        spentResources: progress.spentResources,
        spentResourcesText: formatProjectResourceList(progress.spentResources),
        effects: `阶段 ${progress.stageIndex + 1}/${progress.stageCount} ${progress.stage ? progress.stage.name : ""} ${formatDuration(progress.stageWorkedSeconds)}/${formatDuration(progress.stageRequiredSeconds)}（${progress.stageProgressPercent}%）；总进度 ${progress.progressPercent}%；成功率 ${formatPercent(successRate)} / 最高 ${formatPercent(project.maxSuccessRate)}`,
        missing: missing.join("、"),
        difficulty: project.difficulty,
        difficultyLabel: formatDifficultyLabel(project.difficulty),
        maxSuccessRate: project.maxSuccessRate,
        successRate,
        minWorkHours: project.minWorkHours,
        stageName: progress.stage ? progress.stage.name : "",
        stageIndex: progress.stageIndex,
        stageCount: progress.stageCount,
        stageWorkedSeconds: progress.stageWorkedSeconds,
        stageRequiredSeconds: progress.stageRequiredSeconds,
        stageProgressPercent: progress.stageProgressPercent,
        workedSeconds: progress.workedSeconds,
        requiredSeconds: progress.requiredSeconds,
        progressPercent: progress.progressPercent,
        progressLabel: "阶段进度",
        progressActive: active,
        progressText: `${formatGameDuration(progress.stageWorkedSeconds)}/${formatGameDuration(progress.stageRequiredSeconds)}`,
        resourcesPaid: progress.resourcesPaid,
        deadlineText,
        deadlineCritical,
        command: `project ${project.id}`
      };
    });

    return [
      {
        id: "promote",
        name: "申请晋升",
        description: "检查当前职位晋升条件。",
        status: "可尝试",
        done: false,
        available: true,
        cost: "无",
        missing: "",
        command: "promote"
      },
      ...projectOptions
    ];
  }

  return [];
}

function getCurrentOutputRate(state, activity, project, skill, currentPhase) {
  // 计算当前活动的每小时资源产出率
  if (!activity && !project && !skill) return null;

  const overtime = currentPhase && currentPhase.overtime;
  const rate = {};

  if (activity) {
    // 活动产出率
    const estimate = estimateActivityPerHour(state, activity, { overtime });
    Object.assign(rate, estimate.deltas);
  } else if (project) {
    // 项目产出率：只显示精力消耗
    const energyCostPerHour = getProjectEnergyCostPerHour(project) * (overtime ? 1.25 : 1);
    rate.energy = -energyCostPerHour;
  } else if (skill) {
    // 技能学习产出率：只显示精力消耗
    const energyCostPerHour = SKILL_ENERGY_COST_PER_HOUR * (overtime ? 1.25 : 1);
    rate.energy = -energyCostPerHour;
  }

  // 过滤掉接近0的值
  const filtered = {};
  for (const [key, value] of Object.entries(rate)) {
    if (Math.abs(value) >= 0.01) {
      filtered[key] = value;
    }
  }

  return Object.keys(filtered).length > 0 ? filtered : null;
}

function getGameViewModel(state) {
  if (!state.dayEndSummaryPending) syncScheduledActiveMode(state);
  clearCompletedSkillLearning(state);
  const role = roleById(state.currentRole);
  const characterCard = characterCardById(state.characterCardId);
  const active = activityById(state.activeActivityId);
  const activeProject = projectById(state.activeProjectId);
  const activeSkill = itemById(content.skills, state.activeSkillLearningId);
  const activeActivityProgress = active ? getActivityProgress(state, active.id) : null;
  const activeProjectProgress = activeProject ? getProjectProgress(state, activeProject) : null;
  const activeSkillProgress = activeSkill ? getSkillLearningProgress(state, activeSkill) : null;
  const claimableGoals = getClaimableGoals(state);
  const currentMainGoal = getCurrentMainGoal(state);
  const calendar = getWorldCalendar(state.worldTimeMinutes);
  const weeklyFocus = getWeeklyFocus(state);
  const currentPhase = getCurrentSchedulePhase(state.worldTimeMinutes);
  const schedule = state.lockedSchedule || state.scheduleDraft || createScheduleDraft(calendar.day);
  const activeWorldEvents = getActiveWorldEvents(state).map((event) => ({
    id: event.id,
    name: event.name,
    message: event.message,
    startDay: event.startDay,
    endDay: event.endDay
  }));
  const nearestDeadline = getNearestDeadline(state);

  return {
    title: "代码人生",
    calendar,
    dayEndReport: state.dayEndSummaryPending ? buildDayEndReport(state.dayEndSummaryPending.summary) : null,
    schedule: {
      day: schedule.day,
      confirmed: Boolean(state.lockedSchedule),
      waiting: Boolean(state.waitingForSchedule),
      currentPhase: currentPhase ? {
        id: currentPhase.id,
        name: currentPhase.name,
        start: currentPhase.start,
        end: currentPhase.end,
        timeRange: formatScheduleTimeRange(currentPhase),
        overtime: Boolean(currentPhase.overtime)
      } : null,
      slots: SCHEDULE_PHASES.map((phase) => ({
        id: phase.id,
        name: phase.name,
        timeRange: formatScheduleTimeRange(phase),
        required: phase.required,
        overtime: Boolean(phase.overtime),
        completed: state.scheduleCompletedPhases.includes(phase.id),
        slot: schedule.slots[phase.id],
        label: describeScheduleSlot(schedule.slots[phase.id])
      })),
      options: getScheduleOptions(state),
      actions: {
        confirm: state.lockedSchedule ? null : "plan confirm",
        clear: state.lockedSchedule ? null : "plan clear",
        eveningNone: state.lockedSchedule ? null : "plan evening none"
      }
    },
    weeklyFocus,
    lifestyle: getLifestyleStatus(state),
    activeWorldEvents,
    nearestDeadline,
    profile: {
      id: state.profileId,
      name: state.profileName,
      characterCardId: state.characterCardId,
      characterCardName: getCharacterCardName(state.characterCardId),
      createdAt: state.createdAt,
      updatedAt: state.updatedAt
    },
    characterCard: characterCard ? {
      id: characterCard.id,
      name: characterCard.name,
      description: characterCard.description,
      background: characterCard.background,
      initialAttributes: getInitialCharacterCardAttributeEntries(characterCard),
      initialBonuses: getCharacterCardInitialBonuses(characterCard)
    } : {
      id: null,
      name: getCharacterCardName(null),
      description: "这个档案创建于人物卡系统之前，未绑定初始人物卡。",
      background: "",
      initialAttributes: [],
      initialBonuses: null,
      legacy: true
    },
    role: {
      id: state.currentRole,
      name: role ? role.name : state.currentRole,
      maxEnergy: getEffectiveMaxEnergy(state)
    },
    energyStatus: getEnergyStatus(state),
    activeActivity: active ? {
      id: active.id,
      name: active.name,
      level: activeActivityProgress.level,
      exp: activeActivityProgress.exp,
      nextExp: activeActivityProgress.next,
      progressPercent: activeActivityProgress.next > 0
        ? Math.min(100, Math.floor(activeActivityProgress.exp / activeActivityProgress.next * 100))
        : 100,
      progressLabel: "等级进度",
      progressText: `${formatNumber(activeActivityProgress.exp)}/${formatNumber(activeActivityProgress.next)}`,
      attributeExpIds: Object.entries(active.attributeExpPerHour || {})
        .filter(([, value]) => Number(value) > 0)
        .map(([id]) => id)
    } : null,
    activeProject: activeProject ? {
      id: activeProject.id,
      name: activeProject.name,
      kind: activeProject.kind || "milestone",
      progressPercent: activeProjectProgress.progressPercent,
      stageName: activeProjectProgress.stage ? activeProjectProgress.stage.name : "",
      stageIndex: activeProjectProgress.stageIndex,
      stageCount: activeProjectProgress.stageCount,
      stageProgressPercent: activeProjectProgress.stageProgressPercent,
      workedSeconds: activeProjectProgress.workedSeconds,
      requiredSeconds: activeProjectProgress.requiredSeconds,
      stageWorkedSeconds: activeProjectProgress.stageWorkedSeconds,
      stageRequiredSeconds: activeProjectProgress.stageRequiredSeconds,
      progressLabel: "阶段进度",
      progressText: `${formatGameDuration(activeProjectProgress.stageWorkedSeconds)}/${formatGameDuration(activeProjectProgress.stageRequiredSeconds)}`,
      successRate: getProjectSuccessRate(state, activeProject)
    } : null,
    activeSkillLearning: activeSkill ? {
      id: activeSkill.id,
      name: activeSkill.name,
      progressPercent: activeSkillProgress.progressPercent,
      workedSeconds: activeSkillProgress.workedSeconds,
      requiredSeconds: activeSkillProgress.requiredSeconds,
      progressLabel: "学习进度",
      progressText: `${formatDuration(activeSkillProgress.workedSeconds)}/${formatDuration(activeSkillProgress.requiredSeconds)}`
    } : null,
    resources: getResourceEntries(state),
    attributes: getAttributeEntries(state),
    goals: {
      claimableCount: claimableGoals.length,
      claimable: claimableGoals.map((goal) => ({ id: goal.id, name: goal.name })),
      currentMain: currentMainGoal ? {
        id: currentMainGoal.id,
        name: currentMainGoal.name,
        status: getGoalStatus(state, currentMainGoal),
        progress: formatGoalProgress(state, currentMainGoal)
      } : null,
      options: getGoalOptions(state)
    },
    collections: {
      skills: [...state.unlockedSkills],
      tools: [...state.ownedTools],
      projects: [...state.completedProjects]
    },
    skillLevels: getSkillLevelEntries(state),
    activityLevels: getActivityLevelEntries(state),
    stats: {
      totalCodeLines: Math.floor(state.stats.totalCodeLines || 0),
      totalBugsFixed: Math.floor(state.stats.totalBugsFixed || 0),
      totalProjects: Math.floor(state.stats.totalProjects || 0),
      totalActiveSeconds: Math.floor(state.activityStats.totalActiveSeconds || 0)
    },
    nextAdvice: formatNextAdvice(state),
    adviceList: getAdviceList(state),
    todayActivities: getTodayActivities(state),
    learningSkills: getLearningSkillsProgress(state),
    currentOutputRate: getCurrentOutputRate(state, active, activeProject, activeSkill, currentPhase),
    actions: {
      claimAll: claimableGoals.length > 0 ? "claim all" : null,
      stopActivity: state.activeActivityId || state.activeProjectId || state.activeSkillLearningId ? "stop" : null,
      save: "save",
      quit: "quit"
    }
  };
}

function getTodayActivities(state) {
  // 获取今日完成的活动
  const schedule = state.lockedSchedule;
  if (!schedule || !schedule.slots) return [];

  const activities = [];
  const completedPhases = state.scheduleCompletedPhases || [];

  Object.entries(schedule.slots).forEach(([phaseId, slot]) => {
    if (slot && slot.type === "activity" && completedPhases.includes(phaseId)) {
      const activity = activityById(slot.id);
      if (activity) activities.push(activity.name);
    }
  });

  return activities;
}

function getLearningSkillsProgress(state) {
  // 获取学习中的技能进度
  if (!state.activeSkillLearningId) return [];

  const skill = itemById(content.skills, state.activeSkillLearningId);
  if (!skill) return [];

  const progress = state.skillLearningProgress[state.activeSkillLearningId];
  if (!progress) return [];

  const percent = Math.floor((progress.workedSeconds / skill.learningDurationSeconds) * 100);

  return [{
    id: skill.id,
    name: skill.name,
    progress: percent
  }];
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
  if (getSkillLevel(state, id) > 0) return formatLines([`你已经学会了 ${skill.name}。`, formatNextAdvice(state)]);
  const progress = ensureSkillLearningProgress(state, id);
  const missingAttributes = missingAttributeRequirements(state, skill.attributeRequirements);
  if (missingAttributes.length) {
    return formatLines([
      `属性不足，学习 ${skill.name} 还需要：${missingAttributes.join("、")}。`,
      `要求：${formatAttributeRequirements(skill.attributeRequirements)}。`
    ]);
  }
  if (!progress.resourcesPaid && !canAfford(state.resources, skill.cost)) {
    return formatLines([
      `资源不足，学习 ${skill.name} 需要 ${formatResourceList(skill.cost)}。`,
      formatShortfall(state.resources, skill.cost),
      "建议：start study 产出知识，再回来 learn。"
    ]);
  }
  const wasPaid = progress.resourcesPaid;
  if (!progress.resourcesPaid) {
    pay(state.resources, skill.cost);
    progress.resourcesPaid = true;
  }
  state.activeSkillLearningId = id;
  state.activeActivityId = null;
  state.activeProjectId = null;
  const currentProgress = getSkillLearningProgress(state, skill);
  return formatLines([
    `${wasPaid ? "继续学习" : "开始学习"}：${skill.name}。${skill.description}`,
    wasPaid ? "" : `消耗：${formatResourceList(Object.fromEntries(Object.entries(skill.cost).map(([key, value]) => [key, -value])))}`,
    `进度：${formatDuration(currentProgress.workedSeconds)}/${formatDuration(currentProgress.requiredSeconds)}（${currentProgress.progressPercent}%）。`,
    formatNextAdvice(state)
  ]);
}

function upgradeSkill(state, id) {
  const skill = itemById(content.skills, id);
  if (!skill) return `没有这个技能：${id}`;
  const progress = ensureSkillProgress(state, id);
  if (progress.level <= 0) return `还没有学会 ${skill.name}，先执行 learn ${skill.id}。`;
  if (progress.level >= 5) return `${skill.name} 已经是大师级。`;

  const targetLevel = progress.level + 1;
  const requiredExp = SKILL_EXP_THRESHOLDS[progress.level];
  if (progress.exp < requiredExp) {
    return `技能经验不足，${skill.name} 升到 ${SKILL_LEVEL_NAMES[targetLevel]} 需要 ${formatNumber(requiredExp)}，当前 ${formatNumber(progress.exp)}。`;
  }
  const attrReq = getSkillUpgradeAttributeRequirements(skill, targetLevel);
  const missingAttributes = missingAttributeRequirements(state, attrReq);
  if (missingAttributes.length) {
    return formatLines([
      `属性不足，${skill.name} 升到 ${SKILL_LEVEL_NAMES[targetLevel]} 还需要：${missingAttributes.join("、")}。`,
      `要求：${formatAttributeRequirements(attrReq)}。`
    ]);
  }
  const cost = getSkillUpgradeCost(skill, targetLevel);
  if (!canAfford(state.resources, cost)) {
    return formatLines([
      `资源不足，${skill.name} 升到 ${SKILL_LEVEL_NAMES[targetLevel]} 需要 ${formatResourceList(cost)}。`,
      formatShortfall(state.resources, cost)
    ]);
  }

  pay(state.resources, cost);
  progress.exp -= requiredExp;
  progress.level = targetLevel;
  syncUnlockedSkills(state);
  return formatLines([
    `${skill.name} 提升到 ${SKILL_LEVEL_NAMES[targetLevel]}。`,
    `消耗：技能经验 -${formatNumber(requiredExp)}，${formatResourceList(Object.fromEntries(Object.entries(cost).map(([key, value]) => [key, -value])))}`,
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

function processPhaseCommand(state, args) {
  if (!state.phaseTransitionPending) {
    return "当前不在阶段转换窗口。";
  }

  const [action, ...rest] = args;
  const pending = state.phaseTransitionPending;
  const fromPhaseName = SCHEDULE_PHASE_BY_ID[pending.fromPhase].name;
  const toPhase = SCHEDULE_PHASE_BY_ID[pending.toPhase];

  if (action === "continue") {
    state.phaseTransitionPending = null;
    return formatLines([
      `继续执行原计划的 ${toPhase.name} 阶段。`,
      formatNextAdvice(state)
    ]);
  }

  if (action === "adjust") {
    const [phaseId, type, id] = rest;
    if (!phaseId || !type || !id) {
      return "用法：phase adjust <phaseId> <type> <id>，例如：phase adjust afternoon activity rest";
    }

    // 验证阶段ID
    const targetPhase = SCHEDULE_PHASE_BY_ID[phaseId];
    if (!targetPhase) {
      return `无效的阶段ID：${phaseId}，可用：morning, afternoon, evening`;
    }

    // 验证类型
    if (!SCHEDULE_SLOT_TYPES.includes(type)) {
      return `无效的类型：${type}，可用：activity, skill, project, none`;
    }

    // 临时解锁日程进行修改
    if (!state.lockedSchedule) {
      return "日程未锁定，无需调整。";
    }

    // 验证ID
    if (type === "activity") {
      const activity = activityById(id);
      if (!activity) return `没有这个活动：${id}`;
      if (!activityUnlocked(state, activity)) return `活动 ${activity.name} 尚未解锁。`;
    } else if (type === "skill") {
      const skill = itemById(content.skills, id);
      if (!skill) return `没有这个技能：${id}`;
    } else if (type === "project") {
      const project = projectById(id);
      if (!project) return `没有这个项目：${id}`;
    } else if (type !== "none") {
      return `无效的类型：${type}`;
    }

    // 修改日程槽
    state.lockedSchedule.slots[phaseId] = { type, id: type === "none" ? null : id };
    state.phaseTransitionPending = null;

    const targetName = type === "none"
      ? "休息"
      : type === "activity"
        ? activityById(id)?.name
        : type === "skill"
          ? itemById(content.skills, id)?.name
          : projectById(id)?.name;

    return formatLines([
      `已调整 ${targetPhase.name}：${targetName}`,
      formatNextAdvice(state)
    ]);
  }

  return formatLines([
    `${fromPhaseName}阶段已结束。`,
    `使用 phase continue 继续原计划，或 phase adjust <phaseId> <type> <id> 调整。`
  ]);
}

function processCompleteCommand(state, args) {
  if (!state.earlyCompletionPending) {
    return "当前没有提前完成的任务。";
  }

  const [action, type, id] = args;
  const pending = state.earlyCompletionPending;
  const phase = SCHEDULE_PHASE_BY_ID[pending.phaseId];
  const completedTaskName = pending.completedTask.type === "activity"
    ? activityById(pending.completedTask.id)?.name
    : pending.completedTask.type === "skill"
      ? itemById(content.skills, pending.completedTask.id)?.name
      : pending.completedTask.type === "project"
        ? projectById(pending.completedTask.id)?.name
        : "任务";

  if (action === "rest") {
    state.earlyCompletionPending = null;
    // 保持 clearActiveWork 状态，进入休整
    const remainingHours = Math.floor(pending.remainingMinutes / 60);
    const remainingMinutes = pending.remainingMinutes % 60;
    return formatLines([
      `${completedTaskName} 已完成，进入休整模式。`,
      `${phase.name}阶段剩余 ${remainingHours}h${remainingMinutes}m 将恢复精力。`,
      formatNextAdvice(state)
    ]);
  }

  if (action === "switch") {
    if (!type || !id) {
      return "用法：complete switch <activity|skill|project> <id>";
    }

    // 临时切换，不修改日程
    state.earlyCompletionPending = null;

    if (type === "activity") {
      const activity = activityById(id);
      if (!activity) return `没有这个活动：${id}`;
      if (!activityUnlocked(state, activity)) return `活动 ${activity.name} 尚未解锁。`;
      state.activeActivityId = id;
      state.activeSkillLearningId = null;
      state.activeProjectId = null;
      return formatLines([
        `${completedTaskName} 已完成，切换到活动：${activity.name}。`,
        `${phase.name}阶段剩余时间将推进该活动。`,
        formatNextAdvice(state)
      ]);
    }

    if (type === "skill") {
      const skill = itemById(content.skills, id);
      if (!skill) return `没有这个技能：${id}`;
      const progress = ensureSkillProgress(state, id);
      if (progress.level > 0) return `${skill.name} 已学会，无需继续学习。使用 upgrade ${id} 升级。`;
      if (!progress.resourcesPaid && !canAfford(state.resources, skill.cost)) {
        return formatLines([
          `资源不足，学习 ${skill.name} 需要 ${formatResourceList(skill.cost)}。`,
          formatShortfall(state.resources, skill.cost)
        ]);
      }
      if (!progress.resourcesPaid) {
        pay(state.resources, skill.cost);
        progress.resourcesPaid = true;
      }
      state.activeSkillLearningId = id;
      state.activeActivityId = null;
      state.activeProjectId = null;
      return formatLines([
        `${completedTaskName} 已完成，切换到学习：${skill.name}。`,
        `${phase.name}阶段剩余时间将推进学习。`,
        formatNextAdvice(state)
      ]);
    }

    if (type === "project") {
      const project = projectById(id);
      if (!project) return `没有这个项目：${id}`;
      const missing = missingProjectRequirements(state, project, { skipResources: true });
      if (missing.length) {
        return `项目 ${project.name} 条件不足：${missing.join("、")}`;
      }
      ensureProjectProgress(state, id);
      ensureProjectDeadline(state, project);
      state.activeProjectId = id;
      state.activeActivityId = null;
      state.activeSkillLearningId = null;
      return formatLines([
        `${completedTaskName} 已完成，切换到项目：${project.name}。`,
        `${phase.name}阶段剩余时间将推进项目。`,
        formatNextAdvice(state)
      ]);
    }

    return "用法：complete switch <activity|skill|project> <id>";
  }

  return formatLines([
    `${completedTaskName} 已提前完成！`,
    `${phase.name}阶段还剩 ${Math.floor(pending.remainingMinutes / 60)}h${pending.remainingMinutes % 60}m`,
    "选项：",
    "  complete rest              (休整恢复精力)",
    "  complete switch <type> <id> (切换任务)"
  ]);
}

function processDayCommand(state, args, options = {}) {
  if (!state.dayEndSummaryPending) {
    return "当前不在一天结束总结窗口。";
  }

  const [action] = args;
  const pending = state.dayEndSummaryPending;

  if (action === "confirm" || !action) {
    // 确认总结，结算睡眠并跳转到第二天 09:00
    const currentDay = pending.day;
    state.dayEndSummaryPending = null;

    const nextDayStart = currentDay * MINUTES_PER_DAY + 9 * 60;
    const sleepMinutes = Math.max(0, nextDayStart - state.worldTimeMinutes);
    const sleepDeltas = sleepMinutes > 0 ? settleLifestyleRest(state, "rest_night", sleepMinutes) : {};
    const sleepSummary = formatChangedResources({}, sleepDeltas);
    state.worldTimeMinutes = nextDayStart;

    // 重置日程
    resetScheduleForCurrentDay(state);

    // 应用晨间转换
    const messages = [];
    const events = [];
    applyMorningTransitionIfDue(state, messages, events);
    state.lastTick = options.now ?? Date.now();

    return formatLines([
      `D${currentDay} ${pending.summary.weekday} 已结束。`,
      `睡眠结算 ${Math.floor(sleepMinutes / 60)}h${sleepMinutes % 60}m${sleepSummary ? `：${sleepSummary}` : "。"}`,
      `欢迎来到 D${currentDay + 1}，请安排今日日程。`,
      formatNextAdvice(state)
    ]);
  }

  if (action === "review") {
    // 重新显示总结
    return formatDayEndSummary(pending.summary);
  }

  // 默认显示总结
  return formatDayEndSummary(pending.summary);
}

function formatDayEndSummary(summary) {
  const lines = [`[一天结束] D${summary.day} ${summary.weekday}`];

  // 工作统计
  const totalMinutes = summary.workTime.morning + summary.workTime.afternoon + summary.workTime.evening;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  lines.push(`[工作时长] ${hours}h${minutes}m`);

  // 活动统计
  if (summary.activities.length > 0) {
    const activityNames = summary.activities.map(a => {
      const activity = activityById(a.id);
      return activity ? activity.name : a.id;
    }).join("、");
    lines.push(`[今日活动] ${activityNames}`);
  }

  // 资源变化
  if (summary.resources && Object.keys(summary.resources).length > 0) {
    const resourceStr = formatChangedResources({}, summary.resources);
    if (resourceStr) {
      lines.push(`[资源变化] ${resourceStr}`);
    }
  }

  // 明日提醒
  if (summary.tomorrowReminders.length > 0) {
    lines.push(`[明日提醒] ${summary.tomorrowReminders.join("、")}`);
  }

  lines.push("");
  lines.push("输入 day confirm 或按 Enter 确认，进入明天。");

  return lines.join("\n");
}

function formatReportNumber(value, digits = 0) {
  const number = Number(value) || 0;
  return digits > 0 ? number.toFixed(digits) : formatNumber(number);
}

function formatReportDelta(value, unit = "") {
  const number = Number(value) || 0;
  const sign = number > 0 ? "+" : number < 0 ? "-" : "";
  return `${sign}${formatReportNumber(Math.abs(number))}${unit}`;
}

function getReportDelta(summary, id) {
  return Number(summary && summary.resourceDeltas && summary.resourceDeltas[id]) || 0;
}

function formatReportProjectProgress(projectProgressDeltas = []) {
  const first = projectProgressDeltas[0];
  if (!first) return "独立项目推进: 今日无显著推进";
  return `独立项目《${first.name}》总进度: ${formatReportNumber(first.startPercent, 1)}% -> ${formatReportNumber(first.endPercent, 1)}% (▲ ${formatReportNumber(first.deltaPercent, 1)}%)`;
}

function buildDayEndReport(summary) {
  if (!summary) return null;
  const calendar = summary.calendar || {};
  const year = Number.isFinite(Number(calendar.year)) ? Math.floor(Number(calendar.year)) : 1;
  const month = Number.isFinite(Number(calendar.month)) ? String(Math.floor(Number(calendar.month))).padStart(2, "0") : "01";
  const week = Number.isFinite(Number(calendar.weekOfMonth)) ? Math.floor(Number(calendar.weekOfMonth)) : 1;
  const dateLabel = `Y${year}-M${month}-W${week} ${summary.weekday}`;
  const code = getReportDelta(summary, "codeLines");
  const bugs = getReportDelta(summary, "bugs");
  const docs = getReportDelta(summary, "docs");
  const tests = getReportDelta(summary, "tests");
  const techDebt = getReportDelta(summary, "techDebt");
  const money = getReportDelta(summary, "money");
  const reputation = getReportDelta(summary, "reputation");
  const leads = getReportDelta(summary, "leads");
  const knowledge = getReportDelta(summary, "knowledge");
  const energy = summary.currentResources ? summary.currentResources.energy : null;
  const pressure = summary.currentResources ? summary.currentResources.pressure : null;
  const actions = (summary.phaseActions || [])
    .map((action) => `${action.phaseName}: ${action.label}${action.completed ? " [完成]" : ""}`)
    .join(" │ ") || "今日没有锁定行动";
  const phaseEventText = (summary.phaseEvents || [])
    .slice(-3)
    .map((event) => `${event.phaseName}:${event.name}`)
    .join(" │ ") || "今日没有额外插曲";
  const healthTags = summary.healthTags && summary.healthTags.length ? summary.healthTags.map((tag) => `[${tag}]`).join(" ") : "[状态尚可]";
  const projectProgress = formatReportProjectProgress(summary.projectProgressDeltas || []);
  const separator = "─".repeat(74);
  const rows = [
    "═".repeat(86),
    `📅 ${dateLabel} │ ⌛ 24:00 │ 📑 打工人每日资产与代码审计报告`,
    "═".repeat(86),
    "",
    "🏢 【大厂搬砖流水线】",
    separator,
    `▪ 今日行动轨迹: ${actions}`,
    `▪ 交付业务代码: ${formatReportDelta(code, " 行")} │ ▪ 线上新增缺陷: 🐛 ${formatReportDelta(bugs, " 个")}`,
    `▪ 文档沉淀贡献: ${formatReportDelta(docs, " 点")} │ ▪ 累计技术债务: 📈 ${formatReportDelta(techDebt, " 点")}`,
    `▪ 测试资产变化: ${formatReportDelta(tests, " 点")} │ ▪ 阶段小事: ${phaseEventText}`,
    "",
    "🚀 【极客秘密基地 (Side-Hustle)】",
    separator,
    `▪ 知识/线索资产: 知识 ${formatReportDelta(knowledge)} │ 线索 ${formatReportDelta(leads)}`,
    `▪ 私活/外包收益: ¥${formatReportDelta(money)} │ ▪ 社区声望影响力: ${formatReportDelta(reputation)}`,
    `▪ ${projectProgress}`,
    "",
    "🧠 【人类基本盘与健康赤字】",
    separator,
    `▪ 剩余能量: ${energy === null ? "--" : `${formatReportNumber(energy)}%`} │ ▪ 精神压力: ${pressure === null ? "--" : formatReportNumber(pressure)}`,
    `▪ 财务收支: ¥${formatReportDelta(money)} │ ▪ 健康状态: ${healthTags}`,
    "",
    separator,
    "💬 【Leader/内心独白辣评】",
    `“${summary.commentary || "今天的缓存已写盘，明天继续。"}”`,
    separator,
    "",
    "⌨️ [按 Space 确认并清空缓存，迎接明天的太阳...]"
  ];
  return {
    title: "打工人每日资产与代码审计报告",
    dateLabel,
    timeLabel: "24:00",
    rows,
    summary
  };
}

function missingProjectRequirements(state, project, options = {}) {
  const missing = [];
  if (!options.skipResources) {
    for (const [key, value] of Object.entries(project.requirements.resources || {})) {
      if ((state.resources[key] || 0) < value) missing.push(`${RESOURCE_NAMES[key] || key} ${formatNumber(value - (state.resources[key] || 0))}`);
    }
  }
  for (const [id, level] of Object.entries(project.requirements.activityLevels || {})) {
    if (getActivityLevel(state, id) < level) missing.push(`${activityById(id)?.name || id} Lv.${level}`);
  }
  for (const skill of project.requirements.skills || []) {
    const requiredLevel = clamp(Math.floor(Number(project.difficulty) || 1), 1, 5);
    if (getSkillLevel(state, skill) < requiredLevel) missing.push(`技能 ${skill} ${SKILL_LEVEL_NAMES[requiredLevel]}`);
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
  const project = projectById(id);
  if (!project) return `没有这个项目：${id}`;
  const existingProgress = state.projectProgress[project.id];
  const missing = missingProjectRequirements(state, project, { skipResources: true });
  if (missing.length) {
    return formatLines([
      `项目条件不足，还需要：${missing.join("、")}。`,
      "建议：先补齐技能和活动等级，再回来接取。"
    ]);
  }

  const progress = ensureProjectProgress(state, project.id);
  const continuing = Boolean(existingProgress);
  state.activeProjectId = project.id;
  state.activeSkillLearningId = null;
  state.activeActivityId = null;
  const deadline = ensureProjectDeadline(state, project);
  const currentProgress = getProjectProgress(state, project);
  return formatLines([
    `${continuing ? "继续项目" : state.completedProjects.includes(id) ? "重复项目" : project.kind === "commission" ? "接受委托" : "开始项目"}：${project.name}。`,
    `类型：${project.kind === "commission" ? "随机委托" : "里程碑"}；当前阶段 ${currentProgress.stageIndex + 1}/${currentProgress.stageCount} ${currentProgress.stage ? currentProgress.stage.name : ""}。`,
    `阶段进度：${formatDuration(currentProgress.stageWorkedSeconds)}/${formatDuration(currentProgress.stageRequiredSeconds)}（${currentProgress.stageProgressPercent}%）。`,
    `已消耗素材：${formatProjectResourceList(currentProgress.spentResources)}。`,
    `Deadline：D${String(getWorldCalendar(deadline.dueWorldMinute).day).padStart(3, "0")} ${getWorldCalendar(deadline.dueWorldMinute).hhmm}。`,
    `难度 ${project.difficulty}，当前成功率 ${formatPercent(getProjectSuccessRate(state, project))}，最高 ${formatPercent(project.maxSuccessRate)}。`,
    formatNextAdvice(state)
  ]);
}

function promote(state) {
  const role = roleById(state.currentRole);
  if (!role || !role.promoteTo) return "你已经是当前版本的最高职位了。";
  const req = role.promoteRequirements;
  const missing = [];
  if ((state.resources.reputation || 0) < req.reputation) missing.push(`${req.reputation} 声望`);
  if (state.completedProjects.length < req.completedProjects) missing.push(`${req.completedProjects} 个完成项目`);
  for (const skill of req.skills || []) if (getSkillLevel(state, skill) < 1) missing.push(`技能 ${skill}`);
  for (const [id, level] of Object.entries(req.activityLevels || {})) if (getActivityLevel(state, id) < level) missing.push(`${activityById(id)?.name || id} Lv.${level}`);
  if (missing.length) return formatLines([`晋升失败，还需要：${missing.join("、")}。`, formatNextAdvice(state)]);

  state.currentRole = role.promoteTo;
  const nextRole = roleById(state.currentRole);
  applyAttributeExpRewards(state, nextRole.attributeExp);
  const transitionStory = `职业转折：从 ${role.name} 到 ${nextRole.name}，你不再只是完成任务，也开始被期待拆解问题、承担结果。`;
  return formatLines([
    `晋升成功！当前职位：${nextRole.name}。`,
    transitionStory,
    `固定精力上限：${ENERGY_MAX}。当前精力 ${formatNumber(state.resources.energy)}（${formatEnergyStatus(state)}）。`,
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

function getSaveRoot(saveRoot) {
  return saveRoot || path.dirname(SAVE_PATH);
}

function resolveProfilePath(profileId = DEFAULT_PROFILE_ID, saveRoot) {
  const id = normalizeProfileId(profileId);
  if (!id) throw new Error(`非法档案 ID：${profileId}`);
  if (id === DEFAULT_PROFILE_ID) return path.join(getSaveRoot(saveRoot), path.basename(SAVE_PATH));
  return path.join(getSaveRoot(saveRoot), "profiles", `${id}.json`);
}

function resolveLastProfilePath(saveRoot) {
  return path.join(getSaveRoot(saveRoot), "last-profile.json");
}

function readLastProfileId(options = {}) {
  const metadataPath = resolveLastProfilePath(options.saveRoot);
  if (!fs.existsSync(metadataPath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
    return normalizeProfileId(raw && raw.profileId) || null;
  } catch {
    return null;
  }
}

function writeLastProfileId(profileIdOrState, options = {}) {
  const rawId = typeof profileIdOrState === "object" && profileIdOrState !== null
    ? profileIdOrState.profileId
    : profileIdOrState;
  const id = normalizeProfileId(rawId);
  if (!id) throw new Error(`非法档案 ID：${rawId}`);
  const metadataPath = resolveLastProfilePath(options.saveRoot);
  fs.mkdirSync(path.dirname(metadataPath), { recursive: true });
  fs.writeFileSync(metadataPath, JSON.stringify({
    profileId: id,
    updatedAt: new Date(options.now ?? Date.now()).toISOString()
  }, null, 2));
  return id;
}

function applyProfileMetadata(state, profileId, profileName, now = Date.now()) {
  const id = normalizeProfileId(profileId) || DEFAULT_PROFILE_ID;
  const timestamp = new Date(now).toISOString();
  state.profileId = id;
  state.profileName = normalizeProfileName(profileName, id);
  state.createdAt = normalizeTimestamp(state.createdAt, timestamp);
  state.updatedAt = normalizeTimestamp(state.updatedAt, timestamp);
  return state;
}

function readProfileState(profileId, now = Date.now(), saveRoot) {
  const id = normalizeProfileId(profileId);
  if (!id) throw new Error(`非法档案 ID：${profileId}`);
  const savePath = resolveProfilePath(id, saveRoot);
  if (!fs.existsSync(savePath)) {
    if (id !== DEFAULT_PROFILE_ID) throw new Error(`没有这个档案：${id}`);
    return applyProfileMetadata(createNewState(now), DEFAULT_PROFILE_ID, DEFAULT_PROFILE_NAME, now);
  }
  const raw = JSON.parse(fs.readFileSync(savePath, "utf8"));
  return applyProfileMetadata(normalizeState(raw, now), id, raw.profileName, now);
}

function profileSummaryFromFile(profileId, savePath, currentProfileId, now = Date.now()) {
  const id = normalizeProfileId(profileId);
  if (!fs.existsSync(savePath)) {
    return {
      id,
      name: id === DEFAULT_PROFILE_ID ? DEFAULT_PROFILE_NAME : id,
      characterCardId: null,
      characterCardName: getCharacterCardName(null),
      current: id === currentProfileId,
      exists: false,
      createdAt: null,
      updatedAt: null,
      command: `profile load ${id}`
    };
  }
  const raw = JSON.parse(fs.readFileSync(savePath, "utf8"));
  const state = applyProfileMetadata(normalizeState(raw, now), id, raw.profileName, now);
  return {
    id,
    name: state.profileName,
    characterCardId: state.characterCardId,
    characterCardName: getCharacterCardName(state.characterCardId),
    current: id === currentProfileId,
    exists: true,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    command: id === currentProfileId ? null : `profile load ${id}`
  };
}

function listProfiles(options = {}) {
  const saveRoot = getSaveRoot(options.saveRoot);
  const currentProfileId = normalizeProfileId(options.currentProfileId) || DEFAULT_PROFILE_ID;
  const profiles = [profileSummaryFromFile(DEFAULT_PROFILE_ID, resolveProfilePath(DEFAULT_PROFILE_ID, saveRoot), currentProfileId, options.now)];
  const profilesDir = path.join(saveRoot, "profiles");
  if (fs.existsSync(profilesDir)) {
    for (const entry of fs.readdirSync(profilesDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const id = normalizeProfileId(path.basename(entry.name, ".json"));
      if (!id || id === DEFAULT_PROFILE_ID) continue;
      profiles.push(profileSummaryFromFile(id, path.join(profilesDir, entry.name), currentProfileId, options.now));
    }
  }
  return profiles.sort((a, b) => {
    if (a.id === DEFAULT_PROFILE_ID) return -1;
    if (b.id === DEFAULT_PROFILE_ID) return 1;
    return a.id.localeCompare(b.id);
  });
}

function formatProfiles(profiles) {
  return formatLines([
    "新建档案需选择人物卡：profile new <id> --card <cardId> [name]",
    "档案：",
    ...profiles.map((profile) => {
      const marker = profile.current ? "*" : " ";
      const status = profile.exists ? "已创建" : "未创建";
      const card = profile.characterCardName ? `，人物卡 ${profile.characterCardName}` : "";
      const updatedAt = profile.updatedAt ? `，更新 ${profile.updatedAt}` : "";
      return `${marker} ${profile.id} - ${profile.name} [${status}]${card}${updatedAt}`;
    })
  ]);
}

function saveProfile(state, options = {}) {
  const now = options.now ?? Date.now();
  const id = normalizeProfileId(state.profileId) || DEFAULT_PROFILE_ID;
  state.profileId = id;
  state.profileName = normalizeProfileName(state.profileName, id);
  state.updatedAt = new Date(now).toISOString();
  saveGame(state, resolveProfilePath(id, options.saveRoot));
  return state;
}

function loadProfile(profileId = DEFAULT_PROFILE_ID, now = Date.now(), options = {}) {
  return readProfileState(profileId, now, options.saveRoot);
}

function loadLastProfile(now = Date.now(), options = {}) {
  const id = readLastProfileId(options) || DEFAULT_PROFILE_ID;
  try {
    return loadProfile(id, now, options);
  } catch {
    return loadProfile(DEFAULT_PROFILE_ID, now, options);
  }
}

function createProfile(profileId, profileName, now = Date.now(), options = {}) {
  const id = normalizeProfileId(profileId);
  if (!id) throw new Error(`非法档案 ID：${profileId}`);
  if (!options.characterCardId) throw new Error("新建档案必须选择人物卡：profile new <id> --card <cardId> [name]");
  if (!characterCardById(options.characterCardId)) throw new Error(`没有这个人物卡：${options.characterCardId}`);
  const savePath = resolveProfilePath(id, options.saveRoot);
  if (fs.existsSync(savePath)) throw new Error(`档案已存在：${id}`);
  const state = applyProfileMetadata(createNewState(now, { characterCardId: options.characterCardId }), id, profileName || id, now);
  saveProfile(state, { saveRoot: options.saveRoot, now });
  return state;
}

function deleteProfile(profileId, options = {}) {
  const id = normalizeProfileId(profileId);
  if (!id) throw new Error(`非法档案 ID：${profileId}`);
  if (id === DEFAULT_PROFILE_ID) throw new Error("default 档案不能删除。");
  if (id === normalizeProfileId(options.currentProfileId)) throw new Error("不能删除当前正在使用的档案。");
  if (!options.confirm) throw new Error(`删除档案 ${id} 需要确认：profile delete ${id} confirm`);
  const savePath = resolveProfilePath(id, options.saveRoot);
  if (!fs.existsSync(savePath)) throw new Error(`没有这个档案：${id}`);
  fs.unlinkSync(savePath);
}

function replaceStateContents(target, source) {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, source);
  return target;
}

function getProfileOptions(state, options = {}) {
  const profiles = listProfiles({ saveRoot: options.saveRoot, currentProfileId: state.profileId, now: options.now });
  return [
    {
      id: "profile-new",
      name: "新建档案",
      description: "新建档案必须先选择人物卡。切到 C 人物卡面板，或使用 profile new <id> --card <cardId> [name]。",
      status: "需选择人物卡",
      command: null
    },
    {
      id: "profile-save",
      name: "保存当前档案",
      description: `${state.profileId} - ${state.profileName}`,
      status: "可保存",
      command: "save"
    },
    ...profiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
      description: `${profile.id}，人物卡 ${profile.characterCardName}${profile.updatedAt ? `，更新 ${profile.updatedAt}` : ""}`,
      status: profile.current ? "当前" : profile.exists ? "可加载" : "未创建",
      command: profile.current ? null : `profile load ${profile.id}`,
      deleteCommand: profile.id !== DEFAULT_PROFILE_ID && !profile.current ? `profile delete ${profile.id} confirm` : null,
      current: profile.current
    }))
  ];
}

function parseProfileNewArgs(args) {
  const [id, ...rest] = args;
  let characterCardId = null;
  const nameParts = [];
  for (let index = 0; index < rest.length; index += 1) {
    const part = rest[index];
    if (part === "--card") {
      characterCardId = rest[index + 1] || null;
      index += 1;
    } else {
      nameParts.push(part);
    }
  }
  return { id, characterCardId, profileName: nameParts.join(" ") || id };
}

function shouldAutosaveCurrentProfile(state, options = {}) {
  const id = normalizeProfileId(state.profileId) || DEFAULT_PROFILE_ID;
  if (state.characterCardId) return true;
  return fs.existsSync(resolveProfilePath(id, options.saveRoot));
}

function processProfileCommand(state, args, options = {}) {
  const [subcommand, id, ...rest] = args;
  const now = options.now ?? Date.now();
  try {
    switch (subcommand) {
      case "list":
      case undefined:
        return formatProfiles(listProfiles({ saveRoot: options.saveRoot, currentProfileId: state.profileId, now }));
      case "new": {
        if (!id) return "用法：profile new <id> --card <cardId> [name]";
        const parsed = parseProfileNewArgs([id, ...rest]);
        if (!parsed.characterCardId) return "新建档案必须选择人物卡：profile new <id> --card <cardId> [name]";
        if (shouldAutosaveCurrentProfile(state, options)) saveProfile(state, { saveRoot: options.saveRoot, now });
        const next = createProfile(parsed.id, parsed.profileName, now, { saveRoot: options.saveRoot, characterCardId: parsed.characterCardId });
        replaceStateContents(state, next);
        return `已创建并切换到档案：${state.profileId} - ${state.profileName}（${getCharacterCardName(state.characterCardId)}）。`;
      }
      case "load": {
        if (!id) return "用法：profile load <id>";
        if (id === state.profileId) return `已经在档案 ${state.profileId}。`;
        if (shouldAutosaveCurrentProfile(state, options)) saveProfile(state, { saveRoot: options.saveRoot, now });
        const next = loadProfile(id, now, { saveRoot: options.saveRoot });
        replaceStateContents(state, next);
        return `已切换到档案：${state.profileId} - ${state.profileName}。`;
      }
      case "save": {
        if (id) {
          state.profileId = id;
          if (rest.length) state.profileName = rest.join(" ");
        }
        saveProfile(state, { saveRoot: options.saveRoot, now });
        return `已保存档案：${state.profileId} - ${state.profileName}。`;
      }
      case "rename": {
        if (!id || !rest.length) return "用法：profile rename <id> <name>";
        const target = loadProfile(id, now, { saveRoot: options.saveRoot });
        target.profileName = rest.join(" ");
        saveProfile(target, { saveRoot: options.saveRoot, now });
        if (state.profileId === target.profileId) state.profileName = target.profileName;
        return `已重命名档案：${target.profileId} - ${target.profileName}。`;
      }
      case "delete": {
        if (!id) return "用法：profile delete <id> confirm";
        const confirm = rest[0] === "confirm";
        deleteProfile(id, { saveRoot: options.saveRoot, currentProfileId: state.profileId, confirm });
        return `已删除档案：${id}。`;
      }
      default:
        return "用法：profiles 或 profile list|new|load|save|rename|delete；新建：profile new <id> --card <cardId> [name]";
    }
  } catch (error) {
    return error && error.message ? error.message : String(error);
  }
}

function processCommand(state, input, options = {}) {
  const now = options.now ?? Date.now();
  const messages = [];
  const trimmed = input.trim();
  if (!trimmed) return { messages, exit: false };

  const parts = trimmed.split(/\s+/);
  const command = parts[0];
  const args = parts.slice(1);
  const arg = args[0];
  if (!trimmed.startsWith("wait ") && !trimmed.startsWith("plan") && !trimmed.startsWith("lifestyle") && !trimmed.startsWith("day")) {
    messages.push(...settleTime(state, now, { randomEvents: options.randomEvents, rng: options.rng }).messages);
  }

  switch (command) {
    case "status":
      messages.push(formatState(state));
      break;
    case "activities":
      messages.push(formatActivities(state));
      break;
    case "events":
      messages.push(formatWorldEvents(state));
      break;
    case "plan":
      messages.push(processPlanCommand(state, args));
      break;
    case "week":
      messages.push(arg ? setWeeklyFocus(state, arg) : `本周重点：${formatWeeklyFocus(state)}。用法：week <learning|project|freelance|quality|balanced>`);
      break;
    case "lifestyle":
      messages.push(arg ? setLifestyleStance(state, arg) : formatLifestyle(state));
      break;
    case "start":
      messages.push(arg ? `start 不再立即执行。请使用 plan morning activity ${arg} 或 plan afternoon activity ${arg} 安排到今日日程。` : "用法：plan <morning|afternoon|evening> activity <activityId>");
      break;
    case "stop":
      messages.push(stopActivity(state));
      break;
    case "learn":
      messages.push(arg ? `learn 不再立即执行。请使用 plan morning skill ${arg} 或 plan afternoon skill ${arg} 安排学习。` : "用法：plan <morning|afternoon|evening> skill <id>");
      break;
    case "upgrade":
      messages.push(arg ? upgradeSkill(state, arg) : "用法：upgrade <id>");
      break;
    case "buy":
      messages.push(arg ? buyTool(state, arg) : "用法：buy <id>");
      break;
    case "projects":
      messages.push(formatProjectBoard(state));
      break;
    case "project":
      messages.push(arg ? submitProject(state, arg) : formatProjectBoard(state));
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
    case "complete":
      messages.push(processCompleteCommand(state, args));
      break;
    case "phase":
      messages.push(processPhaseCommand(state, args));
      break;
    case "day":
      messages.push(processDayCommand(state, args, { ...options, now }));
      break;
    case "profiles":
      messages.push(formatProfiles(listProfiles({ saveRoot: options.saveRoot, currentProfileId: state.profileId, now })));
      break;
    case "cards":
      messages.push(formatCharacterCards());
      break;
    case "profile":
      messages.push(processProfileCommand(state, args, { ...options, now }));
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
      saveProfile(state, { saveRoot: options.saveRoot, now });
      messages.push(`已保存档案：${state.profileId} - ${state.profileName}。`);
      break;
    case "quit":
    case "exit":
      saveProfile(state, { saveRoot: options.saveRoot, now });
      writeLastProfileId(state, { saveRoot: options.saveRoot, now });
      messages.push(`已保存档案 ${state.profileId}，下次继续写。`);
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

function defaultProfileExists(saveRoot) {
  return fs.existsSync(resolveProfilePath(DEFAULT_PROFILE_ID, saveRoot));
}

function startCliSession(state) {
  const offline = settleTime(state, Date.now(), { randomEvents: true });
  saveProfile(state);

  console.log("《代码人生》CLI");
  console.log(`当前档案：${state.profileId} - ${state.profileName}`);
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
        if (liveTicks % 10 === 0) saveProfile(state);
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
    saveProfile(state);
    writeLastProfileId(state);
  });
}

function startCli() {
  if (!defaultProfileExists()) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      console.log("首次创建 default 档案必须选择人物卡。");
      console.log("可用人物卡：");
      console.log(formatCharacterCards());
      console.log("用法：profile new default --card <cardId> 默认档案");
      return;
    }

    console.log("首次创建 default 档案，请选择人物卡：");
    console.log(formatCharacterCards());
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question("输入人物卡 id> ", (answer) => {
      const characterCardId = String(answer || "").trim();
      try {
        const state = createProfile(DEFAULT_PROFILE_ID, DEFAULT_PROFILE_NAME, Date.now(), { characterCardId });
        rl.close();
        startCliSession(state);
      } catch (error) {
        console.log(error && error.message ? error.message : String(error));
        rl.close();
        startCli();
      }
    });
    return;
  }

  startCliSession(loadLastProfile());
}

if (require.main === module) {
  startCli();
}

module.exports = {
  ATTRIBUTE_IDS,
  ATTRIBUTE_NAMES,
  DEFAULT_ATTRIBUTES,
  ENERGY_MAX,
  OFFLINE_CAP_SECONDS,
  SAVE_VERSION,
  SAVE_PATH,
  SCHEDULE_PHASES,
  WORLD_START_MINUTES,
  addAttributeExp,
  buyTool,
  claimGoal,
  applyCharacterCard,
  characterCardById,
  createNewState,
  createProfile,
  deleteProfile,
  defaultProfileExists,
  formatActivities,
  formatCharacterCards,
  formatChangedResources,
  formatGameEvent,
  formatGameEvents,
  formatGoals,
  formatGoalSummary,
  formatLiveStatus,
  estimateActivityPerHour,
  formatLifestyle,
  formatNearestDeadline,
  formatState,
  formatSchedule,
  formatWorldCalendar,
  formatWorldEvents,
  createTuiTicker,
  getActivityLevel,
  getActivityOptions,
  getActivityProgress,
  getBaseAttribute,
  getBreakthrough,
  getCharacterCardOptions,
  getEffectiveAttribute,
  getEffectiveMaxEnergy,
  getEnergyStatus,
  getGameViewModel,
  getGoalOptions,
  getLifestyleOptions,
  getManagementOptions,
  getMultipliers,
  getNearestDeadline,
  getProductionRisk,
  getProfileOptions,
  getScheduleOptions,
  getProjectProgress,
  getProjectSuccessRate,
  getSkillProgress,
  getWorldCalendar,
  getAdviceList,
  formatAdviceList,
  helpText,
  learnSkill,
  listContent,
  listProfiles,
  loadGame,
  loadLastProfile,
  loadProfile,
  normalizeState,
  processCommand,
  processPlanCommand,
  promote,
  qualityPenalty,
  replaceStateContents,
  readLastProfileId,
  resolveLastProfilePath,
  resolveProfilePath,
  saveGame,
  saveProfile,
  settleTime,
  startActivity,
  stopActivity,
  submitProject,
  updateHourlySummarySnapshot,
  upgradeSkill,
  writeLastProfileId
};
