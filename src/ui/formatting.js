const {
  ATTRIBUTE_IDS,
  ATTRIBUTE_NAMES,
  ENERGY_MAX,
  EVENT_LABELS,
  GAME_MINUTES_PER_HOUR,
  RESOURCE_NAMES,
  RESOURCE_ORDER,
  RISK_RESOURCE_IDS,
  SCHEDULE_PHASES,
  SCHEDULE_PHASE_BY_ID
} = require("../core/constants");
const { formatNumber, formatRateNumber } = require("../core/math");
const { getWorldCalendar, formatWorldCalendar } = require("../core/time");

// ============================================================================
// Basic Formatting Utilities
// ============================================================================

function formatLines(lines) {
  return lines.filter((line) => line && line.trim()).join("\n");
}

function formatPercent(value) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

function formatDuration(seconds) {
  const s = Math.floor(seconds);
  if (s < 60) return `${s}秒`;
  return `${Math.floor(s / 60)}分${s % 60}秒`;
}

function formatGameDuration(seconds) {
  const gameMinutes = Math.floor(seconds * GAME_MINUTES_PER_HOUR / 3600);
  if (gameMinutes < 60) return `${gameMinutes}游戏分钟`;
  const hours = Math.floor(gameMinutes / 60);
  const mins = gameMinutes % 60;
  return mins > 0 ? `${hours}游戏小时${mins}分` : `${hours}游戏小时`;
}

function formatDifficultyLabel(difficulty) {
  const labels = { 1: "入门", 2: "初级", 3: "中级", 4: "高级", 5: "专家" };
  return labels[difficulty] || `难度${difficulty}`;
}

// ============================================================================
// Resource Formatting
// ============================================================================

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

function formatProjectResourceList(values = {}) {
  const entries = Object.entries(values)
    .filter(([, value]) => value)
    .map(([key, value]) => `${RESOURCE_NAMES[key] || key} ${formatNumber(value)}`);
  return entries.length ? entries.join("，") : "无";
}

function formatRestDeltaNumber(value) {
  const num = Number(value) || 0;
  if (num === 0) return "0";
  return num > 0 ? `+${formatNumber(num)}` : formatNumber(num);
}

function formatRestChangedResources(deltas = {}) {
  const order = ["energy", "pressure", "money", "reputation"];
  const entries = order
    .filter((key) => {
      const value = deltas[key];
      return value !== undefined && value !== null && value !== 0;
    })
    .map((key) => `${RESOURCE_NAMES[key]} ${formatRestDeltaNumber(deltas[key])}`);
  return entries.length ? entries.join("，") : "";
}

function formatChangedResources(beforeResources, afterResources) {
  const deltas = {};
  for (const key of RESOURCE_ORDER) {
    const before = Number(beforeResources[key]) || 0;
    const after = Number(afterResources[key]) || 0;
    const delta = after - before;
    if (delta !== 0) deltas[key] = delta;
  }
  return formatResourceList(deltas);
}

function formatMultiplierList(multipliers = {}) {
  const entries = Object.entries(multipliers)
    .filter(([, value]) => value !== 1)
    .map(([key, value]) => {
      const name = { code: "代码产出", money: "金钱获取", bug: "Bug 风险", debt: "技术债风险", pressure: "压力增长" }[key] || key;
      return `${name} ×${formatRateNumber(value)}`;
    });
  return entries.length ? entries.join("，") : "无";
}

// ============================================================================
// Exports (Partial - will be extended)
// ============================================================================

module.exports = {
  // Basic utilities
  formatLines,
  formatPercent,
  formatDuration,
  formatGameDuration,
  formatDifficultyLabel,

  // Resource formatting
  formatResourceList,
  formatResourceRateEntries,
  formatProjectResourceList,
  formatRestDeltaNumber,
  formatRestChangedResources,
  formatChangedResources,
  formatMultiplierList,

  // Internal helpers
  roundRate
};
