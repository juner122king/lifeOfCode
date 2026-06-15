const {
  ATTRIBUTE_IDS,
  DEFAULT_ATTRIBUTES,
  ENERGY_MAX,
  RESOURCE_ORDER,
  RISK_RESOURCE_IDS
} = require("../core/constants");
const { clamp } = require("../core/math");

const RESOURCE_EPSILON = 1e-9;

// ============================================================================
// Resource Management
// ============================================================================

function normalizeResources(raw, defaults) {
  const result = {};
  for (const key of RESOURCE_ORDER) {
    const value = Number(raw && raw[key]);
    result[key] = Number.isFinite(value) ? value : defaults[key];
  }
  return result;
}

function snapshotResources(resources) {
  return Object.fromEntries(RESOURCE_ORDER.map((key) => [key, Math.floor(Number(resources[key]) || 0)]));
}

function applyResourceDelta(state, key, rawDelta, getEffectiveMaxEnergy) {
  if (!rawDelta) return 0;
  const before = state.resources[key] || 0;
  if (key === "energy") {
    const maxEnergy = getEffectiveMaxEnergy ? getEffectiveMaxEnergy(state) : ENERGY_MAX;
    state.resources.energy = clamp(before + rawDelta, 0, maxEnergy);
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

function canAfford(resources, cost) {
  return Object.entries(cost || {}).every(([key, value]) => (resources[key] || 0) >= value);
}

function pay(resources, cost) {
  for (const [key, value] of Object.entries(cost || {})) {
    resources[key] -= value;
  }
}

function clampState(state, getEffectiveMaxEnergy) {
  if (state.resources) {
    for (const key of RESOURCE_ORDER) {
      const value = Math.max(0, Number(state.resources[key]) || 0);
      state.resources[key] = Math.abs(value) < RESOURCE_EPSILON ? 0 : value;
    }
    state.resources.pressure = clamp(state.resources.pressure, 0, 100);
    delete state.dailyEnergyCapMultiplier;
    delete state.pendingMorningEnergyCapMultiplier;
    delete state.pendingMorningEnergyPenalty;
    const maxEnergy = getEffectiveMaxEnergy ? getEffectiveMaxEnergy(state) : ENERGY_MAX;
    const energy = clamp(Number(state.resources.energy) || 0, 0, maxEnergy);
    state.resources.energy = Math.abs(energy) < RESOURCE_EPSILON ? 0 : energy;
  }
}

// ============================================================================
// Attribute Management
// ============================================================================

function normalizeAttributes(raw, defaults, min, max) {
  const result = {};
  for (const id of ATTRIBUTE_IDS) {
    const value = raw && Number(raw[id]);
    const fallback = defaults[id] ?? 0;
    result[id] = clamp(Number.isFinite(value) ? value : fallback, min, max);
  }
  return result;
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

  // Emit growth events if callback provided
  if (gained > 0 && options.collectAttributeGrowthEvents) {
    options.collectAttributeGrowthEvents(state, attr, beforeValue, getBaseAttribute(state, attr), options.events);
  }
  return gained;
}

function applyAttributeExpRewards(state, rewards = {}, options = {}) {
  for (const [attr, amount] of Object.entries(rewards)) {
    if (ATTRIBUTE_IDS.includes(attr) && amount > 0) {
      addAttributeExp(state, attr, amount, options);
    }
  }
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Resources
  normalizeResources,
  snapshotResources,
  applyResourceDelta,
  applyResourceDeltaTo,
  canAfford,
  pay,
  clampState,

  // Attributes
  normalizeAttributes,
  getBaseAttribute,
  getBreakthrough,
  getEffectiveAttribute,
  addAttributeExp,
  applyAttributeExpRewards
};
