const {
  ENERGY_MAX,
  ENERGY_STATUS_DEFS
} = require("./constants");
const { clamp } = require("./math");

function getEnergyStatus(valueOrState) {
  let value = Number(valueOrState);
  if (typeof valueOrState === "object" && valueOrState !== null) {
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
  return ENERGY_STATUS_DEFS.find((status) => energy >= status.min && energy <= status.max) || ENERGY_STATUS_DEFS[0];
}

module.exports = {
  getEnergyStatus
};
