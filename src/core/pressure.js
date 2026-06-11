const { MINUTES_PER_DAY } = require('./constants');

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getPressureRecoveryMultiplier(state) {
  const pressure = Number(state.resources?.pressure) || 0;
  return clamp(1 - pressure / 125, 0.2, 1);
}

function getPressureThresholdEffects(state) {
  const pressure = Number(state.resources?.pressure) || 0;

  return {
    level: pressure < 26 ? "normal" : pressure < 51 ? "tense" : pressure < 76 ? "anxious" : "critical",
    codeEfficiencyPenalty: pressure < 51 ? 0 : pressure < 76 ? 0.1 : 0.15,
    bugRiskIncrease: pressure < 51 ? 0 : pressure < 76 ? 0.15 : 0.3
  };
}

function checkPressureOverload(state, messages, events, applyResourceDelta, pushMessageEvent) {
  const pressure = Number(state.resources && state.resources.pressure) || 0;

  if (pressure >= 75) {
    if (!state.pressureOverloadStartMinute) {
      state.pressureOverloadStartMinute = state.worldTimeMinutes;
    }

    const overloadDuration = state.worldTimeMinutes - state.pressureOverloadStartMinute;
    const twoDaysMinutes = 2 * MINUTES_PER_DAY;

    if (overloadDuration >= twoDaysMinutes && !state.pressureOverloadTriggered) {
      state.pressureOverloadTriggered = true;
      applyResourceDelta(state, "techDebt", 15);
      applyResourceDelta(state, "bugs", 8);
      state.activeActivityId = null;
      state.activeSkillLearningId = null;
      state.activeProjectId = null;
      pushMessageEvent(
        messages,
        events,
        "warning",
        "压力崩溃：长期高压导致技术债和 Bug 激增，当前工作被迫中断。你需要休息了。",
        "danger"
      );
    }
  } else {
    delete state.pressureOverloadStartMinute;
    delete state.pressureOverloadTriggered;
  }
}

function formatPressureStatus(pressure) {
  if (pressure >= 76) return '临界';
  if (pressure >= 51) return '焦虑';
  if (pressure >= 26) return '紧张';
  return '正常';
}

module.exports = {
  getPressureRecoveryMultiplier,
  getPressureThresholdEffects,
  checkPressureOverload,
  formatPressureStatus
};
