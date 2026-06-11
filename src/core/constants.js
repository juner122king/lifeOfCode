const path = require("node:path");

const DEFAULT_PROFILE_ID = "default";
const DEFAULT_PROFILE_NAME = "默认档案";
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
const RISK_RESOURCE_IDS = new Set(["bugs", "techDebt", "pressure"]);

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

const WORLD_START_MINUTES = 9 * 60;
const MINUTES_PER_DAY = 24 * 60;
const GAME_MINUTES_PER_HOUR = 60;
const SAVE_VERSION = 2;
const ENERGY_MAX = 100;
const ENERGY_STATUS_DEFS = [
  { id: "depleted", name: "枯竭", min: 0, max: 0, productivityMultiplier: 0, riskMultiplier: 2.5 },
  { id: "overdrawn", name: "透支", min: 1, max: 29, productivityMultiplier: 0.55, riskMultiplier: 2.2 },
  { id: "tired", name: "疲惫", min: 30, max: 59, productivityMultiplier: 0.8, riskMultiplier: 1.5 },
  { id: "stable", name: "平稳", min: 60, max: 89, productivityMultiplier: 1, riskMultiplier: 1 },
  { id: "full", name: "充沛", min: 90, max: 100, productivityMultiplier: 1.1, riskMultiplier: 0.75 }
];

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

module.exports = {
  ATTRIBUTE_IDS,
  ATTRIBUTE_NAMES,
  DEFAULT_ATTRIBUTES,
  DEFAULT_PROFILE_ID,
  DEFAULT_PROFILE_NAME,
  DAYS_PER_MONTH,
  DAYS_PER_WEEK,
  DAYS_PER_YEAR,
  ENERGY_MAX,
  ENERGY_STATUS_DEFS,
  EVENT_LABELS,
  GAME_MINUTES_PER_HOUR,
  MINUTES_PER_DAY,
  MONTHS_PER_YEAR,
  OFFLINE_CAP_SECONDS,
  RESOURCE_NAMES,
  RESOURCE_ORDER,
  RISK_RESOURCE_IDS,
  SAVE_PATH,
  SAVE_VERSION,
  SCHEDULE_PHASE_BY_ID,
  SCHEDULE_PHASES,
  SCHEDULE_SLOT_TYPES,
  WEEKDAY_NAMES,
  WEEKS_PER_MONTH,
  WORLD_START_MINUTES
};
