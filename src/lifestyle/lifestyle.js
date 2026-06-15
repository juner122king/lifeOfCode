const { LIFESTYLE_STANCES, WEEKLY_FOCUS_CONFIG, REST_RECOVERY_PER_HOUR, MINUTES_PER_DAY } = require("../core/constants");
const { normalizeWorldTimeMinutes } = require("../core/time");

// ============================================================================
// Weekly Focus
// ============================================================================

function normalizeWeeklyFocus(value) {
  return WEEKLY_FOCUS_CONFIG[value] ? value : "balanced";
}

function getWeeklyFocus(state) {
  const id = normalizeWeeklyFocus(state.weeklyFocus);
  return { id, ...WEEKLY_FOCUS_CONFIG[id] };
}

function setWeeklyFocus(state, id) {
  if (!WEEKLY_FOCUS_CONFIG[id]) return `没有这个周重点：${id}。可选：learning、project、freelance、quality、balanced。`;
  state.weeklyFocus = id;
  return `本周重点已设为：${WEEKLY_FOCUS_CONFIG[id].name}。`;
}

// ============================================================================
// Lifestyle Stance
// ============================================================================

function normalizeLifestyleStanceId(value) {
  return LIFESTYLE_STANCES[value] ? value : "health";
}

function normalizePendingLifestyleStanceId(value) {
  return value && LIFESTYLE_STANCES[value] ? value : null;
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

function setLifestyleStance(state, id, formatLifestyleEffectSummary) {
  if (!LIFESTYLE_STANCES[id]) return `没有这个作息基调：${id}。可选：${Object.keys(LIFESTYLE_STANCES).join("、")}。`;
  const effect = `作息效果：${formatLifestyleEffectSummary(id)}`;
  if (normalizeLifestyleStanceId(state.lifestyleStanceId) === id) {
    state.pendingLifestyleStanceId = null;
    const lines = [
      `明日沿用当前作息：${LIFESTYLE_STANCES[id].name}。`,
      effect
    ];
    return lines.filter(Boolean).join("\n");
  }
  state.pendingLifestyleStanceId = id;
  const lines = [
    `明日作息已设为：${LIFESTYLE_STANCES[id].name}。将在次日 09:00 生效。`,
    effect
  ];
  return lines.filter(Boolean).join("\n");
}

// ============================================================================
// Rest Windows
// ============================================================================

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

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  normalizeWeeklyFocus,
  getWeeklyFocus,
  setWeeklyFocus,
  normalizeLifestyleStanceId,
  normalizePendingLifestyleStanceId,
  getLifestyleStance,
  getLifestyleStatus,
  getLifestyleOptions,
  setLifestyleStance,
  getRestWindow
};
