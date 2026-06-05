const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  createNewState,
  createProfile,
  getCharacterCardOptions,
  getGameViewModel,
  getProfileOptions,
  loadProfile,
  processCommand,
  settleTime
} = require("../src/game");
const {
  MAX_LOGS,
  TUI_CLOCK_TICK_MS,
  TUI_LOG_FLUSH_MS,
  appendLogEntries,
  calculateLayoutBudget,
  createLogEntries,
  formatOptionDetail,
  formatTuiHeartbeat,
  getCharacterCardAttributeRows,
  getOptionProgress,
  getPageWindow,
  getProfilePageOptions,
  getLogRows,
  handleProfileEnterKeypress,
  handleProfileDeleteKeypress,
  normalizeLogMessages,
  pauseGameClock,
  profileDeleteUnavailableMessage,
  processTuiCommand,
  resumeGameClock,
  resolveProfileDeleteKeypress,
  shouldFlushTuiLogs,
  shouldExitProfileCreationMode,
  syncPausedClock
} = require("../src/tui");

function createTempSaveRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "life-of-code-tui-save-"));
}

test("normalizeLogMessages keeps non-empty log lines in order", () => {
  assert.deepEqual(normalizeLogMessages(["first\nsecond", "", null, "third"]), ["first", "second", "third"]);
});

test("createLogEntries assigns stable incrementing ids", () => {
  const created = createLogEntries(["first\nsecond", "third"], 7);

  assert.deepEqual(created.entries, [
    { id: 7, text: "first" },
    { id: 8, text: "second" },
    { id: 9, text: "third" }
  ]);
  assert.equal(created.nextId, 10);
});

test("appendLogEntries appends to the bottom and trims oldest logs", () => {
  const current = [
    { id: 1, text: "oldest" },
    { id: 2, text: "middle" }
  ];
  const next = [
    { id: 3, text: "newer" },
    { id: 4, text: "latest" }
  ];

  assert.deepEqual(appendLogEntries(current, next, 3), [
    { id: 2, text: "middle" },
    { id: 3, text: "newer" },
    { id: 4, text: "latest" }
  ]);
});

test("getLogRows returns fixed-height rows with logs pinned to the bottom", () => {
  const rows = getLogRows([
    { id: 1, text: "older" },
    { id: 2, text: "latest" }
  ], 4);

  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map((row) => row.text), ["", "", "older", "latest"]);
  assert.deepEqual(rows.map((row) => row.id), ["empty-0", "empty-1", 1, 2]);
});

test("getLogRows renders an empty fixed-height log panel", () => {
  const rows = getLogRows([], MAX_LOGS);

  assert.equal(rows.length, MAX_LOGS);
  assert.equal(rows.at(-1).text, "暂无日志。");
  assert.equal(rows.slice(0, -1).every((row) => row.empty && row.text === ""), true);
});

test("calculateLayoutBudget returns a compact 24 row budget with a usable list", () => {
  const budget = calculateLayoutBudget(24, 80);

  assert.equal(budget.terminalRows, 24);
  assert.equal(budget.narrow, true);
  assert.equal(budget.logHeight, 8);
  assert.equal(budget.mainHeight, 5);
  assert.ok(budget.pageSize >= 3);
  assert.ok(
    budget.headerHeight + budget.resourceHeight + budget.tabHeight + budget.footerHeight + budget.logHeight + budget.mainHeight > 24
  );
});

test("calculateLayoutBudget falls back to 24 rows and expands taller terminals", () => {
  const fallback = calculateLayoutBudget(undefined, undefined);
  const tall = calculateLayoutBudget(30, 120);

  assert.equal(fallback.terminalRows, 24);
  assert.equal(fallback.terminalColumns, 80);
  assert.equal(fallback.logHeight, 8);
  assert.equal(tall.logHeight, 10);
  assert.ok(tall.mainHeight > fallback.mainHeight);
  assert.equal(tall.narrow, false);
  assert.ok(tall.pageSize >= fallback.pageSize);
});

test("TUI refreshes logs quickly", () => {
  assert.equal(TUI_CLOCK_TICK_MS, 250);
  assert.equal(TUI_LOG_FLUSH_MS, 5000);
});

test("TUI log flush cadence is every five seconds", () => {
  assert.equal(shouldFlushTuiLogs(4_999, 0), false);
  assert.equal(shouldFlushTuiLogs(5_000, 0), true);
  assert.equal(shouldFlushTuiLogs(7_500, 2_500), true);
});

test("formatTuiHeartbeat returns a lightweight status log", () => {
  const state = createNewState(1_700_000_000_000);
  state.worldTimeMinutes = 10 * 60;

  const message = formatTuiHeartbeat(state);

  assert.match(message, /状态刷新/);
  assert.match(message, /精力/);
  assert.match(message, /压力/);
});

test("getPageWindow follows the selected absolute index", () => {
  assert.deepEqual(getPageWindow(0, 0, 5), { start: 0, end: 0, page: 0, pageCount: 0, pageSize: 5 });
  assert.deepEqual(getPageWindow(10, 0, 4), { start: 0, end: 4, page: 0, pageCount: 3, pageSize: 4 });
  assert.deepEqual(getPageWindow(10, 4, 4), { start: 4, end: 8, page: 1, pageCount: 3, pageSize: 4 });
  assert.deepEqual(getPageWindow(10, 99, 4), { start: 8, end: 10, page: 2, pageCount: 3, pageSize: 4 });
});

test("getPageWindow enforces a minimum page size", () => {
  assert.deepEqual(getPageWindow(5, 3, 1), { start: 3, end: 5, page: 1, pageCount: 2, pageSize: 3 });
});

test("formatOptionDetail summarizes common option fields", () => {
  const details = formatOptionDetail({
    name: "React",
    description: "组件化界面。",
    status: "可学习",
    level: 1,
    levelName: "入门",
    exp: 20,
    nextExp: 120,
    requirements: "学习 Lv.2",
    output: "知识 +1",
    cost: "知识 100",
    effects: "代码产出 +2%",
    missing: "金钱 20",
    progress: "20/120",
    command: "learn react"
  });

  assert.deepEqual(details, [
    { label: "描述", value: "组件化界面。" },
    { label: "等级", value: "入门 20/120" },
    { label: "需求", value: "学习 Lv.2" },
    { label: "进度", value: "20/120" },
    { label: "输出", value: "知识 +1" },
    { label: "花费", value: "知识 100" },
    { label: "作用", value: "代码产出 +2%" },
    { label: "缺口", value: "金钱 20" },
    { label: "命令", value: "learn react" }
  ]);
});

test("getOptionProgress freezes animated progress while paused", () => {
  const option = {
    progressLabel: "学习进度",
    progressPercent: 42,
    progressActive: true,
    progressText: "4 分钟/10 分钟"
  };

  assert.deepEqual(getOptionProgress(option), {
    label: "学习进度",
    percent: 42,
    active: true,
    text: "4 分钟/10 分钟"
  });
  assert.deepEqual(getOptionProgress(option, { paused: true }), {
    label: "学习进度",
    percent: 42,
    active: false,
    text: "4 分钟/10 分钟"
  });
  assert.equal(getOptionProgress({ name: "无进度" }), null);
});

test("pause and resume drops real time spent paused", () => {
  const start = 1_700_000_000_000;
  const state = createNewState(start);
  processCommand(state, "plan morning activity feature-coding");
  processCommand(state, "plan afternoon activity study");
  processCommand(state, "plan evening none");
  processCommand(state, "plan confirm");
  const initialWorldTime = state.worldTimeMinutes;

  const pauseAt = start + 60_000;
  const paused = pauseGameClock(state, pauseAt, { randomEvents: false });
  assert.equal(paused.seconds, 60);
  assert.equal(state.worldTimeMinutes, initialWorldTime + 60);

  const resumeAt = pauseAt + 10 * 60_000;
  resumeGameClock(state, resumeAt);
  const resumed = settleTime(state, resumeAt + 1000, { randomEvents: false });

  assert.equal(resumed.seconds, 1);
  assert.equal(state.worldTimeMinutes, initialWorldTime + 61);
});

test("pausing first settles time up to the pause keypress", () => {
  const start = 1_700_000_000_000;
  const state = createNewState(start);
  processCommand(state, "plan morning activity feature-coding");
  processCommand(state, "plan afternoon activity study");
  processCommand(state, "plan evening none");
  processCommand(state, "plan confirm");
  const initialWorldTime = state.worldTimeMinutes;
  const codeBefore = state.resources.codeLines;

  const result = pauseGameClock(state, start + 2_000, { randomEvents: false });

  assert.equal(result.seconds, 2);
  assert.equal(state.lastTick, start + 2_000);
  assert.equal(state.worldTimeMinutes, initialWorldTime + 2);
  assert.ok(state.resources.codeLines > codeBefore);
});

test("paused TUI commands sync lastTick before processCommand can settle time", () => {
  const start = 1_700_000_000_000;
  const state = createNewState(start);
  processCommand(state, "plan morning activity feature-coding");
  processCommand(state, "plan afternoon activity study");
  processCommand(state, "plan evening none");
  processCommand(state, "plan confirm");
  pauseGameClock(state, start + 1000, { randomEvents: false });
  const pausedWorldTime = state.worldTimeMinutes;
  const pausedCode = state.resources.codeLines;
  const commandAt = start + 10 * 60_000;

  const status = processTuiCommand(state, "status", { paused: true, now: commandAt, randomEvents: false });

  assert.match(status.messages.join("\n"), /当前/);
  assert.equal(state.lastTick, commandAt);
  assert.equal(state.worldTimeMinutes, pausedWorldTime);
  assert.equal(state.resources.codeLines, pausedCode);

  resumeGameClock(state, commandAt);
  const resumed = settleTime(state, commandAt + 1000, { randomEvents: false });
  assert.equal(resumed.seconds, 1);
  assert.equal(state.worldTimeMinutes, pausedWorldTime + 1);
});

test("TUI command processing can set tomorrow lifestyle", () => {
  const state = createNewState(1_700_000_000_000);

  const result = processTuiCommand(state, "lifestyle side_hustle", { randomEvents: false });

  assert.match(result.messages.join("\n"), /明日作息已设为：Indie Side-Hustle/);
  assert.match(result.messages.join("\n"), /作息效果/);
  assert.match(result.messages.join("\n"), /金钱和声望/);
  assert.equal(state.lifestyleStanceId, "health");
  assert.equal(state.pendingLifestyleStanceId, "side_hustle");
});

test("syncPausedClock lets paused saves discard paused real time", () => {
  const start = 1_700_000_000_000;
  const state = createNewState(start);
  processCommand(state, "plan morning activity feature-coding");
  processCommand(state, "plan afternoon activity study");
  processCommand(state, "plan evening none");
  processCommand(state, "plan confirm");
  pauseGameClock(state, start + 1000, { randomEvents: false });

  const synced = syncPausedClock(state, start + 600_000);

  assert.equal(synced, start + 600_000);
  assert.equal(state.lastTick, start + 600_000);
  const resumed = settleTime(state, start + 601_000, { randomEvents: false });
  assert.equal(resumed.seconds, 1);
});

test("getCharacterCardAttributeRows pairs initial card attributes with current growth", () => {
  const state = createNewState(1_700_000_000_000, { characterCardId: "academy-prodigy" });
  state.attributes.learning = 84;
  state.attributeBreakthroughs.learning = 3;
  state.attributeExp.learning = 57.8;
  const view = getGameViewModel(state);

  const rows = getCharacterCardAttributeRows(view);
  const learning = rows.find((row) => row.id === "learning");

  assert.equal(learning.name, "学习");
  assert.equal(learning.label, "学习 84");
  assert.equal(learning.initialValue, 72);
  assert.equal(learning.currentValue, 84);
  assert.equal(learning.effectiveValue, 84.6);
  assert.equal(learning.growthValue, 12.6);
  assert.equal(learning.exp, 57);
  assert.equal(learning.upgradeRequired, 470);
  assert.equal(learning.upgradePercent, 12);
  assert.equal(learning.progressPercent, 84);
  assert.equal(learning.initialPercent, 72);
  assert.equal(learning.growthPercent, 12);
  assert.equal(learning.growthText, "+12.6");
  assert.equal(learning.expText, "57/470");
  assert.deepEqual(learning.expMeter, { id: "exp", label: "经验", percent: 12, color: "exp" });
  assert.equal(learning.meters, undefined);
  assert.equal(learning.progressText, "成长+加成 +12.6");
  assert.doesNotMatch(learning.progressText, /初始 72/);
  assert.doesNotMatch(learning.progressText, /当前 84/);
  assert.doesNotMatch(learning.progressText, /有效 84.6/);
  assert.doesNotMatch(learning.progressText, /经验 57/);
});

test("getCharacterCardAttributeRows clamps progress to current base attribute", () => {
  const view = getGameViewModel(createNewState(1_700_000_000_000, { characterCardId: "laid-back-slacker" }));

  const rows = getCharacterCardAttributeRows(view);

  assert.equal(rows.find((row) => row.id === "focus").currentValue, 2);
  assert.equal(rows.find((row) => row.id === "focus").progressPercent, 2);
  assert.equal(rows.find((row) => row.id === "resilience").currentValue, 72);
  assert.equal(rows.find((row) => row.id === "resilience").progressPercent, 72);
});

test("getCharacterCardAttributeRows keeps current attributes for legacy profiles", () => {
  const state = createNewState();
  state.attributes.logic = 43;
  state.attributeExp.logic = 12;
  const view = getGameViewModel(state);

  const rows = getCharacterCardAttributeRows(view);
  const logic = rows.find((row) => row.id === "logic");

  assert.equal(view.characterCard.legacy, true);
  assert.equal(logic.label, "逻辑 43");
  assert.equal(logic.initialValue, "未记录");
  assert.equal(logic.currentValue, 43);
  assert.equal(logic.growthValue, 43);
  assert.equal(logic.upgradeRequired, 265);
  assert.equal(logic.upgradePercent, 4);
  assert.equal(logic.progressPercent, 43);
  assert.equal(logic.initialPercent, 0);
  assert.equal(logic.growthPercent, 43);
  assert.equal(logic.growthText, "+43");
  assert.equal(logic.expText, "12/265");
  assert.deepEqual(logic.expMeter, { id: "exp", label: "经验", percent: 4, color: "exp" });
  assert.equal(logic.meters, undefined);
  assert.equal(logic.progressText, "成长+加成 +43");
  assert.doesNotMatch(logic.progressText, /初始 未记录/);
  assert.doesNotMatch(logic.progressText, /当前 43/);
  assert.doesNotMatch(logic.progressText, /经验 12/);
});

test("profile enter on new profile enters character card selection mode", () => {
  const saveRoot = createTempSaveRoot();
  createProfile("default", "默认档案", 1_700_000_000_000, { saveRoot, characterCardId: "academy-prodigy" });
  const state = loadProfile("default", 1_700_000_001_000, { saveRoot });
  const option = getProfileOptions(state, { saveRoot, now: 1_700_000_002_000 }).find((item) => item.id === "profile-new");

  const result = handleProfileEnterKeypress(state, option, { saveRoot, now: 1_700_000_003_000 });

  assert.equal(result.creatingProfile, true);
  assert.equal(result.profileCreationStartedAt, 1_700_000_003_000);
  assert.equal(result.changed, false);
  assert.match(result.messages.join("\n"), /请选择人物卡/);
  assert.equal(state.profileId, "default");
});

test("profile creation mode options are stable character card commands", () => {
  const saveRoot = createTempSaveRoot();
  createProfile("default", "默认档案", 1_700_000_000_000, { saveRoot, characterCardId: "academy-prodigy" });
  const state = loadProfile("default", 1_700_000_001_000, { saveRoot });

  const options = getProfilePageOptions(state, {
    saveRoot,
    creatingProfile: true,
    profileCreationStartedAt: 1_700_000_000_000,
    now: 1_700_000_999_000
  });

  assert.deepEqual(options.map((item) => item.id), getCharacterCardOptions({ now: 1_700_000_000_000 }).map((item) => item.id));
  assert.equal(
    options.find((item) => item.id === "indie-hacker").command,
    "profile new profile-20231114221320-indie-hacker --card indie-hacker 野路子独立开发者"
  );
});

test("profile creation mode enter creates and switches to selected character card profile", () => {
  const saveRoot = createTempSaveRoot();
  createProfile("default", "默认档案", 1_700_000_000_000, { saveRoot, characterCardId: "academy-prodigy" });
  const state = loadProfile("default", 1_700_000_001_000, { saveRoot });
  const option = getProfilePageOptions(state, {
    saveRoot,
    creatingProfile: true,
    profileCreationStartedAt: 1_700_000_010_000
  }).find((item) => item.id === "indie-hacker");

  const result = handleProfileEnterKeypress(state, option, {
    saveRoot,
    creatingProfile: true,
    profileCreationStartedAt: 1_700_000_010_000,
    now: 1_700_000_020_000
  });

  assert.equal(result.creatingProfile, false);
  assert.equal(result.changed, true);
  assert.equal(state.profileId, "profile-20231114221330-indie-hacker");
  assert.equal(state.profileName, "野路子独立开发者");
  assert.equal(state.characterCardId, "indie-hacker");
  assert.match(result.messages.join("\n"), /已创建并切换到档案/);
});

test("resolveProfileDeleteKeypress confirms deletable profile on the second D", () => {
  const option = {
    id: "work",
    deleteCommand: "profile delete work confirm"
  };

  const first = resolveProfileDeleteKeypress(option, null);
  assert.equal(first.pendingProfileId, "work");
  assert.equal(first.command, null);
  assert.match(first.message, /再次按 D 删除档案：work/);

  const second = resolveProfileDeleteKeypress(option, first.pendingProfileId);
  assert.equal(second.pendingProfileId, null);
  assert.equal(second.command, "profile delete work confirm");
  assert.equal(second.message, null);
});

test("resolveProfileDeleteKeypress ignores non-deletable profile options", () => {
  const action = resolveProfileDeleteKeypress({ id: "default", deleteCommand: null }, "work");

  assert.deepEqual(action, { pendingProfileId: null, command: null, message: null });
});

test("handleProfileDeleteKeypress deletes the selected profile after confirmation", () => {
  const saveRoot = createTempSaveRoot();
  createProfile("default", "默认档案", 1_700_000_000_000, { saveRoot, characterCardId: "academy-prodigy" });
  createProfile("work", "工作档案", 1_700_000_001_000, { saveRoot, characterCardId: "determined-switcher" });
  const state = loadProfile("default", 1_700_000_002_000, { saveRoot });
  const option = getProfileOptions(state, { saveRoot, now: 1_700_000_003_000 }).find((item) => item.id === "work");
  const savePath = path.join(saveRoot, "profiles", "work.json");

  const first = handleProfileDeleteKeypress(state, option, null, { saveRoot, now: 1_700_000_004_000 });
  assert.equal(first.pendingProfileId, "work");
  assert.equal(first.changed, false);
  assert.equal(fs.existsSync(savePath), true);

  const second = handleProfileDeleteKeypress(state, option, first.pendingProfileId, { saveRoot, now: 1_700_000_005_000 });
  assert.equal(second.pendingProfileId, null);
  assert.equal(second.changed, true);
  assert.match(second.messages.join("\n"), /已删除档案：work/);
  assert.equal(fs.existsSync(savePath), false);
});

test("profile delete keypress is blocked while choosing a character card", () => {
  const saveRoot = createTempSaveRoot();
  createProfile("default", "默认档案", 1_700_000_000_000, { saveRoot, characterCardId: "academy-prodigy" });
  createProfile("work", "工作档案", 1_700_000_001_000, { saveRoot, characterCardId: "determined-switcher" });
  const state = loadProfile("default", 1_700_000_002_000, { saveRoot });
  const option = getProfileOptions(state, { saveRoot, now: 1_700_000_003_000 }).find((item) => item.id === "work");
  const savePath = path.join(saveRoot, "profiles", "work.json");

  const result = handleProfileDeleteKeypress(state, option, "work", { saveRoot, creatingProfile: true, now: 1_700_000_004_000 });

  assert.equal(result.pendingProfileId, null);
  assert.equal(result.changed, false);
  assert.match(result.messages.join("\n"), /正在选择人物卡/);
  assert.equal(fs.existsSync(savePath), true);
});

test("profile creation mode exits on escape, tab, and panel shortcuts", () => {
  assert.equal(shouldExitProfileCreationMode("", { escape: true }), true);
  assert.equal(shouldExitProfileCreationMode("", { tab: true }), true);
  assert.equal(shouldExitProfileCreationMode("f", {}), true);
  assert.equal(shouldExitProfileCreationMode("a", {}), true);
  assert.equal(shouldExitProfileCreationMode("d", {}), false);
});

test("profile delete keypress reports why an option cannot be deleted", () => {
  assert.match(profileDeleteUnavailableMessage({ id: "profile-save" }), /请选择具体档案/);
  assert.match(profileDeleteUnavailableMessage({ id: "default" }), /default 档案不能删除/);
  assert.match(profileDeleteUnavailableMessage({ id: "work", current: true }), /不能删除当前/);
});
