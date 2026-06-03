const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const content = require("../src/content");
const {
  DEFAULT_ATTRIBUTES,
  OFFLINE_CAP_SECONDS,
  addAttributeExp,
  characterCardById,
  buyTool,
  claimGoal,
  createProfile,
  createNewState,
  deleteProfile,
  formatActivities,
  formatGoals,
  formatLiveStatus,
  formatState,
  getActivityLevel,
  getActivityOptions,
  getActivityProgress,
  getCharacterCardOptions,
  getEffectiveAttribute,
  getGameViewModel,
  getGoalOptions,
  getManagementOptions,
  getProfileOptions,
  getProjectProgress,
  getProjectSuccessRate,
  getSkillProgress,
  learnSkill,
  listProfiles,
  normalizeState,
  processCommand,
  promote,
  settleTime,
  startActivity,
  stopActivity,
  submitProject,
  loadProfile,
  upgradeSkill
} = require("../src/game");

function unlockSkill(state, id, level = 1, exp = 0) {
  state.skillProgress[id] = { level, exp };
  if (!state.unlockedSkills.includes(id)) state.unlockedSkills.push(id);
}

function createTempSaveRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "life-of-code-save-"));
}

test("新存档默认没有活动，并初始化职业资源和活动等级", () => {
  const state = createNewState();

  assert.equal(state.activeActivityId, null);
  assert.equal(state.activeProjectId, null);
  assert.equal(state.activeSkillLearningId, null);
  assert.deepEqual(state.projectProgress, {});
  assert.deepEqual(state.skillProgress, {});
  assert.deepEqual(state.skillLearningProgress, {});
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
    unlockedSkills: ["html-css"],
    attributes: { logic: 999, focus: -2 },
    attributeBreakthroughs: { logic: 20 },
    attributeExp: { learning: 30 }
  });

  assert.equal(state.activeActivityId, null);
  assert.equal(state.activeProjectId, null);
  assert.deepEqual(state.projectProgress, {});
  assert.equal(state.resources.knowledge, 0);
  assert.deepEqual(state.claimedGoals, []);
  assert.equal(getSkillProgress(state, "html-css").level, 1);
  assert.equal(getActivityLevel(state, "feature-coding"), 1);
  assert.equal(state.attributes.logic, 100);
  assert.equal(state.attributes.focus, 1);
  assert.equal(state.attributes.learning, DEFAULT_ATTRIBUTES.learning);
  assert.equal(getEffectiveAttribute(state, "logic"), 104);
  assert.equal(state.characterCardId, null);
});

test("人物卡数据完整且活动等级奖励受限", () => {
  assert.equal(content.characterCards.length, 8);
  assert.equal(content.characterCards.flatMap((card) => Object.keys(card.attributes)).length, 48);

  for (const card of content.characterCards) {
    assert.deepEqual(Object.keys(card.attributes).sort(), ["communication", "creativity", "focus", "learning", "logic", "resilience"].sort());
    for (const value of Object.values(card.attributes)) {
      assert.ok(value >= 1 && value <= 100);
    }
    assert.deepEqual(card.ownedTools, []);
  }

  const boostedActivities = content.characterCards.flatMap((card) => Object.entries(card.activityLevels).map(([id, level]) => `${id}:${level}`));
  assert.deepEqual(boostedActivities.sort(), ["feature-coding:2", "rest:2", "study:2"].sort());
  assert.ok(boostedActivities.every((entry) => !entry.endsWith(":3")));
});

test("人物卡只应用初始状态，不自动开始活动", () => {
  const academy = createNewState(1_700_000_000_000, { characterCardId: "academy-prodigy" });
  assert.equal(academy.characterCardId, "academy-prodigy");
  assert.equal(academy.attributes.learning, 72);
  assert.equal(academy.resources.knowledge, 80);
  assert.equal(academy.resources.money, 20);
  assert.equal(getActivityLevel(academy, "study"), 2);
  assert.equal(academy.activeActivityId, null);

  const indie = createNewState(1_700_000_000_000, { characterCardId: "indie-hacker" });
  assert.equal(getSkillProgress(indie, "javascript").level, 1);
  assert.equal(getActivityLevel(indie, "feature-coding"), 2);

  const slacker = createNewState(1_700_000_000_000, { characterCardId: "laid-back-slacker" });
  assert.equal(getActivityLevel(slacker, "rest"), 2);
  assert.equal(slacker.activeActivityId, null);
});

test("旧单存档作为 default 档案兼容加载", () => {
  const saveRoot = createTempSaveRoot();
  const savePath = path.join(saveRoot, "code-life.json");
  fs.writeFileSync(savePath, JSON.stringify({
    resources: { exp: 42, money: 99 },
    lastTick: 1_700_000_000_000
  }));

  const state = loadProfile("default", 1_700_000_100_000, { saveRoot });
  const profiles = listProfiles({ saveRoot, currentProfileId: state.profileId });

  assert.equal(state.profileId, "default");
  assert.equal(state.profileName, "默认档案");
  assert.equal(state.resources.exp, 42);
  assert.equal(state.resources.money, 99);
  assert.equal(profiles.find((item) => item.id === "default").exists, true);
});

test("角色档案创建、读取和状态隔离", () => {
  const saveRoot = createTempSaveRoot();
  assert.throws(() => createProfile("missing-card", "缺卡", 1_700_000_000_000, { saveRoot }), /必须选择人物卡/);
  assert.throws(() => createProfile("bad-card", "坏卡", 1_700_000_000_000, { saveRoot, characterCardId: "nope" }), /没有这个人物卡/);

  const alpha = createProfile("alpha", "前端角色", 1_700_000_000_000, { saveRoot, characterCardId: "product-minded-dev" });
  alpha.resources.money = 321;
  processCommand(alpha, "save", { saveRoot, now: 1_700_000_010_000 });

  const beta = createProfile("beta", "AI 角色", 1_700_000_020_000, { saveRoot, characterCardId: "indie-hacker" });
  beta.resources.money = 654;
  processCommand(beta, "save", { saveRoot, now: 1_700_000_030_000 });

  assert.equal(loadProfile("alpha", 1_700_000_040_000, { saveRoot }).resources.money, 321);
  assert.equal(loadProfile("beta", 1_700_000_040_000, { saveRoot }).resources.money, 654);
  assert.equal(loadProfile("alpha", 1_700_000_040_000, { saveRoot }).characterCardId, "product-minded-dev");
  assert.deepEqual(listProfiles({ saveRoot }).map((item) => item.id), ["default", "alpha", "beta"]);
});

test("profile 命令可创建、切换、重命名和保存当前档案", () => {
  const saveRoot = createTempSaveRoot();
  const state = createProfile("default", "默认档案", 1_700_000_000_000, { saveRoot, characterCardId: "academy-prodigy" });
  state.resources.money = 111;

  let message = processCommand(state, "profile new nocard 开发者档案", { saveRoot, now: 1_700_000_005_000 }).messages.join("\n");
  assert.match(message, /必须选择人物卡/);
  message = processCommand(state, "profile new bad --card nope 坏档案", { saveRoot, now: 1_700_000_006_000 }).messages.join("\n");
  assert.match(message, /没有这个人物卡：nope/);

  message = processCommand(state, "profile new dev --card indie-hacker 开发者档案", { saveRoot, now: 1_700_000_010_000 }).messages.join("\n");
  assert.match(message, /已创建并切换到档案：dev - 开发者档案/);
  assert.equal(state.profileId, "dev");
  assert.equal(state.characterCardId, "indie-hacker");
  state.resources.money = 222;
  processCommand(state, "save", { saveRoot, now: 1_700_000_020_000 });
  assert.equal(loadProfile("dev", 1_700_000_025_000, { saveRoot }).characterCardId, "indie-hacker");

  message = processCommand(state, "profile load default", { saveRoot, now: 1_700_000_030_000 }).messages.join("\n");
  assert.match(message, /已切换到档案：default - 默认档案/);
  assert.equal(state.resources.money, 111);

  message = processCommand(state, "profile rename dev 新名字", { saveRoot, now: 1_700_000_040_000 }).messages.join("\n");
  assert.match(message, /已重命名档案：dev - 新名字/);
  assert.equal(loadProfile("dev", 1_700_000_050_000, { saveRoot }).profileName, "新名字");
});

test("删除档案需要确认且不能删除 default 或当前档案", () => {
  const saveRoot = createTempSaveRoot();
  const state = createProfile("side", "副档案", 1_700_000_000_000, { saveRoot, characterCardId: "academy-prodigy" });

  assert.throws(() => deleteProfile("default", { saveRoot, confirm: true }), /default 档案不能删除/);
  assert.throws(() => deleteProfile("side", { saveRoot, currentProfileId: "side", confirm: true }), /不能删除当前/);
  assert.throws(() => deleteProfile("side", { saveRoot, currentProfileId: "default" }), /需要确认/);

  replaceCurrentProfileForTest(state, "default");
  const message = processCommand(state, "profile delete side confirm", { saveRoot, now: 1_700_000_010_000 }).messages.join("\n");
  assert.match(message, /已删除档案：side/);
  assert.throws(() => loadProfile("side", 1_700_000_020_000, { saveRoot }), /没有这个档案/);
});

function replaceCurrentProfileForTest(state, id) {
  state.profileId = id;
  state.profileName = id === "default" ? "默认档案" : id;
}

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

test("learn 消耗资源并启动耗时学习，完成后才解锁技能", () => {
  const now = 1_700_000_000_000;
  const state = createNewState(now);
  startActivity(state, "study");
  settleTime(state, now + 300_000, { randomEvents: false });

  assert.ok(state.resources.knowledge > 30);
  state.resources.knowledge = 60;
  state.resources.exp = 100;
  state.resources.money = 100;

  const beforeKnowledge = state.resources.knowledge;
  const message = learnSkill(state, "html-css");

  assert.match(message, /开始学习：HTML\/CSS/);
  assert.ok(state.resources.knowledge < beforeKnowledge);
  assert.equal(state.activeSkillLearningId, "html-css");
  assert.equal(state.unlockedSkills.includes("html-css"), false);

  const result = settleTime(state, now + 901_000, { randomEvents: false });

  assert.match(result.messages.join("\n"), /技能 HTML\/CSS 学习完成/);
  assert.ok(state.unlockedSkills.includes("html-css"));
  assert.equal(getSkillProgress(state, "html-css").level, 1);
});

test("新增程序员技术包内容通过现有选项接口展示", () => {
  const state = createNewState();

  const activities = getActivityOptions(state);
  const skills = getManagementOptions(state, "skills");
  const tools = getManagementOptions(state, "tools");
  const projects = getManagementOptions(state, "projects");
  const goals = getGoalOptions(state);

  assert.ok(activities.some((item) => item.id === "code-review"));
  assert.ok(skills.some((item) => item.id === "typescript"));
  assert.ok(skills.some((item) => item.id === "llm-agent"));
  assert.ok(tools.some((item) => item.id === "github-actions"));
  assert.ok(projects.some((item) => item.id === "component-library"));
  assert.ok(projects.some((item) => item.id === "rag-assistant"));
  assert.ok(goals.some((item) => item.id === "learn-typescript"));
  assert.ok(goals.some((item) => item.id === "ship-rag-assistant"));
  assert.ok(content.randomEvents.some((item) => item.id === "dependency-hell"));
  assert.ok(content.randomEvents.some((item) => item.id === "friday-scope-change"));
});

test("新增技能 TypeScript 满足属性和资源后进入学习队列", () => {
  const state = createNewState(1_700_000_000_000);
  state.attributes.logic = 26;
  state.resources.knowledge = 260;
  state.resources.exp = 350;
  state.resources.money = 200;

  const message = learnSkill(state, "typescript");

  assert.match(message, /开始学习：TypeScript/);
  assert.equal(state.activeSkillLearningId, "typescript");
  assert.equal(state.unlockedSkills.includes("typescript"), false);
  assert.equal(Math.floor(state.resources.knowledge), 20);
});

test("upgrade 消耗技能经验、知识和资源后提升技能等级", () => {
  const state = createNewState();
  unlockSkill(state, "html-css", 1, 130);
  state.attributes.creativity = 22;
  state.resources.knowledge = 150;
  state.resources.codeLines = 100;
  state.resources.docs = 20;

  const message = upgradeSkill(state, "html-css");

  assert.match(message, /HTML\/CSS 提升到 熟练/);
  assert.equal(getSkillProgress(state, "html-css").level, 2);
  assert.ok(state.resources.knowledge < 150);
  assert.ok(state.resources.codeLines < 100);
});

test("新增工具流水线会员可购买并进入已拥有工具", () => {
  const state = createNewState();
  state.resources.money = 700;

  const message = buyTool(state, "github-actions");

  assert.match(message, /买到了 流水线会员/);
  assert.ok(state.ownedTools.includes("github-actions"));
  assert.equal(Math.floor(state.resources.money), 60);
});

test("新增活动代码评审满足条件后可启动并改善质量资产", () => {
  const start = 1_700_000_000_000;
  const state = createNewState(start);
  state.unlockedSkills.push("git");
  state.activityLevels["feature-coding"] = 3;
  state.activityLevels.testing = 2;
  state.resources.bugs = 20;
  state.resources.techDebt = 20;

  assert.match(startActivity(state, "code-review"), /开始活动：代码评审/);
  settleTime(state, start + 60_000, { randomEvents: false });

  assert.ok(state.resources.bugs < 20 || state.resources.techDebt < 20);
  assert.ok(state.resources.docs > 0 || state.resources.exp > 0);
});

test("新增项目组件库内卷可开始并在成功 RNG 下交付", () => {
  const start = 1_700_000_000_000;
  const state = createNewState(start);
  state.resources.codeLines = 300;
  state.resources.docs = 30;
  state.resources.tests = 40;
  unlockSkill(state, "typescript", 2);
  unlockSkill(state, "react", 2);
  state.activityLevels["feature-coding"] = 4;
  state.activityLevels.documentation = 2;
  state.activityLevels.testing = 2;

  const message = submitProject(state, "component-library");

  assert.match(message, /开始项目：组件库内卷/);
  assert.equal(state.activeProjectId, "component-library");
  assert.equal(state.resources.codeLines, 40);
  assert.equal(state.resources.docs, 12);
  assert.equal(state.resources.tests, 15);

  const result = settleTime(state, start + 2_400_000, { randomEvents: false, rng: () => 0 });

  assert.match(result.messages.join("\n"), /交付成功/);
  assert.ok(state.completedProjects.includes("component-library"));
  assert.equal(state.activeProjectId, null);
  assert.ok(state.resources.money >= 250);
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

test("项目会检查条件，开始时投入资源并按工时推进", () => {
  const state = createNewState();

  assert.match(submitProject(state, "homepage"), /项目条件不足/);

  state.resources.codeLines = 100;
  state.resources.docs = 10;
  state.resources.exp = 100;
  state.resources.money = 100;
  state.resources.knowledge = 30;
  state.activityLevels["feature-coding"] = 2;
  unlockSkill(state, "html-css");

  const message = submitProject(state, "homepage");

  assert.match(message, /开始项目：个人主页/);
  assert.equal(state.activeProjectId, "homepage");
  assert.equal(state.activeActivityId, null);
  assert.equal(state.projectProgress.homepage.resourcesPaid, true);
  assert.equal(state.resources.codeLines, 20);
  assert.equal(state.resources.docs, 2);
  assert.equal(state.completedProjects.includes("homepage"), false);

  settleTime(state, state.lastTick + 300_000, { randomEvents: false });
  const progress = getProjectProgress(state, "homepage");
  assert.ok(progress.workedSeconds > 0);
  assert.ok(progress.progressPercent < 100);
});

test("项目达标后会自动成功并发放奖励", () => {
  const start = 1_700_000_000_000;
  const state = createNewState(start);
  state.resources.codeLines = 100;
  state.resources.docs = 10;
  state.resources.exp = 100;
  state.resources.money = 100;
  state.resources.knowledge = 30;
  state.activityLevels["feature-coding"] = 2;
  unlockSkill(state, "html-css");
  submitProject(state, "homepage");

  const result = settleTime(state, start + 700_000, { randomEvents: false, rng: () => 0 });

  assert.match(result.messages.join("\n"), /交付成功/);
  assert.equal(state.completedProjects.includes("homepage"), true);
  assert.equal(state.activeProjectId, null);
  assert.equal(state.projectProgress.homepage, undefined);
  assert.ok(state.resources.reputation > 0);
});

test("重复项目只给技能经验和少量经验金钱", () => {
  const start = 1_700_000_000_000;
  const state = createNewState(start);
  state.resources.codeLines = 220;
  state.resources.docs = 30;
  state.activityLevels["feature-coding"] = 2;
  unlockSkill(state, "html-css");

  submitProject(state, "homepage");
  settleTime(state, start + 700_000, { randomEvents: false, rng: () => 0 });
  const first = {
    exp: state.resources.exp,
    money: state.resources.money,
    reputation: state.resources.reputation,
    totalProjects: state.stats.totalProjects,
    skillExp: getSkillProgress(state, "html-css").exp
  };

  state.resources.codeLines += 100;
  state.resources.docs += 10;
  submitProject(state, "homepage");
  const result = settleTime(state, start + 1_400_000, { randomEvents: false, rng: () => 0 });

  assert.match(result.messages.join("\n"), /重复交付/);
  assert.equal(state.completedProjects.filter((id) => id === "homepage").length, 1);
  assert.equal(state.stats.totalProjects, first.totalProjects);
  assert.equal(state.resources.reputation, first.reputation);
  assert.equal(Math.floor(state.resources.exp - first.exp), 9);
  assert.equal(Math.floor(state.resources.money - first.money), 12);
  assert.ok(getSkillProgress(state, "html-css").exp > first.skillExp);
});

test("新增训练项目可重复提供目标技能经验", () => {
  const start = 1_700_000_000_000;
  const state = createNewState(start);
  state.resources.codeLines = 260;
  state.resources.docs = 20;
  state.resources.tests = 20;
  unlockSkill(state, "javascript");

  assert.match(submitProject(state, "vanilla-widget"), /开始项目：原生 JS 小组件/);
  settleTime(state, start + 1_300_000, { randomEvents: false, rng: () => 0 });
  const firstExp = getSkillProgress(state, "javascript").exp;

  state.resources.codeLines += 140;
  state.resources.docs += 10;
  state.resources.tests += 10;
  assert.match(submitProject(state, "vanilla-widget"), /重复项目：原生 JS 小组件/);
  settleTime(state, start + 2_600_000, { randomEvents: false, rng: () => 0 });

  assert.ok(firstExp >= 70);
  assert.ok(getSkillProgress(state, "javascript").exp >= firstExp + 70);
});

test("项目失败会清空进度且不返还已投入资源", () => {
  const start = 1_700_000_000_000;
  const state = createNewState(start);
  state.resources.codeLines = 100;
  state.resources.docs = 10;
  state.resources.exp = 100;
  state.resources.money = 100;
  state.resources.knowledge = 30;
  state.resources.bugs = 100;
  state.resources.techDebt = 180;
  state.resources.pressure = 100;
  state.activityLevels["feature-coding"] = 2;
  unlockSkill(state, "html-css");
  submitProject(state, "homepage");
  const afterInvestment = { codeLines: state.resources.codeLines, docs: state.resources.docs };

  const result = settleTime(state, start + 700_000, { randomEvents: false, rng: () => 1 });

  assert.match(result.messages.join("\n"), /交付失败/);
  assert.equal(state.completedProjects.includes("homepage"), false);
  assert.equal(state.activeProjectId, null);
  assert.equal(state.projectProgress.homepage, undefined);
  assert.equal(state.resources.codeLines, afterInvestment.codeLines);
  assert.equal(state.resources.docs, afterInvestment.docs);
});

test("项目会占用当前活动位，普通活动会暂停项目", () => {
  const state = createNewState();
  state.resources.codeLines = 100;
  state.resources.docs = 10;
  state.resources.exp = 100;
  state.resources.money = 100;
  state.resources.knowledge = 30;
  state.activityLevels["feature-coding"] = 2;
  unlockSkill(state, "html-css");
  submitProject(state, "homepage");

  const message = startActivity(state, "study");

  assert.match(message, /开始活动：系统学习/);
  assert.equal(state.activeProjectId, null);
  assert.equal(state.activeActivityId, "study");
  assert.equal(state.projectProgress.homepage.resourcesPaid, true);
});

test("stop 可以暂停当前项目并保留进度", () => {
  const state = createNewState();
  state.resources.codeLines = 100;
  state.resources.docs = 10;
  state.resources.exp = 100;
  state.resources.money = 100;
  state.resources.knowledge = 30;
  state.activityLevels["feature-coding"] = 2;
  unlockSkill(state, "html-css");
  submitProject(state, "homepage");

  const message = stopActivity(state);

  assert.match(message, /暂停项目：个人主页/);
  assert.equal(state.activeProjectId, null);
  assert.equal(state.projectProgress.homepage.resourcesPaid, true);
});

test("项目成功率会随 Bug、技术债和压力下降但受上下限约束", () => {
  const clean = createNewState();
  const risky = createNewState();
  risky.resources.bugs = 100;
  risky.resources.techDebt = 180;
  risky.resources.pressure = 100;

  assert.equal(getProjectSuccessRate(clean, "homepage"), 0.98);
  assert.ok(getProjectSuccessRate(risky, "homepage") < getProjectSuccessRate(clean, "homepage"));
  assert.equal(getProjectSuccessRate(risky, "flash-sale"), 0.24);
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
  assert.match(help, /cards/);
  assert.match(help, /profile new <id> --card <cardId>/);
  assert.match(help, /start <id>/);
  assert.match(help, /stop/);
  assert.doesNotMatch(help, /  code\s/);
  assert.doesNotMatch(help, /  fix\s/);
  assert.doesNotMatch(help, /  refactor\s/);
});

test("cards 命令和人物卡选项展示卡片信息", () => {
  const message = processCommand(createNewState(), "cards").messages.join("\n");
  const options = getCharacterCardOptions({ now: 1_700_000_000_000 });

  assert.match(message, /academy-prodigy - 象牙塔学霸/);
  assert.match(message, /indie-hacker - 野路子独立开发者/);
  assert.equal(options.length, 8);
  assert.equal(options.find((item) => item.id === "indie-hacker").command, "profile new profile-20231114221320-indie-hacker --card indie-hacker 野路子独立开发者");
  assert.match(options.find((item) => item.id === "academy-prodigy").resources, /知识 \+80/);
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

test("view model 提供结构化资源、属性、目标摘要和可执行动作", () => {
  const state = createNewState();
  state.activityStats.totalActiveSeconds = 30;
  const view = getGameViewModel(state);

  assert.equal(view.role.name, "实习程序员");
  assert.equal(view.profile.id, "default");
  assert.equal(view.profile.name, "默认档案");
  assert.equal(view.profile.characterCardName, "未选择人物卡/旧档案");
  assert.equal(view.characterCard.legacy, true);
  assert.deepEqual(view.characterCard.initialAttributes, []);
  assert.equal(view.activeActivity, null);
  assert.equal(view.activeProject, null);
  assert.deepEqual(view.resources.map((item) => item.id), [
    "codeLines",
    "exp",
    "money",
    "knowledge",
    "tests",
    "docs",
    "architecture",
    "leads",
    "energy",
    "pressure",
    "bugs",
    "techDebt",
    "reputation"
  ]);
  assert.equal(view.resources.find((item) => item.id === "money").value, 30);
  assert.equal(view.attributes.find((item) => item.id === "focus").name, "专注");
  assert.equal(view.goals.claimableCount, 1);
  assert.equal(view.goals.currentMain.id, "choose-work");
  assert.equal(view.actions.claimAll, "claim all");
  assert.equal(view.actions.save, "save");
  assert.equal(view.activityLevels.find((item) => item.id === "feature-coding").level, 1);
});

test("view model 展示当前人物卡信息", () => {
  const state = createNewState(1_700_000_000_000, { characterCardId: "academy-prodigy" });
  const view = getGameViewModel(state);

  assert.equal(characterCardById("academy-prodigy").name, "象牙塔学霸");
  assert.equal(view.profile.characterCardId, "academy-prodigy");
  assert.equal(view.profile.characterCardName, "象牙塔学霸");
  assert.equal(view.characterCard.id, "academy-prodigy");
  assert.equal(view.characterCard.name, "象牙塔学霸");
  assert.equal(view.characterCard.initialAttributes.find((item) => item.id === "learning").value, 72);
  assert.match(view.characterCard.initialBonuses.resources, /知识 \+80/);
  assert.match(view.characterCard.initialBonuses.activityLevels, /系统学习 Lv\.2/);
});

test("activity options 标出锁定、当前活动、等级和命令", () => {
  const state = createNewState();
  startActivity(state, "feature-coding");

  const options = getActivityOptions(state);
  const active = options.find((item) => item.id === "feature-coding");
  const locked = options.find((item) => item.id === "architecture");

  assert.equal(active.status, "进行中");
  assert.equal(active.active, true);
  assert.equal(active.command, "start feature-coding");
  assert.equal(active.level, 1);
  assert.equal(locked.status, "未解锁");
  assert.equal(locked.command, null);
});

test("goal options 标出可领取状态和 claim 命令", () => {
  const state = createNewState();
  state.activityStats.totalActiveSeconds = 30;

  const options = getGoalOptions(state);
  const goal = options.find((item) => item.id === "choose-work");

  assert.equal(goal.status, "可领取");
  assert.equal(goal.claimable, true);
  assert.equal(goal.command, "claim choose-work");
  assert.match(goal.rewards, /经验/);
});

test("management options 标出技能、工具和项目动作状态", () => {
  const state = createNewState();
  state.resources.knowledge = 40;
  state.resources.exp = 50;
  state.resources.money = 100;

  const skill = getManagementOptions(state, "skills").find((item) => item.id === "html-css");
  const tool = getManagementOptions(state, "tools").find((item) => item.id === "used-laptop");
  const project = getManagementOptions(state, "projects").find((item) => item.id === "homepage");
  const promoteAction = getManagementOptions(state, "projects")[0];

  assert.equal(skill.status, "可学习");
  assert.equal(skill.command, "learn html-css");
  assert.match(skill.effects, /代码产出 x1\.02/);
  assert.equal(tool.status, "可购买");
  assert.equal(tool.command, "buy used-laptop");
  assert.match(tool.effects, /代码产出 x1\.12/);
  assert.equal(project.status, "条件不足");
  assert.equal(project.command, "project homepage");
  assert.match(project.effects, /难度 1/);
  assert.match(project.effects, /成功率/);
  assert.equal(promoteAction.command, "promote");
});

test("profile options 为 TUI 提供新建、保存和切换动作", () => {
  const saveRoot = createTempSaveRoot();
  createProfile("work", "工作档案", 1_700_000_000_000, { saveRoot, characterCardId: "determined-switcher" });
  const state = loadProfile("default", 1_700_000_010_000, { saveRoot });

  const options = getProfileOptions(state, { saveRoot, now: 1_700_000_020_000 });
  const createOption = options.find((item) => item.id === "profile-new");
  const saveOption = options.find((item) => item.id === "profile-save");
  const work = options.find((item) => item.id === "work");

  assert.equal(createOption.command, null);
  assert.match(createOption.description, /必须先选择人物卡|必须先选择/);
  assert.equal(saveOption.command, "save");
  assert.equal(work.status, "可加载");
  assert.equal(work.command, "profile load work");
  assert.equal(work.deleteCommand, "profile delete work confirm");
  assert.match(work.description, /破釜沉舟转行者/);
  assert.equal(options.some((item) => item.id.startsWith("create-")), false);
});
