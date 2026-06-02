const assert = require("node:assert/strict");
const test = require("node:test");
const {
  DEFAULT_ATTRIBUTES,
  OFFLINE_CAP_SECONDS,
  addAttributeExp,
  buyTool,
  claimGoal,
  createNewState,
  formatActivities,
  formatGoals,
  formatLiveStatus,
  formatState,
  getActivityLevel,
  getActivityProgress,
  getEffectiveAttribute,
  learnSkill,
  normalizeState,
  processCommand,
  promote,
  settleTime,
  startActivity,
  stopActivity,
  submitProject
} = require("../src/game");

test("新存档默认没有活动，并初始化职业资源和活动等级", () => {
  const state = createNewState();

  assert.equal(state.activeActivityId, null);
  assert.equal(state.resources.knowledge, 0);
  assert.equal(state.resources.tests, 0);
  assert.equal(state.resources.docs, 0);
  assert.equal(state.resources.architecture, 0);
  assert.equal(state.resources.leads, 0);
  assert.equal(getActivityLevel(state, "feature-coding"), 1);
  assert.equal(getActivityLevel(state, "study"), 1);
});

test("旧存档会补齐活动字段、职业资源和目标领取记录", () => {
  const state = normalizeState({
    resources: { codeLines: 10, exp: 5, money: 30 },
    attributes: { logic: 999, focus: -2 },
    attributeBreakthroughs: { logic: 20 },
    attributeExp: { learning: 30 }
  });

  assert.equal(state.activeActivityId, null);
  assert.equal(state.resources.knowledge, 0);
  assert.deepEqual(state.claimedGoals, []);
  assert.equal(getActivityLevel(state, "feature-coding"), 1);
  assert.equal(state.attributes.logic, 100);
  assert.equal(state.attributes.focus, 1);
  assert.equal(state.attributes.learning, DEFAULT_ATTRIBUTES.learning);
  assert.equal(getEffectiveAttribute(state, "logic"), 104);
});

test("没有当前活动时，时间结算不会默认写代码", () => {
  const now = 1_700_000_000_000;
  const state = createNewState(now);

  const result = settleTime(state, now + 60_000, { randomEvents: false });

  assert.equal(result.seconds, 60);
  assert.deepEqual(result.messages, []);
  assert.equal(state.resources.codeLines, 0);
  assert.equal(state.resources.exp, 0);
  assert.equal(state.stats.totalCodeLines, 0);
  assert.equal(state.lastTick, now + 60_000);
});

test("start feature-coding 后只结算写功能活动", () => {
  const now = 1_700_000_000_000;
  const state = createNewState(now);

  assert.match(startActivity(state, "feature-coding"), /开始活动：写功能/);
  settleTime(state, now + 60_000, { randomEvents: false });

  assert.ok(state.resources.codeLines > 0);
  assert.ok(state.resources.exp > 0);
  assert.ok(state.resources.bugs > 0);
  assert.ok(state.resources.techDebt > 0);
  assert.ok(state.resources.pressure > 0);
  assert.ok(state.resources.energy < 100);
  assert.ok(state.activityStats.totalActiveSeconds >= 60);
  assert.ok(state.activityStats.byActivity["feature-coding"] >= 60);
});

test("切换活动会先结算旧活动，再设置新活动", () => {
  const now = 1_700_000_000_000;
  const state = createNewState(now);
  startActivity(state, "feature-coding");

  const message = processCommand(state, "start study", { now: now + 60_000 }).messages.join("\n");

  assert.match(message, /写功能 60 秒：/);
  assert.match(message, /代码 \+\d+（\d+）/);
  assert.match(message, /开始活动：系统学习/);
  assert.equal(state.activeActivityId, "study");
  assert.ok(state.resources.codeLines > 0);
});

test("stop 会停止当前活动", () => {
  const state = createNewState();
  startActivity(state, "study");

  assert.match(stopActivity(state), /停止活动：系统学习/);
  assert.equal(state.activeActivityId, null);
  assert.match(stopActivity(state), /当前没有正在进行的活动/);
});

test("锁定活动不可启动，满足条件后可启动", () => {
  const state = createNewState();

  assert.match(startActivity(state, "architecture"), /还未解锁/);

  state.unlockedSkills.push("sql");
  state.activityLevels.refactoring = 5;

  assert.match(startActivity(state, "architecture"), /开始活动：架构设计/);
  assert.equal(state.activeActivityId, "architecture");
});

test("activities 展示活动列表、等级、锁定状态和当前状态", () => {
  const state = createNewState();
  startActivity(state, "feature-coding");

  const message = formatActivities(state);

  assert.match(message, /feature-coding - 写功能 \[进行中\] Lv\.1/);
  assert.match(message, /architecture - 架构设计 \[未解锁\]/);
  assert.match(message, /rest - 休息恢复/);
});

test("活动经验达到阈值后升级", () => {
  const now = 1_700_000_000_000;
  const state = createNewState(now);
  startActivity(state, "feature-coding");

  settleTime(state, now + 300_000, { randomEvents: false });

  assert.ok(getActivityLevel(state, "feature-coding") > 1);
  assert.ok(getActivityProgress(state, "feature-coding").exp >= 0);
});

test("精力耗尽时非休息活动收益降低并提示风险", () => {
  const now = 1_700_000_000_000;
  const state = createNewState(now);
  state.resources.energy = 0;
  startActivity(state, "feature-coding");

  const result = settleTime(state, now + 60_000, { randomEvents: false });

  assert.match(result.messages.join("\n"), /精力耗尽/);
  assert.ok(state.resources.pressure > 0);
});

test("活动结算只显示可见整数变化并附带当前总数", () => {
  const now = 1_700_000_000_000;
  const state = createNewState(now);
  startActivity(state, "study");

  const result = settleTime(state, now + 60_000, { randomEvents: false });
  const message = result.messages.join("\n");

  assert.match(message, /系统学习 60 秒：/);
  assert.match(message, /经验 \+\d+（\d+）/);
  assert.match(message, /知识 \+\d+（\d+）/);
  assert.match(message, /精力 -\d+（\d+）/);
  assert.doesNotMatch(message, /测试/);
});

test("活动升级但资源没有可见变化时仍显示升级消息", () => {
  const now = 1_700_000_000_000;
  const state = createNewState(now);
  state.activityExp.rest = 99.5;
  startActivity(state, "rest");

  const result = settleTime(state, now + 4_000, { randomEvents: false });

  assert.deepEqual(result.messages, ["休息恢复提升到 Lv.2。"]);
});

test("bug-hunting 降低 Bug 并产出测试", () => {
  const now = 1_700_000_000_000;
  const state = createNewState(now);
  state.resources.bugs = 20;
  startActivity(state, "bug-hunting");

  settleTime(state, now + 60_000, { randomEvents: false });

  assert.ok(state.resources.bugs < 20);
  assert.ok(state.resources.tests > 0);
  assert.ok(state.stats.totalBugsFixed > 0);
});

test("refactoring 降低技术债并产出架构资产", () => {
  const now = 1_700_000_000_000;
  const state = createNewState(now);
  state.resources.techDebt = 30;
  startActivity(state, "refactoring");

  settleTime(state, now + 60_000, { randomEvents: false });

  assert.ok(state.resources.techDebt < 30);
  assert.ok(state.resources.architecture > 0);
});

test("study 产出知识，learn 消耗知识学习技能", () => {
  const now = 1_700_000_000_000;
  const state = createNewState(now);
  startActivity(state, "study");
  settleTime(state, now + 300_000, { randomEvents: false });

  assert.ok(state.resources.knowledge > 18);
  state.resources.exp = 100;
  state.resources.money = 100;

  const beforeKnowledge = state.resources.knowledge;
  const message = learnSkill(state, "html-css");

  assert.match(message, /学会了 HTML\/CSS/);
  assert.ok(state.resources.knowledge < beforeKnowledge);
  assert.ok(state.unlockedSkills.includes("html-css"));
});

test("testing、documentation、freelancing、rest 分别产出对应资源", () => {
  const start = 1_700_000_000_000;
  const testing = createNewState(start);
  testing.activityLevels["feature-coding"] = 2;
  startActivity(testing, "testing");
  settleTime(testing, start + 60_000, { randomEvents: false });
  assert.ok(testing.resources.tests > 0);

  const docs = createNewState(start);
  docs.activityLevels.study = 2;
  startActivity(docs, "documentation");
  settleTime(docs, start + 60_000, { randomEvents: false });
  assert.ok(docs.resources.docs > 0);

  const freelance = createNewState(start);
  freelance.activityLevels["feature-coding"] = 3;
  startActivity(freelance, "freelancing");
  settleTime(freelance, start + 60_000, { randomEvents: false });
  assert.ok(freelance.resources.money > 30);
  assert.ok(freelance.resources.leads > 0);

  const rest = createNewState(start);
  rest.resources.energy = 30;
  rest.resources.pressure = 50;
  startActivity(rest, "rest");
  settleTime(rest, start + 60_000, { randomEvents: false });
  assert.ok(rest.resources.energy > 30);
  assert.ok(rest.resources.pressure < 50);
});

test("项目会检查职业产物、技能和活动等级，并提交成功", () => {
  const state = createNewState();

  assert.match(submitProject(state, "homepage"), /项目条件不足/);

  state.resources.codeLines = 100;
  state.resources.docs = 10;
  state.resources.exp = 100;
  state.resources.money = 100;
  state.resources.knowledge = 30;
  state.activityLevels["feature-coding"] = 2;
  learnSkill(state, "html-css");

  const message = submitProject(state, "homepage");

  assert.match(message, /提交了 个人主页/);
  assert.equal(state.completedProjects.includes("homepage"), true);
  assert.ok(state.resources.codeLines < 100);
  assert.ok(state.resources.docs < 10);
  assert.ok(state.resources.reputation > 0);
});

test("晋升会检查活动等级条件", () => {
  const state = createNewState();
  state.resources.exp = 200;
  state.resources.reputation = 2;
  state.unlockedSkills = ["html-css", "javascript"];
  state.completedProjects = ["homepage"];

  assert.match(promote(state), /写功能 Lv\.3/);

  state.activityLevels["feature-coding"] = 3;
  state.activityLevels.study = 2;

  assert.match(promote(state), /晋升成功/);
  assert.equal(state.currentRole, "junior");
});

test("goals 基于活动进度推进并可领取", () => {
  const state = createNewState();
  state.activityStats.totalActiveSeconds = 30;

  const goals = formatGoals(state);
  const message = claimGoal(state, "choose-work");

  assert.match(goals, /choose-work - 选择第一项活动/);
  assert.match(message, /领取目标：选择第一项活动/);
  assert.deepEqual(state.claimedGoals, ["choose-work"]);
  assert.ok(state.resources.exp > 0);
});

test("claim all 会按顺序领取当前可领取目标", () => {
  const state = createNewState();
  state.activityStats.totalActiveSeconds = 60;
  state.activityLevels["feature-coding"] = 2;

  const message = processCommand(state, "claim all").messages.join("\n");

  assert.match(message, /领取了 2 个目标/);
  assert.deepEqual(state.claimedGoals, ["choose-work", "first-feature-level"]);
});

test("status 显示完整状态，live status 只显示活动变化摘要", () => {
  const state = createNewState();
  startActivity(state, "study");
  state.resources.knowledge = 12;
  state.resources.tests = 3;

  const status = formatState(state);
  const live = formatLiveStatus(state, "-", "知识 +1（12）");

  assert.match(status, /当前活动：系统学习 Lv\.1/);
  assert.match(status, /知识：12/);
  assert.match(status, /测试：3/);
  assert.equal(live, "- 系统学习：知识 +1（12）");
  assert.doesNotMatch(live, /测试 3/);
  assert.equal(live.includes("\n"), false);
});

test("live status 在无活动或无变化摘要时保持静默", () => {
  const inactive = createNewState();
  assert.equal(formatLiveStatus(inactive, "-", "代码 +1（1）"), "");

  const active = createNewState();
  startActivity(active, "study");
  assert.equal(formatLiveStatus(active, "-", ""), "");
});

test("wait 命令保留快进秒数并使用变化摘要", () => {
  const now = 1_700_000_000_000;
  const state = createNewState(now);
  startActivity(state, "feature-coding");

  const message = processCommand(state, "wait 60", { randomEvents: false }).messages.join("\n");

  assert.match(message, /快进了 60 秒。/);
  assert.match(message, /写功能 60 秒：/);
  assert.match(message, /代码 \+\d+（\d+）/);
});

test("help 包含新命令，不再展示旧的一次性命令", () => {
  const help = processCommand(createNewState(), "help").messages.join("\n");

  assert.match(help, /activities/);
  assert.match(help, /start <id>/);
  assert.match(help, /stop/);
  assert.doesNotMatch(help, /  code\s/);
  assert.doesNotMatch(help, /  fix\s/);
  assert.doesNotMatch(help, /  refactor\s/);
});

test("旧的一次性命令只返回迁移提示，不改变资源", () => {
  const state = createNewState();
  const before = { ...state.resources };

  const message = processCommand(state, "code").messages.join("\n");

  assert.match(message, /旧命令 code 已移除/);
  assert.deepEqual(state.resources, before);
});

test("技能和工具倍率会影响活动产出", () => {
  const start = 1_700_000_000_000;
  const baseline = createNewState(start);
  const boosted = createNewState(start);
  boosted.unlockedSkills = ["javascript"];
  boosted.ownedTools = ["used-laptop"];
  startActivity(baseline, "feature-coding");
  startActivity(boosted, "feature-coding");

  settleTime(baseline, start + 60_000, { randomEvents: false });
  settleTime(boosted, start + 60_000, { randomEvents: false });

  assert.ok(boosted.resources.codeLines > baseline.resources.codeLines);
});

test("离线收益不超过 8 小时上限", () => {
  const start = 1_700_000_000_000;
  const capped = createNewState(start);
  const exact = createNewState(start);
  startActivity(capped, "study");
  startActivity(exact, "study");

  settleTime(capped, start + 24 * 60 * 60 * 1000, { randomEvents: false });
  settleTime(exact, start + OFFLINE_CAP_SECONDS * 1000, { randomEvents: false });

  assert.equal(Math.floor(capped.resources.knowledge), Math.floor(exact.resources.knowledge));
  assert.equal(Math.floor(capped.resources.exp), Math.floor(exact.resources.exp));
});

test("属性经验仍按基础属性成本成长", () => {
  const state = createNewState();
  state.attributes.logic = 99;

  const gained = addAttributeExp(state, "logic", 10_000);

  assert.equal(gained, 1);
  assert.equal(state.attributes.logic, 100);
  assert.ok(state.attributeExp.logic > 0);
});

test("buyTool 仍作为管理动作购买工具", () => {
  const state = createNewState();
  state.resources.money = 100;

  const message = buyTool(state, "used-laptop");

  assert.match(message, /买到了 二手笔记本/);
  assert.deepEqual(state.ownedTools, ["used-laptop"]);
});
