const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  createTuiTicker,
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
  TUI_SETTLE_TICK_MS,
  appendLogEntries,
  calculateLayoutBudget,
  commandForDailyPlannerSelection,
  createCommandLogMessages,
  createLogEntries,
  formatOptionDetail,
  formatTopStatusSegmentRows,
  formatTopStatusRows,
  formatTopStatusLine,
  getCharacterCardAttributeRows,
  getCurrentLogRows,
  getDailyPlannerCandidateOptions,
  getNextDailyPlannerPhaseId,
  getTextDisplayWidth,
  getOptionProgress,
  getPageWindow,
  getProfilePageOptions,
  getLogRows,
  handleDailyPlannerEnterKeypress,
  handleProfileEnterKeypress,
  handleProfileDeleteKeypress,
  isDailyPlannerMode,
  normalizeLogMessages,
  pauseGameClock,
  profileDeleteUnavailableMessage,
  processTuiCommand,
  resumeGameClock,
  resolveProfileDeleteKeypress,
  shouldResetDailyPlannerPhase,
  shouldExitProfileCreationMode,
  syncPausedClock
} = require("../src/tui");
const {
  THEME,
  toneForResource
} = require("../src/tuiTheme");

function createTempSaveRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "life-of-code-tui-save-"));
}

test("normalizeLogMessages keeps non-empty log lines in order", () => {
  assert.deepEqual(normalizeLogMessages(["first\nsecond", "", null, "third"]).map((entry) => entry.text), ["first", "second", "third"]);
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

test("MAX_LOGS keeps enough history for the split event panel", () => {
  assert.equal(MAX_LOGS, 80);
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

test("getLogRows hides command echoes from event history", () => {
  const messages = createCommandLogMessages("week project", ["本周重点已设为：项目周。"]);
  const rows = getLogRows(createLogEntries(messages, 0).entries, 8);

  assert.equal(rows.length, 8);
  assert.deepEqual(rows.filter((row) => !row.empty).map((row) => row.text), ["[周重点] 本周重点已设为：项目周。"]);
  assert.equal(rows.some((row) => row.category === "command" || row.text.includes("> week project")), false);
});

test("getLogRows keeps non-command command results in event history", () => {
  const messages = createCommandLogMessages("project homepage", ["项目 个人主页 交付成功。"]);
  const rows = getLogRows(createLogEntries(messages, 0).entries, 8);

  assert.deepEqual(rows.filter((row) => !row.empty).map((row) => row.text), ["[项目] 项目 个人主页 交付成功。"]);
});

test("calculateLayoutBudget returns a compact 24 row budget with a usable list", () => {
  const budget = calculateLayoutBudget(24, 80);

  assert.equal(budget.terminalRows, 24);
  assert.equal(budget.narrow, true);
  assert.equal(budget.topHeight, 3);
  assert.equal(budget.tabHeight, 1);
  assert.equal(budget.logHeight, 9);
  assert.equal(budget.mainHeight, 8);
  assert.equal(budget.listHeight, 5);
  assert.equal(budget.detailHeight, 3);
  assert.equal(budget.logDirection, "column");
  assert.equal(budget.currentLogHeight + budget.eventLogHeight, budget.logHeight);
  assert.ok(budget.pageSize >= 3);
  assert.equal(budget.topHeight + budget.tabHeight + budget.footerHeight + budget.logHeight + budget.mainHeight, 24);
});

test("calculateLayoutBudget falls back to 24 rows and expands taller terminals", () => {
  const fallback = calculateLayoutBudget(undefined, undefined);
  const tall = calculateLayoutBudget(36, 120);

  assert.equal(fallback.terminalRows, 24);
  assert.equal(fallback.terminalColumns, 80);
  assert.equal(fallback.topHeight, 3);
  assert.equal(fallback.tabHeight, 1);
  assert.equal(fallback.logHeight, 9);
  assert.equal(fallback.logDirection, "column");

  assert.equal(tall.topHeight, 3);
  assert.equal(tall.tabHeight, 1);
  assert.equal(tall.logHeight, 13);
  assert.equal(tall.mainHeight, 16);
  assert.equal(tall.logDirection, "row");
  assert.equal(tall.currentLogWidth < tall.eventLogWidth, true);

  assert.ok(tall.mainHeight > fallback.mainHeight);
  assert.equal(tall.narrow, false);
  assert.ok(tall.pageSize >= fallback.pageSize);
});

test("TUI settle tick runs every second for better real-time feedback", () => {
  assert.equal(TUI_SETTLE_TICK_MS, 1000);
});

test("formatTopStatusRows renders the fixed top status fields", () => {
  const state = createNewState(1_700_000_000_000);
  state.worldTimeMinutes = 2 * 24 * 60 + 9 * 60;
  const view = getGameViewModel(state);
  const rows = formatTopStatusRows(view, false, 140);

  assert.equal(rows.length, 3);
  assert.match(rows[0], /\[Y1-M01-W1 周三\]/);
  assert.match(rows[0], /09:00 \(上午\)/);
  assert.match(rows[0], /状态: 等待排程/);
  assert.match(rows[0], /本周重点: 均衡周/);
  assert.doesNotMatch(rows[0], /Deadline/);
  assert.match(rows[1], /精力/);
  assert.match(rows[1], /压力/);
  assert.match(rows[1], /\[[#=-]+\]/);
  assert.match(rows[2], /代码/);
  assert.match(rows[2], /金钱/);
  assert.match(rows[2], /知识/);
  assert.match(rows[2], /测试/);
  assert.match(rows[2], /文档/);
  assert.match(rows[2], /架构/);
  assert.match(rows[2], /线索/);
  assert.match(rows[2], /声望/);
  assert.match(rows[2], /Bug/);
  assert.match(rows[2], /技术债/);
  assert.doesNotMatch(rows[2], /精力/);
  assert.doesNotMatch(rows[2], /压力/);
  assert.doesNotMatch(rows.join("\n"), /│/);
});

test("formatTopStatusSegmentRows keeps top status text while coloring fields independently", () => {
  const state = createNewState(1_700_000_000_000);
  state.worldTimeMinutes = 2 * 24 * 60 + 9 * 60;
  const view = {
    ...getGameViewModel(state),
    nearestDeadline: { dueDay: 3 }
  };
  const segmentRows = formatTopStatusSegmentRows(view, false, 140);

  assert.deepEqual(segmentRows.map((row) => row.map((segment) => segment.text).join("")), formatTopStatusRows(view, false, 140));
  assert.equal(segmentRows[0].find((segment) => segment.id === "date").color, THEME.title);
  assert.equal(segmentRows[0].find((segment) => segment.id === "time").color, THEME.status.info);
  assert.equal(segmentRows[0].find((segment) => segment.id === "runtime-status").color, THEME.status.warn);
  assert.equal(segmentRows[0].find((segment) => segment.id === "weekly-focus").color, THEME.status.good);
  assert.equal(segmentRows[0].find((segment) => segment.id === "deadline").color, THEME.status.warn);
});

test("formatTopStatusSegmentRows colors each top resource with its own resource tone", () => {
  const view = getGameViewModel(createNewState(1_700_000_000_000));
  const resourceSegments = formatTopStatusSegmentRows(view, false, 180)[2].filter((segment) => segment.resourceId);
  const expectedIds = ["codeLines", "money", "knowledge", "tests", "docs", "architecture", "leads", "reputation", "bugs", "techDebt"];

  assert.deepEqual(resourceSegments.map((segment) => segment.resourceId), expectedIds);
  for (const id of expectedIds) {
    assert.equal(resourceSegments.find((segment) => segment.resourceId === id).color, toneForResource(id).color);
  }
  assert.equal(new Set(resourceSegments.map((segment) => segment.color)).size, expectedIds.length);
});

test("formatTopStatusSegmentRows uses risk tones for high bugs and tech debt", () => {
  const state = createNewState(1_700_000_000_000);
  state.resources.bugs = 40;
  state.resources.techDebt = 80;
  state.resources.energy = 20;
  state.resources.pressure = 80;
  const segmentRows = formatTopStatusSegmentRows(getGameViewModel(state), false, 180);
  const meterSegments = segmentRows[1].filter((segment) => segment.resourceId);
  const resourceSegments = segmentRows[2].filter((segment) => segment.resourceId);

  assert.equal(meterSegments.find((segment) => segment.resourceId === "energy").color, THEME.status.warn);
  assert.equal(meterSegments.find((segment) => segment.resourceId === "pressure").color, THEME.status.danger);
  assert.equal(resourceSegments.find((segment) => segment.resourceId === "bugs").color, THEME.status.warn);
  assert.equal(resourceSegments.find((segment) => segment.resourceId === "techDebt").color, THEME.status.danger);
});

test("formatTopStatusLine applies paused, waiting, running, and rest status rules", () => {
  const waitingState = createNewState(1_700_000_000_000);
  waitingState.worldTimeMinutes = 9 * 60;
  assert.match(formatTopStatusLine(getGameViewModel(waitingState), false), /状态: 等待排程/);
  assert.match(formatTopStatusLine(getGameViewModel(waitingState), true), /状态: 已暂停/);
  assert.doesNotMatch(formatTopStatusLine(getGameViewModel(waitingState), false), /Deadline/);

  const runningState = createNewState(1_700_000_000_000);
  processCommand(runningState, "plan morning activity feature-coding", { randomEvents: false });
  processCommand(runningState, "plan afternoon activity study", { randomEvents: false });
  processCommand(runningState, "plan evening none", { randomEvents: false });
  processCommand(runningState, "plan confirm", { randomEvents: false });
  runningState.worldTimeMinutes = 9 * 60;
  assert.match(formatTopStatusLine(getGameViewModel(runningState), false), /状态: 进行中/);

  runningState.worldTimeMinutes = 13 * 60;
  assert.match(formatTopStatusLine(getGameViewModel(runningState), false), /状态: 休整/);
  assert.match(formatTopStatusLine(getGameViewModel(runningState), false), /13:00 \(休整\)/);
});

test("formatTopStatusRows truncates long content without manual ASCII borders", () => {
  const state = createNewState(1_700_000_000_000);
  const view = {
    ...getGameViewModel(state),
    weeklyFocus: { name: "超长周重点".repeat(20) }
  };
  const rows = formatTopStatusRows(view, false, 30);

  assert.ok(rows.every((row) => getTextDisplayWidth(row) <= 30));
  assert.ok(rows.some((row) => row.endsWith("…")));
  assert.doesNotMatch(rows.join("\n"), /^\+/m);
  assert.doesNotMatch(rows.join("\n"), /-$/m);
  assert.doesNotMatch(rows.join("\n"), /│/);
});

test("getTextDisplayWidth counts Chinese and icons as terminal columns", () => {
  assert.equal(getTextDisplayWidth("代码"), 4);
  assert.equal(getTextDisplayWidth("💻 代码"), 7);
  assert.equal(getTextDisplayWidth("⚠ Bug"), 6);
});

test("getLogRows can render ticker rows without reducing history capacity", () => {
  const state = createNewState(1_700_000_000_000);
  state.worldTimeMinutes = 10 * 60;
  const result = settleTime(state, state.lastTick + 3000, { randomEvents: false });
  const rows = getLogRows([{ id: 1, category: "system", text: "[系统] 已保存。" }], 3, result.ticker);

  assert.equal(rows.tickerRows.length, 4); // ticker 现在返回 4 行
  assert.equal(rows.historyRows.length, 3);
  assert.match(rows.tickerRows[0].text, /\[当前状态\]/);
  assert.equal(rows.historyRows.at(-1).text, "[系统] 已保存。");
});

test("getCurrentLogRows includes status, advice, weekly focus, and key resources", () => {
  const state = createNewState(1_700_000_000_000);
  const view = getGameViewModel(state);
  const rows = getCurrentLogRows(view, ["[当前状态] 活动 写代码。", "[当前时间] 第 001 天 09:00。"], 20);

  assert.match(rows.find((row) => row.id === "current-status")?.text, /\[当前状态\]/);
  assert.equal(rows.find((row) => row.id === "current-time"), undefined);
  assert.equal(rows.find((row) => row.id === "current-budget"), undefined);
  // 本周重点已移至顶部状态栏，不再重复显示
  assert.equal(rows.find((row) => row.id === "current-weekly-focus"), undefined);
  // 资源在充足空间时显示为独立行
  assert.match(rows.find((row) => row.id === "current-energy")?.text, /精力/);
  assert.match(rows.find((row) => row.id === "current-pressure")?.text, /压力/);
  assert.match(rows.find((row) => row.id === "current-bugs")?.text, /Bug/);
  assert.match(rows.find((row) => row.id === "current-techDebt")?.text, /技术债/);
  // current-advice 现在可能是 adviceList 的第一条，或者是 nextAdvice
  assert.ok(rows.find((row) => row.id === "current-advice"));
  assert.doesNotMatch(rows.map((row) => row.text).join("\n"), /今日预算/);
});

test("getCurrentLogRows omits actual delta and output-rate rows in short panels", () => {
  const state = createNewState(1_700_000_000_000);
  processCommand(state, "plan morning activity feature-coding", { randomEvents: false });
  processCommand(state, "plan afternoon activity study", { randomEvents: false });
  processCommand(state, "plan evening none", { randomEvents: false });
  processCommand(state, "plan confirm", { randomEvents: false });
  state.worldTimeMinutes = 9 * 60;

  const rows = getCurrentLogRows(
    getGameViewModel(state),
    ["[当前状态] 活动 写功能。"],
    5,
    { codeLines: 2, bugs: 0.05, energy: -0.1 }
  );

  assert.equal(rows.length <= 5, true);
  assert.match(rows.find((row) => row.id === "current-status")?.text, /活动 写功能/);
  assert.equal(rows.find((row) => row.id === "current-actual-output"), undefined);
  assert.equal(rows.find((row) => row.id === "current-output-rate"), undefined);
  assert.doesNotMatch(rows.map((row) => row.text).join("\n"), /本次变化|产出\/h/);
  assert.match(rows.find((row) => row.id === "current-resources-compact")?.text, /精力/);
});

test("getCurrentLogRows displays specific rest action and output from ticker", () => {
  const now = 1_700_000_000_000;
  const state = createNewState(now);
  state.worldTimeMinutes = 12 * 60;
  state.lastTick = now;
  state.resources.energy = 20;
  state.resources.pressure = 60;

  const result = settleTime(state, now + 60_000, { randomEvents: false });
  const rows = getCurrentLogRows(getGameViewModel(state), result.ticker);
  const currentStatus = rows.find((row) => row.id === "current-status")?.text;

  assert.match(currentStatus, /\[当前行动\] 健康休整 60 秒：/);
  assert.match(currentStatus, /精力 \+/);
  assert.match(currentStatus, /压力 -/);
  assert.notEqual(currentStatus, "[当前状态] 休整。");
});

test("createTuiTicker shows the concrete rest status between settlement ticks", () => {
  const state = createNewState(1_700_000_000_000);
  processCommand(state, "plan morning activity rest", { randomEvents: false });
  processCommand(state, "plan afternoon activity rest", { randomEvents: false });
  processCommand(state, "plan evening none", { randomEvents: false });
  processCommand(state, "plan confirm", { randomEvents: false });
  state.worldTimeMinutes = 12 * 60;

  const rows = getCurrentLogRows(getGameViewModel(state), createTuiTicker(state));
  const currentStatus = rows.find((row) => row.id === "current-status")?.text;

  assert.match(currentStatus, /\[当前状态\] 健康休整：恢复精力，降低压力/);
  assert.notEqual(currentStatus, "[当前状态] 休整。");
});

test("createTuiTicker clears stale activity for evening none before rendering", () => {
  const state = createNewState(1_700_000_000_000);
  state.worldTimeMinutes = 18 * 60;
  state.waitingForSchedule = false;
  state.lockedSchedule = {
    day: 1,
    slots: {
      morning: { type: "activity", id: "rest" },
      afternoon: { type: "activity", id: "rest" },
      evening: { type: "none", id: null }
    }
  };
  state.activeActivityId = "feature-coding";

  const rows = getCurrentLogRows(getGameViewModel(state), createTuiTicker(state));
  const currentStatus = rows.find((row) => row.id === "current-status")?.text;

  assert.equal(state.activeActivityId, null);
  assert.match(currentStatus, /\[当前状态\] 健康休整：恢复精力，降低压力/);
  assert.doesNotMatch(currentStatus, /活动 写功能/);
});

test("command log messages get command and result category prefixes", () => {
  const messages = createCommandLogMessages("week project", ["本周重点已设为：项目周。"]);
  const entries = createLogEntries(messages, 0).entries;

  assert.equal(entries[0].text, "[命令] > week project");
  assert.equal(entries[1].text, "[周重点] 本周重点已设为：项目周。");
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

test("isDailyPlannerMode only applies to unconfirmed schedule waiting", () => {
  const state = createNewState(1_700_000_000_000);

  assert.equal(isDailyPlannerMode(getGameViewModel(state)), true);

  processCommand(state, "plan morning activity rest", { randomEvents: false });
  processCommand(state, "plan afternoon activity rest", { randomEvents: false });
  processCommand(state, "plan evening none", { randomEvents: false });
  processCommand(state, "plan confirm", { randomEvents: false });

  assert.equal(isDailyPlannerMode(getGameViewModel(state)), false);
  assert.equal(isDailyPlannerMode({ schedule: { waiting: false, confirmed: false } }), false);
  assert.equal(isDailyPlannerMode(null), false);
});

test("daily planner candidates reuse activity, learnable skill, and project options", () => {
  const state = createNewState(1_700_000_000_000);

  const activities = getDailyPlannerCandidateOptions(state, "activity");
  const skills = getDailyPlannerCandidateOptions(state, "skill");
  const projects = getDailyPlannerCandidateOptions(state, "project");

  assert.ok(activities.some((option) => option.id === "rest"));
  assert.ok(skills.length > 0);
  assert.equal(skills.every((option) => option.command && option.command.startsWith("learn ")), true);
  assert.ok(projects.length > 0);
  assert.equal(projects.some((option) => option.id === "promote"), false);
});

test("commandForDailyPlannerSelection maps valid choices to plan commands", () => {
  assert.equal(
    commandForDailyPlannerSelection("activity", { id: "feature-coding", unlocked: true }, "morning"),
    "plan morning activity feature-coding"
  );
  assert.equal(
    commandForDailyPlannerSelection("skill", { id: "html-css", command: "learn html-css" }, "afternoon"),
    "plan afternoon skill html-css"
  );
  assert.equal(
    commandForDailyPlannerSelection("project", { id: "homepage" }, "evening"),
    "plan evening project homepage"
  );
});

test("commandForDailyPlannerSelection blocks non-scheduleable planner choices", () => {
  assert.equal(commandForDailyPlannerSelection("activity", { id: "locked", unlocked: false, locked: true }, "morning"), null);
  assert.equal(commandForDailyPlannerSelection("skill", { id: "html-css", command: "upgrade html-css" }, "afternoon"), null);
  assert.equal(commandForDailyPlannerSelection("project", { id: "promote", command: "promote" }, "evening"), null);
  assert.equal(commandForDailyPlannerSelection("activity", { id: "rest", unlocked: true }, "bad-phase"), null);
});

test("getNextDailyPlannerPhaseId advances through the schedule phases", () => {
  assert.equal(getNextDailyPlannerPhaseId("morning"), "afternoon");
  assert.equal(getNextDailyPlannerPhaseId("afternoon"), "evening");
  assert.equal(getNextDailyPlannerPhaseId("evening"), "evening");
  assert.equal(getNextDailyPlannerPhaseId("bad-phase"), "morning");
});

test("handleDailyPlannerEnterKeypress advances after scheduleable selections", () => {
  assert.deepEqual(
    handleDailyPlannerEnterKeypress("activity", { id: "feature-coding", unlocked: true }, "morning"),
    {
      command: "plan morning activity feature-coding",
      nextPhaseId: "afternoon"
    }
  );
  assert.deepEqual(
    handleDailyPlannerEnterKeypress("skill", { id: "html-css", command: "learn html-css" }, "afternoon"),
    {
      command: "plan afternoon skill html-css",
      nextPhaseId: "evening"
    }
  );
  assert.deepEqual(
    handleDailyPlannerEnterKeypress("project", { id: "homepage" }, "evening"),
    {
      command: "plan evening project homepage",
      nextPhaseId: "evening"
    }
  );
});

test("handleDailyPlannerEnterKeypress does not advance non-scheduleable selections", () => {
  assert.deepEqual(
    handleDailyPlannerEnterKeypress("activity", { id: "locked", unlocked: false, locked: true }, "morning"),
    {
      command: null,
      nextPhaseId: "morning"
    }
  );
  assert.deepEqual(
    handleDailyPlannerEnterKeypress("skill", { id: "html-css", command: "upgrade html-css" }, "afternoon"),
    {
      command: null,
      nextPhaseId: "afternoon"
    }
  );
  assert.deepEqual(
    handleDailyPlannerEnterKeypress("project", { id: "promote", command: "promote" }, "evening"),
    {
      command: null,
      nextPhaseId: "evening"
    }
  );
});

test("shouldResetDailyPlannerPhase resets only when entering planner or schedule day changes", () => {
  assert.equal(shouldResetDailyPlannerPhase(false, null, true, 1), true);
  assert.equal(shouldResetDailyPlannerPhase(true, 1, true, 1), false);
  assert.equal(shouldResetDailyPlannerPhase(true, 1, true, 2), true);
  assert.equal(shouldResetDailyPlannerPhase(true, 1, false, null), false);
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
    output: "收益/游戏小时：知识 +17.95",
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
    { label: "输出", value: "收益/游戏小时：知识 +17.95" },
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

test("day-end view model exposes the audit report for TUI", () => {
  const now = 1_700_000_000_000;
  const state = createNewState(now);
  processCommand(state, "plan morning activity feature-coding", { randomEvents: false });
  processCommand(state, "plan afternoon activity study", { randomEvents: false });
  processCommand(state, "plan evening none", { randomEvents: false });
  processCommand(state, "plan confirm", { randomEvents: false });
  state.worldTimeMinutes = 23 * 60 + 59;
  state.lastTick = now;

  settleTime(state, now + 60_000, { randomEvents: false });
  const view = getGameViewModel(state);
  const reportText = view.dayEndReport.rows.join("\n");

  assert.equal(view.dayEndReport.timeLabel, "24:00");
  assert.match(reportText, /打工人每日资产与代码审计报告/);
  assert.match(reportText, /大厂搬砖流水线/);
  assert.match(reportText, /人类基本盘与健康赤字/);
  assert.match(reportText, /Leader\/内心独白辣评/);
  assert.match(reportText, /Space/);
});

test("TUI day confirm command clears report and enters next morning", () => {
  const now = 1_700_000_000_000;
  const state = createNewState(now);
  processCommand(state, "plan morning activity feature-coding", { randomEvents: false });
  processCommand(state, "plan afternoon activity study", { randomEvents: false });
  processCommand(state, "plan evening none", { randomEvents: false });
  processCommand(state, "plan confirm", { randomEvents: false });
  state.worldTimeMinutes = 23 * 60 + 59;
  state.lastTick = now;
  settleTime(state, now + 60_000, { randomEvents: false });

  const result = processTuiCommand(state, "day confirm", { now: now + 120_000, randomEvents: false });

  assert.match(result.messages.join("\n"), /睡眠结算/);
  assert.equal(getGameViewModel(state).dayEndReport, null);
  assert.equal(state.waitingForSchedule, true);
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
