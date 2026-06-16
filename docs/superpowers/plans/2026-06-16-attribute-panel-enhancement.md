# 属性面板展示优化 - 实施计划

**规格文档**: `docs/superpowers/specs/2026-06-16-attribute-panel-enhancement.md`  
**创建日期**: 2026-06-16  
**实施方式**: TDD，分5个任务，每个任务先测试后实现

---

## 任务概览

1. **Task 1**: 数据层函数（getAttributeSummary, getAttributeDetails, getMilestoneOverview）
2. **Task 2**: 摘要视图渲染（attr 命令默认）
3. **Task 3**: 详情视图渲染（attr <name>）
4. **Task 4**: 里程碑总览渲染（attr milestones）
5. **Task 5**: 命令集成和端到端测试

---

## Task 1: 数据层函数

**目标**: 实现3个数据获取函数，为渲染层提供结构化数据

### Step 1.1: 编写 getAttributeSummary 测试

**文件**: `test/attributes.test.js`

在文件末尾添加新测试套件：

```javascript
describe("Attribute panel - getAttributeSummary", () => {
  test("should return summary for all 6 attributes", () => {
    const state = createNewState();
    state.attributes.logic = 42;
    state.attributeExp.logic = 240;
    state.attributes.focus = 38;
    state.attributeExp.focus = 85;
    state.attributes.learning = 25;
    state.attributeExp.learning = 12;
    
    const { getAttributeSummary } = require("../src/game");
    const summary = getAttributeSummary(state);
    
    assert.strictEqual(summary.length, 6, "should return 6 attributes");
    
    const logic = summary.find(s => s.id === "logic");
    assert.strictEqual(logic.name, "逻辑");
    assert.strictEqual(logic.currentLevel, 42);
    assert.strictEqual(logic.currentExp, 240);
    assert.strictEqual(logic.nextLevelExp, 156); // 30 + 42 * 3
    assert.strictEqual(logic.expPercent, Math.floor(240 / 156 * 100));
    assert.strictEqual(logic.nextMilestone.level, 55);
    assert.strictEqual(logic.nextMilestone.name, "质量守护者");
    assert.strictEqual(logic.nextMilestone.pointsNeeded, 13);
    assert.strictEqual(logic.progressBar, "[████████░░]"); // 42 of 55 filled
  });
  
  test("should handle recently unlocked milestones", () => {
    const state = createNewState();
    state.attributes.learning = 25;
    state.unlockedMilestones = state.unlockedMilestones || {};
    state.unlockedMilestones.learning = [25];
    state.recentMilestoneUnlocks = state.recentMilestoneUnlocks || {};
    state.recentMilestoneUnlocks.learning = 25;
    
    const { getAttributeSummary } = require("../src/game");
    const summary = getAttributeSummary(state);
    const learning = summary.find(s => s.id === "learning");
    
    assert.strictEqual(learning.recentlyUnlocked.level, 25);
    assert.strictEqual(learning.recentlyUnlocked.name, "快速学习");
  });
});
```

**运行测试**:
```bash
npm test -- test/attributes.test.js
```

**预期结果**: 测试失败，因为 `getAttributeSummary` 函数不存在。

**提交**:
```
git add test/attributes.test.js
git commit -m "test: add getAttributeSummary tests for attribute panel

Tests verify:
- Returns summary for all 6 attributes
- Includes correct level, exp, and progress data
- Calculates next milestone and progress bar
- Tracks recently unlocked milestones

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Step 1.2: 实现 getAttributeSummary

**文件**: `src/game.js`

在 `getEffectiveAttribute` 函数后（约1072行）添加辅助函数：

```javascript
function getAttributeUpgradeCost(level) {
  return 30 + level * 3;
}

function findNextMilestone(attrId, currentLevel) {
  const { ATTRIBUTE_MILESTONES } = require("./core/attributes");
  const milestones = ATTRIBUTE_MILESTONES[attrId] || [];
  return milestones.find(m => m.level > currentLevel) || null;
}

function calculateProgressBar(current, target, barLength = 10) {
  const filled = Math.floor((current / target) * barLength);
  const empty = barLength - filled;
  return "[" + "█".repeat(filled) + "░".repeat(empty) + "]";
}

function getAttributeSummary(state) {
  const summary = [];
  
  for (const attrId of ATTRIBUTE_IDS) {
    const currentLevel = getBaseAttribute(state, attrId);
    const currentExp = Math.floor(state.attributeExp[attrId] || 0);
    const nextLevelExp = getAttributeUpgradeCost(currentLevel);
    const expPercent = Math.floor((currentExp / nextLevelExp) * 100);
    
    const nextMilestone = findNextMilestone(attrId, currentLevel);
    const progressBar = nextMilestone 
      ? calculateProgressBar(currentLevel, nextMilestone.level)
      : "[██████████]";
    
    // Check for recently unlocked milestones
    let recentlyUnlocked = null;
    const recentLevel = state.recentMilestoneUnlocks && state.recentMilestoneUnlocks[attrId];
    if (recentLevel) {
      const { ATTRIBUTE_MILESTONES } = require("./core/attributes");
      const milestone = (ATTRIBUTE_MILESTONES[attrId] || []).find(m => m.level === recentLevel);
      if (milestone) {
        recentlyUnlocked = { level: milestone.level, name: milestone.name };
      }
    }
    
    summary.push({
      id: attrId,
      name: ATTRIBUTE_NAMES[attrId],
      currentLevel,
      currentExp,
      nextLevelExp,
      expPercent,
      nextMilestone: nextMilestone ? {
        level: nextMilestone.level,
        name: nextMilestone.name,
        pointsNeeded: nextMilestone.level - currentLevel
      } : null,
      progressBar,
      recentlyUnlocked
    });
  }
  
  return summary;
}
```

在 `module.exports` 中（约5954行）添加导出：

```javascript
module.exports = {
  // ... existing exports
  getAttributeSummary,  // 添加这一行
  // ... rest of exports
```

**运行测试**:
```bash
npm test -- test/attributes.test.js
```

**预期结果**: 所有 `getAttributeSummary` 测试通过。

**提交**:
```
git add src/game.js
git commit -m "feat: implement getAttributeSummary for attribute panel

Adds:
- getAttributeSummary() returns summary for all 6 attributes
- Helper functions: getAttributeUpgradeCost, findNextMilestone, calculateProgressBar
- Includes next milestone info and progress visualization
- Tracks recently unlocked milestones

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Step 1.3: 编写 getAttributeDetails 测试

**文件**: `test/attributes.test.js`

在 `getAttributeSummary` 测试套件后添加：

```javascript
describe("Attribute panel - getAttributeDetails", () => {
  test("should return complete details for single attribute", () => {
    const state = createNewState();
    state.attributes.logic = 42;
    state.attributeExp.logic = 240;
    state.unlockedMilestones = { logic: [25, 40] };
    
    const { getAttributeDetails } = require("../src/game");
    const details = getAttributeDetails(state, "logic");
    
    assert.strictEqual(details.id, "logic");
    assert.strictEqual(details.name, "逻辑");
    assert.strictEqual(details.currentLevel, 42);
    assert.strictEqual(details.currentExp, 240);
    assert.strictEqual(details.nextLevelExp, 156);
    assert.strictEqual(details.effectiveValue, 42.0);
    
    // Unlocked milestones
    assert.strictEqual(details.unlockedMilestones.length, 2);
    assert.strictEqual(details.unlockedMilestones[0].level, 25);
    assert.strictEqual(details.unlockedMilestones[0].name, "代码直觉觉醒");
    
    // Next milestone
    assert.strictEqual(details.nextMilestone.level, 55);
    assert.strictEqual(details.nextMilestone.pointsNeeded, 13);
    assert.ok(details.nextMilestone.expNeeded > 0);
    
    // Future milestones
    assert.strictEqual(details.futureMilestones.length, 2);
    assert.strictEqual(details.futureMilestones[0].level, 70);
    assert.strictEqual(details.futureMilestones[1].level, 85);
  });
});
```

**运行测试**:
```bash
npm test -- test/attributes.test.js
```

**预期结果**: 测试失败，因为 `getAttributeDetails` 不存在。

**提交**:
```
git add test/attributes.test.js
git commit -m "test: add getAttributeDetails tests

Tests verify:
- Returns complete details for single attribute
- Includes unlocked, next, and future milestones
- Calculates exp needed to next milestone

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Step 1.4: 实现 getAttributeDetails

**文件**: `src/game.js`

在 `getAttributeSummary` 函数后添加：

```javascript
function getAttributeDetails(state, attrId) {
  if (!ATTRIBUTE_IDS.includes(attrId)) {
    throw new Error(`Invalid attribute ID: ${attrId}`);
  }
  
  const { ATTRIBUTE_MILESTONES } = require("./core/attributes");
  const milestones = ATTRIBUTE_MILESTONES[attrId] || [];
  
  const currentLevel = getBaseAttribute(state, attrId);
  const currentExp = Math.floor(state.attributeExp[attrId] || 0);
  const nextLevelExp = getAttributeUpgradeCost(currentLevel);
  const expPercent = Math.floor((currentExp / nextLevelExp) * 100);
  const effectiveValue = getEffectiveAttribute(state, attrId);
  const baseValue = currentLevel;
  const breakthroughBonus = getBreakthrough(state, attrId);
  
  // Unlocked milestones
  const unlockedLevels = (state.unlockedMilestones && state.unlockedMilestones[attrId]) || [];
  const unlockedMilestones = milestones
    .filter(m => unlockedLevels.includes(m.level))
    .map(m => ({
      level: m.level,
      name: m.name,
      effect: m.effect,
      value: m.value,
      description: m.description,
      narrative: m.narrative
    }));
  
  // Next milestone
  const nextMilestone = findNextMilestone(attrId, currentLevel);
  let nextMilestoneData = null;
  if (nextMilestone) {
    const pointsNeeded = nextMilestone.level - currentLevel;
    let expNeeded = 0;
    for (let lvl = currentLevel; lvl < nextMilestone.level; lvl++) {
      expNeeded += getAttributeUpgradeCost(lvl);
    }
    expNeeded -= currentExp; // Subtract current progress
    
    nextMilestoneData = {
      level: nextMilestone.level,
      name: nextMilestone.name,
      pointsNeeded,
      expNeeded: Math.max(0, expNeeded),
      description: nextMilestone.description,
      narrative: nextMilestone.narrative
    };
  }
  
  // Future milestones
  const futureMilestones = milestones
    .filter(m => nextMilestone && m.level > nextMilestone.level)
    .map(m => ({
      level: m.level,
      name: m.name,
      description: m.description
    }));
  
  return {
    id: attrId,
    name: ATTRIBUTE_NAMES[attrId],
    currentLevel,
    currentExp,
    nextLevelExp,
    expPercent,
    effectiveValue,
    baseValue,
    breakthroughBonus,
    unlockedMilestones,
    nextMilestone: nextMilestoneData,
    futureMilestones
  };
}
```

在 `module.exports` 中添加导出：

```javascript
  getAttributeDetails,  // 添加这一行
```

**运行测试**:
```bash
npm test -- test/attributes.test.js
```

**预期结果**: 所有 `getAttributeDetails` 测试通过。

**提交**:
```
git add src/game.js
git commit -m "feat: implement getAttributeDetails for attribute panel

Returns comprehensive attribute data including:
- Current level, exp, and effective value
- Unlocked milestones with full info
- Next milestone with exp calculation
- Future milestones preview

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Step 1.5: 编写 getMilestoneOverview 测试

**文件**: `test/attributes.test.js`

添加测试套件：

```javascript
describe("Attribute panel - getMilestoneOverview", () => {
  test("should return milestone overview for all attributes", () => {
    const state = createNewState();
    state.attributes.logic = 42;
    state.attributes.focus = 38;
    state.unlockedMilestones = {
      logic: [25, 40],
      focus: [25]
    };
    
    const { getMilestoneOverview } = require("../src/game");
    const overview = getMilestoneOverview(state);
    
    assert.ok(overview.logic);
    assert.strictEqual(overview.logic.currentLevel, 42);
    assert.strictEqual(overview.logic.milestones.length, 5);
    
    const logicM25 = overview.logic.milestones.find(m => m.level === 25);
    assert.strictEqual(logicM25.unlocked, true);
    assert.strictEqual(logicM25.pointsNeeded, 0);
    
    const logicM55 = overview.logic.milestones.find(m => m.level === 55);
    assert.strictEqual(logicM55.unlocked, false);
    assert.strictEqual(logicM55.pointsNeeded, 13);
    assert.strictEqual(logicM55.name, "质量守护者");
  });
});
```

**运行测试**:
```bash
npm test -- test/attributes.test.js
```

**预期结果**: 测试失败，因为 `getMilestoneOverview` 不存在。

**提交**:
```
git add test/attributes.test.js
git commit -m "test: add getMilestoneOverview tests

Tests verify:
- Returns overview for all 6 attributes
- Includes all 5 milestones per attribute
- Shows unlock status and points needed

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Step 1.6: 实现 getMilestoneOverview

**文件**: `src/game.js`

在 `getAttributeDetails` 函数后添加：

```javascript
function getMilestoneOverview(state) {
  const { ATTRIBUTE_MILESTONES } = require("./core/attributes");
  const overview = {};
  
  for (const attrId of ATTRIBUTE_IDS) {
    const currentLevel = getBaseAttribute(state, attrId);
    const milestones = ATTRIBUTE_MILESTONES[attrId] || [];
    const unlockedLevels = (state.unlockedMilestones && state.unlockedMilestones[attrId]) || [];
    
    overview[attrId] = {
      currentLevel,
      milestones: milestones.map(m => ({
        level: m.level,
        unlocked: unlockedLevels.includes(m.level),
        name: m.name,
        description: m.description,
        pointsNeeded: Math.max(0, m.level - currentLevel)
      }))
    };
  }
  
  return overview;
}
```

在 `module.exports` 中添加导出：

```javascript
  getMilestoneOverview,  // 添加这一行
```

**运行测试**:
```bash
npm test -- test/attributes.test.js
```

**预期结果**: 所有测试通过。

**提交**:
```
git add src/game.js
git commit -m "feat: implement getMilestoneOverview for attribute panel

Returns milestone roadmap for all 6 attributes:
- Current level for each attribute
- All 5 milestones with unlock status
- Points needed to reach each milestone

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: 摘要视图渲染 (Summary View)

**目标**: 实现 `renderAttributeSummary` 函数，渲染所有6个属性的一行摘要

### Step 2.1: 编写渲染函数测试

**文件**: `test/tui.test.js`

在文件末尾添加：

```javascript
describe("Attribute panel rendering - Summary view", () => {
  test("renderAttributeSummary should format all attributes", () => {
    const summary = [
      {
        id: "logic",
        name: "逻辑",
        currentLevel: 42,
        currentExp: 240,
        nextLevelExp: 156,
        expPercent: 153,
        nextMilestone: { level: 55, name: "质量守护者", pointsNeeded: 13 },
        progressBar: "[████████░░]",
        recentlyUnlocked: null
      }
    ];
    
    const { renderAttributeSummary } = require("../src/tui");
    const output = renderAttributeSummary(summary);
    
    assert.ok(output.includes("属性总览"));
    assert.ok(output.includes("逻辑 42"));
    assert.ok(output.includes("[████████░░]"));
    assert.ok(output.includes("240/156"));
    assert.ok(output.includes("质量守护者"));
  });
});
```

**运行测试**:
```bash
npm test -- test/tui.test.js
```

**预期结果**: 测试失败，因为 `renderAttributeSummary` 不存在。

**提交**:
```
git add test/tui.test.js
git commit -m "test: add renderAttributeSummary tests

Tests verify rendering of attribute summary view

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Step 2.2: 实现 renderAttributeSummary

**文件**: `src/tui.js`

在文件末尾的 `module.exports` 之前添加：

```javascript
function renderAttributeSummary(summary) {
  const lines = ["========== 属性总览 ==========", ""];
  
  for (const attr of summary) {
    let line = `${attr.name} ${attr.currentLevel} ${attr.progressBar}`;
    
    if (attr.nextMilestone) {
      line += ` ${attr.nextMilestone.level}`;
    } else {
      line += ` MAX`;
    }
    
    line += `    经验 ${attr.currentExp}/${attr.nextLevelExp} (${attr.expPercent}%)`;
    
    if (attr.recentlyUnlocked) {
      line += `    刚解锁: Lv.${attr.recentlyUnlocked.level} ${attr.recentlyUnlocked.name} ✓`;
    } else if (attr.nextMilestone) {
      line += `    下一里程碑: Lv.${attr.nextMilestone.level} ${attr.nextMilestone.name}`;
    }
    
    lines.push(line);
  }
  
  lines.push("");
  lines.push("> 输入 attr <属性名> 查看详情 (如: attr logic 或 attr 逻辑)");
  lines.push("> 输入 attr milestones 查看所有里程碑总览");
  
  return lines.join("\n");
}
```

在 `module.exports` 对象中添加：

```javascript
module.exports = {
  // ... existing exports
  renderAttributeSummary,  // 添加这一行
  // ... rest
};
```

**运行测试**:
```bash
npm test -- test/tui.test.js
```

**预期结果**: 测试通过。

**提交**:
```
git add src/tui.js
git commit -m "feat: implement renderAttributeSummary for attr command

Renders summary view showing:
- All 6 attributes in one screen
- Progress bars to next milestone
- Exp progress to next level
- Recently unlocked milestones marked with ✓

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: 详情视图渲染 (Detail View)

**目标**: 实现 `renderAttributeDetails` 函数，渲染单个属性的完整信息

### Step 3.1: 编写测试

**文件**: `test/tui.test.js`

添加测试：

```javascript
describe("Attribute panel rendering - Detail view", () => {
  test("renderAttributeDetails should format complete details", () => {
    const details = {
      id: "logic",
      name: "逻辑",
      currentLevel: 42,
      currentExp: 240,
      nextLevelExp: 156,
      expPercent: 153,
      effectiveValue: 42.0,
      baseValue: 42,
      breakthroughBonus: 0,
      unlockedMilestones: [
        {
          level: 25,
          name: "代码直觉觉醒",
          description: "Bug 风险额外 -5%",
          narrative: "你开始能预见代码中潜伏的问题。"
        }
      ],
      nextMilestone: {
        level: 55,
        name: "质量守护者",
        pointsNeeded: 13,
        expNeeded: 1170,
        description: "项目成功率额外 +8%",
        narrative: "质量不再是事后补救。"
      },
      futureMilestones: [
        { level: 70, name: "系统思维", description: "所有质量活动效率额外 +15%" }
      ]
    };
    
    const { renderAttributeDetails } = require("../src/tui");
    const output = renderAttributeDetails(details);
    
    assert.ok(output.includes("逻辑 详情"));
    assert.ok(output.includes("当前等级：42/100"));
    assert.ok(output.includes("【已解锁里程碑】"));
    assert.ok(output.includes("代码直觉觉醒"));
    assert.ok(output.includes("【下一里程碑】"));
    assert.ok(output.includes("质量守护者"));
    assert.ok(output.includes("还需：13 属性点"));
    assert.ok(output.includes("【未来里程碑】"));
    assert.ok(output.includes("系统思维"));
  });
});
```

**运行测试**:
```bash
npm test -- test/tui.test.js
```

**预期结果**: 测试失败。

**提交**:
```
git add test/tui.test.js
git commit -m "test: add renderAttributeDetails tests

Tests verify detailed attribute view rendering

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Step 3.2: 实现 renderAttributeDetails

**文件**: `src/tui.js`

在 `renderAttributeSummary` 后添加：

```javascript
function renderAttributeDetails(details) {
  const lines = [`========== ${details.name} 详情 ==========`, ""];
  
  // Basic info
  lines.push(`当前等级：${details.currentLevel}/100`);
  lines.push(`经验进度：${details.currentExp}/${details.nextLevelExp} (${details.expPercent}%) 到 Lv.${details.currentLevel + 1}`);
  lines.push(`有效属性：${details.effectiveValue.toFixed(1)} (基础 ${details.baseValue} + 突破 ${details.breakthroughBonus})`);
  lines.push("");
  
  // Unlocked milestones
  if (details.unlockedMilestones.length > 0) {
    lines.push("【已解锁里程碑】");
    for (const m of details.unlockedMilestones) {
      lines.push(`  ✓ Lv.${m.level} ${m.name}`);
      lines.push(`     ${m.description}`);
      lines.push(`     ${m.narrative}`);
      lines.push("");
    }
  }
  
  // Next milestone
  if (details.nextMilestone) {
    lines.push("【下一里程碑】");
    lines.push(`  Lv.${details.nextMilestone.level} ${details.nextMilestone.name} - ${details.nextMilestone.description}`);
    lines.push(`  还需：${details.nextMilestone.pointsNeeded} 属性点 (约 ${details.nextMilestone.expNeeded} 经验)`);
    lines.push(`  预计：${details.nextMilestone.narrative}`);
    lines.push("");
  }
  
  // Future milestones
  if (details.futureMilestones.length > 0) {
    lines.push("【未来里程碑】");
    for (const m of details.futureMilestones) {
      lines.push(`  Lv.${m.level} ${m.name} - ${m.description}`);
    }
    lines.push("");
  }
  
  lines.push("> 输入 attr 返回属性总览");
  
  return lines.join("\n");
}
```

在 `module.exports` 中添加：

```javascript
  renderAttributeDetails,  // 添加这一行
```

**运行测试**:
```bash
npm test -- test/tui.test.js
```

**预期结果**: 测试通过。

**提交**:
```
git add src/tui.js
git commit -m "feat: implement renderAttributeDetails

Renders detailed view showing:
- Current level and exp progress
- Unlocked milestones with full narrative
- Next milestone with distance calculation
- Future milestones preview

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: 里程碑总览渲染 (Milestone Overview)

**目标**: 实现 `renderMilestoneOverview` 函数

### Step 4.1: 编写测试

**文件**: `test/tui.test.js`

添加测试：

```javascript
describe("Attribute panel rendering - Milestone overview", () => {
  test("renderMilestoneOverview should format all milestones", () => {
    const overview = {
      logic: {
        currentLevel: 42,
        milestones: [
          { level: 25, unlocked: true, name: "代码直觉觉醒", description: "Bug 风险额外 -5%", pointsNeeded: 0 },
          { level: 55, unlocked: false, name: "质量守护者", description: "项目成功率额外 +8%", pointsNeeded: 13 }
        ]
      }
    };
    
    const { renderMilestoneOverview } = require("../src/tui");
    const output = renderMilestoneOverview(overview);
    
    assert.ok(output.includes("属性里程碑总览"));
    assert.ok(output.includes("逻辑 (42/100)"));
    assert.ok(output.includes("✓ Lv.25 代码直觉觉醒"));
    assert.ok(output.includes("⬜ Lv.55 质量守护者"));
    assert.ok(output.includes("(还需 13 点)"));
  });
});
```

**运行测试**:
```bash
npm test -- test/tui.test.js
```

**预期结果**: 测试失败。

**提交**:
```
git add test/tui.test.js
git commit -m "test: add renderMilestoneOverview tests

Tests verify milestone overview rendering

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Step 4.2: 实现 renderMilestoneOverview

**文件**: `src/tui.js`

在 `renderAttributeDetails` 后添加：

```javascript
function renderMilestoneOverview(overview) {
  const { ATTRIBUTE_IDS, ATTRIBUTE_NAMES } = require("./game");
  const lines = ["========== 属性里程碑总览 ==========", ""];
  
  for (const attrId of ATTRIBUTE_IDS) {
    const data = overview[attrId];
    if (!data) continue;
    
    lines.push(`${ATTRIBUTE_NAMES[attrId]} (${data.currentLevel}/100):`);
    
    for (const m of data.milestones) {
      const icon = m.unlocked ? "✓" : "⬜";
      let line = `  ${icon} Lv.${m.level} ${m.name} - ${m.description}`;
      
      if (!m.unlocked && m.pointsNeeded > 0) {
        line += ` (还需 ${m.pointsNeeded} 点)`;
      }
      
      lines.push(line);
    }
    
    lines.push("");
  }
  
  lines.push("> 输入 attr <属性名> 查看详细信息和当前收益");
  
  return lines.join("\n");
}
```

在 `module.exports` 中添加：

```javascript
  renderMilestoneOverview,  // 添加这一行
```

**运行测试**:
```bash
npm test -- test/tui.test.js
```

**预期结果**: 测试通过。

**提交**:
```
git add src/tui.js
git commit -m "feat: implement renderMilestoneOverview

Renders milestone roadmap for all attributes:
- All 30 milestones (6 attributes × 5 each)
- Unlock status with ✓/⬜ icons
- Points needed to reach each milestone

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: 命令集成

**目标**: 在 `processCommand` 中集成 `attr` 命令，支持3种视图

### Step 5.1: 编写集成测试

**文件**: `test/integration.test.js`

在文件末尾添加：

```javascript
describe("attr command integration", () => {
  test("attr without args should show summary", () => {
    const state = createNewState();
    state.attributes.logic = 42;
    state.attributeExp.logic = 240;
    
    const { processCommand } = require("../src/game");
    const result = processCommand(state, "attr");
    
    assert.strictEqual(result.messages.length, 1);
    assert.ok(result.messages[0].includes("属性总览"));
    assert.ok(result.messages[0].includes("逻辑 42"));
  });
  
  test("attr logic should show details", () => {
    const state = createNewState();
    state.attributes.logic = 42;
    state.unlockedMilestones = { logic: [25, 40] };
    
    const { processCommand } = require("../src/game");
    const result = processCommand(state, "attr logic");
    
    assert.strictEqual(result.messages.length, 1);
    assert.ok(result.messages[0].includes("逻辑 详情"));
    assert.ok(result.messages[0].includes("已解锁里程碑"));
  });
  
  test("attr 逻辑 should work with Chinese name", () => {
    const state = createNewState();
    state.attributes.logic = 42;
    
    const { processCommand } = require("../src/game");
    const result = processCommand(state, "attr 逻辑");
    
    assert.strictEqual(result.messages.length, 1);
    assert.ok(result.messages[0].includes("逻辑 详情"));
  });
  
  test("attr milestones should show overview", () => {
    const state = createNewState();
    state.attributes.logic = 42;
    
    const { processCommand } = require("../src/game");
    const result = processCommand(state, "attr milestones");
    
    assert.strictEqual(result.messages.length, 1);
    assert.ok(result.messages[0].includes("属性里程碑总览"));
    assert.ok(result.messages[0].includes("逻辑"));
  });
  
  test("attributes alias should work", () => {
    const state = createNewState();
    
    const { processCommand } = require("../src/game");
    const result = processCommand(state, "attributes");
    
    assert.strictEqual(result.messages.length, 1);
    assert.ok(result.messages[0].includes("属性总览"));
  });
});
```

**运行测试**:
```bash
npm test -- test/integration.test.js
```

**预期结果**: 测试失败，因为 `attr` 命令未实现。

**提交**:
```
git add test/integration.test.js
git commit -m "test: add attr command integration tests

Tests verify:
- attr shows summary view
- attr <name> shows detail view
- attr milestones shows overview
- Chinese attribute names work
- attributes alias works

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Step 5.2: 实现 attr 命令

**文件**: `src/game.js`

在 `processCommand` 函数的 switch 语句中，在 `case "cards":` 之后添加：

```javascript
    case "attr":
    case "attributes":
      messages.push(processAttrCommand(state, args));
      break;
```

在 `processCommand` 函数之前添加辅助函数：

```javascript
function processAttrCommand(state, args) {
  const { renderAttributeSummary, renderAttributeDetails, renderMilestoneOverview } = require("./tui");
  
  if (args.length === 0) {
    // Default: show summary
    const summary = getAttributeSummary(state);
    return renderAttributeSummary(summary);
  }
  
  const arg = args[0].toLowerCase();
  
  if (arg === "milestones") {
    // Show milestone overview
    const overview = getMilestoneOverview(state);
    return renderMilestoneOverview(overview);
  }
  
  // Try to match attribute by ID or Chinese name
  let attrId = null;
  
  if (ATTRIBUTE_IDS.includes(arg)) {
    attrId = arg;
  } else {
    // Try Chinese name
    for (const id of ATTRIBUTE_IDS) {
      if (ATTRIBUTE_NAMES[id] === args[0]) {
        attrId = id;
        break;
      }
    }
  }
  
  if (!attrId) {
    return `未知属性：${args[0]}。可用属性：logic (逻辑), focus (专注), learning (学习), communication (沟通), resilience (抗压), creativity (创造)。`;
  }
  
  // Show attribute details
  const details = getAttributeDetails(state, attrId);
  return renderAttributeDetails(details);
}
```

**运行测试**:
```bash
npm test -- test/integration.test.js
```

**预期结果**: 所有集成测试通过。

**运行所有测试**:
```bash
npm test
```

**预期结果**: 所有测试通过。

**提交**:
```
git add src/game.js
git commit -m "feat: implement attr command with 3 views

Commands:
- attr / attributes → summary view (all 6 attributes)
- attr <name> → detail view (single attribute)
- attr milestones → milestone overview (all 30 milestones)

Supports both English IDs and Chinese names for attribute selection.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5.3: 更新 help 文本

**文件**: `src/game.js`

找到 `helpText()` 函数（约5500行），在命令列表中添加：

```javascript
function helpText() {
  return `
《代码人生》命令列表

[资源与状态]
  status - 查看当前状态和资源
  attr / attributes - 查看属性总览
  attr <name> - 查看单个属性详情 (如: attr logic 或 attr 逻辑)
  attr milestones - 查看所有属性里程碑总览
  // ... existing commands
`.trim();
}
```

**手动测试**:
```bash
npm start
> help
```

确认 help 文本包含 attr 命令说明。

**提交**:
```
git add src/game.js
git commit -m "docs: add attr command to help text

Updated help command to include:
- attr command and its 3 usage modes
- Examples with both English and Chinese names

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## 验证清单

运行以下命令验证功能完整性：

```bash
# 1. 运行所有测试
npm test

# 2. 手动测试摘要视图
npm start
> attr

# 3. 手动测试详情视图（英文）
> attr logic

# 4. 手动测试详情视图（中文）
> attr 逻辑

# 5. 手动测试里程碑总览
> attr milestones

# 6. 测试 attributes 别名
> attributes

# 7. 测试错误处理
> attr invalid
```

**预期行为**:
- 所有测试通过
- 摘要视图显示6个属性，带进度条和下一里程碑
- 详情视图显示完整信息，包括已解锁、下一个、未来里程碑
- 里程碑总览显示所有30个里程碑
- 中英文属性名都能正确识别
- 错误输入显示友好提示

---

## 最终检查

**代码审查要点**:
1. 所有新函数都有对应测试
2. 测试覆盖正常路径和边界情况
3. 导出函数已添加到 module.exports
4. 中英文属性名都能正确识别
5. 进度条计算正确（当前等级 / 下一里程碑等级）
6. 经验需求计算正确（累加多个等级的升级成本）

**最终提交**:
```bash
git log --oneline -10
```

确认所有commits都按计划创建，commit message清晰描述改动内容。

---

**计划完成标志**: 所有测试通过，手动测试验证通过，代码审查通过。

**预计耗时**: 45-60分钟（每个任务8-12分钟）

**下一步**: 执行此计划，创建属性面板功能。
```
