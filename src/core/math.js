function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatNumber(value) {
  return Math.floor(value).toString();
}

function formatRateNumber(value) {
  const rounded = Math.round((Number(value) || 0) * 100) / 100;
  const normalized = Object.is(rounded, -0) ? 0 : rounded;
  return Number.isInteger(normalized) ? normalized.toString() : normalized.toString();
}

module.exports = {
  clamp,
  formatNumber,
  formatRateNumber
};
