const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  createProfile,
  getCharacterCardOptions,
  getProfileOptions,
  loadProfile
} = require("../src/game");
const {
  MAX_LOGS,
  appendLogEntries,
  calculateLayoutBudget,
  createLogEntries,
  formatOptionDetail,
  getPageWindow,
  getProfilePageOptions,
  getLogRows,
  handleProfileEnterKeypress,
  handleProfileDeleteKeypress,
  normalizeLogMessages,
  profileDeleteUnavailableMessage,
  resolveProfileDeleteKeypress,
  shouldExitProfileCreationMode
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
  assert.ok(budget.mainHeight >= 5);
  assert.ok(budget.pageSize >= 3);
  assert.equal(
    budget.headerHeight + budget.resourceHeight + budget.tabHeight + budget.footerHeight + budget.logHeight + budget.mainHeight,
    24
  );
});

test("calculateLayoutBudget falls back to 24 rows and expands taller terminals", () => {
  const fallback = calculateLayoutBudget(undefined, undefined);
  const tall = calculateLayoutBudget(30, 120);

  assert.equal(fallback.terminalRows, 24);
  assert.equal(fallback.terminalColumns, 80);
  assert.ok(tall.mainHeight > fallback.mainHeight);
  assert.equal(tall.narrow, false);
  assert.ok(tall.pageSize >= fallback.pageSize);
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
