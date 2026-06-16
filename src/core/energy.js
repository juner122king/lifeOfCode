const {
  ENERGY_MAX,
  ENERGY_STATUS_DEFS
} = require("./constants");
const { clamp } = require("./math");

function getEnergyStatus(valueOrState) {
  let value = Number(valueOrState);
  let state = null;

  if (typeof valueOrState === "object" && valueOrState !== null) {
    state = valueOrState;
    const resourceEntries = Array.isArray(valueOrState.resources) ? valueOrState.resources : [];
    const energyEntry = resourceEntries.find((entry) => entry && entry.id === "energy");
    const candidates = [
      valueOrState.resources && valueOrState.resources.energy,
      energyEntry && energyEntry.value,
      valueOrState.value,
      valueOrState.energy
    ];
    value = candidates.map((candidate) => Number(candidate)).find((candidate) => Number.isFinite(candidate));
  }
  if (!Number.isFinite(value)) value = 0;
  const energy = clamp(value, 0, ENERGY_MAX);
  const baseStatus = ENERGY_STATUS_DEFS.find((status) => energy >= status.min && energy <= status.max) || ENERGY_STATUS_DEFS[0];

  // Apply milestone bonuses if state is available
  if (state && state.unlockedMilestones) {
    // Lazy load to avoid circular dependency
    let getMilestoneBonus;
    try {
      getMilestoneBonus = require("./attributes").getMilestoneBonus;
    } catch (e) {
      // If attributes module isn't available, return base status
      return baseStatus;
    }

    const status = { ...baseStatus };

    // focus 25: high_energy_production (+0.05 to production when energy >= 90)
    if (energy >= 90) {
      const highEnergyBonus = getMilestoneBonus(state, "focus", "high_energy_production");
      if (highEnergyBonus !== 0) {
        status.productivityMultiplier = baseStatus.productivityMultiplier + highEnergyBonus;
      }
    }

    // focus 85: low_energy_efficiency_relief (+0.5, reduces low energy penalty by half)
    if (energy >= 1 && energy < 30) {
      const lowEnergyRelief = getMilestoneBonus(state, "focus", "low_energy_efficiency_relief");
      if (lowEnergyRelief !== 0) {
        // Base penalty for overdrawn is 0.55 (= 1 - 0.45 penalty)
        // With relief, we want to halve the penalty: 0.55 -> 0.775 (= 1 - 0.225)
        const basePenalty = 1 - baseStatus.productivityMultiplier; // 0.45
        status.productivityMultiplier = 1 - basePenalty * (1 - lowEnergyRelief);
      }
    }

    return status;
  }

  return baseStatus;
}

module.exports = {
  getEnergyStatus
};
