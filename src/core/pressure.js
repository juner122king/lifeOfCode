const { MINUTES_PER_DAY } = require('./constants');

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getPressureRecoveryMultiplier(state) {
  const { getMilestoneBonus } = require("./attributes");
  const pressure = Number(state.resources?.pressure) || 0;
  const baseMultiplier = clamp(1 - pressure / 125, 0.2, 1);

  // resilience 25: pressure_recovery (+0.2)
  const resilienceMilestone = 1 + getMilestoneBonus(state, "resilience", "pressure_recovery");

  return baseMultiplier * resilienceMilestone;
}

function getPressureThresholdEffects(state) {
  const { getMilestoneBonus } = require("./attributes");
  const pressure = Number(state.resources?.pressure) || 0;

  let codeEfficiencyPenalty = pressure < 51 ? 0 : pressure < 76 ? 0.1 : 0.15;
  let bugRiskIncrease = pressure < 51 ? 0 : pressure < 76 ? 0.15 : 0.3;

  // resilience 40: high_pressure_efficiency (0.5, reduces penalty when pressure > 70)
  if (pressure > 70) {
    const highPressureRelief = getMilestoneBonus(state, "resilience", "high_pressure_efficiency");
    codeEfficiencyPenalty *= (1 - highPressureRelief);
    bugRiskIncrease *= (1 - highPressureRelief);
  }

  return {
    level: pressure < 26 ? "normal" : pressure < 51 ? "tense" : pressure < 76 ? "anxious" : "critical",
    codeEfficiencyPenalty,
    bugRiskIncrease
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
