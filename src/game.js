const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const content = require("./content");

const DEFAULT_PROFILE_ID = "default";
const DEFAULT_PROFILE_NAME = "默认档案";
const SAVE_PATH = path.join(process.cwd(), ".save", "code-life.json");
const PROFILE_DIR = path.join(process.cwd(), ".save", "profiles");
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
const RESOURCE_ORDER = ["codeLines", "money", "knowledge", "tests", "docs", "architecture", "leads", "energy", "pressure", "bugs", "techDebt", "reputation"];
const EVENT_LABELS = {
  command: "命令",
  project: "项目",
  skill: "技能",
  career: "职业",
  warning: "警告",
  focus: "周重点",
  world: "世界大势",
  random: "随机事件",
  system: "系统"
};
const BUG_RISK_THRESHOLDS = [25, 50, 75];
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
const WORLD_START_MINUTES = 9 * 60;
const MINUTES_PER_DAY = 24 * 60;
const SAVE_VERSION = 2;
const SCHEDULE_PHASES = [
  { id: "morning", name: "上午", start: 9 * 60, end: 12 * 60, required: true },
  { id: "afternoon", name: "下午", start: 14 * 60, end: 18 * 60, required: true },
  { id: "evening", name: "晚上", start: 18 * 60, end: 21 * 60, required: false, overtime: true }
];
const SCHEDULE_PHASE_BY_ID = Object.fromEntries(SCHEDULE_PHASES.map((phase) => [phase.id, phase]));
const SCHEDULE_SLOT_TYPES = ["activity", "skill", "project", "none"];
const DAYS_PER_WEEK = 7;
const WEEKS_PER_MONTH = 4;
const MONTHS_PER_YEAR = 12;
const DAYS_PER_MONTH = DAYS_PER_WEEK * WEEKS_PER_MONTH;
const DAYS_PER_YEAR = DAYS_PER_MONTH * MONTHS_PER_YEAR;
const WEEKDAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
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
    description: "用赛博娱乐快速降压，深夜会压低次日精力上限。"
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
    activeProjectId: null,
    projectProgress: {},
    worldTimeMinutes: WORLD_START_MINUTES,
    scheduleDraft: createScheduleDraft(1),
    lockedSchedule: null,
    scheduleCompletedPhases: [],
    waitingForSchedule: true,
    weeklyFocus: "balanced",
    lifestyleStanceId: "health",
    pendingLifestyleStanceId: null,
    pendingMorningEnergyPenalty: 0,
    pendingMorningEnergyCapMultiplier: 1,
    dailyEnergyCapMultiplier: 1,
    lastMorningTransitionDay: 1,
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
    stats: {
      totalCodeLines: 0,
      totalBugsFixed: 0,
      totalProjects: 0
    }
  };
  if (options.characterCardId) applyCharacterCard(state, options.characterCardId);
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
    worldTimeMinutes: normalizeWorldTimeMinutes(raw && raw.worldTimeMinutes),
    scheduleDraft: normalizeSchedule(raw && raw.scheduleDraft, calendarDay),
    lockedSchedule: raw && raw.lockedSchedule ? normalizeSchedule(raw.lockedSchedule, calendarDay, { locked: true }) : null,
    scheduleCompletedPhases: normalizeCompletedSchedulePhases(raw && raw.scheduleCompletedPhases),
    waitingForSchedule: Boolean(raw && raw.waitingForSchedule),
    weeklyFocus: normalizeWeeklyFocus(raw && raw.weeklyFocus),
    lifestyleStanceId: normalizeLifestyleStanceId(raw && raw.lifestyleStanceId),
    pendingLifestyleStanceId: normalizePendingLifestyleStanceId(raw && raw.pendingLifestyleStanceId),
    pendingMorningEnergyPenalty: Math.max(0, Number(raw && raw.pendingMorningEnergyPenalty) || 0),
    pendingMorningEnergyCapMultiplier: normalizeEnergyCapMultiplier(raw && raw.pendingMorningEnergyCapMultiplier),
    dailyEnergyCapMultiplier: normalizeEnergyCapMultiplier(raw && raw.dailyEnergyCapMultiplier),
    lastMorningTransitionDay: normalizeLastMorningTransitionDay(raw && raw.lastMorningTransitionDay, raw && raw.worldTimeMinutes),
    triggeredWorldEvents: Array.isArray(raw && raw.triggeredWorldEvents) ? raw.triggeredWorldEvents.filter((id) => WORLD_EVENTS.some((event) => event.id === id)) : [],
    activeProjectDeadlines: normalizeProjectDeadlines(raw && raw.activeProjectDeadlines),
    warnedBugRiskThresholds: normalizeBugRiskThresholds(raw && raw.warnedBugRiskThresholds),
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
  if (!normalized.lockedSchedule) normalized.waitingForSchedule = true;
  if (normalized.lockedSchedule) normalized.scheduleDraft = normalizeSchedule(normalized.scheduleDraft, normalized.lockedSchedule.day);
  delete normalized.dailyActionMinutesUsed;
  delete normalized.currentDailyActionMinutesLimit;
  clampState(normalized);
  return normalized;
}

function normalizeWorldTimeMinutes(value) {
  const minutes = Number(value);
  return Number.isFinite(minutes) && minutes >= 0 ? Math.floor(minutes) : WORLD_START_MINUTES;
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

function normalizeEnergyCapMultiplier(value) {
  const number = Number(value);
  return Number.isFinite(number) ? clamp(number, 0.5, 1) : 1;
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

function normalizeProjectProgress(raw) {
  const result = {};
  for (const project of content.projects || []) {
    const progress = raw && raw[project.id];
    if (!progress || typeof progress !== "object") continue;
    const workedSeconds = Math.max(0, Number(progress.workedSeconds) || 0);
    const resourcesPaid = Boolean(progress.resourcesPaid);
    if (workedSeconds > 0 || resourcesPaid) {
      result[project.id] = { workedSeconds, resourcesPaid };
      if (Number.isFinite(Number(progress.dueWorldMinute))) {
        result[project.id].dueWorldMinute = Math.max(0, Math.floor(Number(progress.dueWorldMinute)));
      }
    }
  }
  return result;
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getWorldCalendar(worldTimeMinutes = WORLD_START_MINUTES) {
  const totalMinutes = normalizeWorldTimeMinutes(worldTimeMinutes);
  const dayIndex = Math.floor(totalMinutes / MINUTES_PER_DAY);
  const minuteOfDay = totalMinutes % MINUTES_PER_DAY;
  const year = Math.floor(dayIndex / DAYS_PER_YEAR) + 1;
  const dayOfYear = dayIndex % DAYS_PER_YEAR + 1;
  const month = Math.floor((dayOfYear - 1) / DAYS_PER_MONTH) + 1;
  const dayOfMonth = (dayOfYear - 1) % DAYS_PER_MONTH + 1;
  const weekOfMonth = Math.floor((dayOfMonth - 1) / DAYS_PER_WEEK) + 1;
  const weekdayIndex = (dayOfMonth - 1) % DAYS_PER_WEEK;
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const hhmm = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return {
    totalMinutes,
    dayIndex,
    day: dayIndex + 1,
    year,
    month,
    weekOfMonth,
    weekdayIndex,
    weekday: WEEKDAY_NAMES[weekdayIndex],
    hour,
    minute,
    hhmm,
    full: `第${year}年 ${month}月 第${weekOfMonth}周 ${WEEKDAY_NAMES[weekdayIndex]} 第${dayIndex + 1}天 ${hhmm}`,
    short: `Y${year} M${String(month).padStart(2, "0")} W${weekOfMonth} ${WEEKDAY_NAMES[weekdayIndex]} D${String(dayIndex + 1).padStart(3, "0")} ${hhmm}`
  };
}

function formatWorldCalendar(state, style = "full") {
  const calendar = getWorldCalendar(state.worldTimeMinutes);
  return style === "short" ? calendar.short : calendar.full;
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
  const role = roleById(state.currentRole) || content.roles[0];
  const capMultiplier = normalizeEnergyCapMultiplier(state.dailyEnergyCapMultiplier);
  return Math.max(1, role.maxEnergy * capMultiplier);
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
  if (stanceId === "health") return "休整恢复精力并降低压力，抗压越高恢复与减压越强。";
  if (stanceId === "tech_surfing") return "休整获得知识，专注可带来少量减压，但不恢复精力。";
  if (stanceId === "cyber_gaming") return "休整快速降低压力，深夜会降低次日精力上限，抗压可缓解代价。";
  if (stanceId === "side_hustle") return "深夜休整产出金钱和声望并增加压力，次日扣精力；创造、沟通、抗压和专注影响收益与代价。";
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
  const minutes = Math.max(0, seconds);
  if (!stance || !windowId || minutes <= 0) return deltas;

  if (stance.id === "health") {
    const resilienceRecovery = 1 + attributeBonus(state, "resilience", 0.003, 0.24);
    const resilienceRelief = 1 + attributeBonus(state, "resilience", 0.004, 0.32);
    deltas.energy = applyResourceDelta(state, "energy", minutes * 0.2 * resilienceRecovery);
    deltas.pressure = applyResourceDelta(state, "pressure", -minutes * 0.05 * resilienceRelief);
    return deltas;
  }

  if (stance.id === "tech_surfing") {
    const learningBoost = 1 + attributeBonus(state, "learning", 0.003, 0.24);
    const focusRelief = attributeBonus(state, "focus", 0.003, 0.18);
    deltas.knowledge = applyResourceDelta(state, "knowledge", minutes * 0.06 * learningBoost);
    if (focusRelief > 0) deltas.pressure = applyResourceDelta(state, "pressure", -minutes * 0.01 * focusRelief);
    return deltas;
  }

  if (stance.id === "cyber_gaming") {
    const resilienceRelief = 1 + attributeBonus(state, "resilience", 0.004, 0.32);
    deltas.pressure = applyResourceDelta(state, "pressure", -minutes * 0.12 * resilienceRelief);
    if (windowId === "rest_night") {
      const penaltyRelief = attributeBonus(state, "resilience", 0.005, 0.4);
      const capMultiplier = 1 - 0.2 * (1 - penaltyRelief);
      state.pendingMorningEnergyCapMultiplier = Math.min(normalizeEnergyCapMultiplier(state.pendingMorningEnergyCapMultiplier), capMultiplier);
    }
    return deltas;
  }

  if (stance.id === "side_hustle" && windowId === "rest_night") {
    const creativityBoost = 1 + attributeBonus(state, "creativity", 0.004, 0.32);
    const communicationBoost = 1 + attributeBonus(state, "communication", 0.003, 0.24);
    const resilienceRelief = attributeBonus(state, "resilience", 0.004, 0.3);
    const focusRelief = attributeBonus(state, "focus", 0.004, 0.333);
    deltas.money = applyResourceDelta(state, "money", minutes * 0.035 * creativityBoost);
    deltas.reputation = applyResourceDelta(state, "reputation", minutes * 0.0008 * communicationBoost);
    deltas.pressure = applyResourceDelta(state, "pressure", minutes * 0.018 * (1 - resilienceRelief));
    state.pendingMorningEnergyPenalty = Math.max(Number(state.pendingMorningEnergyPenalty) || 0, 30 * (1 - focusRelief));
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
    return { name: "技术浏览", defaultSummary: "获得知识，专注较高时少量降压", sideEffectSummary: "" };
  }
  if (stance.id === "cyber_gaming") {
    const night = windowId === "rest_night";
    return {
      name: "赛博娱乐",
      defaultSummary: night ? "降低压力，并设置次日精力上限惩罚" : "降低压力",
      sideEffectSummary: night ? "设置次日精力上限惩罚" : ""
    };
  }
  if (stance.id === "side_hustle") {
    if (windowId === "rest_night") {
      return {
        name: "独立副业",
        defaultSummary: "获得金钱和声望，增加压力，并设置次日精力扣除",
        sideEffectSummary: "设置次日精力扣除"
      };
    }
    return { name: "休整（副业只在深夜生效）", defaultSummary: "暂无可见产出", sideEffectSummary: "" };
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
  state.dailyEnergyCapMultiplier = normalizeEnergyCapMultiplier(state.pendingMorningEnergyCapMultiplier);
  state.pendingMorningEnergyCapMultiplier = 1;
  clampState(state);

  const energyPenalty = Math.max(0, Number(state.pendingMorningEnergyPenalty) || 0);
  if (energyPenalty > 0) {
    applyResourceDelta(state, "energy", -energyPenalty);
    state.pendingMorningEnergyPenalty = 0;
  }

  if (state.pendingLifestyleStanceId) {
    state.lifestyleStanceId = normalizeLifestyleStanceId(state.pendingLifestyleStanceId);
    state.pendingLifestyleStanceId = null;
  }

  applyResourceDelta(state, "energy", 20);
  applyResourceDelta(state, "pressure", -5);

  pushMessageEvent(messages, events, "system", `09:00：${formatLifestyle(state).split("\n")[0]}。`);
  return true;
}

function getNearestDeadline(state) {
  const entries = Object.entries(state.activeProjectDeadlines || {})
    .map(([id, deadline]) => {
      const project = projectById(id);
      if (!project || !Number.isFinite(Number(deadline.dueWorldMinute)) || deadline.failed) return null;
      const daysRemaining = Math.ceil((deadline.dueWorldMinute - state.worldTimeMinutes) / MINUTES_PER_DAY);
      return {
        id,
        name: project.name,
        dueWorldMinute: deadline.dueWorldMinute,
        dueDay: getWorldCalendar(deadline.dueWorldMinute).day,
        daysRemaining,
        overdue: deadline.dueWorldMinute < state.worldTimeMinutes
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
    state.resources[key] = Math.max(0, Number(state.resources[key]) || 0);
  }
  state.resources.pressure = clamp(state.resources.pressure, 0, 100);
  state.dailyEnergyCapMultiplier = normalizeEnergyCapMultiplier(state.dailyEnergyCapMultiplier);
  state.pendingMorningEnergyCapMultiplier = normalizeEnergyCapMultiplier(state.pendingMorningEnergyCapMultiplier);
  state.resources.energy = clamp(Number(state.resources.energy) || 0, 0, getEffectiveMaxEnergy(state));
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
  return {
    codeEfficiency: (1 - pressurePenalty) * (1 - debtPenalty),
    bugDebtBoost,
    pressurePenalty,
    debtPenalty
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
  const deadline = state.activeProjectDeadlines && state.activeProjectDeadlines[project.id];
  if (deadline && Number(deadline.dueWorldMinute) < Number(state.worldTimeMinutes || WORLD_START_MINUTES)) {
    rate -= 0.12;
  }
  return clamp(rate, 0.15, maxSuccessRate);
}

function getProjectRequiredSeconds(projectOrId) {
  const project = typeof projectOrId === "string" ? projectById(projectOrId) : projectOrId;
  if (!project) return 0;
  return Math.max(1, Math.round((Number(project.minWorkHours) || 0) * 3600));
}

function getProjectProgress(state, projectOrId) {
  const project = typeof projectOrId === "string" ? projectById(projectOrId) : projectOrId;
  const id = project && project.id;
  const progress = id && state.projectProgress[id] ? state.projectProgress[id] : {};
  const workedSeconds = Math.max(0, Number(progress.workedSeconds) || 0);
  const requiredSeconds = getProjectRequiredSeconds(project);
  return {
    workedSeconds,
    requiredSeconds,
    remainingSeconds: Math.max(0, requiredSeconds - workedSeconds),
    progressPercent: requiredSeconds > 0 ? Math.min(100, Math.floor(workedSeconds / requiredSeconds * 100)) : 100,
    resourcesPaid: Boolean(progress.resourcesPaid)
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

function formatMultiplierList(multipliers = {}) {
  const entries = Object.entries(multipliers)
    .filter(([, value]) => value && value !== 1)
    .map(([key, value]) => `${MULTIPLIER_NAMES[key] || key} x${Number(value).toFixed(2)}`);
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

function createTuiTicker(state, result = null, changedResources = "") {
  const activeSeconds = result && Number(result.activeSeconds) > 0 ? Math.floor(Number(result.activeSeconds)) : 0;
  const activeName = result && result.activeName;
  if (activeSeconds > 0 && activeName) {
    const summary = changedResources || "进度推进";
    return [
      `[当前行动] ${activeName} ${activeSeconds} 秒：${summary}。`,
      `[当前时间] ${formatWorldCalendar(state, "short")}。`
    ];
  }

  const restTick = result && result.restTick;
  const restSeconds = restTick && Number(restTick.seconds) > 0 ? Math.floor(Number(restTick.seconds)) : 0;
  if (restSeconds > 0 && restTick.name) {
    const resourceSummary = formatRestChangedResources(restTick.deltas);
    const sideEffect = resourceSummary && restTick.sideEffectSummary ? `，${restTick.sideEffectSummary}` : "";
    const summary = `${resourceSummary || restTick.defaultSummary}${sideEffect}`;
    return [
      `[当前行动] ${restTick.name} ${restSeconds} 秒：${summary}。`,
      `[当前时间] ${formatWorldCalendar(state, "short")}。`
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
  return [
    `[当前状态] ${status}。`,
    `[当前时间] ${formatWorldCalendar(state, "short")}。`
  ];
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
      return `${activity.id} - ${activity.name} [${status}] Lv.${progress.level} 等级经验 ${formatNumber(progress.exp)}/${formatNumber(progress.next)}，解锁：${formatActivityRequirements(activity.requirements)}。${activity.description}`;
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
  return state.resources[key] - before;
}

function settleActivity(state, activity, seconds, options = {}) {
  const level = getActivityLevel(state, activity.id);
  const activityMultiplier = 1 + (level - 1) * 0.08;
  const attributeMultiplier = 1 + attributeBonus(state, activity.primaryAttribute, 0.0025, 0.22);
  const multipliers = getMultipliers(state);
  const risk = getProductionRisk(state);
  const maxEnergy = getEffectiveMaxEnergy(state);
  const lowEnergy = activity.id !== "rest" && state.resources.energy <= 0;
  const energyFactor = activity.id === "rest" ? 1 : clamp(0.35 + 0.65 * (state.resources.energy || 0) / maxEnergy, 0.35, 1);
  const lowEnergyPenalty = activity.id !== "rest" && state.resources.energy < 30 ? 0.8 : 1;
  const overtimeRelief = options.overtime ? attributeBonus(state, "focus", 0.003, 0.24) : 0;
  const overtimeFactor = options.overtime ? 0.45 + overtimeRelief * 0.5 : 1;
  const focus = getWeeklyFocus(state);
  const learningFocusFactor = focus.id === "learning" && activity.id === "study" ? focus.learning : 1;
  const qualityActivityIds = new Set(["bug-hunting", "refactoring", "testing", "code-review"]);
  const qualityFactor = focus.id === "quality" && qualityActivityIds.has(activity.id) ? focus.quality : 1;
  const positiveFactor = activityMultiplier * attributeMultiplier * energyFactor * lowEnergyPenalty * overtimeFactor * learningFocusFactor * qualityFactor;
  const deltas = {};

  if (activity.energyCostPerSecond > 0) {
    const focusRelief = attributeBonus(state, "focus", 0.0025, 0.2);
    deltas.energy = applyResourceDelta(state, "energy", -activity.energyCostPerSecond * (1 - focusRelief) * seconds);
  }

  for (const [key, value] of Object.entries(activity.effectsPerSecond || {})) {
    let delta = value * seconds;
    if (delta > 0) delta *= positiveFactor;
    if (key === "energy" && delta > 0) delta *= 1 + attributeBonus(state, "resilience", 0.0025, 0.2);
    if (key === "codeLines" && delta > 0) delta *= multipliers.code * risk.codeEfficiency;
    if (key === "money" && delta > 0) delta *= multipliers.money;
    if (key === "money" && delta > 0 && focus.id === "freelance") delta *= focus.money;
    if (key === "codeLines" && delta > 0 && focus.id === "quality") delta *= focus.code;
    if (key === "money" && delta > 0 && focus.id === "quality") delta *= focus.money;
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
    if (key === "pressure" && focus.id === "freelance") delta *= focus.pressure;
    if (key === "bugs" && state.resources.energy < 10) delta *= 3;
    if (lowEnergy && key === "pressure") delta *= 1.8;
    if (options.overtime && (key === "bugs" || key === "techDebt")) delta *= 1.8 * (1 - attributeBonus(state, "logic", 0.004, 0.3));
    if (options.overtime && key === "pressure") delta *= 1.5 * (1 - attributeBonus(state, "resilience", 0.004, 0.3));
    const applied = applyResourceDelta(state, key, delta);
    deltas[key] = (deltas[key] || 0) + applied;
  }

  if (lowEnergy) {
    deltas.pressure = (deltas.pressure || 0) + applyResourceDelta(state, "pressure", seconds * 0.006);
  }
  if (options.overtime) {
    const resilienceRelief = attributeBonus(state, "resilience", 0.004, 0.3);
    deltas.pressure = (deltas.pressure || 0) + applyResourceDelta(state, "pressure", seconds * 0.003 * (1 - resilienceRelief));
  }

  state.stats.totalCodeLines += Math.max(0, deltas.codeLines || 0);
  state.stats.totalBugsFixed += Math.max(0, -(deltas.bugs || 0));
  state.activityStats.totalActiveSeconds += seconds;
  state.activityStats.byActivity[activity.id] = (state.activityStats.byActivity[activity.id] || 0) + seconds;

  const levelUps = addActivityExp(state, activity.id, activity.activityExpPerSecond * seconds * attributeMultiplier * overtimeFactor * learningFocusFactor * qualityFactor);
  for (const [attr, amount] of Object.entries(activity.attributeExpPerMinute || {})) {
    addAttributeExp(state, attr, amount * seconds / 60);
  }

  return { deltas, levelUps, lowEnergy: lowEnergy || (activity.id !== "rest" && state.resources.energy <= 0) };
}

function ensureProjectProgress(state, projectId) {
  state.projectProgress[projectId] = state.projectProgress[projectId] || { workedSeconds: 0, resourcesPaid: false };
  state.projectProgress[projectId].workedSeconds = Math.max(0, Number(state.projectProgress[projectId].workedSeconds) || 0);
  state.projectProgress[projectId].resourcesPaid = Boolean(state.projectProgress[projectId].resourcesPaid);
  return state.projectProgress[projectId];
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
  progress.workedSeconds += seconds * (options.workMultiplier || 1);
  const currentProgress = getSkillLearningProgress(state, skill);
  if (currentProgress.workedSeconds < currentProgress.requiredSeconds) return [];

  const skillProgress = ensureSkillProgress(state, skill.id);
  skillProgress.level = Math.max(skillProgress.level, 1);
  clearSkillLearningProgress(state, skill.id);
  syncUnlockedSkills(state);
  const message = formatLines([
    `技能 ${skill.name} 学习完成，达到 ${SKILL_LEVEL_NAMES[1]}。`,
    formatNextAdvice(state)
  ]);
  pushGameEvent(options.events, "skill", `技能 ${skill.name} 学习完成，达到 ${SKILL_LEVEL_NAMES[1]}。`, "good");
  return [message];
}

function applyProjectRewards(state, project, options = {}) {
  const firstSuccess = !state.completedProjects.includes(project.id);
  const rewardScale = firstSuccess ? 1 : 0.05;
  const rewardMultiplier = options.rewardMultiplier || 1;
  const moneyReward = (project.rewards.money || 0) * rewardScale * rewardMultiplier;
  state.resources.money += moneyReward;
  if (firstSuccess) {
    state.resources.reputation += project.rewards.reputation || 0;
    state.completedProjects.push(project.id);
    state.stats.totalProjects += 1;
    applyAttributeExpRewards(state, project.attributeExp);
  }
  return {
    firstSuccess,
    rewards: {
      money: moneyReward,
      reputation: firstSuccess ? project.rewards.reputation || 0 : 0
    },
    skillExp: addSkillExp(state, project.skillExpRewards, options.skillExpMultiplier || 1)
  };
}

function settleProject(state, project, seconds, options = {}) {
  const progress = ensureProjectProgress(state, project.id);
  progress.workedSeconds += seconds * (options.workMultiplier || 1);
  const projectProgress = getProjectProgress(state, project);
  const messages = [];

  if (projectProgress.workedSeconds < projectProgress.requiredSeconds) {
    return messages;
  }

  const successRate = getProjectSuccessRate(state, project);
  const rng = options.rng || Math.random;
  const roll = rng();
  if (roll <= successRate) {
    const rewardResult = applyProjectRewards(state, project, {
      rewardMultiplier: options.rewardMultiplier || 1,
      skillExpMultiplier: options.skillExpMultiplier || 1
    });
    clearProjectProgress(state, project.id);
    messages.push(formatLines([
      `项目 ${project.name} 工时达标：成功率 ${formatPercent(successRate)}，交付成功。`,
      `获得：${formatResourceList(rewardResult.rewards)}`,
      rewardResult.firstSuccess ? formatAttributeExpRewards(project.attributeExp) : "重复交付：声望、属性经验和完成计数不重复获得。",
      formatSkillExpRewards(rewardResult.skillExp),
      formatNextAdvice(state)
    ]));
    pushGameEvent(options.events, "project", `项目 ${project.name} 交付成功。获得：${formatResourceList(rewardResult.rewards)}。`, "good");
    return messages;
  }

  const failedSkillExp = addSkillExp(state, project.skillExpRewards, 0.4);
  clearProjectProgress(state, project.id);
  messages.push(formatLines([
    `项目 ${project.name} 工时达标：成功率 ${formatPercent(successRate)}，交付失败。`,
    `投入资源全部损失：${formatProjectResourceList(project.requirements.resources || {})}`,
    formatSkillExpRewards(failedSkillExp),
    formatNextAdvice(state)
  ]));
  pushGameEvent(options.events, "project", `项目 ${project.name} 交付失败，投入资源全部损失。`, "danger");
  return messages;
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
  if (slot.type === "none") return "休整";
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
    return `已安排 ${phase.name}：休整。`;
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
  const projectsToPay = new Set();

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
      const progress = ensureProjectProgress(state, project.id);
      const missing = missingProjectRequirements(state, project, { skipResources: true });
      if (missing.length) errors.push(`${phase.name} 项目 ${project.name} 条件不足：${missing.join("、")}。`);
      if (!progress.resourcesPaid && !projectsToPay.has(project.id)) {
        const cost = project.requirements.resources || {};
        if (!canAfford(nextResources, cost)) {
          errors.push(`${phase.name} 项目 ${project.name} 资源不足：${formatShortfall(nextResources, cost)}。`);
        } else {
          pay(nextResources, cost);
          projectsToPay.add(project.id);
        }
      }
    }
  }

  return { errors, nextResources, skillsToPay, projectsToPay };
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
  for (const id of plan.projectsToPay) {
    const progress = ensureProjectProgress(state, id);
    progress.resourcesPaid = true;
    ensureProjectDeadline(state, projectById(id));
  }
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
  if (slot.type === "project") return Boolean(projectById(slot.id) && state.completedProjects.includes(slot.id) && !state.projectProgress[slot.id]);
  return false;
}

function syncScheduledActiveMode(state) {
  ensureScheduleForCurrentDay(state);
  clearCompletedSkillLearning(state);
  if (state.waitingForSchedule || !state.lockedSchedule) {
    if (hasManualActiveWork(state)) return null;
    clearActiveWork(state);
    return null;
  }
  const phase = getCurrentSchedulePhase(state.worldTimeMinutes);
  if (!phase) {
    clearActiveWork(state);
    return null;
  }
  const slot = state.lockedSchedule.slots[phase.id];
  if (isScheduledSlotFinished(state, phase.id, slot)) {
    clearActiveWork(state);
    return { phase, slot: null };
  }
  clearActiveWork(state);
  if (slot.type === "activity") state.activeActivityId = slot.id;
  if (slot.type === "skill") state.activeSkillLearningId = slot.id;
  if (slot.type === "project") state.activeProjectId = slot.id;
  return { phase, slot };
}

function markSchedulePhaseDone(state, phaseId) {
  if (!phaseId || state.scheduleCompletedPhases.includes(phaseId)) return;
  state.scheduleCompletedPhases.push(phaseId);
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
  state.activeProjectDeadlines = state.activeProjectDeadlines || {};
  const existing = state.activeProjectDeadlines[project.id];
  if (existing && Number.isFinite(Number(existing.dueWorldMinute))) return existing;
  const progress = state.projectProgress[project.id];
  if (progress && Number.isFinite(Number(progress.dueWorldMinute))) {
    state.activeProjectDeadlines[project.id] = { dueWorldMinute: progress.dueWorldMinute, failed: false };
    return state.activeProjectDeadlines[project.id];
  }
  const currentDay = getWorldCalendar(state.worldTimeMinutes).day;
  const deadlineDay = Number.isFinite(Number(project.deadlineDay))
    ? Math.max(currentDay, Math.floor(Number(project.deadlineDay)))
    : currentDay + Math.max(2, Math.ceil(Number(project.deadlineDays) || (3 + Number(project.difficulty || 1) * 2)));
  const dueWorldMinute = (deadlineDay - 1) * MINUTES_PER_DAY + 18 * 60;
  state.activeProjectDeadlines[project.id] = { dueWorldMinute, failed: false };
  if (progress) progress.dueWorldMinute = dueWorldMinute;
  return state.activeProjectDeadlines[project.id];
}

function checkProjectDeadlines(state, messages = [], events = []) {
  state.activeProjectDeadlines = state.activeProjectDeadlines || {};
  for (const [id, deadline] of Object.entries(state.activeProjectDeadlines)) {
    if (deadline.failed || !Number.isFinite(Number(deadline.dueWorldMinute))) continue;
    const project = projectById(id);
    if (!project) continue;
    if (state.completedProjects.includes(id)) {
      delete state.activeProjectDeadlines[id];
      continue;
    }
    const overdueMinutes = state.worldTimeMinutes - deadline.dueWorldMinute;
    if (overdueMinutes < 0) continue;
    const graceMinutes = 2 * MINUTES_PER_DAY;
    if (!deadline.warned) {
      deadline.warned = true;
      applyResourceDelta(state, "pressure", 10);
      pushMessageEvent(messages, events, "warning", `Deadline 逾期：${project.name} 已超过 D${getWorldCalendar(deadline.dueWorldMinute).day}，成功率和奖励将受惩罚。`, "warn");
    }
    if (overdueMinutes >= graceMinutes) {
      deadline.failed = true;
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
  let workMultiplier = overtime ? 0.5 + overtimeRelief * 0.5 : 1;
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
    if (state.resources.energy < 15) workMultiplier *= 0.5;
  }
  if (state.resources.energy < 30 && type === "project") workMultiplier *= 0.8;
  return { workMultiplier, rewardMultiplier, skillExpMultiplier };
}

function settleTime(state, now = Date.now(), options = {}) {
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
    pushMessageEvent(messages, events, "system", "09:00 到了，请先用 plan 安排并确认今日日程。");
    return { seconds: 0, messages, events, ticker: createTuiTicker(state) };
  }

  if (seconds <= 0) {
    return { seconds: 0, messages, events, ticker: createTuiTicker(state) };
  }

  const beforeResources = snapshotResources(state.resources);
  const result = { deltas: {}, levelUps: 0, lowEnergy: false, overtime: false, activityName: null, activeName: null, activeSeconds: 0, restTick: null };
  let remainingMinutes = seconds;
  let processedSeconds = 0;
  if (applyWorldEffects) applyWorldEventTriggers(state, getWorldCalendar(state.worldTimeMinutes).day, getWorldCalendar(state.worldTimeMinutes).day, messages, events);

  while (remainingMinutes > 0) {
    ensureScheduleForCurrentDay(state);
    if (isSchedulePauseMinute(state) && !hasManualActiveWork(state)) {
      state.waitingForSchedule = true;
      clearActiveWork(state);
      pushMessageEvent(messages, events, "system", "09:00 到了，请先用 plan 安排并确认今日日程。");
      break;
    }
    const currentCalendar = getWorldCalendar(state.worldTimeMinutes);
    const minutesToNextDay = MINUTES_PER_DAY - (state.worldTimeMinutes % MINUTES_PER_DAY);
    const scheduleContext = state.lockedSchedule ? syncScheduledActiveMode(state) : null;
    const minutesToNextBoundary = minutesToNextScheduleBoundary(state.worldTimeMinutes);
    const segmentMinutes = Math.min(60, remainingMinutes, minutesToNextDay, minutesToNextBoundary);
    const beforeDay = currentCalendar.day;
    const mode = getActiveMode(state);
    const hasActiveWork = state.lockedSchedule ? Boolean(scheduleContext && scheduleContext.slot) && mode.type !== "idle" : mode.type !== "idle";
    const overtime = Boolean(scheduleContext && scheduleContext.phase && scheduleContext.phase.overtime && hasActiveWork);
    if (hasActiveWork) {
      result.overtime = result.overtime || overtime;
      result.activeSeconds += segmentMinutes;
      if (mode.type === "activity") {
        result.activityName = mode.item.name;
        result.activeName = mode.item.name;
        const segment = settleActivity(state, mode.item, segmentMinutes, { overtime });
        for (const [key, value] of Object.entries(segment.deltas || {})) {
          result.deltas[key] = (result.deltas[key] || 0) + value;
        }
        result.levelUps += segment.levelUps || 0;
        result.lowEnergy = result.lowEnergy || segment.lowEnergy;
      } else if (mode.type === "skill") {
        result.activeName = `学习 ${mode.item.name}`;
        const modifiers = getWorkModifiers(state, "skill", mode.item, overtime);
        messages.push(...settleSkillLearning(state, mode.item, segmentMinutes, { ...modifiers, events }));
        if (scheduleContext && getSkillLevel(state, mode.item.id) > 0) markSchedulePhaseDone(state, scheduleContext.phase.id);
      } else if (mode.type === "project") {
        result.activeName = `项目 ${mode.item.name}`;
        const modifiers = getWorkModifiers(state, "project", mode.item, overtime);
        messages.push(...settleProject(state, mode.item, segmentMinutes, { ...options, ...modifiers, events }));
        if (scheduleContext && !state.activeProjectId && !state.projectProgress[mode.item.id]) markSchedulePhaseDone(state, scheduleContext.phase.id);
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
    if (scheduleContext && scheduleContext.phase) {
      const minuteOfDay = state.worldTimeMinutes % MINUTES_PER_DAY;
      if (minuteOfDay === scheduleContext.phase.end) markSchedulePhaseDone(state, scheduleContext.phase.id);
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
      pushMessageEvent(messages, events, "system", "新的一天 09:00 到了，请先用 plan 安排并确认今日日程。");
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
    pushMessageEvent(messages, events, "warning", "精力耗尽，当前活动收益下降，压力额外上升。", "danger");
  }
  collectBugRiskEvents(state, beforeResources, snapshotResources(state.resources), events);

  if (options.randomEvents && processedSeconds > 0) {
    const eventChance = Math.min(0.35, processedSeconds / 3600 * 0.12);
    const rng = options.rng || Math.random;
    if (rng() < eventChance) {
      const event = content.randomEvents[Math.floor(rng() * content.randomEvents.length)];
      const beforeRandom = snapshotResources(state.resources);
      event.apply(state);
      applyAttributeExpRewards(state, event.attributeExp);
      clampState(state);
      messages.push(`随机事件：${event.name}。${event.message}`);
      const randomSummary = formatChangedResources(beforeRandom, state.resources);
      pushGameEvent(events, "random", `随机事件：${event.name}。${event.message}${randomSummary ? ` 本次变化：${randomSummary}。` : ""}`);
      collectBugRiskEvents(state, beforeRandom, snapshotResources(state.resources), events);
    }
  }

  state.lastTick = seconds < elapsedSeconds ? now : lastTick + processedSeconds * 1000;
  clampState(state);
  clearCompletedSkillLearning(state);
  syncScheduledActiveMode(state);
  return { seconds: processedSeconds, messages, events, ticker: createTuiTicker(state, result, changedResources) };
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
    `主要产出：${formatResourceList(activity.effectsPerSecond || {})}`,
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

function formatNextAdvice(state) {
  clearCompletedSkillLearning(state);
  const claimable = getClaimableGoals(state);
  if (claimable.length) return `建议：目标 ${claimable[0].name} 已完成，先 claim ${claimable[0].id} 领取奖励。`;
  if (state.waitingForSchedule) return "建议：先用 plan 安排上午、下午和可选晚上，再 plan confirm。";
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
    `当前项目：${activeProject ? `${activeProject.name} 工时 ${projectProgress.progressPercent}%（成功率 ${formatPercent(getProjectSuccessRate(state, activeProject))}）` : "无"}`,
    `当前学习：${activeSkill ? `${activeSkill.name} 学习 ${skillLearningProgress.progressPercent}%` : "无"}`,
    `代码：${formatNumber(state.resources.codeLines)}  金钱：${formatNumber(state.resources.money)}  知识：${formatNumber(state.resources.knowledge)}`,
    `测试：${formatNumber(state.resources.tests)}  文档：${formatNumber(state.resources.docs)}  架构：${formatNumber(state.resources.architecture)}  线索：${formatNumber(state.resources.leads)}`,
    `精力：${formatNumber(state.resources.energy)}  压力：${formatNumber(state.resources.pressure)}  Bug：${formatNumber(state.resources.bugs)}  技术债：${formatNumber(state.resources.techDebt)}  声望：${formatNumber(state.resources.reputation)}`,
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
    "  plan evening none            晚上休整",
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
    "  project <id>           旧入口：提示改用 plan",
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
      return `${project.id} - ${project.name}，${formatDifficultyLabel(project.difficulty)}，最少工时 ${formatDuration(getProjectRequiredSeconds(project))}，最高成功率 ${formatPercent(project.maxSuccessRate)}，技能 ${skills}，投入 ${formatProjectResourceList(project.requirements.resources)}，活动 ${formatActivityRequirements({ activityLevels: project.requirements.activityLevels })}，奖励 ${formatSkillExpRewards(project.skillExpRewards)}。${project.description}`;
    }).join("\n");
  }
  return "可查看：list skills、list tools、list projects、list cards";
}

function getResourceEntries(state) {
  return RESOURCE_ORDER.map((id) => ({
    id,
    name: RESOURCE_NAMES[id] || id,
    value: Math.floor(Number(state.resources[id]) || 0)
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
    return {
      id: activity.id,
      name: activity.name,
      description: activity.description,
      tier: activity.tier,
      primaryAttribute: activity.primaryAttribute,
      primaryAttributeName: ATTRIBUTE_NAMES[activity.primaryAttribute] || activity.primaryAttribute,
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
      output: formatResourceList(activity.effectsPerSecond || {}),
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
      name: "晚上休整",
      description: "晚上不安排任务，避免加班压力。",
      status: state.lockedSchedule ? "已锁定" : "可选择",
      command: state.lockedSchedule ? null : "plan evening none"
    },
    {
      id: "confirm",
      name: "确认日程",
      description: "确认后扣除学习/项目资源，今日不可再修改。",
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
    const projectOptions = content.projects.map((project) => {
      const completed = state.completedProjects.includes(project.id);
      const progress = getProjectProgress(state, project);
      const active = state.activeProjectId === project.id;
      const inProgress = progress.resourcesPaid;
      const missing = missingProjectRequirements(state, project, { skipResources: progress.resourcesPaid });
      const successRate = getProjectSuccessRate(state, project);
      const deadline = state.activeProjectDeadlines && state.activeProjectDeadlines[project.id];
      const deadlineText = deadline && Number.isFinite(Number(deadline.dueWorldMinute))
        ? `；Deadline D${String(getWorldCalendar(deadline.dueWorldMinute).day).padStart(3, "0")}`
        : "";
      return {
        id: project.id,
        name: project.name,
        description: project.description,
        status: active ? "进行中" : inProgress ? "已暂停" : completed ? "已完成/可重复" : missing.length ? "条件不足" : "可开始",
        done: completed,
        available: missing.length === 0,
        rewards: formatSkillExpRewards(project.skillExpRewards),
        cost: progress.resourcesPaid ? "已投入" : formatProjectResourceList(project.requirements.resources || {}),
        effects: `工时 ${formatDuration(progress.workedSeconds)}/${formatDuration(progress.requiredSeconds)}（${progress.progressPercent}%）；成功率 ${formatPercent(successRate)} / 最高 ${formatPercent(project.maxSuccessRate)}${deadlineText}`,
        missing: missing.join("、"),
        difficulty: project.difficulty,
        difficultyLabel: formatDifficultyLabel(project.difficulty),
        maxSuccessRate: project.maxSuccessRate,
        successRate,
        minWorkHours: project.minWorkHours,
        workedSeconds: progress.workedSeconds,
        requiredSeconds: progress.requiredSeconds,
        progressPercent: progress.progressPercent,
        progressLabel: "工时进度",
        progressActive: active,
        progressText: `${formatDuration(progress.workedSeconds)}/${formatDuration(progress.requiredSeconds)}`,
        resourcesPaid: progress.resourcesPaid,
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

function getGameViewModel(state) {
  syncScheduledActiveMode(state);
  clearCompletedSkillLearning(state);
  const role = roleById(state.currentRole);
  const characterCard = characterCardById(state.characterCardId);
  const active = activityById(state.activeActivityId);
  const activeProject = projectById(state.activeProjectId);
  const activeSkill = itemById(content.skills, state.activeSkillLearningId);
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
      maxEnergy: role ? role.maxEnergy : 0
    },
    activeActivity: active ? {
      id: active.id,
      name: active.name,
      level: getActivityLevel(state, active.id)
    } : null,
    activeProject: activeProject ? {
      id: activeProject.id,
      name: activeProject.name,
      progressPercent: activeProjectProgress.progressPercent,
      workedSeconds: activeProjectProgress.workedSeconds,
      requiredSeconds: activeProjectProgress.requiredSeconds,
      successRate: getProjectSuccessRate(state, activeProject)
    } : null,
    activeSkillLearning: activeSkill ? {
      id: activeSkill.id,
      name: activeSkill.name,
      progressPercent: activeSkillProgress.progressPercent,
      workedSeconds: activeSkillProgress.workedSeconds,
      requiredSeconds: activeSkillProgress.requiredSeconds
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
    actions: {
      claimAll: claimableGoals.length > 0 ? "claim all" : null,
      stopActivity: state.activeActivityId || state.activeProjectId || state.activeSkillLearningId ? "stop" : null,
      save: "save",
      quit: "quit"
    }
  };
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
  const resourcesPaid = Boolean(existingProgress && existingProgress.resourcesPaid);
  const missing = missingProjectRequirements(state, project, { skipResources: resourcesPaid });
  if (missing.length) {
    return formatLines([
      `项目条件不足，还需要：${missing.join("、")}。`,
      "建议：根据缺口切换 activities 积累对应产物。"
    ]);
  }

  const progress = ensureProjectProgress(state, project.id);
  const wasPaid = progress.resourcesPaid;
  if (!progress.resourcesPaid) {
    pay(state.resources, project.requirements.resources);
    progress.resourcesPaid = true;
  }
  state.activeProjectId = project.id;
  state.activeSkillLearningId = null;
  state.activeActivityId = null;
  const deadline = ensureProjectDeadline(state, project);
  const currentProgress = getProjectProgress(state, project);
  return formatLines([
    `${wasPaid ? "继续项目" : state.completedProjects.includes(id) ? "重复项目" : "开始项目"}：${project.name}。`,
    wasPaid ? "" : `投入：${formatProjectResourceList(Object.fromEntries(Object.entries(project.requirements.resources || {}).map(([key, value]) => [key, -value])))}`,
    `进度：${formatDuration(currentProgress.workedSeconds)}/${formatDuration(currentProgress.requiredSeconds)}（${currentProgress.progressPercent}%）。`,
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

function getSaveRoot(saveRoot) {
  return saveRoot || path.dirname(SAVE_PATH);
}

function resolveProfilePath(profileId = DEFAULT_PROFILE_ID, saveRoot) {
  const id = normalizeProfileId(profileId);
  if (!id) throw new Error(`非法档案 ID：${profileId}`);
  if (id === DEFAULT_PROFILE_ID) return path.join(getSaveRoot(saveRoot), path.basename(SAVE_PATH));
  return path.join(getSaveRoot(saveRoot), "profiles", `${id}.json`);
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
  if (!trimmed.startsWith("wait ") && !trimmed.startsWith("plan") && !trimmed.startsWith("lifestyle")) {
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
    case "project":
      messages.push(arg ? `project 不再立即执行。请使用 plan morning project ${arg} 或 plan afternoon project ${arg} 安排项目。` : "用法：plan <morning|afternoon|evening> project <id>");
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

  startCliSession(loadProfile(DEFAULT_PROFILE_ID));
}

if (require.main === module) {
  startCli();
}

module.exports = {
  ATTRIBUTE_IDS,
  ATTRIBUTE_NAMES,
  DEFAULT_ATTRIBUTES,
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
  helpText,
  learnSkill,
  listContent,
  listProfiles,
  loadGame,
  loadProfile,
  normalizeState,
  processCommand,
  processPlanCommand,
  promote,
  qualityPenalty,
  replaceStateContents,
  resolveProfilePath,
  saveGame,
  saveProfile,
  settleTime,
  startActivity,
  stopActivity,
  submitProject,
  upgradeSkill
};
