const assert = require("node:assert/strict");
const test = require("node:test");
const {
  THEME,
  renderProgressBar,
  toneForResource,
  toneForStatus
} = require("../src/tuiTheme");

test("renderProgressBar clamps percent and keeps a stable width", () => {
  assert.equal(renderProgressBar(-20, 10), "[----------]   0%");
  assert.equal(renderProgressBar(50, 10, 99), "[####=-----]  50%");
  assert.equal(renderProgressBar(140, 10), "[##########] 100%");
  assert.equal(renderProgressBar(Number.NaN, 6), "[------]   0%");
});

test("renderProgressBar can render static progress without shimmer", () => {
  assert.match(renderProgressBar(50, 10, 99, true), /=/);
  assert.doesNotMatch(renderProgressBar(50, 10, 99, false), /=/);
});

test("toneForStatus maps core TUI statuses", () => {
  assert.equal(toneForStatus("进行中").label, "live");
  assert.equal(toneForStatus("可开始").label, "ready");
  assert.equal(toneForStatus("资源不足").label, "blocked");
  assert.equal(toneForStatus("未解锁").label, "locked");
  assert.equal(toneForStatus("已暂停").label, "paused");
  assert.equal(toneForStatus("已拥有").label, "done");
  assert.equal(toneForStatus("其它").label, "neutral");
});

test("toneForResource highlights resource risk thresholds", () => {
  assert.equal(toneForResource({ id: "energy", value: 8 }).label, "critical");
  assert.equal(toneForResource({ id: "energy", value: 20 }).label, "low");
  assert.equal(toneForResource({ id: "pressure", value: 80 }).label, "critical");
  assert.equal(toneForResource({ id: "bugs", value: 40 }).label, "rising");
  assert.equal(toneForResource({ id: "money", value: 1 }).color, THEME.resources.money);
  assert.equal(toneForResource("knowledge").color, THEME.resources.knowledge);
});
