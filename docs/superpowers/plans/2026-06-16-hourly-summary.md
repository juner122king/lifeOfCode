# 每小时资源汇总功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在游戏日志中添加每小时资源和进展汇总功能，让玩家能够清晰地了解每个小时的收益和变化。

**Architecture:** 在 `state` 中添加快照字段记录上次汇总时的状态，在 `settleTime` 主循环中检测整点触发，生成包含资源变化、活动进展、属性经验的完整报告，并以特殊类型的多行日志显示。

**Tech Stack:** Node.js, 现有游戏引擎（game.js），TUI 显示层（tui.js）

---

## 文件结构

### 创建文件
无

### 修改文件
- `src/game.js` - 添加快照字段初始化、整点检测逻辑、汇总生成函数
- `src/tui.js` - 添加 `hourly_summary` 事件标签
- `test/game.test.js` - 添加汇总功能的单元测试

---

### Task 1: 初始化每小时汇总状态字段

**Files:**
- Modify: `src/game.js:245-318` (createNewState 函数)

- [ ] **Step 1: 写失败的测试 - 验证新档案包含汇总字段**

在 `test/game.test.js` 末尾添加：

```javascript
test("createNewState initializes hourly summary fields", () => {
  const state = createNewState();
  
  assert.strictEqual(typeof state.lastHourlySummaryHour, "number");
  assert.ok(state.hourlySummarySnapshot);
  assert.ok(state.hourlySummarySnapshot.resources);
  assert.ok(state.hourlySummarySnapshot.activityLevels);
  assert.ok(state.hourlySummarySnapshot.attributeExp);
  assert.strictEqual(typeof state.hourlySummarySnapshot.worldMinute, "number");
  
  // 验证快照初始值
  assert.strictEqual(state.hourlySummarySnapshot.resources.energy, 100);
  assert.strictEqual(state.hourlySummarySnapshot.worldMinute, 540); // 9:00
});
```

- [ ] **Step 2: 运行测试验证失败**

```bash
npm test -- --grep "createNewState initializes hourly summary fields"
```

预期输出：FAIL - `state.lastHourlySummaryHour is undefined`

- [ ] **Step 3: 在 createNewState 中添加汇总字段**

在 `src/game.js` 的 `createNewState` 函数中，在 `lastTick: now,` 之后添加：

```javascript
    lastTick: now,
    lastHourlySummaryHour: Math.floor((WORLD_START_MINUTES % MINUTES_PER_DAY) / 60),
    hourlySummarySnapshot: {
      resources: {},
      activityLevels: {},
      attributeExp: {},
      worldMinute: WORLD_START_MINUTES
    },
    stats: {
```

- [ ] **Step 4: 初始化快照内容**

在 `createNewState` 函数末尾，`return state;` 之前添加：

```javascript
  if (options.characterCardId) applyCharacterCard(state, options.characterCardId);
  state.dayStartResources = snapshotResources(state.resources);
  
  // 初始化每小时汇总快照
  state.hourlySummarySnapshot.resources = snapshotResources(state.resources);
  state.hourlySummarySnapshot.activityLevels = Object.fromEntries(
    Object.entries(state.activityLevels).map(([id, level]) => [id, { level, exp: state.activityExp[id] || 0 }])
  );
  state.hourlySummarySnapshot.attributeExp = { ...state.attributeExp };
  
  return state;
```

- [ ] **Step 5: 运行测试验证通过**

```bash
npm test -- --grep "createNewState initializes hourly summary fields"
```

预期输出：PASS

- [ ] **Step 6: 提交**

```bash
git add src/game.js test/game.test.js
git commit -m "feat(game): initialize hourly summary state fields

添加每小时汇总所需的状态字段：
- lastHourlySummaryHour: 上次汇总的小时数
- hourlySummarySnapshot: 快照对象（资源、活动等级、属性经验）

在 createNewState 中初始化这些字段，避免游戏启动时立即触发汇总。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: 实现快照更新函数

**Files:**
- Modify: `src/game.js` (在 snapshotResources 函数附近添加新函数)
- Test: `test/game.test.js`

- [ ] **Step 1: 写失败的测试 - 验证快照更新**

在 `test/game.test.js` 末尾添加：

```javascript
test("updateHourlySummarySnapshot updates snapshot correctly", () => {
  const state = createNewState();
  
  // 修改当前状态
  state.resources.energy = 50;
  state.resources.pressure = 30;
  state.activityLevels["bug-hunting"] = 3;
  state.activityExp["bug-hunting"] = 150;
  state.attributeExp.logic = 25;
  state.worldTimeMinutes = 600; // 10:00
  
  updateHourlySummarySnapshot(state);
  
  // 验证快照已更新
  assert.strictEqual(state.hourlySummarySnapshot.resources.energy, 50);
  assert.strictEqual(state.hourlySummarySnapshot.resources.pressure, 30);
  assert.strictEqual(state.hourlySummarySnapshot.activityLevels["bug-hunting"].level, 3);
  assert.strictEqual(state.hourlySummarySnapshot.activityLevels["bug-hunting"].exp, 150);
  assert.strictEqual(state.hourlySummarySnapshot.attributeExp.logic, 25);
  assert.strictEqual(state.hourlySummarySnapshot.worldMinute, 600);
});
```

- [ ] **Step 2: 运行测试验证失败**

```bash
npm test -- --grep "updateHourlySummarySnapshot"
```

预期输出：FAIL - `updateHourlySummarySnapshot is not defined`

- [ ] **Step 3: 实现 updateHourlySummarySnapshot 函数**

在 `src/game.js` 中 `snapshotResources` 函数之后添加：

```javascript
function updateHourlySummarySnapshot(state) {
  state.hourlySummarySnapshot.resources = snapshotResources(state.resources);
  state.hourlySummarySnapshot.activityLevels = Object.fromEntries(
    Object.entries(state.activityLevels).map(([id, level]) => [id, { level, exp: state.activityExp[id] || 0 }])
  );
  state.hourlySummarySnapshot.attributeExp = { ...state.attributeExp };
  state.hourlySummarySnapshot.worldMinute = state.worldTimeMinutes;
}
```

- [ ] **Step 4: 导出函数**

在 `src/game.js` 末尾的 `module.exports` 中添加：

```javascript
module.exports = {
  // ... 现有导出
  updateHourlySummarySnapshot,
```

- [ ] **Step 5: 运行测试验证通过**

```bash
npm test -- --grep "updateHourlySummarySnapshot"
```

预期输出：PASS

- [ ] **Step 6: 提交**

```bash
git add src/game.js test/game.test.js
git commit -m "feat(game): add updateHourlySummarySnapshot function

实现快照更新函数，用于在生成汇总后更新快照状态：
- 复制当前资源状态
- 复制活动等级和经验
- 复制属性经验
- 更新快照时间戳

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: 实现汇总内容生成函数

**Files:**
- Modify: `src/game.js` (在 formatChangedResources 函数附近添加)
- Test: `test/game.test.js`

- [ ] **Step 1: 写失败的测试 - 验证汇总生成**

在 `test/game.test.js` 末尾添加：

```javascript
test("generateHourlySummary generates complete report", () => {
  const state = createNewState();
  
  // 设置快照（上个小时的状态）
  state.hourlySummarySnapshot.resources = {
    energy: 100, pressure: 20, bugs: 15, techDebt: 10,
    money: 30, reputation: 0, knowledge: 0
  };
  state.hourlySummarySnapshot.activityLevels = {
    "bug-hunting": { level: 2, exp: 150 }
  };
  state.hourlySummarySnapshot.attributeExp = { logic: 10, resilience: 5 };
  state.hourlySummarySnapshot.worldMinute = 540; // 9:00
  
  // 设置当前状态（一小时后）
  state.resources.energy = 85;
  state.resources.pressure = 30;
  state.resources.bugs = 13;
  state.resources.money = 30;
  state.activityLevels["bug-hunting"] = 3;
  state.activityExp["bug-hunting"] = 200;
  state.attributeExp.logic = 22;
  state.attributeExp.resilience = 13;
  state.worldTimeMinutes = 600; // 10:00
  
  const summary = generateHourlySummary(state);
  
  assert.ok(summary.includes("[汇总] 09:00-10:00"));
  assert.ok(summary.includes("精力 -15"));
  assert.ok(summary.includes("100→85"));
  assert.ok(summary.includes("压力 +10"));
  assert.ok(summary.includes("Bug -2"));
  assert.ok(summary.includes("逻辑 +12"));
  assert.ok(summary.includes("韧性 +8"));
});
```

- [ ] **Step 2: 运行测试验证失败**

```bash
npm test -- --grep "generateHourlySummary"
```

预期输出：FAIL - `generateHourlySummary is not defined`

- [ ] **Step 3: 实现 generateHourlySummary 函数 - 第一部分（时间和资源）**

在 `src/game.js` 中 `formatChangedResources` 函数之后添加：

```javascript
function generateHourlySummary(state) {
  const snapshot = state.hourlySummarySnapshot;
  if (!snapshot) return null;
  
  const lines = [];
  
  // 1. 时间范围
  const fromHour = Math.floor((snapshot.worldMinute % MINUTES_PER_DAY) / 60);
  const toHour = Math.floor((state.worldTimeMinutes % MINUTES_PER_DAY) / 60);
  const timeRange = `${String(fromHour).padStart(2, "0")}:00-${String(toHour).padStart(2, "0")}:00`;
  lines.push(`[汇总] ${timeRange}`);
  
  // 2. 资源变化
  const resourceChanges = [];
  for (const key of RESOURCE_ORDER) {
    const before = Math.floor(Number(snapshot.resources[key]) || 0);
    const after = Math.floor(Number(state.resources[key]) || 0);
    const change = after - before;
    if (change !== 0) {
      const name = RESOURCE_NAMES[key] || key;
      resourceChanges.push(`${name} ${change > 0 ? "+" : ""}${change}（${before}→${after}）`);
    }
  }
  if (resourceChanges.length > 0) {
    lines.push(`资源：${resourceChanges.join("，")}`);
  } else {
    lines.push("资源：无明显变化");
  }
  
  return lines.join("\n");
}
```

- [ ] **Step 4: 添加属性经验变化**

在 `generateHourlySummary` 函数的 `return lines.join("\n");` 之前添加：

```javascript
  // 3. 属性经验
  const attributeChanges = [];
  for (const id of ATTRIBUTE_IDS) {
    const before = Math.floor(Number(snapshot.attributeExp[id]) || 0);
    const after = Math.floor(Number(state.attributeExp[id]) || 0);
    const change = after - before;
    if (change > 0) {
      const name = ATTRIBUTE_NAMES[id] || id;
      attributeChanges.push(`${name} +${change}`);
    }
  }
  if (attributeChanges.length > 0) {
    lines.push(`属性：${attributeChanges.join("，")}`);
  }
  
  return lines.join("\n");
```

- [ ] **Step 5: 导出函数**

在 `src/game.js` 末尾的 `module.exports` 中添加：

```javascript
module.exports = {
  // ... 现有导出
  generateHourlySummary,
```

- [ ] **Step 6: 运行测试验证通过**

```bash
npm test -- --grep "generateHourlySummary"
```

预期输出：PASS

- [ ] **Step 7: 提交**

```bash
git add src/game.js test/game.test.js
git commit -m "feat(game): add generateHourlySummary function

实现每小时汇总内容生成函数：
- 计算时间范围（HH:00-HH:00）
- 对比快照生成资源变化列表
- 对比快照生成属性经验变化
- 返回多行格式化文本

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: 在 settleTime 中添加整点检测逻辑

**Files:**
- Modify: `src/game.js:3272-3455` (settleTime 函数)
- Test: `test/game.test.js`

- [ ] **Step 1: 写失败的测试 - 验证整点触发汇总**

在 `test/game.test.js` 末尾添加：

```javascript
test("settleTime triggers hourly summary at整点", () => {
  const state = createNewState();
  state.worldTimeMinutes = 590; // 9:50
  state.lockedSchedule = {
    day: 1,
    slots: { morning: { type: "activity", id: "bug-hunting" }, afternoon: null, evening: null },
    confirmedAtWorldMinute: 540
  };
  state.activeActivityId = "bug-hunting";
  state.waitingForSchedule = false;
  
  // 推进到 10:10（跨过 10:00 整点）
  const result = settleTime(state, Date.now() + 20 * 60 * 1000, { maxSeconds: 20 * 60 });
  
  // 验证生成了汇总事件
  const summaryEvent = result.events.find(e => e.category === "hourly_summary");
  assert.ok(summaryEvent, "Should generate hourly summary event");
  assert.ok(summaryEvent.text.includes("[汇总] 09:00-10:00"));
  assert.strictEqual(state.lastHourlySummaryHour, 10);
});
```

- [ ] **Step 2: 运行测试验证失败**

```bash
npm test -- --grep "settleTime triggers hourly summary"
```

预期输出：FAIL - `summaryEvent is undefined`

- [ ] **Step 3: 在 settleTime 主循环中添加整点检测**

在 `src/game.js` 的 `settleTime` 函数中，找到主循环内 `state.worldTimeMinutes += segmentMinutes;` 这一行，在其之后添加：

```javascript
    state.worldTimeMinutes += segmentMinutes;
    remainingMinutes -= segmentMinutes;
    processedSeconds += segmentMinutes;

    // 检测整点触发每小时汇总
    const currentHour = Math.floor((state.worldTimeMinutes % MINUTES_PER_DAY) / 60);
    const shouldTriggerSummary = 
      state.lastHourlySummaryHour !== null &&
      currentHour !== state.lastHourlySummaryHour &&
      currentHour !== 0; // 跳过 00:00（有日终总结）
    
    if (shouldTriggerSummary) {
      const summary = generateHourlySummary(state);
      if (summary) {
        pushGameEvent(events, "hourly_summary", summary, "info");
      }
      state.lastHourlySummaryHour = currentHour;
      updateHourlySummarySnapshot(state);
    }

    checkPressureOverload(
```

- [ ] **Step 4: 运行测试验证通过**

```bash
npm test -- --grep "settleTime triggers hourly summary"
```

预期输出：PASS

- [ ] **Step 5: 提交**

```bash
git add src/game.js test/game.test.js
git commit -m "feat(game): add hourly summary trigger in settleTime

在 settleTime 主循环中添加整点检测：
- 检测游戏时间跨过整点（小时变化）
- 跳过 00:00（避免与日终总结重复）
- 生成汇总并推送事件
- 更新快照和上次汇总小时

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: 测试跨天边界不触发汇总

**Files:**
- Test: `test/game.test.js`

- [ ] **Step 1: 写测试 - 验证 00:00 不触发汇总**

在 `test/game.test.js` 末尾添加：

```javascript
test("settleTime skips hourly summary at 00:00", () => {
  const state = createNewState();
  state.worldTimeMinutes = 1430; // 23:50
  state.lockedSchedule = {
    day: 1,
    slots: { morning: null, afternoon: null, evening: { type: "activity", id: "rest" } },
    confirmedAtWorldMinute: 540
  };
  state.activeActivityId = "rest";
  state.waitingForSchedule = false;
  state.lastHourlySummaryHour = 23;
  
  // 推进到 00:10（跨过 00:00）
  const result = settleTime(state, Date.now() + 20 * 60 * 1000, { maxSeconds: 20 * 60, randomEvents: false });
  
  // 验证没有生成汇总事件（但可能有日终总结）
  const summaryEvent = result.events.find(e => e.category === "hourly_summary");
  assert.strictEqual(summaryEvent, undefined, "Should NOT generate hourly summary at 00:00");
});
```

- [ ] **Step 2: 运行测试验证通过**

```bash
npm test -- --grep "skips hourly summary at 00:00"
```

预期输出：PASS

- [ ] **Step 3: 提交**

```bash
git add test/game.test.js
git commit -m "test(game): verify hourly summary skips 00:00

添加测试验证 00:00 不触发每小时汇总，避免与日终总结重复。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: 添加 TUI 显示支持

**Files:**
- Modify: `src/tui.js`

- [ ] **Step 1: 在 INFO_EVENT_LABELS 中添加汇总标签**

在 `src/tui.js` 中找到 `INFO_EVENT_LABELS` 常量，添加：

```javascript
const INFO_EVENT_LABELS = {
  random: "情报",
  project: "交付",
  skill: "技能",
  career: "成长",
  warning: "警告",
  command: "命令",
  system: "系统",
  world: "世界大势",
  focus: "周重点",
  hourly_summary: "汇总"
};
```

- [ ] **Step 2: 运行完整测试套件验证**

```bash
npm test
```

预期输出：所有测试通过

- [ ] **Step 3: 手动测试 - 验证显示效果**

```bash
node src/index.js
```

在游戏中：
1. 使用 `wait 60` 推进一个小时
2. 查看玩家信息窗口的事件日志
3. 验证出现 `[汇总]` 标签的多行日志

- [ ] **Step 4: 提交**

```bash
git add src/tui.js
git commit -m "feat(tui): add hourly_summary event label

在 INFO_EVENT_LABELS 中添加 hourly_summary 类别，
显示为 [汇总] 标签。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: 添加边缘情况测试

**Files:**
- Test: `test/game.test.js`

- [ ] **Step 1: 测试首次启动不触发汇总**

在 `test/game.test.js` 末尾添加：

```javascript
test("settleTime does not trigger summary on first启动", () => {
  const state = createNewState();
  state.worldTimeMinutes = 540; // 9:00
  state.lockedSchedule = {
    day: 1,
    slots: { morning: { type: "activity", id: "bug-hunting" }, afternoon: null, evening: null },
    confirmedAtWorldMinute: 540
  };
  state.activeActivityId = "bug-hunting";
  state.waitingForSchedule = false;
  
  // 推进到 10:00
  const result = settleTime(state, Date.now() + 60 * 60 * 1000, { maxSeconds: 60 * 60 });
  
  // 验证生成了汇总（因为是从 9:00 推进到 10:00）
  const summaryEvent = result.events.find(e => e.category === "hourly_summary");
  assert.ok(summaryEvent, "Should generate summary when crossing hour boundary");
});
```

- [ ] **Step 2: 测试资源无变化的情况**

在 `test/game.test.js` 末尾添加：

```javascript
test("generateHourlySummary handles no resource changes", () => {
  const state = createNewState();
  
  // 快照和当前状态相同
  state.hourlySummarySnapshot.resources = snapshotResources(state.resources);
  state.hourlySummarySnapshot.activityLevels = {};
  state.hourlySummarySnapshot.attributeExp = { ...state.attributeExp };
  state.hourlySummarySnapshot.worldMinute = 540;
  state.worldTimeMinutes = 600;
  
  const summary = generateHourlySummary(state);
  
  assert.ok(summary.includes("资源：无明显变化"));
  assert.ok(summary.includes("[汇总] 09:00-10:00"));
});
```

- [ ] **Step 3: 运行测试验证通过**

```bash
npm test -- --grep "settleTime does not trigger summary on first|generateHourlySummary handles no resource"
```

预期输出：PASS

- [ ] **Step 4: 提交**

```bash
git add test/game.test.js
git commit -m "test(game): add edge case tests for hourly summary

添加边缘情况测试：
- 首次启动后正常触发汇总
- 资源无变化时显示 "无明显变化"

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: 运行完整测试并文档化

**Files:**
- Test: 运行完整测试套件
- Modify: `docs/superpowers/specs/2026-06-16-hourly-summary-design.md`

- [ ] **Step 1: 运行完整测试套件**

```bash
npm test
```

预期输出：所有测试通过

- [ ] **Step 2: 更新设计文档状态**

在 `docs/superpowers/specs/2026-06-16-hourly-summary-design.md` 开头修改状态：

```markdown
**日期**: 2026-06-16  
**状态**: ✅ 已实现
```

- [ ] **Step 3: 提交文档更新**

```bash
git add docs/superpowers/specs/2026-06-16-hourly-summary-design.md
git commit -m "docs: mark hourly summary spec as implemented

每小时汇总功能已完整实现并通过测试。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 4: 创建功能总结提交**

```bash
git log --oneline | head -10
```

查看所有相关提交，确认功能完整实现。

---

## 实现完成检查清单

完成所有任务后，验证以下功能：

- [ ] 新档案创建时正确初始化汇总字段
- [ ] 游戏时间跨过整点时触发汇总
- [ ] 汇总内容包含资源变化、属性经验
- [ ] 00:00 时不触发汇总（有日终总结）
- [ ] 汇总事件在 TUI 中显示为 [汇总] 标签
- [ ] 所有单元测试通过
- [ ] 手动测试验证显示效果正常

## 测试命令

```bash
# 运行所有测试
npm test

# 运行特定测试
npm test -- --grep "hourly summary"

# 手动游戏测试
node src/index.js
```
