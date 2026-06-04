const assert = require("node:assert/strict");
const test = require("node:test");
const {
  MAX_LOGS,
  appendLogEntries,
  calculateLayoutBudget,
  createLogEntries,
  formatOptionDetail,
  getPageWindow,
  getLogRows,
  normalizeLogMessages
} = require("../src/tui");

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
