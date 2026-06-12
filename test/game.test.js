const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const content = require("../src/content");
const {
  DEFAULT_ATTRIBUTES,
  ENERGY_MAX,
  OFFLINE_CAP_SECONDS,
  addAttributeExp,
  characterCardById,
  buyTool,
  claimGoal,
  createTuiTicker,
  createProfile,
  createNewState,
  deleteProfile,
  estimateActivityPerHour,
  formatActivities,
  formatGameEvents,
  formatGoals,
  formatLiveStatus,
  formatWorldCalendar,
  formatState,
  getActivityLevel,
  getActivityOptions,
  getActivityProgress,
  getCharacterCardOptions,
  getEffectiveAttribute,
  getEffectiveMaxEnergy,
  getEnergyStatus,
  getGameViewModel,
  getGoalOptions,
  getManagementOptions,
  getProfileOptions,
  getProjectProgress,
  getProjectSuccessRate,
  getScheduleOptions,
  getSkillProgress,
  getWorldCalendar,
  learnSkill,
  listProfiles,
  loadLastProfile,
  normalizeState,
  processCommand,
  promote,
  readLastProfileId,
  resolveLastProfilePath,
  settleTime,
  startActivity,
  stopActivity,
  submitProject,
  loadProfile,
  upgradeSkill,
  writeLastProfileId
} = require("../src/game");

function unlockSkill(state, id, level = 1, exp = 0) {
  state.skillProgress[id] = { level, exp };
  if (!state.unlockedSkills.includes(id)) state.unlockedSkills.push(id);
}

function settleActiveProjectToCompletion(state, rng = () => 0) {
  const projectId = state.activeProjectId;
  const progress = getProjectProgress(state, projectId);
  state.projectProgress[projectId].stageIndex = progress.stageCount - 1;
  state.projectProgress[projectId].stageWorkedSeconds = getProjectProgress(state, projectId).stageRequiredSeconds;
  state.projectProgress[projectId].workedSeconds = progress.requiredSeconds;
  state.projectProgress[projectId].legacyPrepaid = true;
  return settleTime(state, state.lastTick + 1000, { maxSeconds: 1, randomEvents: false, rng });
}

function createTempSaveRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "life-of-code-save-"));
}

function confirmEveningActivity(state, activityId) {
  processCommand(state, "plan morning activity rest", { randomEvents: false });
  processCommand(state, "plan afternoon activity rest", { randomEvents: false });
  processCommand(state, `plan evening activity ${activityId}`, { randomEvents: false });
  const confirmed = processCommand(state, "plan confirm", { randomEvents: false }).messages.join("\n");
  assert.match(confirmed, /今日日程已确认/);
}

function createStaleEveningNoneState(now, minuteOfDay = 18 * 60) {
  const state = createNewState(now);
  state.worldTimeMinutes = minuteOfDay;
  state.lastTick = now;
  state.waitingForSchedule = false;
  state.lockedSchedule = {
    day: getWorldCalendar(state.worldTimeMinutes).day,
    slots: {
      morning: { type: "activity", id: "rest" },
      afternoon: { type: "activity", id: "rest" },
      evening: { type: "none", id: null }
    }
  };
  state.activeActivityId = "feature-coding";
  return state;
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

test("旧存档加载为 v2 新状态，只保留档案元信息", () => {
  const state = normalizeState({
    profileId: "legacy",
    profileName: "旧档案",
    resources: { codeLines: 10, exp: 5, money: 30 },
    unlockedSkills: ["html-css"],
    attributes: { logic: 999, focus: -2 },
    attributeBreakthroughs: { logic: 20 },
    attributeExp: { learning: 30 }
  });

  assert.equal(state.activeActivityId, null);
  assert.equal(state.activeProjectId, null);
  assert.deepEqual(state.projectProgress, {});
  assert.equal(state.profileId, "legacy");
  assert.equal(state.profileName, "旧档案");
  assert.equal(state.saveVersion, 2);
  assert.equal(state.resources.knowledge, 0);
  assert.equal(Object.hasOwn(state.resources, "exp"), false);
  assert.deepEqual(state.claimedGoals, []);
  assert.equal(getSkillProgress(state, "html-css").level, 0);
  assert.equal(getActivityLevel(state, "feature-coding"), 1);
  assert.equal(state.attributes.logic, DEFAULT_ATTRIBUTES.logic);
  assert.equal(state.attributes.focus, DEFAULT_ATTRIBUTES.focus);
  assert.equal(state.attributes.learning, DEFAULT_ATTRIBUTES.learning);
  assert.equal(getEffectiveAttribute(state, "logic"), DEFAULT_ATTRIBUTES.logic);
  assert.equal(state.characterCardId, null);
  assert.equal(state.waitingForSchedule, true);
  assert.equal(state.lifestyleStanceId, "health");
  assert.equal(state.pendingLifestyleStanceId, null);
});

test("v2 存档迁移会清理废弃的每日预算字段", () => {
  const raw = createNewState(1_700_000_000_000);
  raw.dailyActionMinutesUsed = 123;
  raw.currentDailyActionMinutesLimit = 456;
  raw.dailyEnergyCapMultiplier = 0.5;
  raw.pendingMorningEnergyCapMultiplier = 0.7;
  raw.pendingMorningEnergyPenalty = 30;
  raw.resources.energy = 160;

  const state = normalizeState(raw, 1_700_000_010_000);

  assert.equal(Object.hasOwn(state, "dailyActionMinutesUsed"), false);
  assert.equal(Object.hasOwn(state, "currentDailyActionMinutesLimit"), false);
  assert.equal(Object.hasOwn(state, "dailyEnergyCapMultiplier"), false);
  assert.equal(Object.hasOwn(state, "pendingMorningEnergyCapMultiplier"), false);
  assert.equal(Object.hasOwn(state, "pendingMorningEnergyPenalty"), false);
  assert.equal(state.resources.energy, ENERGY_MAX);
  assert.equal(getEffectiveMaxEnergy(state), ENERGY_MAX);
});

test("新存档初始化世界日历和周重点", () => {
  const state = createNewState();

  assert.equal(formatWorldCalendar(state, "short"), "Y1 M01 W1 周一 D001 09:00");
  assert.equal(Object.hasOwn(state, "dailyActionMinutesUsed"), false);
  assert.equal(Object.hasOwn(state, "currentDailyActionMinutesLimit"), false);
  assert.equal(Object.hasOwn(state, "dailyEnergyCapMultiplier"), false);
  assert.equal(Object.hasOwn(state, "pendingMorningEnergyCapMultiplier"), false);
  assert.equal(Object.hasOwn(state, "pendingMorningEnergyPenalty"), false);
  assert.equal(state.resources.energy, ENERGY_MAX);
  assert.equal(getEnergyStatus(state).name, "充沛");
  assert.equal(state.weeklyFocus, "balanced");
  assert.equal(state.lifestyleStanceId, "health");
  assert.equal(state.pendingLifestyleStanceId, null);
  assert.deepEqual(state.triggeredWorldEvents, []);
  assert.deepEqual(state.activeProjectDeadlines, {});
});

test("精力状态可从数值、状态和资源条目正确计算", () => {
  const state = createNewState();
  state.resources.energy = 89;
  const view = getGameViewModel(state);
  const energyEntry = view.resources.find((resource) => resource.id === "energy");

  assert.equal(getEnergyStatus(89).name, "平稳");
  assert.equal(getEnergyStatus(state).name, "平稳");
  assert.equal(getEnergyStatus(view).name, "平稳");
  assert.equal(getEnergyStatus(energyEntry).name, "平稳");
  assert.equal(energyEntry.status, "平稳");
});

test("世界时间按现实秒推进为游戏分钟并跨周月年", () => {
  const start = 1_700_000_000_000;
  const state = createNewState(start);
  startActivity(state, "rest");

  settleTime(state, start + 60_000, { randomEvents: false });
  assert.equal(getWorldCalendar(state.worldTimeMinutes).hhmm, "10:00");

  state.worldTimeMinutes = (7 - 1) * 24 * 60 + 23 * 60 + 59;
  settleTime(state, state.lastTick + 60_000, { randomEvents: false });
  let calendar = getWorldCalendar(state.worldTimeMinutes);
  assert.equal(calendar.weekOfMonth, 2);
  assert.equal(calendar.weekday, "周一");

  state.worldTimeMinutes = 28 * 24 * 60 - 1;
  settleTime(state, state.lastTick + 60_000, { randomEvents: false });
  calendar = getWorldCalendar(state.worldTimeMinutes);
  assert.equal(calendar.month, 2);
  assert.equal(calendar.day, 29);

  state.worldTimeMinutes = 336 * 24 * 60 - 1;
  settleTime(state, state.lastTick + 60_000, { randomEvents: false });
  calendar = getWorldCalendar(state.worldTimeMinutes);
  assert.equal(calendar.year, 2);
  assert.equal(calendar.day, 337);
});

test("settleTime 保留未满一秒的计时余量", () => {
  const start = 1_700_000_000_000;
  const state = createNewState(start);
  state.worldTimeMinutes = 10 * 60;

  const early = settleTime(state, start + 400, { randomEvents: false });

  assert.equal(early.seconds, 0);
  assert.equal(state.lastTick, start);

  const settled = settleTime(state, start + 1000, { randomEvents: false });

  assert.equal(settled.seconds, 1);
  assert.equal(state.lastTick, start + 1000);
  assert.equal(state.worldTimeMinutes, 10 * 60 + 1);
});

test("晚上日程加班降低主动产出并增加压力", () => {
  const start = 1_700_000_000_000;
  const normal = createNewState(start);
  const overtime = createNewState(start);
  normal.worldTimeMinutes = 18 * 60;
  overtime.worldTimeMinutes = 18 * 60;
  startActivity(normal, "feature-coding");
  confirmEveningActivity(overtime, "feature-coding");

  settleTime(normal, start + 60_000, { randomEvents: true, rng: () => 1 });
  const result = settleTime(overtime, start + 60_000, { randomEvents: true, rng: () => 1 });

  assert.ok(overtime.resources.codeLines < normal.resources.codeLines);
  assert.ok(overtime.resources.pressure > normal.resources.pressure);
  assert.doesNotMatch(result.messages.join("\n"), /今日预算|低效加班/);
});

test("未锁定日程的手动活动不会因旧预算字段触发加班", () => {
  const start = 1_700_000_000_000;
  const normal = createNewState(start);
  const staleBudget = createNewState(start);
  staleBudget.dailyActionMinutesUsed = 9999;
  staleBudget.currentDailyActionMinutesLimit = 1;
  startActivity(normal, "feature-coding");
  startActivity(staleBudget, "feature-coding");

  settleTime(normal, start + 60_000, { randomEvents: true, rng: () => 1 });
  const result = settleTime(staleBudget, start + 60_000, { randomEvents: true, rng: () => 1 });

  assert.equal(staleBudget.resources.codeLines, normal.resources.codeLines);
  assert.equal(staleBudget.resources.pressure, normal.resources.pressure);
  assert.doesNotMatch(result.messages.join("\n"), /今日预算|低效加班/);
});

test("加班产出、压力和质量风险受属性缓解", () => {
  const start = 1_700_000_000_000;
  const lowFocus = createNewState(start);
  const highFocus = createNewState(start);
  const lowResilience = createNewState(start);
  const highResilience = createNewState(start);
  const lowLogic = createNewState(start);
  const highLogic = createNewState(start);

  for (const state of [lowFocus, highFocus, lowResilience, highResilience, lowLogic, highLogic]) {
    state.worldTimeMinutes = 18 * 60;
    confirmEveningActivity(state, "feature-coding");
  }
  highFocus.attributes.focus = 100;
  highResilience.attributes.resilience = 100;
  highLogic.attributes.logic = 100;

  settleTime(lowFocus, start + 60_000, { randomEvents: true, rng: () => 1 });
  settleTime(highFocus, start + 60_000, { randomEvents: true, rng: () => 1 });
  settleTime(lowResilience, start + 60_000, { randomEvents: true, rng: () => 1 });
  settleTime(highResilience, start + 60_000, { randomEvents: true, rng: () => 1 });
  settleTime(lowLogic, start + 60_000, { randomEvents: true, rng: () => 1 });
  settleTime(highLogic, start + 60_000, { randomEvents: true, rng: () => 1 });

  assert.ok(highFocus.resources.codeLines > lowFocus.resources.codeLines);
  assert.ok(highResilience.resources.pressure < lowResilience.resources.pressure);
  assert.ok(highLogic.resources.bugs < lowLogic.resources.bugs);
  assert.ok(highLogic.resources.techDebt < lowLogic.resources.techDebt);
});

test("世界事件按游戏日历触发并展示在事件命令和 ViewModel", () => {
  const start = 1_700_000_000_000;
  const state = createNewState(start);
  state.worldTimeMinutes = 28 * 24 * 60 - 1;

  const result = settleTime(state, start + 2_000, { randomEvents: true, rng: () => 1 });
  assert.match(result.messages.join("\n"), /世界事件：AI 热潮/);
  assert.match(formatGameEvents(result.events).join("\n"), /\[世界大势\] 世界事件：AI 热潮/);
  assert.ok(state.triggeredWorldEvents.includes("ai-boom"));
  assert.match(processCommand(state, "events", { now: start + 2_000, randomEvents: false }).messages.join("\n"), /AI 热潮/);
  assert.equal(getGameViewModel(state).activeWorldEvents[0].id, "ai-boom");
});

test("week 命令设置本周重点并进入 ViewModel", () => {
  const state = createNewState();

  const message = processCommand(state, "week project", { randomEvents: false }).messages.join("\n");

  assert.match(message, /项目周/);
  assert.equal(state.weeklyFocus, "project");
  assert.equal(getGameViewModel(state).weeklyFocus.name, "项目周");
});

test("lifestyle 命令只设置明日作息并在次日 09:00 生效", () => {
  const start = 1_700_000_000_000;
  const state = createNewState(start);

  const message = processCommand(state, "lifestyle side_hustle", { randomEvents: false }).messages.join("\n");
  assert.match(message, /明日作息已设为/);
  assert.match(message, /作息效果/);
  assert.match(message, /金钱和声望/);
  assert.match(message, /消耗精力/);
  assert.equal(state.lifestyleStanceId, "health");
  assert.equal(state.pendingLifestyleStanceId, "side_hustle");
  assert.match(processCommand(state, "lifestyle", { randomEvents: false }).messages.join("\n"), /明日：Indie Side-Hustle/);
  assert.match(processCommand(state, "plan lifestyle cyber_gaming", { randomEvents: false }).messages.join("\n"), /Cyber Gaming/);
  assert.equal(state.lifestyleStanceId, "health");
  assert.equal(state.pendingLifestyleStanceId, "cyber_gaming");

  state.worldTimeMinutes = 21 * 60;
  state.lastTick = start;
  settleTime(state, start + 12 * 60 * 1000, { randomEvents: false });

  assert.equal(getWorldCalendar(state.worldTimeMinutes).hhmm, "09:00");
  assert.equal(state.lifestyleStanceId, "cyber_gaming");
  assert.equal(state.pendingLifestyleStanceId, null);
  assert.equal(getGameViewModel(state).lifestyle.current.id, "cyber_gaming");
});

test("lifestyle 命令选择当前作息时沿用当前并清空待生效", () => {
  const state = createNewState();
  state.pendingLifestyleStanceId = "side_hustle";

  const message = processCommand(state, "lifestyle health", { randomEvents: false }).messages.join("\n");

  assert.match(message, /明日沿用当前作息/);
  assert.match(message, /作息效果/);
  assert.equal(state.lifestyleStanceId, "health");
  assert.equal(state.pendingLifestyleStanceId, null);
  assert.match(getGameViewModel(state).lifestyle.text, /明日：沿用当前/);
});

test("日程选项包含可执行的作息基调入口", () => {
  const state = createNewState();

  const options = getScheduleOptions(state);
  const lifestyleOptions = options.filter((option) => option.id.startsWith("lifestyle-"));

  assert.deepEqual(lifestyleOptions.map((option) => option.id), [
    "lifestyle-health",
    "lifestyle-tech_surfing",
    "lifestyle-cyber_gaming",
    "lifestyle-side_hustle"
  ]);
  assert.equal(lifestyleOptions.find((option) => option.id === "lifestyle-health").name, "作息：Health First");
  assert.equal(lifestyleOptions.find((option) => option.id === "lifestyle-health").status, "当前");
  assert.equal(lifestyleOptions.find((option) => option.id === "lifestyle-side_hustle").status, "可设为明日");
  assert.equal(lifestyleOptions.find((option) => option.id === "lifestyle-side_hustle").command, "lifestyle side_hustle");

  const result = processCommand(state, lifestyleOptions.find((option) => option.id === "lifestyle-side_hustle").command, { randomEvents: false });
  assert.match(result.messages.join("\n"), /明日作息已设为/);
  assert.equal(state.lifestyleStanceId, "health");
  assert.equal(state.pendingLifestyleStanceId, "side_hustle");

  const updated = getScheduleOptions(state).find((option) => option.id === "lifestyle-side_hustle");
  assert.equal(updated.status, "明日生效");
  assert.match(updated.effects, /金钱和声望/);
  assert.match(updated.effects, /消耗精力/);
});

test("日程确认后仍可从日程选项设置明日作息", () => {
  const state = createNewState();
  processCommand(state, "plan morning activity feature-coding", { randomEvents: false });
  processCommand(state, "plan afternoon activity study", { randomEvents: false });
  processCommand(state, "plan evening none", { randomEvents: false });
  processCommand(state, "plan confirm", { randomEvents: false });

  const option = getScheduleOptions(state).find((item) => item.id === "lifestyle-tech_surfing");

  assert.equal(state.lockedSchedule !== null, true);
  assert.equal(option.command, "lifestyle tech_surfing");
  assert.equal(option.status, "可设为明日");

  const result = processCommand(state, option.command, { randomEvents: false });
  assert.match(result.messages.join("\n"), /明日作息已设为：Tech Surfing/);
  assert.equal(state.lifestyleStanceId, "health");
  assert.equal(state.pendingLifestyleStanceId, "tech_surfing");
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

test("内容不再包含全局经验资源、成本、倍率和奖励", () => {
  const noExpKey = (value) => !value || !Object.hasOwn(value, "exp");

  assert.ok(content.activities.every((activity) => !Object.hasOwn(activity, "effectsPerSecond")));
  assert.ok(content.activities.every((activity) => !Object.hasOwn(activity, "risksPerSecond")));
  assert.ok(content.activities.every((activity) => noExpKey(activity.outputsPerHour)));
  assert.ok(content.activities.every((activity) => noExpKey(activity.mitigationPerHour)));
  assert.ok(content.activities.every((activity) => noExpKey(activity.risksPerHour)));
  assert.ok(content.skills.every((skill) => noExpKey(skill.cost) && noExpKey(skill.multipliers)));
  assert.ok(content.tools.every((tool) => noExpKey(tool.multipliers)));
  assert.ok(content.roles.every((role) => noExpKey(role.promoteRequirements)));
  assert.ok(content.goals.every((goal) => noExpKey(goal.rewards)));
  assert.ok(content.characterCards.every((card) => noExpKey(card.resources)));
  assert.ok(content.randomEvents.every((event) => !event.apply || !event.apply.toString().includes("resources.exp")));
});

test("项目内容提供描述、长工时且不含基础经验奖励", () => {
  assert.ok(content.projects.every((project) => project.description && project.description.trim()));
  assert.ok(content.projects.every((project) => !Object.hasOwn(project.rewards, "exp")));
  assert.ok(content.projects.every((project) => ["milestone", "commission"].includes(project.kind)));
  assert.ok(content.projects.every((project) => Array.isArray(project.stages) && project.stages.length > 0));
  assert.ok(content.projects.some((project) => project.kind === "commission"));
  assert.equal(content.projects.find((project) => project.id === "vanilla-widget").minWorkHours, 1);
  assert.equal(content.projects.find((project) => project.id === "typed-form").minWorkHours, 2);
  assert.equal(content.projects.find((project) => project.id === "component-library").minWorkHours, 4);
  assert.equal(content.projects.find((project) => project.id === "blog").minWorkHours, 8);
  assert.equal(content.projects.find((project) => project.id === "admin").minWorkHours, 18);
  assert.equal(content.projects.find((project) => project.id === "flash-sale").minWorkHours, 30);
  assert.equal(content.projects.find((project) => project.id === "rag-assistant").minWorkHours, 36);
});

test("旧单存档作为 default 档案加载时重置为 v2 新进度", () => {
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
  assert.equal(state.saveVersion, 2);
  assert.equal(Object.hasOwn(state.resources, "exp"), false);
  assert.equal(state.resources.money, 30);
  assert.equal(state.waitingForSchedule, true);
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

test("最后游玩档案元数据可加载非 default，缺失或损坏时回退 default", () => {
  const saveRoot = createTempSaveRoot();
  createProfile("default", "默认档案", 1_700_000_000_000, { saveRoot, characterCardId: "academy-prodigy" });
  const alpha = createProfile("alpha", "前端角色", 1_700_000_010_000, { saveRoot, characterCardId: "product-minded-dev" });
  alpha.resources.money = 321;
  processCommand(alpha, "save", { saveRoot, now: 1_700_000_020_000 });

  assert.equal(loadLastProfile(1_700_000_030_000, { saveRoot }).profileId, "default");

  assert.equal(writeLastProfileId("alpha", { saveRoot, now: 1_700_000_040_000 }), "alpha");
  assert.equal(readLastProfileId({ saveRoot }), "alpha");
  const loadedAlpha = loadLastProfile(1_700_000_050_000, { saveRoot });
  assert.equal(loadedAlpha.profileId, "alpha");
  assert.equal(loadedAlpha.resources.money, 321);

  fs.writeFileSync(resolveLastProfilePath(saveRoot), "{bad json");
  assert.equal(readLastProfileId({ saveRoot }), null);
  assert.equal(loadLastProfile(1_700_000_060_000, { saveRoot }).profileId, "default");

  fs.writeFileSync(resolveLastProfilePath(saveRoot), JSON.stringify({ profileId: "missing" }));
  assert.equal(readLastProfileId({ saveRoot }), "missing");
  assert.equal(loadLastProfile(1_700_000_070_000, { saveRoot }).profileId, "default");
});

test("最后游玩档案只在退出时更新，不随切换、创建或保存更新", () => {
  const saveRoot = createTempSaveRoot();
  const state = createProfile("default", "默认档案", 1_700_000_000_000, { saveRoot, characterCardId: "academy-prodigy" });
  writeLastProfileId("default", { saveRoot, now: 1_700_000_001_000 });

  let message = processCommand(state, "profile new dev --card indie-hacker 开发者档案", { saveRoot, now: 1_700_000_010_000 }).messages.join("\n");
  assert.match(message, /已创建并切换到档案：dev - 开发者档案/);
  assert.equal(state.profileId, "dev");
  assert.equal(readLastProfileId({ saveRoot }), "default");

  processCommand(state, "save", { saveRoot, now: 1_700_000_020_000 });
  assert.equal(readLastProfileId({ saveRoot }), "default");

  message = processCommand(state, "profile load default", { saveRoot, now: 1_700_000_030_000 }).messages.join("\n");
  assert.match(message, /已切换到档案：default - 默认档案/);
  assert.equal(readLastProfileId({ saveRoot }), "default");

  message = processCommand(state, "profile load dev", { saveRoot, now: 1_700_000_040_000 }).messages.join("\n");
  assert.match(message, /已切换到档案：dev - 开发者档案/);
  assert.equal(readLastProfileId({ saveRoot }), "default");

  const result = processCommand(state, "quit", { saveRoot, now: 1_700_000_050_000 });
  assert.equal(result.exit, true);
  assert.equal(readLastProfileId({ saveRoot }), "dev");
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

test("未确认日程时 09:00 暂停且不会积压离线时间", () => {
  const now = 1_700_000_000_000;
  const state = createNewState(now);

  const result = settleTime(state, now + 60_000, { randomEvents: false });

  assert.equal(result.seconds, 0);
  assert.match(result.messages.join("\n"), /09:00/);
  assert.equal(getWorldCalendar(state.worldTimeMinutes).hhmm, "09:00");
  assert.equal(state.resources.codeLines, 0);
  assert.equal(Object.hasOwn(state.resources, "exp"), false);
  assert.equal(state.stats.totalCodeLines, 0);
  assert.equal(state.lastTick, now + 60_000);
});

test("plan confirm 校验必填阶段和资源，失败不扣资源", () => {
  const state = createNewState(1_700_000_000_000);
  const before = { ...state.resources };

  let message = processCommand(state, "plan morning activity feature-coding").messages.join("\n");
  assert.match(message, /已安排 上午/);

  message = processCommand(state, "plan confirm").messages.join("\n");
  assert.match(message, /下午 必须安排任务/);
  assert.deepEqual(state.resources, before);

  message = processCommand(state, "plan afternoon skill html-css").messages.join("\n");
  assert.match(message, /已安排 下午/);

  message = processCommand(state, "plan confirm").messages.join("\n");
  assert.match(message, /资源不足/);
  assert.deepEqual(state.resources, before);
  assert.equal(state.lockedSchedule, null);
});

test("确认日程后按阶段执行，且确认后不可修改", () => {
  const now = 1_700_000_000_000;
  const state = createNewState(now);

  processCommand(state, "plan morning activity feature-coding");
  processCommand(state, "plan afternoon activity study");
  processCommand(state, "plan evening none");
  const confirmed = processCommand(state, "plan confirm").messages.join("\n");
  assert.match(confirmed, /今日日程已确认/);

  const changed = processCommand(state, "plan morning activity rest").messages.join("\n");
  assert.match(changed, /不能修改/);

  settleTime(state, now + 60_000, { randomEvents: false });
  assert.ok(state.resources.codeLines > 0);
  assert.equal(state.activeActivityId, "feature-coding");

  settleTime(state, now + 3 * 60_000, { randomEvents: false });
  assert.equal(getWorldCalendar(state.worldTimeMinutes).hhmm, "12:00");
  assert.equal(state.activeActivityId, null);

  settleTime(state, now + 5 * 60_000, { randomEvents: false });
  assert.equal(getWorldCalendar(state.worldTimeMinutes).hhmm, "14:00");
  assert.equal(state.activeActivityId, "study");
});

test("晚上 none 不产生加班压力，同一技能多阶段只扣一次资源", () => {
  const now = 1_700_000_000_000;
  const rest = createNewState(now);
  processCommand(rest, "plan morning activity rest");
  processCommand(rest, "plan afternoon activity rest");
  processCommand(rest, "plan evening none");
  processCommand(rest, "plan confirm");
  rest.worldTimeMinutes = 18 * 60;
  rest.lastTick = now;
  rest.resources.energy = 50;
  rest.resources.pressure = 50;
  const pressureBefore = rest.resources.pressure;
  const energyBefore = rest.resources.energy;
  settleTime(rest, now + 60_000, { randomEvents: false });
  assert.ok(rest.resources.pressure < pressureBefore);
  assert.ok(rest.resources.energy > energyBefore);
  assert.equal(rest.activeActivityId, null);

  const skill = createNewState(now);
  skill.resources.knowledge = 40;
  skill.resources.money = 20;
  processCommand(skill, "plan morning skill html-css");
  processCommand(skill, "plan afternoon skill html-css");
  processCommand(skill, "plan evening none");
  const confirmed = processCommand(skill, "plan confirm").messages.join("\n");
  assert.match(confirmed, /今日日程已确认/);
  assert.equal(skill.resources.knowledge, 0);
  assert.equal(skill.resources.money, 0);
});

test("已确认日程在 24:00 进入每日审计报告而不是直接跳到 09:00", () => {
  const now = 1_700_000_000_000;
  const state = createNewState(now);
  processCommand(state, "plan morning activity feature-coding", { randomEvents: false });
  processCommand(state, "plan afternoon activity study", { randomEvents: false });
  processCommand(state, "plan evening none", { randomEvents: false });
  processCommand(state, "plan confirm", { randomEvents: false });
  state.worldTimeMinutes = 23 * 60 + 59;
  state.lastTick = now;

  const result = settleTime(state, now + 1000, { randomEvents: false });
  const calendar = getWorldCalendar(state.worldTimeMinutes);
  const view = getGameViewModel(state);

  assert.equal(calendar.hhmm, "00:00");
  assert.equal(calendar.day, 2);
  assert.equal(result.seconds, 1);
  assert.ok(state.dayEndSummaryPending);
  assert.equal(state.dayEndSummaryPending.day, 1);
  assert.equal(state.dayEndSummaryPending.summary.weekday, "周一");
  assert.equal(view.dayEndReport.timeLabel, "24:00");
  assert.match(view.dayEndReport.rows.join("\n"), /打工人每日资产与代码审计报告/);
  assert.match(view.dayEndReport.rows.join("\n"), /Space/);
});

test("day confirm 结算睡眠并进入次日 09:00 排程", () => {
  const now = 1_700_000_000_000;
  const state = createNewState(now);
  processCommand(state, "plan morning activity feature-coding", { randomEvents: false });
  processCommand(state, "plan afternoon activity study", { randomEvents: false });
  processCommand(state, "plan evening none", { randomEvents: false });
  processCommand(state, "plan confirm", { randomEvents: false });
  state.worldTimeMinutes = 23 * 60 + 59;
  state.lastTick = now;
  state.resources.energy = 20;
  state.resources.pressure = 50;
  settleTime(state, now + 1000, { randomEvents: false });

  const message = processCommand(state, "day confirm", { now: now + 2000, randomEvents: false }).messages.join("\n");

  assert.equal(getWorldCalendar(state.worldTimeMinutes).hhmm, "09:00");
  assert.equal(getWorldCalendar(state.worldTimeMinutes).day, 2);
  assert.equal(state.dayEndSummaryPending, null);
  assert.equal(state.waitingForSchedule, true);
  assert.ok(state.resources.energy > 20);
  assert.ok(state.resources.pressure < 50);
  assert.match(message, /睡眠结算 9h0m/);
});

test("21:00 不再触发日终报告，夜间继续休整到 24:00", () => {
  const now = 1_700_000_000_000;
  const state = createNewState(now);
  processCommand(state, "plan morning activity rest", { randomEvents: false });
  processCommand(state, "plan afternoon activity rest", { randomEvents: false });
  processCommand(state, "plan evening none", { randomEvents: false });
  processCommand(state, "plan confirm", { randomEvents: false });
  state.worldTimeMinutes = 20 * 60 + 59;
  state.lastTick = now;
  state.resources.energy = 30;

  settleTime(state, now + 1000, { randomEvents: false });

  assert.equal(getWorldCalendar(state.worldTimeMinutes).hhmm, "21:00");
  assert.equal(state.dayEndSummaryPending, null);
  assert.ok(state.resources.energy > 30);
});

test("阶段小事件受 randomEvents 和 rng 控制并进入报告", () => {
  const now = 1_700_000_000_000;
  const state = createNewState(now);
  processCommand(state, "plan morning activity feature-coding", { randomEvents: false });
  processCommand(state, "plan afternoon activity study", { randomEvents: false });
  processCommand(state, "plan evening none", { randomEvents: false });
  processCommand(state, "plan confirm", { randomEvents: false });
  state.worldTimeMinutes = 11 * 60 + 59;
  state.lastTick = now;

  const eventResult = settleTime(state, now + 1000, { randomEvents: true, rng: () => 0 });

  assert.equal(getWorldCalendar(state.worldTimeMinutes).hhmm, "12:00");
  assert.ok(state.dayPhaseEvents.some((event) => event.phaseId === "morning"));
  assert.ok(eventResult.events.some((event) => event.category === "random" && /阶段小事/.test(event.text)));

  const quiet = createNewState(now);
  processCommand(quiet, "plan morning activity feature-coding", { randomEvents: false });
  processCommand(quiet, "plan afternoon activity study", { randomEvents: false });
  processCommand(quiet, "plan evening none", { randomEvents: false });
  processCommand(quiet, "plan confirm", { randomEvents: false });
  quiet.worldTimeMinutes = 11 * 60 + 59;
  quiet.lastTick = now;
  settleTime(quiet, now + 1000, { randomEvents: false, rng: () => 0 });

  assert.equal(quiet.dayPhaseEvents.length, 0);
});

test("晚上 none 的零秒结算会清空旧活动并显示晚间休整", () => {
  const now = 1_700_000_000_000;
  const state = createStaleEveningNoneState(now);

  const result = settleTime(state, now, { randomEvents: false });
  const ticker = result.ticker.join("\n");

  assert.equal(result.seconds, 0);
  assert.equal(state.activeActivityId, null);
  assert.equal(state.activeSkillLearningId, null);
  assert.equal(state.activeProjectId, null);
  assert.doesNotMatch(ticker, /活动 写功能/);
  assert.match(ticker, /健康休整/);
});

test("晚上 none 带旧活动时只按作息休整结算", () => {
  const now = 1_700_000_000_000;
  const state = createStaleEveningNoneState(now);
  state.resources.energy = 20;
  state.resources.pressure = 50;
  const codeBefore = state.resources.codeLines;
  const energyBefore = state.resources.energy;
  const pressureBefore = state.resources.pressure;

  const result = settleTime(state, now + 60_000, { randomEvents: false });

  assert.equal(state.activeActivityId, null);
  assert.equal(state.resources.codeLines, codeBefore);
  assert.ok(state.resources.energy > energyBefore);
  assert.ok(state.resources.pressure < pressureBefore);
  assert.match(result.ticker.join("\n"), /\[当前行动\] 健康休整 60 秒：/);
});

test("休整和非任务阶段不会在 ticker 中显示旧活动", () => {
  const now = 1_700_000_000_000;
  const noon = createStaleEveningNoneState(now, 12 * 60);
  const night = createStaleEveningNoneState(now, 21 * 60);

  const noonTicker = createTuiTicker(noon).join("\n");
  const nightTicker = createTuiTicker(night).join("\n");

  assert.equal(noon.activeActivityId, null);
  assert.equal(night.activeActivityId, null);
  assert.doesNotMatch(noonTicker, /活动 写功能/);
  assert.doesNotMatch(nightTicker, /活动 写功能/);
  assert.match(noonTicker, /健康休整/);
  assert.match(nightTicker, /健康休整/);
});

test("作息基调按休整窗口和属性结算", () => {
  const now = 1_700_000_000_000;

  const lowHealth = createNewState(now);
  const highHealth = createNewState(now);
  for (const state of [lowHealth, highHealth]) {
    state.worldTimeMinutes = 12 * 60;
    state.lastTick = now;
    state.resources.energy = 20;
    state.resources.pressure = 60;
  }
  highHealth.attributes.resilience = 100;
  settleTime(lowHealth, now + 60_000, { randomEvents: false });
  settleTime(highHealth, now + 60_000, { randomEvents: false });
  assert.equal(highHealth.resources.energy, lowHealth.resources.energy);
  assert.ok(highHealth.resources.pressure < lowHealth.resources.pressure);

  const lowTech = createNewState(now);
  const highTech = createNewState(now);
  for (const state of [lowTech, highTech]) {
    state.lifestyleStanceId = "tech_surfing";
    state.worldTimeMinutes = 12 * 60;
    state.lastTick = now;
    state.resources.energy = 20;
  }
  highTech.attributes.learning = 100;
  settleTime(lowTech, now + 60_000, { randomEvents: false });
  settleTime(highTech, now + 60_000, { randomEvents: false });
  assert.ok(lowTech.resources.energy > 20);
  assert.equal(highTech.resources.energy, lowTech.resources.energy);
  assert.ok(highTech.resources.knowledge > lowTech.resources.knowledge);

  const gaming = createNewState(now);
  gaming.lifestyleStanceId = "cyber_gaming";
  gaming.worldTimeMinutes = 21 * 60;
  gaming.lastTick = now;
  gaming.resources.pressure = 60;
  settleTime(gaming, now + 60_000, { randomEvents: false });
  assert.ok(gaming.resources.pressure < 60);
  assert.ok(gaming.resources.energy > 0);
  assert.equal(gaming.pendingMorningEnergyCapMultiplier, undefined);
});

test("基础精力恢复速率为午休低于晚间低于深夜", () => {
  const now = 1_700_000_000_000;
  const makeRestState = (minuteOfDay) => {
    const state = createNewState(now);
    state.worldTimeMinutes = minuteOfDay;
    state.lastTick = now;
    state.resources.energy = 0;
    state.resources.pressure = 0;
    state.lockedSchedule = { day: 1, slots: { evening: { type: "none", id: null } } };
    return state;
  };

  const noon = makeRestState(12 * 60);
  const evening = makeRestState(18 * 60);
  const night = makeRestState(21 * 60);

  settleTime(noon, now + 60_000, { randomEvents: false });
  settleTime(evening, now + 60_000, { randomEvents: false });
  settleTime(night, now + 60_000, { randomEvents: false });

  assert.ok(noon.resources.energy < evening.resources.energy);
  assert.ok(evening.resources.energy < night.resources.energy);
  assert.ok(Math.abs(noon.resources.energy - 4) < 0.000001);
  assert.ok(Math.abs(evening.resources.energy - 6) < 0.000001);
  assert.ok(Math.abs(night.resources.energy - 8) < 0.000001);
});

test("压力按线性倍率抑制正向精力恢复", () => {
  const now = 1_700_000_000_000;
  const settleNoonAtPressure = (pressure) => {
    const state = createNewState(now);
    state.worldTimeMinutes = 12 * 60;
    state.lastTick = now;
    state.resources.energy = 0;
    state.resources.pressure = pressure;
    settleTime(state, now + 60_000, { randomEvents: false });
    return state.resources.energy;
  };

  assert.ok(Math.abs(settleNoonAtPressure(0) - 4) < 0.000001);
  assert.ok(Math.abs(settleNoonAtPressure(50) - 2.4) < 0.000001);
  assert.ok(Math.abs(settleNoonAtPressure(100) - 0.8) < 0.000001);
});

test("主动 rest 的精力恢复受压力抑制但不再降低压力", () => {
  const now = 1_700_000_000_000;
  const lowPressure = createNewState(now);
  const highPressure = createNewState(now);
  for (const state of [lowPressure, highPressure]) {
    state.worldTimeMinutes = 9 * 60;
    state.lastTick = now;
    state.resources.energy = 0;
    state.resources.pressure = 0;
    startActivity(state, "rest");
  }
  highPressure.resources.pressure = 100;

  settleTime(lowPressure, now + 60_000, { randomEvents: false });
  settleTime(highPressure, now + 60_000, { randomEvents: false });

  assert.ok(Math.abs(lowPressure.resources.energy - 2.5) < 0.000001);
  assert.ok(Math.abs(highPressure.resources.energy - 0.5) < 0.000001);
  assert.equal(lowPressure.resources.pressure, 0);
  assert.equal(highPressure.resources.pressure, 76);
});

test("side_hustle 深夜即时消耗精力并产生收益", () => {
  const now = 1_700_000_000_000;
  const noon = createNewState(now);
  noon.lifestyleStanceId = "side_hustle";
  noon.worldTimeMinutes = 12 * 60;
  noon.lastTick = now;
  settleTime(noon, now + 60_000, { randomEvents: false });
  assert.equal(noon.resources.money, 30);
  assert.ok(noon.resources.energy > 0);
  assert.equal(noon.resources.reputation, 0);

  const night = createNewState(now);
  night.lifestyleStanceId = "side_hustle";
  night.worldTimeMinutes = 21 * 60;
  night.lastTick = now;
  night.resources.energy = 100;
  settleTime(night, now + 12 * 60 * 1000, { randomEvents: false });
  assert.ok(night.resources.money > 30);
  assert.ok(night.resources.reputation > 0);
  assert.ok(night.resources.pressure > 0);
  assert.equal(night.pendingMorningEnergyPenalty, undefined);
  assert.ok(night.resources.energy < 100);

  const lowFocus = createNewState(now);
  const highFocus = createNewState(now);
  for (const state of [lowFocus, highFocus]) {
    state.lifestyleStanceId = "side_hustle";
    state.worldTimeMinutes = 21 * 60;
    state.lastTick = now;
    state.resources.energy = 100;
  }
  highFocus.attributes.focus = 100;
  settleTime(lowFocus, now + 12 * 60 * 1000, { randomEvents: false });
  settleTime(highFocus, now + 12 * 60 * 1000, { randomEvents: false });
  assert.equal(highFocus.resources.energy, lowFocus.resources.energy);
});

test("side_hustle 深夜消耗不受压力影响，午休恢复仍受压力抑制", () => {
  const now = 1_700_000_000_000;
  const lowPressureNight = createNewState(now);
  const highPressureNight = createNewState(now);
  for (const state of [lowPressureNight, highPressureNight]) {
    state.lifestyleStanceId = "side_hustle";
    state.worldTimeMinutes = 21 * 60;
    state.lastTick = now;
    state.resources.energy = 100;
  }
  highPressureNight.resources.pressure = 100;
  settleTime(lowPressureNight, now + 60_000, { randomEvents: false });
  settleTime(highPressureNight, now + 60_000, { randomEvents: false });
  assert.equal(highPressureNight.resources.energy, lowPressureNight.resources.energy);

  const lowPressureNoon = createNewState(now);
  const highPressureNoon = createNewState(now);
  for (const state of [lowPressureNoon, highPressureNoon]) {
    state.lifestyleStanceId = "side_hustle";
    state.worldTimeMinutes = 12 * 60;
    state.lastTick = now;
    state.resources.energy = 0;
  }
  highPressureNoon.resources.pressure = 100;
  settleTime(lowPressureNoon, now + 60_000, { randomEvents: false });
  settleTime(highPressureNoon, now + 60_000, { randomEvents: false });
  assert.ok(Math.abs(lowPressureNoon.resources.energy - 4) < 0.000001);
  assert.ok(Math.abs(highPressureNoon.resources.energy - 0.8) < 0.000001);
});

test("休整 tick 显示具体行动和实际产出摘要", () => {
  const now = 1_700_000_000_000;

  const health = createNewState(now);
  health.worldTimeMinutes = 12 * 60;
  health.lastTick = now;
  health.resources.energy = 20;
  health.resources.pressure = 60;
  const healthTicker = settleTime(health, now + 60_000, { randomEvents: false }).ticker.join("\n");
  assert.match(healthTicker, /\[当前行动\] 健康休整 60 秒：/);
  assert.match(healthTicker, /精力 \+/);
  assert.match(healthTicker, /压力 -/);

  const tech = createNewState(now);
  tech.lifestyleStanceId = "tech_surfing";
  tech.worldTimeMinutes = 12 * 60;
  tech.lastTick = now;
  const techTicker = settleTime(tech, now + 60_000, { randomEvents: false }).ticker.join("\n");
  assert.match(techTicker, /\[当前行动\] 技术浏览 60 秒：/);
  assert.match(techTicker, /知识 \+/);

  const sideNoon = createNewState(now);
  sideNoon.lifestyleStanceId = "side_hustle";
  sideNoon.worldTimeMinutes = 12 * 60;
  sideNoon.lastTick = now;
  const sideNoonTicker = settleTime(sideNoon, now + 60_000, { randomEvents: false }).ticker.join("\n");
  assert.match(sideNoonTicker, /副业前休整 60 秒/);
  assert.match(sideNoonTicker, /恢复精力/);

  const sideNight = createNewState(now);
  sideNight.lifestyleStanceId = "side_hustle";
  sideNight.worldTimeMinutes = 21 * 60;
  sideNight.lastTick = now;
  const sideNightTicker = settleTime(sideNight, now + 60_000, { randomEvents: false }).ticker.join("\n");
  assert.match(sideNightTicker, /\[当前行动\] 独立副业 60 秒：/);
  assert.match(sideNightTicker, /金钱 \+/);
  assert.match(sideNightTicker, /声望 \+/);
  assert.match(sideNightTicker, /压力 \+/);
  assert.match(sideNightTicker, /精力 -/);
});

test("start feature-coding 后只结算写功能活动", () => {
  const now = 1_700_000_000_000;
  const state = createNewState(now);

  const startMessage = startActivity(state, "feature-coding");
  assert.match(startMessage, /开始活动：写功能/);
  assert.match(startMessage, /收益\/游戏小时：代码 \+35\.55/);
  assert.match(startMessage, /风险\/游戏小时：Bug \+1\.21，技术债 \+0\.78，压力 \+0\.26/);
  assert.match(startMessage, /精力消耗\/游戏小时：精力 -11\.2/);
  settleTime(state, now + 60_000, { randomEvents: false });

  assert.ok(state.resources.codeLines > 0);
  assert.equal(Object.hasOwn(state.resources, "exp"), false);
  assert.ok(state.resources.bugs > 0);
  assert.ok(state.resources.techDebt > 0);
  assert.ok(state.resources.pressure > 0);
  assert.ok(state.resources.energy < 100);
  assert.ok(state.activityStats.totalActiveSeconds >= 60);
  assert.ok(state.activityStats.byActivity["feature-coding"] >= 60);
});

test("start 命令不再立即切换活动，只提示使用日程", () => {
  const now = 1_700_000_000_000;
  const state = createNewState(now);
  startActivity(state, "feature-coding");

  const message = processCommand(state, "start study", { now: now + 60_000 }).messages.join("\n");

  assert.match(message, /写功能 60 秒：/);
  assert.match(message, /代码 \+\d+（\d+）/);
  assert.match(message, /start 不再立即执行/);
  assert.equal(state.activeActivityId, "feature-coding");
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
  state.activityLevels.refactoring = 4;

  assert.match(startActivity(state, "architecture"), /开始活动：架构设计/);
  assert.equal(state.activeActivityId, "architecture");
});

test("activities 展示活动列表、等级、锁定状态和当前状态", () => {
  const state = createNewState();
  startActivity(state, "feature-coding");

  const message = formatActivities(state);

  assert.match(message, /feature-coding - 写功能 \[进行中\] Lv\.1/);
  assert.match(message, /等级经验/);
  assert.match(message, /产出：收益\/游戏小时：代码 \+35\.55/);
  assert.match(message, /风险\/游戏小时：Bug \+1\.21/);
  assert.match(message, /architecture - 架构设计 \[未解锁\]/);
  assert.match(message, /rest - 休息恢复/);
});

test("activity options 按游戏小时展示收益、风险、改善和精力", () => {
  const state = createNewState();

  const options = getActivityOptions(state);
  const featureCoding = options.find((item) => item.id === "feature-coding");
  const bugHunting = options.find((item) => item.id === "bug-hunting");
  const rest = options.find((item) => item.id === "rest");

  assert.equal(
    featureCoding.output,
    "收益/游戏小时：代码 +35.55；风险/游戏小时：Bug +1.21，技术债 +0.78，压力 +0.26；精力消耗/游戏小时：精力 -11.2"
  );
  assert.equal(featureCoding.detailKind, "activity");
  assert.equal(featureCoding.roleSummary, "核心产出");
  assert.equal(featureCoding.growthSummary, "Lv.1 0/200  专注 +9/h，逻辑 +5/h");
  assert.equal(featureCoding.attributeGrowthSummary, "专注 +9/h，逻辑 +5/h");
  assert.deepEqual(featureCoding.rateSections, {
    gains: "代码 +35.55",
    improvements: "",
    risks: "Bug +1.21，技术债 +0.78，压力 +0.26",
    energy: "精力 -11.2",
    lowEnergy: ""
  });
  assert.match(featureCoding.useCase, /推进项目素材/);
  assert.equal(
    bugHunting.output,
    "收益/游戏小时：测试 +1.33；精力消耗/游戏小时：精力 -11.2"
  );
  assert.equal(rest.output, "当前无可见变化");
  assert.equal(rest.roleSummary, "恢复节奏");
  assert.deepEqual(rest.rateSections, {
    gains: "",
    improvements: "",
    risks: "",
    energy: "",
    lowEnergy: ""
  });
});

test("activity energy costs and quality mitigation match balance targets", () => {
  const byId = Object.fromEntries(content.activities.map((activity) => [activity.id, activity]));
  const expectedEnergyCosts = {
    study: 8.4,
    documentation: 8.4,
    "prompt-engineering": 8.4,
    "feature-coding": 11.2,
    "bug-hunting": 11.2,
    refactoring: 11.2,
    testing: 11.2,
    "open-source": 11.2,
    "code-review": 11.2,
    freelancing: 14,
    architecture: 14,
    "performance-tuning": 14,
    "incident-response": 16.8,
    rest: 0
  };
  const expectedMitigation = {
    "bug-hunting": { bugs: 3.64 },
    refactoring: { techDebt: 3.19 },
    testing: { bugs: 1.14 },
    documentation: { techDebt: 0.91, pressure: 9 },
    architecture: { techDebt: 2.28 },
    "code-review": { bugs: 3.64, techDebt: 2.28 },
    "performance-tuning": { techDebt: 1.37 },
    "incident-response": { bugs: 5.46 }
  };

  for (const [id, cost] of Object.entries(expectedEnergyCosts)) {
    assert.equal(byId[id].energyCostPerHour, cost);
  }
  for (const [id, mitigation] of Object.entries(expectedMitigation)) {
    assert.deepEqual(byId[id].mitigationPerHour, mitigation);
  }
});

test("activity estimate matches one-hour settlement deltas", () => {
  const now = 1_700_000_000_000;
  const setup = (state) => {
    state.resources.energy = 50;
    state.resources.bugs = 50;
    state.resources.techDebt = 50;
    state.resources.pressure = 50;
  };
  const estimateState = createNewState(now);
  const settleState = createNewState(now);
  setup(estimateState);
  setup(settleState);
  const activity = content.activities.find((item) => item.id === "bug-hunting");

  const estimate = estimateActivityPerHour(estimateState, activity).deltas;
  startActivity(settleState, "bug-hunting");
  const before = { ...settleState.resources };
  settleTime(settleState, now + 60_000, { randomEvents: false });

  for (const key of ["tests", "bugs", "energy"]) {
    assert.ok(Math.abs(estimate[key] - (settleState.resources[key] - before[key])) < 0.000001);
  }
});

test("活动经验达到阈值后升级", () => {
  const now = 1_700_000_000_000;
  const state = createNewState(now);
  state.activityExp["feature-coding"] = 190;
  startActivity(state, "feature-coding");

  settleTime(state, now + 60_000, { randomEvents: false });
  assert.ok(getActivityLevel(state, "feature-coding") > 1);
  assert.ok(getActivityProgress(state, "feature-coding").exp >= 0);
});

test("精力耗尽时非休息活动停止推进并提示", () => {
  const now = 1_700_000_000_000;
  const state = createNewState(now);
  state.resources.energy = 0;
  startActivity(state, "feature-coding");

  const result = settleTime(state, now + 60_000, { randomEvents: false });

  assert.match(result.messages.join("\n"), /精力耗尽/);
  assert.equal(state.resources.codeLines, 0);
  assert.equal(state.activityStats.totalActiveSeconds, 0);
});

test("技能学习精力不足时只推进可负担工时", () => {
  const now = 1_700_000_000_000;
  const state = createNewState(now);
  state.resources.knowledge = 60;
  state.resources.money = 100;
  state.resources.energy = 1;
  learnSkill(state, "html-css");

  const first = settleTime(state, now + 60_000, { randomEvents: false });
  const worked = state.skillLearningProgress["html-css"].workedSeconds;

  assert.match(first.messages.join("\n"), /精力耗尽/);
  assert.ok(worked > 0);
  assert.ok(worked < 60);
  assert.equal(state.resources.energy, 0);

  settleTime(state, now + 120_000, { randomEvents: false });
  assert.equal(state.skillLearningProgress["html-css"].workedSeconds, worked);
});

test("项目推进精力不足时只推进可负担工时且保留投入", () => {
  const now = 1_700_000_000_000;
  const state = createNewState(now);
  state.resources.energy = 1;
  state.activeProjectId = "homepage";
  state.projectProgress.homepage = { workedSeconds: 0, resourcesPaid: true };

  const first = settleTime(state, now + 60_000, { randomEvents: false, rng: () => 0 });
  const worked = state.projectProgress.homepage.workedSeconds;

  assert.match(first.messages.join("\n"), /精力耗尽/);
  assert.ok(worked > 0);
  assert.ok(worked < 60);
  assert.equal(state.resources.energy, 0);
  assert.equal(state.projectProgress.homepage.legacyPrepaid, true);

  settleTime(state, now + 120_000, { randomEvents: false, rng: () => 0 });
  assert.equal(state.projectProgress.homepage.workedSeconds, worked);
});

test("活动结算只显示可见整数变化并附带当前总数", () => {
  const now = 1_700_000_000_000;
  const state = createNewState(now);
  startActivity(state, "study");

  const result = settleTime(state, now + 60_000, { randomEvents: false });
  const message = result.messages.join("\n");

  assert.match(message, /系统学习 60 秒：/);
  assert.doesNotMatch(message, /经验 \+\d+（\d+）/);
  assert.match(message, /知识 \+\d+（\d+）/);
  assert.match(message, /精力 -\d+（\d+）/);
  assert.doesNotMatch(message, /测试/);
});

test("settleTime 普通短 tick 只更新 TUI ticker，不追加结构化事件", () => {
  const now = 1_700_000_000_000;
  const state = createNewState(now);
  startActivity(state, "study");

  const result = settleTime(state, now + 30_000, { randomEvents: false });

  assert.equal(result.events.length, 0);
  assert.match(result.ticker.join("\n"), /\[当前行动\] 系统学习 30 秒：/);
  assert.match(result.ticker.join("\n"), /知识 \+/);
});

test("活动升级但资源没有可见变化时仍显示升级消息", () => {
  const now = 1_700_000_000_000;
  const state = createNewState(now);
  state.activityExp.rest = 199.5;
  startActivity(state, "rest");

  const result = settleTime(state, now + 5_000, { randomEvents: false });

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

test("maintenance activities scale side outputs and activity proficiency by current risk", () => {
  const now = 1_700_000_000_000;
  const bugHunting = content.activities.find((item) => item.id === "bug-hunting");
  const lowBugs = createNewState(now);
  const highBugs = createNewState(now);
  lowBugs.resources.bugs = 0;
  highBugs.resources.bugs = 50;

  const lowBugEstimate = estimateActivityPerHour(lowBugs, bugHunting).deltas;
  const highBugEstimate = estimateActivityPerHour(highBugs, bugHunting).deltas;
  assert.ok(highBugEstimate.tests > lowBugEstimate.tests * 2);

  startActivity(lowBugs, "bug-hunting");
  startActivity(highBugs, "bug-hunting");
  settleTime(lowBugs, now + 60_000, { randomEvents: false });
  settleTime(highBugs, now + 60_000, { randomEvents: false });
  assert.ok(highBugs.activityExp["bug-hunting"] > lowBugs.activityExp["bug-hunting"] * 2);

  const refactoring = content.activities.find((item) => item.id === "refactoring");
  const lowDebt = createNewState(now);
  const highDebt = createNewState(now);
  lowDebt.resources.techDebt = 0;
  highDebt.resources.techDebt = 50;
  assert.ok(estimateActivityPerHour(highDebt, refactoring).deltas.architecture > estimateActivityPerHour(lowDebt, refactoring).deltas.architecture * 2);
});

test("freelancing pays more than performance tuning and carries higher risk", () => {
  const freelancing = content.activities.find((item) => item.id === "freelancing");
  const performance = content.activities.find((item) => item.id === "performance-tuning");

  assert.ok(freelancing.outputsPerHour.money > performance.outputsPerHour.money);
  assert.ok(freelancing.risksPerHour.bugs > performance.risksPerHour.bugs);
  assert.ok(freelancing.risksPerHour.pressure > performance.risksPerHour.pressure);
});

test("architecture outproduces refactoring and unlocks at refactoring Lv4 plus sql", () => {
  const architecture = content.activities.find((item) => item.id === "architecture");
  const refactoring = content.activities.find((item) => item.id === "refactoring");

  assert.ok(architecture.outputsPerHour.architecture > refactoring.outputsPerHour.architecture);
  assert.deepEqual(architecture.requirements, { skills: ["sql"], activityLevels: { refactoring: 4 } });
});

test("activity attribute growth follows skill-route balance and global exp resource is absent", () => {
  const expected = {
    "feature-coding": { focus: 9, logic: 5 },
    "bug-hunting": { logic: 9, resilience: 5 },
    refactoring: { logic: 9, focus: 5 },
    study: { learning: 14 },
    testing: { focus: 9, logic: 5 },
    documentation: { learning: 9, communication: 5 },
    freelancing: { communication: 9, resilience: 5 },
    "open-source": { communication: 9, creativity: 5 },
    architecture: { logic: 9, learning: 5, creativity: 5 },
    "code-review": { logic: 5, communication: 5, learning: 5 },
    "performance-tuning": { logic: 9, focus: 5, resilience: 5 },
    "prompt-engineering": { creativity: 9, learning: 9 },
    "incident-response": { resilience: 9, logic: 5, focus: 5 },
    rest: { resilience: 6 }
  };

  for (const activity of content.activities) {
    assert.deepEqual(activity.attributeExpPerHour, expected[activity.id]);
    assert.equal(Object.hasOwn(activity.outputsPerHour, "exp"), false);
    assert.equal(Object.hasOwn(activity.mitigationPerHour, "exp"), false);
    assert.equal(Object.hasOwn(activity.risksPerHour, "exp"), false);
  }
  assert.equal(Object.hasOwn(createNewState().resources, "exp"), false);
});

test("learn 消耗资源并启动耗时学习，完成后才解锁技能", () => {
  const now = 1_700_000_000_000;
  const state = createNewState(now);
  startActivity(state, "study");
  settleTime(state, now + 300_000, { randomEvents: false });

  assert.ok(state.resources.knowledge > 15);
  state.resources.knowledge = 60;
  state.resources.money = 100;
  state.resources.energy = 100;

  const beforeKnowledge = state.resources.knowledge;
  const message = learnSkill(state, "html-css");

  assert.match(message, /开始学习：HTML\/CSS/);
  assert.ok(state.resources.knowledge < beforeKnowledge);
  assert.equal(state.activeSkillLearningId, "html-css");
  assert.equal(state.unlockedSkills.includes("html-css"), false);

  const result = settleTime(state, state.lastTick + 660_000, { randomEvents: false });
  const eventLog = formatGameEvents(result.events).join("\n");

  assert.match(result.messages.join("\n"), /技能 HTML\/CSS 学习完成/);
  assert.match(result.messages.join("\n"), /学习总结：/);
  assert.match(eventLog, /\[技能\] 学习日志：HTML\/CSS/);
  assert.match(eventLog, /\[技能\] 技能 HTML\/CSS 学习完成，达到 入门。学习总结：/);
  assert.ok(state.unlockedSkills.includes("html-css"));
  assert.equal(getSkillProgress(state, "html-css").level, 1);
  assert.equal(state.activeSkillLearningId, null);
  assert.equal(state.skillLearningProgress["html-css"], undefined);
  assert.equal(getGameViewModel(state).activeSkillLearning, null);
  assert.equal(getGameViewModel(state).actions.stopActivity, null);
});

test("已学会的技能不会继续保留为当前学习", () => {
  const state = createNewState();
  unlockSkill(state, "html-css");
  state.activeSkillLearningId = "html-css";
  state.skillLearningProgress["html-css"] = { workedSeconds: 600, resourcesPaid: true };

  const view = getGameViewModel(state);

  assert.equal(state.activeSkillLearningId, null);
  assert.equal(state.skillLearningProgress["html-css"], undefined);
  assert.equal(view.activeSkillLearning, null);
  assert.equal(view.actions.stopActivity, null);
  assert.match(formatState(state), /当前学习：无/);
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
  assert.ok(content.ambientEvents.some((item) => item.id === "feature-clean-slice"));
  assert.ok(content.ambientEvents.some((item) => item.id === "project-acceptance-thread"));
});

test("随机事件返回随机分类事件并附带资源变化摘要", () => {
  const now = 1_700_000_000_000;
  const state = createNewState(now);
  state.worldTimeMinutes = 10 * 60;

  const result = settleTime(state, now + 3600_000, { randomEvents: true, rng: () => 0 });
  const eventLog = formatGameEvents(result.events).join("\n");

  assert.match(eventLog, /\[随机事件\] 随机事件：需求变更/);
  assert.match(eventLog, /本次变化：/);
  assert.match(eventLog, /技术债 \+/);
});

test("随机事件支持 messages 叙事变体并保留旧 message 兼容", () => {
  const now = 1_700_000_000_000;
  const state = createNewState(now);
  state.worldTimeMinutes = 10 * 60;
  const requirementChange = content.randomEvents.find((event) => event.id === "requirement-change");
  const legacyOnly = { name: "旧事件", message: "旧消息仍可显示。" };

  const result = settleTime(state, now + 3600_000, { randomEvents: true, rng: () => 0 });
  const eventLog = formatGameEvents(result.events).join("\n");

  assert.ok(Array.isArray(requirementChange.messages));
  assert.match(eventLog, new RegExp(requirementChange.messages[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(legacyOnly.message, "旧消息仍可显示。");
});

test("挂机 ambient 事件会进入日志并轻量影响资源、活动经验和属性经验", () => {
  const now = 1_700_000_000_000;
  const state = createNewState(now);
  state.worldTimeMinutes = 10 * 60;
  state.resources.energy = 100;
  startActivity(state, "feature-coding");
  const rngValues = [0.99, 0, 0];
  const rng = () => rngValues.shift() ?? 0;

  const result = settleTime(state, now + 8 * 60_000, { randomEvents: true, rng });
  const eventLog = formatGameEvents(result.events).join("\n");

  assert.match(eventLog, /\[随机事件\] 工作插曲：切片清爽/);
  assert.match(eventLog, /变化：代码 \+4，专注经验 \+2，写功能熟练度 \+6/);
  assert.ok(state.resources.codeLines >= 4);
  assert.ok(state.activityExp["feature-coding"] >= 6);
  assert.ok(state.attributeExp.focus >= 2);
});

test("randomEvents false 会关闭挂机 ambient 事件", () => {
  const now = 1_700_000_000_000;
  const state = createNewState(now);
  state.worldTimeMinutes = 10 * 60;
  startActivity(state, "feature-coding");

  const result = settleTime(state, now + 8 * 60_000, { randomEvents: false, rng: () => 0 });

  assert.doesNotMatch(formatGameEvents(result.events).join("\n"), /工作插曲/);
});

test("挂机 ambient 事件最多保留四条且遵守资源上下限", () => {
  const now = 1_700_000_000_000;
  const state = createNewState(now);
  state.worldTimeMinutes = 10 * 60;
  state.resources.energy = 100;
  state.resources.pressure = 0;
  startActivity(state, "feature-coding");

  const result = settleTime(state, now + 24 * 60 * 60_000, { randomEvents: true, rng: () => 0.99 });
  const eventLog = formatGameEvents(result.events).join("\n");
  const ambientCount = (eventLog.match(/工作插曲/g) || []).length;

  assert.equal(ambientCount, 4);
  assert.ok(state.resources.energy <= getEffectiveMaxEnergy(state));
  assert.ok(state.resources.pressure >= 0);
});

test("活动阶段叙事跨阈值触发且同日同阶段不重复", () => {
  const now = 1_700_000_000_000;
  const state = createNewState(now);
  startActivity(state, "feature-coding");

  const first = settleTime(state, now + 60_000, { randomEvents: false, rng: () => 0 });
  const repeat = settleTime(state, state.lastTick + 1_000, { randomEvents: false, rng: () => 0 });
  const eventLog = formatGameEvents(first.events).join("\n");

  assert.match(eventLog, /\[随机事件\] 活动片段：写功能/);
  assert.doesNotMatch(formatGameEvents(repeat.events).join("\n"), /活动片段：写功能/);
});

test("新增技能 TypeScript 满足属性和资源后进入学习队列", () => {
  const state = createNewState(1_700_000_000_000);
  state.attributes.logic = 26;
  state.resources.knowledge = 260;
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
  assert.ok(state.resources.docs > 0);
});

test("新增项目组件库内卷可开始并在成功 RNG 下交付", () => {
  const start = 1_700_000_000_000;
  const state = createNewState(start);
  state.resources.codeLines = 600;
  state.resources.docs = 50;
  state.resources.tests = 60;
  unlockSkill(state, "typescript", 2);
  unlockSkill(state, "react", 2);
  state.activityLevels["feature-coding"] = 4;
  state.activityLevels.documentation = 2;
  state.activityLevels.testing = 2;

  const message = submitProject(state, "component-library");

  assert.match(message, /开始项目：组件库内卷/);
  assert.equal(state.activeProjectId, "component-library");
  assert.equal(state.resources.codeLines, 600);
  assert.equal(state.resources.docs, 50);
  assert.equal(state.resources.tests, 60);

  const result = settleActiveProjectToCompletion(state, () => 0);

  assert.match(result.messages.join("\n"), /交付成功/);
  assert.ok(state.completedProjects.includes("component-library"));
  assert.equal(state.activeProjectId, null);
  assert.ok(state.resources.money >= 190);
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
  assert.equal(rest.resources.pressure, 26);
});

test("项目会检查条件，开始不预扣资源并按阶段推进消耗素材", () => {
  const state = createNewState();

  assert.match(submitProject(state, "homepage"), /项目条件不足/);

  state.resources.codeLines = 128;
  state.resources.docs = 13;
  state.resources.money = 100;
  state.resources.knowledge = 30;
  state.activityLevels["feature-coding"] = 2;
  unlockSkill(state, "html-css");

  const message = submitProject(state, "homepage");

  assert.match(message, /开始项目：个人主页/);
  assert.equal(state.activeProjectId, "homepage");
  assert.equal(state.activeActivityId, null);
  assert.equal(state.projectProgress.homepage.resourcesPaid, undefined);
  assert.equal(state.resources.codeLines, 128);
  assert.equal(state.resources.docs, 13);
  assert.equal(state.completedProjects.includes("homepage"), false);

  settleTime(state, state.lastTick + 300_000, { randomEvents: false });
  const progress = getProjectProgress(state, "homepage");
  assert.ok(progress.workedSeconds > 0);
  assert.ok(progress.progressPercent < 100);
  assert.ok(state.resources.codeLines < 128);
  assert.ok(progress.spentResources.codeLines > 0);
});

test("project activity level requirements are capped and training difficulty follows skill tier", () => {
  const flashSale = content.projects.find((item) => item.id === "flash-sale");
  const legacyRescue = content.projects.find((item) => item.id === "legacy-rescue");
  const webQuality = content.projects.find((item) => item.id === "web-quality-overhaul");
  const vanilla = content.projects.find((item) => item.id === "vanilla-widget");
  const docker = content.projects.find((item) => item.id === "container-demo");
  const llmAgent = content.projects.find((item) => item.id === "llm-prompt-bench");

  assert.equal(flashSale.requirements.activityLevels.architecture, 5);
  assert.equal(flashSale.requirements.activityLevels.refactoring, 5);
  assert.equal(legacyRescue.requirements.activityLevels.refactoring, 4);
  assert.equal(legacyRescue.requirements.activityLevels["bug-hunting"], 4);
  assert.equal(webQuality.requirements.activityLevels.testing, 4);
  assert.equal(vanilla.difficulty, 1);
  assert.equal(docker.difficulty, 2);
  assert.equal(llmAgent.difficulty, 3);
});

test("项目委托板同日稳定、次日刷新并保留主线和进行中项目", () => {
  const boardText = (message) => message.slice(message.indexOf("项目委托板"));
  const now = 1_700_000_000_000;
  const state = createNewState(now);
  const first = boardText(processCommand(state, "projects", { now, randomEvents: false }).messages.join("\n"));
  const second = boardText(processCommand(state, "projects", { now, randomEvents: false }).messages.join("\n"));

  assert.equal(first, second);
  assert.match(first, /homepage - 个人主页 \[里程碑\]/);
  assert.match(first, /\[委托\]/);

  const commission = getManagementOptions(state, "projects").find((item) => item.kind === "commission");
  state.projectProgress[commission.id] = { stageIndex: 0, stageWorkedSeconds: 1, workedSeconds: 1, spentResources: {} };
  state.worldTimeMinutes += 24 * 60;
  const next = boardText(processCommand(state, "projects", { now, randomEvents: false }).messages.join("\n"));

  assert.notEqual(first, next);
  assert.match(next, new RegExp(`${commission.id} - `));
  assert.match(next, /homepage - 个人主页 \[里程碑\]/);
});

test("项目达标后会自动成功并发放奖励", () => {
  const start = 1_700_000_000_000;
  const state = createNewState(start);
  state.resources.codeLines = 128;
  state.resources.docs = 13;
  state.resources.money = 100;
  state.resources.knowledge = 30;
  state.activityLevels["feature-coding"] = 2;
  unlockSkill(state, "html-css");
  submitProject(state, "homepage");

  const result = settleActiveProjectToCompletion(state, () => 0);
  const eventLog = formatGameEvents(result.events).join("\n");

  assert.match(result.messages.join("\n"), /交付成功/);
  assert.match(result.messages.join("\n"), /客户反馈：|交付成果：/);
  assert.match(eventLog, /\[项目\] 项目 个人主页 交付成功/);
  assert.match(eventLog, /客户反馈：|交付成果：/);
  assert.equal(state.completedProjects.includes("homepage"), true);
  assert.equal(state.activeProjectId, null);
  assert.equal(state.projectProgress.homepage, undefined);
  assert.equal(Object.hasOwn(state.resources, "exp"), false);
  assert.ok(state.resources.reputation > 0);
});

test("重复项目只给技能经验和少量金钱", () => {
  const start = 1_700_000_000_000;
  const state = createNewState(start);
  state.resources.codeLines = 256;
  state.resources.docs = 26;
  state.activityLevels["feature-coding"] = 2;
  unlockSkill(state, "html-css");

  submitProject(state, "homepage");
  settleActiveProjectToCompletion(state, () => 0);
  const first = {
    money: state.resources.money,
    reputation: state.resources.reputation,
    totalProjects: state.stats.totalProjects,
    skillExp: getSkillProgress(state, "html-css").exp
  };

  state.resources.codeLines += 128;
  state.resources.docs += 13;
  submitProject(state, "homepage");
  const result = settleActiveProjectToCompletion(state, () => 0);

  assert.match(result.messages.join("\n"), /重复交付/);
  assert.equal(state.completedProjects.filter((id) => id === "homepage").length, 1);
  assert.equal(state.stats.totalProjects, first.totalProjects);
  assert.equal(state.resources.reputation, first.reputation);
  assert.equal(Object.hasOwn(state.resources, "exp"), false);
  assert.equal(Math.floor(state.resources.money - first.money), 3);
  assert.ok(getSkillProgress(state, "html-css").exp > first.skillExp);
});

test("新增训练项目可重复提供目标技能经验", () => {
  const start = 1_700_000_000_000;
  const state = createNewState(start);
  state.resources.codeLines = 400;
  state.resources.docs = 30;
  state.resources.tests = 30;
  unlockSkill(state, "javascript");

  assert.match(submitProject(state, "vanilla-widget"), /开始项目：原生 JS 小组件/);
  settleActiveProjectToCompletion(state, () => 0);
  const firstExp = getSkillProgress(state, "javascript").exp;

  state.resources.codeLines += 192;
  state.resources.docs += 13;
  state.resources.tests += 13;
  assert.match(submitProject(state, "vanilla-widget"), /重复项目：原生 JS 小组件/);
  settleActiveProjectToCompletion(state, () => 0);
  const repeatExp = getSkillProgress(state, "javascript").exp;

  assert.ok(firstExp >= 70);
  assert.ok(repeatExp > firstExp);
  assert.ok(repeatExp < firstExp + 70);
});

test("项目阶段失败会回退当前阶段且不返还已消耗素材", () => {
  const start = 1_700_000_000_000;
  const state = createNewState(start);
  state.resources.codeLines = 128;
  state.resources.docs = 13;
  state.resources.money = 100;
  state.resources.knowledge = 30;
  state.resources.bugs = 100;
  state.resources.techDebt = 180;
  state.resources.pressure = 100;
  state.activityLevels["feature-coding"] = 2;
  unlockSkill(state, "html-css");
  submitProject(state, "homepage");
  state.projectProgress.homepage.stageWorkedSeconds = getProjectProgress(state, "homepage").stageRequiredSeconds;
  state.projectProgress.homepage.workedSeconds = getProjectProgress(state, "homepage").stageRequiredSeconds;
  const before = { codeLines: state.resources.codeLines, docs: state.resources.docs };

  const result = settleTime(state, state.lastTick + 1000, { maxSeconds: 1, randomEvents: false, rng: () => 1 });
  const eventLog = formatGameEvents(result.events).join("\n");

  assert.match(result.messages.join("\n"), /阶段验收失败|阶段失败/);
  assert.match(result.messages.join("\n"), /客户反馈：|复盘记录：/);
  assert.match(eventLog, /\[项目\] 项目 个人主页 阶段失败/);
  assert.match(eventLog, /客户反馈：|复盘记录：/);
  assert.equal(state.completedProjects.includes("homepage"), false);
  assert.equal(state.activeProjectId, "homepage");
  assert.ok(state.projectProgress.homepage);
  assert.ok(state.projectProgress.homepage.stageWorkedSeconds > 0);
  assert.ok(state.resources.codeLines <= before.codeLines);
  assert.ok(state.resources.docs <= before.docs);
});

test("属性成长事件跨阈值只触发一次并支持人物卡成长节点", () => {
  const state = createNewState(1_700_000_000_000, { characterCardId: "indie-hacker" });
  state.attributes.logic = 19;
  state.attributeExp.logic = 0;
  const events = [];

  addAttributeExp(state, "logic", 200, { events });
  addAttributeExp(state, "logic", 200, { events });
  const eventLog = formatGameEvents(events).join("\n");

  assert.match(eventLog, /\[职业\] 成长：逻辑 达到 20/);
  assert.match(eventLog, /\[职业\] 人物成长：野路子独立开发者/);
  assert.equal((eventLog.match(/成长：逻辑 达到 20/g) || []).length, 1);
  assert.equal((eventLog.match(/人物成长：野路子独立开发者/g) || []).length, 1);
});

test("Deadline 首次逾期只返回一次警告事件", () => {
  const now = 1_700_000_000_000;
  const state = createNewState(now);
  state.worldTimeMinutes = 10 * 60;
  state.projectProgress.homepage = { stageIndex: 0, stageWorkedSeconds: 1, workedSeconds: 1, dueWorldMinute: state.worldTimeMinutes - 1, spentResources: {} };

  const first = settleTime(state, now + 1000, { randomEvents: true, rng: () => 1 });
  const second = settleTime(state, state.lastTick + 1000, { randomEvents: true, rng: () => 1 });

  assert.match(formatGameEvents(first.events).join("\n"), /\[警告\] Deadline 逾期：个人主页/);
  assert.doesNotMatch(formatGameEvents(second.events).join("\n"), /Deadline 逾期/);
});

test("Bug 风险跨过 25/50/75 阈值分别只触发一次 warning 事件", () => {
  const now = 1_700_000_000_000;
  const state = createNewState(now);
  startActivity(state, "feature-coding");

  state.resources.bugs = 24;
  const first = settleTime(state, now + 60_000, { randomEvents: false });
  state.resources.bugs = 49;
  const second = settleTime(state, state.lastTick + 60_000, { randomEvents: false });
  state.resources.bugs = 74;
  const third = settleTime(state, state.lastTick + 60_000, { randomEvents: false });
  const repeat = settleTime(state, state.lastTick + 60_000, { randomEvents: false });

  assert.match(formatGameEvents(first.events).join("\n"), /Bug 风险升至 25\+/);
  assert.match(formatGameEvents(second.events).join("\n"), /Bug 风险升至 50\+/);
  assert.match(formatGameEvents(third.events).join("\n"), /Bug 风险升至 75\+/);
  assert.doesNotMatch(formatGameEvents(repeat.events).join("\n"), /Bug 风险升至/);
});

test("项目会占用当前活动位，普通活动会暂停项目", () => {
  const state = createNewState();
  state.resources.codeLines = 128;
  state.resources.docs = 13;
  state.resources.money = 100;
  state.resources.knowledge = 30;
  state.activityLevels["feature-coding"] = 2;
  unlockSkill(state, "html-css");
  submitProject(state, "homepage");

  const message = startActivity(state, "study");

  assert.match(message, /开始活动：系统学习/);
  assert.equal(state.activeProjectId, null);
  assert.equal(state.activeActivityId, "study");
  assert.ok(state.projectProgress.homepage);
  assert.ok(Number.isFinite(state.projectProgress.homepage.dueWorldMinute));
});

test("stop 可以暂停当前项目并保留进度", () => {
  const state = createNewState();
  state.resources.codeLines = 128;
  state.resources.docs = 13;
  state.resources.money = 100;
  state.resources.knowledge = 30;
  state.activityLevels["feature-coding"] = 2;
  unlockSkill(state, "html-css");
  submitProject(state, "homepage");

  const message = stopActivity(state);

  assert.match(message, /暂停项目：个人主页/);
  assert.equal(state.activeProjectId, null);
  assert.ok(state.projectProgress.homepage);
  assert.ok(Number.isFinite(state.projectProgress.homepage.dueWorldMinute));
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
  state.resources.reputation = 2;
  state.unlockedSkills = ["html-css", "javascript"];
  state.completedProjects = ["homepage"];

  assert.match(promote(state), /写功能 Lv\.3/);

  state.activityLevels["feature-coding"] = 3;
  state.activityLevels.study = 2;
  state.resources.energy = 40;

  const message = promote(state);
  assert.match(message, /晋升成功/);
  assert.match(message, /职业转折：从 实习程序员 到 初级程序员/);
  assert.doesNotMatch(message, /职位上限/);
  assert.equal(state.currentRole, "junior");
  assert.equal(state.resources.energy, 40);
  assert.equal(getGameViewModel(state).role.maxEnergy, ENERGY_MAX);
});

test("goals 基于活动进度推进并可领取", () => {
  const state = createNewState();
  state.activityStats.totalActiveSeconds = 30;

  const goals = formatGoals(state);
  const message = claimGoal(state, "choose-work");

  assert.match(goals, /choose-work - 选择第一项活动/);
  assert.match(message, /领取目标：选择第一项活动/);
  assert.deepEqual(state.claimedGoals, ["choose-work"]);
  assert.equal(Object.hasOwn(state.resources, "exp"), false);
  assert.ok(state.attributeExp.focus > 0);
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

test("长时间活动结算按 60 秒分段并体现精力衰减", () => {
  const start = 1_700_000_000_000;
  const once = createNewState(start);
  const stepped = createNewState(start);
  startActivity(once, "feature-coding");
  startActivity(stepped, "feature-coding");

  settleTime(once, start + 3_600_000, { randomEvents: false });
  for (let index = 1; index <= 60; index += 1) {
    settleTime(stepped, start + index * 60_000, { randomEvents: false });
  }

  assert.equal(Math.floor(once.resources.codeLines), Math.floor(stepped.resources.codeLines));
  assert.equal(Math.floor(once.resources.energy), Math.floor(stepped.resources.energy));
  assert.ok(once.resources.energy <= 1);
});

test("低精力会渐进降低非休息活动产出", () => {
  const start = 1_700_000_000_000;
  const full = createNewState(start);
  const tired = createNewState(start);
  tired.resources.energy = 10;
  startActivity(full, "feature-coding");
  startActivity(tired, "feature-coding");

  settleTime(full, start + 60_000, { randomEvents: false });
  settleTime(tired, start + 60_000, { randomEvents: false });

  assert.ok(tired.resources.codeLines < full.resources.codeLines);
  assert.ok(tired.resources.pressure >= full.resources.pressure);
});

test("沟通属性会缓解压力对项目成功率的影响", () => {
  const lowCommunication = createNewState();
  const highCommunication = createNewState();
  lowCommunication.resources.pressure = 100;
  highCommunication.resources.pressure = 100;
  highCommunication.attributes.communication = 100;

  assert.ok(getProjectSuccessRate(highCommunication, "todo") > getProjectSuccessRate(lowCommunication, "todo"));
});

test("提示词工程使用创造属性并偏向知识文档线索", () => {
  const start = 1_700_000_000_000;
  const lowCreativity = createNewState(start);
  const highCreativity = createNewState(start);
  lowCreativity.attributes.creativity = 1;
  highCreativity.attributes.creativity = 100;
  for (const state of [lowCreativity, highCreativity]) {
    state.activityLevels.study = 3;
    state.activityLevels.documentation = 2;
    startActivity(state, "prompt-engineering");
    settleTime(state, start + 60_000, { randomEvents: false });
  }

  const activity = content.activities.find((item) => item.id === "prompt-engineering");
  assert.equal(activity.primaryAttribute, "creativity");
  assert.ok(activity.outputsPerHour.docs > activity.outputsPerHour.codeLines);
  assert.ok(highCreativity.resources.docs > lowCreativity.resources.docs);
  assert.ok(highCreativity.resources.knowledge > lowCreativity.resources.knowledge);
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

test("view model exposes active activity attribute experience sources", () => {
  const state = createNewState();
  startActivity(state, "feature-coding");

  const view = getGameViewModel(state);

  assert.equal(view.activeActivity.id, "feature-coding");
  assert.deepEqual(view.activeActivity.attributeExpIds, ["focus", "logic"]);
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
  assert.equal(active.progressLabel, "等级进度");
  assert.equal(active.progressPercent, 0);
  assert.equal(active.progressActive, true);
  assert.match(active.progressText, /0\/200/);
  assert.equal(options.find((item) => item.id === "study").progressActive, false);
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
  assert.match(goal.rewards, /属性经验/);
});

test("management options 标出技能、工具和项目动作状态", () => {
  const state = createNewState();
  state.resources.knowledge = 40;
  state.resources.money = 100;

  const skill = getManagementOptions(state, "skills").find((item) => item.id === "html-css");
  const tool = getManagementOptions(state, "tools").find((item) => item.id === "used-laptop");
  const project = getManagementOptions(state, "projects").find((item) => item.id === "homepage");
  const promoteAction = getManagementOptions(state, "projects")[0];

  assert.equal(skill.status, "可学习");
  assert.equal(skill.command, "learn html-css");
  assert.match(skill.effects, /代码产出 x1\.01/);
  assert.equal(tool.status, "可购买");
  assert.equal(tool.command, "buy used-laptop");
  assert.match(tool.effects, /代码产出 x1\.06/);
  assert.equal(project.status, "条件不足");
  assert.equal(project.command, "project homepage");
  assert.match(project.description, /个人品牌/);
  assert.match(project.rewards, /技能经验：HTML\/CSS \+80/);
  assert.equal(project.cost, "总素材 代码 112，文档 12");
  assert.equal(project.kindLabel, "里程碑");
  assert.equal(project.difficultyLabel, "★☆☆☆☆（难度 1）");
  assert.doesNotMatch(project.effects, /难度 1/);
  assert.match(project.effects, /成功率/);
  assert.equal(promoteAction.command, "promote");
});

test("skill options use explicit progress semantics", () => {
  const learningState = createNewState();
  learningState.resources.knowledge = 60;
  learningState.resources.money = 100;

  const unstarted = getManagementOptions(learningState, "skills").find((item) => item.id === "html-css");
  assert.equal(unstarted.progressPercent, undefined);

  learnSkill(learningState, "html-css");
  const learning = getManagementOptions(learningState, "skills").find((item) => item.id === "html-css");
  assert.equal(learning.progressLabel, "学习进度");
  assert.equal(learning.progressPercent, 0);
  assert.equal(learning.progressActive, true);
  assert.match(formatState(learningState), /当前学习：HTML\/CSS 学习 0%/);

  const learnedState = createNewState();
  unlockSkill(learnedState, "html-css", 1, 60);
  const learned = getManagementOptions(learnedState, "skills").find((item) => item.id === "html-css");
  assert.equal(learned.progressLabel, "升级经验");
  assert.equal(learned.progressPercent, 50);
  assert.equal(learned.progressActive, false);

  const maxedState = createNewState();
  unlockSkill(maxedState, "html-css", 5, 0);
  const maxed = getManagementOptions(maxedState, "skills").find((item) => item.id === "html-css");
  assert.equal(maxed.progressPercent, undefined);
});

test("project options mark work progress and animate only the active project", () => {
  const state = createNewState();
  state.resources.codeLines = 128;
  state.resources.docs = 13;
  state.resources.money = 100;
  state.resources.knowledge = 30;
  state.activityLevels["feature-coding"] = 2;
  unlockSkill(state, "html-css");

  submitProject(state, "homepage");
  let project = getManagementOptions(state, "projects").find((item) => item.id === "homepage");
  assert.equal(project.progressLabel, "阶段进度");
  assert.equal(project.progressActive, true);
  assert.equal(project.stageName, "需求校准");

  assert.match(formatState(state), /当前项目：个人主页 阶段 1\/3 需求校准 0%/);

  stopActivity(state);
  project = getManagementOptions(state, "projects").find((item) => item.id === "homepage");
  assert.equal(project.status, "已暂停");
  assert.equal(project.progressActive, false);
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
