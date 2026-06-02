const assert = require("node:assert/strict");
const test = require("node:test");
const {
  OFFLINE_CAP_SECONDS,
  buyTool,
  createNewState,
  formatLiveStatus,
  learnSkill,
  promote,
  settleTime,
  submitProject
} = require("../src/game");

test("时间结算会增加代码、经验、金钱，并产生 Bug", () => {
  const now = 1_700_000_000_000;
  const state = createNewState(now);

  settleTime(state, now + 60_000, { randomEvents: false });

  assert.ok(state.resources.codeLines > 0);
  assert.ok(state.resources.exp > 0);
  assert.ok(state.resources.money > 30);
  assert.ok(state.resources.bugs > 0);
  assert.equal(state.lastTick, now + 60_000);
});

test("技能和工具会改变产出倍率", () => {
  const start = 1_700_000_000_000;
  const baseline = createNewState(start);
  const boosted = createNewState(start);

  boosted.resources.exp = 1_000;
  boosted.resources.money = 1_000;
  learnSkill(boosted, "javascript");
  buyTool(boosted, "used-laptop");

  settleTime(baseline, start + 120_000, { randomEvents: false });
  settleTime(boosted, start + 120_000, { randomEvents: false });

  assert.ok(boosted.resources.codeLines > baseline.resources.codeLines);
  assert.ok(boosted.resources.exp > baseline.resources.exp);
});

test("项目提交会扣除代码行数并发放奖励", () => {
  const state = createNewState();
  state.resources.exp = 100;
  state.resources.money = 100;
  state.resources.codeLines = 100;
  learnSkill(state, "html-css");

  const beforeMoney = state.resources.money;
  const beforeExp = state.resources.exp;
  const message = submitProject(state, "homepage");

  assert.match(message, /提交了/);
  assert.equal(state.resources.codeLines, 20);
  assert.ok(state.resources.money > beforeMoney);
  assert.ok(state.resources.exp > beforeExp);
  assert.equal(state.resources.reputation, 2);
  assert.deepEqual(state.completedProjects, ["homepage"]);
});

test("晋升条件不足时失败，满足时成功", () => {
  const state = createNewState();

  assert.match(promote(state), /晋升失败/);
  state.resources.exp = 200;
  state.resources.reputation = 2;
  state.unlockedSkills = ["html-css", "javascript"];
  state.completedProjects = ["homepage"];

  assert.match(promote(state), /晋升成功/);
  assert.equal(state.currentRole, "junior");
});

test("离线收益不超过 8 小时上限", () => {
  const start = 1_700_000_000_000;
  const capped = createNewState(start);
  const exact = createNewState(start);

  settleTime(capped, start + 24 * 60 * 60 * 1000, { randomEvents: false });
  settleTime(exact, start + OFFLINE_CAP_SECONDS * 1000, { randomEvents: false });

  assert.equal(Math.floor(capped.resources.codeLines), Math.floor(exact.resources.codeLines));
  assert.equal(Math.floor(capped.resources.exp), Math.floor(exact.resources.exp));
  assert.equal(Math.floor(capped.resources.money), Math.floor(exact.resources.money));
});

test("运行状态行包含关键资源信息", () => {
  const state = createNewState();
  state.resources.codeLines = 123;
  state.resources.exp = 45;
  state.resources.money = 67;
  state.resources.bugs = 2;
  state.resources.techDebt = 1;

  const line = formatLiveStatus(state, "-");

  assert.match(line, /运行中/);
  assert.match(line, /实习程序员/);
  assert.match(line, /代码 123/);
  assert.match(line, /经验 45/);
  assert.match(line, /金钱 67/);
  assert.match(line, /Bug 2/);
  assert.match(line, /技术债 1/);
});
