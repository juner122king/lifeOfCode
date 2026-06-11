const assert = require('node:assert/strict');
const test = require('node:test');
const { getPressureRecoveryMultiplier, getPressureThresholdEffects, checkPressureOverload, formatPressureStatus } = require('../src/core/pressure');
const { MINUTES_PER_DAY } = require('../src/core/constants');

test('getPressureRecoveryMultiplier returns 1.0 when pressure is 0', () => {
  const state = { resources: { pressure: 0 } };
  assert.equal(getPressureRecoveryMultiplier(state), 1.0);
});

test('getPressureRecoveryMultiplier returns 0.6 when pressure is 50', () => {
  const state = { resources: { pressure: 50 } };
  assert.equal(getPressureRecoveryMultiplier(state), 0.6);
});

test('getPressureRecoveryMultiplier returns 0.2 when pressure is 100', () => {
  const state = { resources: { pressure: 100 } };
  assert.equal(getPressureRecoveryMultiplier(state), 0.2);
});

test('getPressureRecoveryMultiplier returns 0.2 when pressure exceeds 125', () => {
  const state = { resources: { pressure: 150 } };
  assert.equal(getPressureRecoveryMultiplier(state), 0.2);
});

test('getPressureThresholdEffects returns normal status when pressure is 20', () => {
  const state = { resources: { pressure: 20 } };
  const effects = getPressureThresholdEffects(state);
  assert.equal(effects.level, 'normal');
  assert.equal(effects.codeEfficiencyPenalty, 0);
  assert.equal(effects.bugRiskIncrease, 0);
});

test('getPressureThresholdEffects returns tense status when pressure is 40', () => {
  const state = { resources: { pressure: 40 } };
  const effects = getPressureThresholdEffects(state);
  assert.equal(effects.level, 'tense');
  assert.equal(effects.codeEfficiencyPenalty, 0);
  assert.equal(effects.bugRiskIncrease, 0);
});

test('getPressureThresholdEffects returns anxious status when pressure is 60', () => {
  const state = { resources: { pressure: 60 } };
  const effects = getPressureThresholdEffects(state);
  assert.equal(effects.level, 'anxious');
  assert.equal(effects.codeEfficiencyPenalty, 0.1);
  assert.equal(effects.bugRiskIncrease, 0.15);
});

test('getPressureThresholdEffects returns critical status when pressure is 85', () => {
  const state = { resources: { pressure: 85 } };
  const effects = getPressureThresholdEffects(state);
  assert.equal(effects.level, 'critical');
  assert.equal(effects.codeEfficiencyPenalty, 0.15);
  assert.equal(effects.bugRiskIncrease, 0.3);
});

test('checkPressureOverload does not track when pressure < 75', () => {
  const state = { resources: { pressure: 70 }, worldTimeMinutes: 1000 };
  checkPressureOverload(state, [], [], () => {}, () => {});
  assert.equal(state.pressureOverloadStartMinute, undefined);
});

test('checkPressureOverload tracks but does not trigger before 2 days', () => {
  const state = { resources: { pressure: 80 }, worldTimeMinutes: 1000 };
  const messages = [], events = [];
  checkPressureOverload(state, messages, events, () => {}, () => {});
  assert.equal(state.pressureOverloadStartMinute, 1000);
  assert.equal(state.pressureOverloadTriggered, undefined);
  assert.equal(messages.length, 0);
});

test('checkPressureOverload triggers after 2 days at pressure >= 75', () => {
  const state = { resources: { pressure: 80, techDebt: 10, bugs: 5 }, worldTimeMinutes: 1000, pressureOverloadStartMinute: 1000 - 2 * MINUTES_PER_DAY };
  const messages = [], events = [];
  const deltas = [];
  checkPressureOverload(state, messages, events, (s, r, v) => deltas.push({ r, v }), (m, e, t, msg, l) => m.push(msg));
  assert.equal(state.pressureOverloadTriggered, true);
  assert.equal(deltas.length, 2);
  assert.equal(messages.length, 1);
});

test('checkPressureOverload resets when pressure drops below 75', () => {
  const state = { resources: { pressure: 70 }, worldTimeMinutes: 3000, pressureOverloadStartMinute: 1000, pressureOverloadTriggered: true };
  checkPressureOverload(state, [], [], () => {}, () => {});
  assert.equal(state.pressureOverloadStartMinute, undefined);
  assert.equal(state.pressureOverloadTriggered, undefined);
});

test('formatPressureStatus returns correct status for all levels', () => {
  assert.equal(formatPressureStatus(10), '正常');
  assert.equal(formatPressureStatus(26), '紧张');
  assert.equal(formatPressureStatus(51), '焦虑');
  assert.equal(formatPressureStatus(76), '临界');
});
