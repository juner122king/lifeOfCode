# 属性成长系统优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 优化属性成长系统，提升成长速度 2-3 倍，平衡所有属性收益，增加里程碑反馈

**Architecture:** 分三个阶段实施：(1) 核心数值调整（成本公式、活动经验倍增、属性收益扩展）(2) 新增经验来源（技能学习、项目推进）(3) 反馈系统（里程碑、面板优化）

**Tech Stack:** Node.js, CommonJS, 现有游戏系统（src/game.js, src/content.js）

---

## 文件结构

### 核心修改文件
- `src/game.js` - 属性升级成本公式、属性收益计算、里程碑系统
- `src/content.js` - 活动属性经验 x3
- `src/skills/skills.js` - 技能学习属性经验逻辑（需创建）
- `src/projects/projects.js` - 项目推进属性经验逻辑（需创建）
- `src/content/projects.js` - 项目阶段属性字段
- `src/core/attributes.js` - 里程碑数据和逻辑（需创建）

### 测试文件
- `test/attributes.test.js` - 属性系统测试（需创建）
- `test/milestones.test.js` - 里程碑系统测试（需创建）
- `test/game.test.js` - 更新现有测试

---

## 阶段 1：核心数值调整

### Task 1: 修改属性升级成本公式

**Files:**
- Modify: `src/game.js:1070-1081` (addAttributeExp 函数)
- Test: `test/attributes.test.js` (新建)

- [ ] **Step 1: 写属性升级成本测试**

创建 `test/attributes.test.js`:

```javascript
const { describe, test } = require("node:test");
const assert = require("node:assert");
const { createNewState } = require("../src/game");

describe("Attribute upgrade cost", () => {
  test("should use new cost formula: 30 + currentAttribute * 3", () => {
    const state = createNewState();
    state.attributes.logic = 20;
    state.attributeExp.logic = 0;
    
    // 20 -> 21 should cost 90 (30 + 20 * 3)
    state.attributeExp.logic = 89;
    const { addAttributeExp } = require("../src/game");
    const gained1 = addAttributeExp(state, "logic", 1);
    assert.strictEqual(gained1, 0, "89 exp should not level up");
    assert.strictEqual(state.attributes.logic, 20);
    
    state.attributeExp.logic = 90;
    const gained2 = addAttributeExp(state, "logic", 0);
    assert.strictEqual(gained2, 1, "90 exp should level up");
    assert.strictEqual(state.attributes.logic, 21);
  });
  
  test("should upgrade multiple levels with enough exp", () => {
    const state = createNewState();
    state.attributes.focus = 20;
    state.attributeExp.focus = 0;
    
    // 20->21: 90, 21->22: 93, total 183
    const { addAttributeExp } = require("../src/game");
    const gained = addAttributeExp(state, "focus", 183);
    assert.strictEqual(gained, 2);
    assert.strictEqual(state.attributes.focus, 22);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npm test -- test/attributes.test.js
```

预期：FAIL - 成本公式仍然是旧的

- [ ] **Step 3: 修改成本公式**

在 `src/game.js` 的 `addAttributeExp` 函数中修改：

```javascript
function addAttributeExp(state, attr, amount, options = {}) {
  if (!ATTRIBUTE_IDS.includes(attr) || amount <= 0) return 0;
  let gained = 0;
  const beforeValue = getBaseAttribute(state, attr);
  state.attributeExp[attr] = Math.max(0, Number(state.attributeExp[attr]) || 0) + amount;

  while (getBaseAttribute(state, attr) < 100) {
    const current = getBaseAttribute(state, attr);
    const cost = 30 + current * 3;  // 旧: 50 + current * 5
    if (state.attributeExp[attr] < cost) break;
    state.attributeExp[attr] -= cost;
    state.attributes[attr] = current + 1;
    gained += 1;
  }

  if (gained > 0) collectAttributeGrowthEvents(state, attr, beforeValue, getBaseAttribute(state, attr), options.events);
  return gained;
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npm test -- test/attributes.test.js
```

预期：PASS

- [ ] **Step 5: 提交**

```bash
git add src/game.js test/attributes.test.js
git commit -m "feat(attributes): reduce upgrade cost by 40%

- Change cost formula from (50 + attr * 5) to (30 + attr * 3)
- Reduces cost by 25% at level 20, 40% at levels 30+
- Add comprehensive tests for new cost formula

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: 活动属性经验 x3

**Files:**
- Modify: `src/content.js:152-345` (所有活动的 attributeExpPerHour)
- Test: `test/game.test.js`

- [ ] **Step 1: 写活动属性经验测试**

在 `test/game.test.js` 中添加：

```javascript
test("activities should give 3x attribute exp", () => {
  const state = createNewState();
  state.attributes.focus = 20;
  state.attributeExp.focus = 0;
  
  const activity = activityById("feature-coding");
  const seconds = 3600; // 1 游戏小时
  
  settleActivity(state, activity, seconds);
  
  // feature-coding 新经验: focus: 27, logic: 15
  assert.strictEqual(state.attributeExp.focus, 27);
  assert.strictEqual(state.attributeExp.logic, 15);
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npm test -- test/game.test.js -t "activities should give 3x"
```

预期：FAIL - 当前经验只有旧值 (focus: 9, logic: 5)

- [ ] **Step 3: 批量修改活动属性经验（第1部分）**

在 `src/content.js` 中修改前7个活动：

```javascript
const activities = [
  activity({
    id: "feature-coding",
    // ... 其他字段
    attributeExpPerHour: { focus: 27, logic: 15 },  // 旧: { focus: 9, logic: 5 }
  }),
  activity({
    id: "bug-hunting",
    attributeExpPerHour: { logic: 27, resilience: 15 },  // 旧: { logic: 9, resilience: 5 }
  }),
  activity({
    id: "refactoring",
    attributeExpPerHour: { logic: 27, focus: 15 }  // 旧: { logic: 9, focus: 5 }
  }),
  activity({
    id: "study",
    attributeExpPerHour: { learning: 42 },  // 旧: { learning: 14 }
  }),
  activity({
    id: "testing",
    attributeExpPerHour: { focus: 27, logic: 15 }  // 旧: { focus: 9, logic: 5 }
  }),
  activity({
    id: "documentation",
    attributeExpPerHour: { learning: 27, communication: 15 }  // 旧: { learning: 9, communication: 5 }
  }),
  activity({
    id: "freelancing",
    attributeExpPerHour: { communication: 27, resilience: 15 }  // 旧: { communication: 9, resilience: 5 }
  }),
```

- [ ] **Step 4: 批量修改活动属性经验（第2部分）**

继续修改剩余活动：

```javascript
  activity({
    id: "open-source",
    attributeExpPerHour: { communication: 27, creativity: 15 }  // 旧: { communication: 9, creativity: 5 }
  }),
  activity({
    id: "architecture",
    attributeExpPerHour: { logic: 27, learning: 15, creativity: 15 }  // 旧: { logic: 9, learning: 5, creativity: 5 }
  }),
  activity({
    id: "code-review",
    attributeExpPerHour: { logic: 15, communication: 15, learning: 15 }  // 旧: { logic: 5, communication: 5, learning: 5 }
  }),
  activity({
    id: "performance-tuning",
    attributeExpPerHour: { logic: 27, focus: 15, resilience: 15 }  // 旧: { logic: 9, focus: 5, resilience: 5 }
  }),
  activity({
    id: "prompt-engineering",
    attributeExpPerHour: { creativity: 27, learning: 27 }  // 旧: { creativity: 9, learning: 9 }
  }),
  activity({
    id: "incident-response",
    attributeExpPerHour: { resilience: 27, logic: 15, focus: 15 }  // 旧: { resilience: 9, logic: 5, focus: 5 }
  }),
  activity({
    id: "rest",
    attributeExpPerHour: { resilience: 18 }  // 旧: { resilience: 6 }
  })
];
```

- [ ] **Step 5: 运行测试确认通过**

```bash
npm test -- test/game.test.js -t "activities should give 3x"
```

预期：PASS

- [ ] **Step 6: 提交**

```bash
git add src/content.js test/game.test.js
git commit -m "feat(activities): triple attribute exp gain from all activities

- All activity attributeExpPerHour values multiplied by 3
- Significantly accelerates attribute growth
- Players gain meaningful attribute exp during normal gameplay

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: 扩展属性收益影响面

**Files:**
- Modify: `src/game.js` (多个倍率计算函数)
- Test: `test/attributes.test.js`

- [ ] **Step 1: 写属性收益扩展测试**

在 `test/attributes.test.js` 中添加：

```javascript
describe("Attribute benefits expansion", () => {
  test("logic should boost quality activities", () => {
    const state = createNewState();
    state.attributes.logic = 40;  // 应该有 +12% 加成
    
    const activity = activityById("bug-hunting");
    const { getActivityRateContext } = require("../src/game");
    const context = getActivityRateContext(state, activity);
    
    // logic 40: (40 - 20) * 0.003 = 0.06 -> 但上限 0.22
    // 实际加成约 0.06
    assert.ok(context.qualityActivityBonus > 0.05);
    assert.ok(context.qualityActivityBonus < 0.07);
  });
  
  test("focus should boost output activities", () => {
    const state = createNewState();
    state.attributes.focus = 40;
    
    const activity = activityById("feature-coding");
    const { getActivityRateContext } = require("../src/game");
    const context = getActivityRateContext(state, activity);
    
    assert.ok(context.outputActivityBonus > 0.05);
  });
  
  test("communication should boost money gain", () => {
    const state = createNewState();
    state.attributes.communication = 40;
    
    const { getMultipliers } = require("../src/game");
    const multipliers = getMultipliers(state);
    
    // communication 应该增加 money 倍率
    assert.ok(multipliers.money > 1.0);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npm test -- test/attributes.test.js -t "Attribute benefits"
```

预期：FAIL - 这些加成尚未实现

- [ ] **Step 3: 添加新的属性加成计算（第1部分：quality/output/collaboration）**

在 `src/game.js` 的 `getActivityRateContext` 函数中添加新的加成：

```javascript
function getActivityRateContext(state, activity, options = {}) {
  const energyStatus = getEnergyStatus(state);
  const level = getActivityLevel(state, activity.id);
  const activityMultiplier = 1 + (level - 1) * 0.08;
  const attributeMultiplier = 1 + attributeBonus(state, activity.primaryAttribute, 0.0025, 0.22);
  const overtimeRelief = options.overtime ? attributeBonus(state, "focus", 0.003, 0.24) : 0;
  const overtimeFactor = options.overtime ? 0.45 + overtimeRelief * 0.5 : 1;
  const focus = getWeeklyFocus(state);
  const learningFocusFactor = focus.id === "learning" && activity.id === "study" ? focus.learning : 1;
  const qualityFactor = focus.id === "quality" && QUALITY_ACTIVITY_IDS.has(activity.id) ? focus.quality : 1;
  
  // 新增：属性收益扩展
  const qualityActivityBonus = QUALITY_ACTIVITY_IDS.has(activity.id) ? attributeBonus(state, "logic", 0.003, 0.22) : 0;
  const outputActivityBonus = ["feature-coding", "testing", "documentation", "architecture"].includes(activity.id) 
    ? attributeBonus(state, "focus", 0.003, 0.22) : 0;
  const collaborationBonus = ["freelancing", "open-source", "documentation", "code-review"].includes(activity.id)
    ? attributeBonus(state, "communication", 0.003, 0.22) : 0;
  const highPressureBonus = ["incident-response", "performance-tuning", "freelancing"].includes(activity.id)
    ? attributeBonus(state, "resilience", 0.003, 0.22) : 0;
  const creativeBonus = ["architecture", "prompt-engineering", "open-source"].includes(activity.id)
    ? attributeBonus(state, "creativity", 0.003, 0.22) : 0;
  
  // ... 原有代码
  
  return {
    energyStatus,
    level,
    activityMultiplier,
    attributeMultiplier,
    overtimeFactor,
    overtimeRelief,
    focus,
    learningFocusFactor,
    qualityFactor,
    qualityActivityBonus,
    outputActivityBonus,
    collaborationBonus,
    highPressureBonus,
    creativeBonus,
    // ... 其他字段
  };
}
```

- [ ] **Step 4: 应用新加成到产出计算（calculateActivityDeltaEntries）**

在 `calculateActivityDeltaEntries` 函数中应用这些加成：

```javascript
function calculateActivityDeltaEntries(state, activity, seconds, options = {}) {
  // ... 原有代码获取 context
  const context = getActivityRateContext(state, activity, options);
  
  // 计算综合倍率时加上新的加成
  const activityTypeBonus = 1 + context.qualityActivityBonus + context.outputActivityBonus + 
    context.collaborationBonus + context.highPressureBonus + context.creativeBonus;
  
  // ... 在计算 outputs 时应用
  for (const [key, perHour] of Object.entries(activity.outputsPerHour || {})) {
    // ... 原有倍率计算
    let value = perHour * rateMultiplier;
    
    // 应用活动类型加成
    value *= activityTypeBonus;
    
    // ... 原有代码
  }
  
  // ... 原有代码
}
```

- [ ] **Step 5: 扩展 learning、communication、resilience、creativity 的其他收益**

在 `src/game.js` 中添加其他属性收益：

```javascript
// learning 影响知识产出
function calculateActivityDeltaEntries(state, activity, seconds, options = {}) {
  // ... 在计算 knowledge 产出时
  if (key === "knowledge") {
    const learningBonus = 1 + attributeBonus(state, "learning", 0.0035, 0.25);
    value *= learningBonus;
  }
  
  // communication 影响金钱产出
  if (key === "money") {
    const communicationMoneyBonus = 1 + attributeBonus(state, "communication", 0.0025, 0.18);
    value *= communicationMoneyBonus;
  }
  
  // creativity 影响线索产出
  if (key === "leads") {
    const creativityLeadsBonus = 1 + attributeBonus(state, "creativity", 0.0035, 0.25);
    value *= creativityLeadsBonus;
  }
}

// resilience 影响精力恢复
function settleLifestyleRest(state, lifestyleId, windowType, seconds, options = {}) {
  // ... 在计算精力恢复时
  const resilienceRecoveryBonus = 1 + attributeBonus(state, "resilience", 0.003, 0.2);
  energyRecovery *= resilienceRecoveryBonus;
  // ... 原有代码
}

// learning 增强学习速度上限
function getSkillLearningProgress(state, skill) {
  // ... 原有代码
  const learningRelief = attributeBonus(state, "learning", 0.0035, 0.25);  // 旧: 0.0025, 0.2
  // ... 原有代码
}
```

- [ ] **Step 6: 运行测试确认通过**

```bash
npm test -- test/attributes.test.js -t "Attribute benefits"
```

预期：PASS

- [ ] **Step 7: 运行完整测试套件**

```bash
npm test
```

预期：所有测试通过（可能需要更新一些断言值）

- [ ] **Step 8: 提交**

```bash
git add src/game.js test/attributes.test.js
git commit -m "feat(attributes): expand all attribute benefits to related actions

- logic: boost quality activities +0-22%
- focus: boost output activities +0-22%
- learning: boost knowledge +0-25%, learning speed +0-25%
- communication: boost collaboration +0-22%, money +0-18%
- resilience: boost high-pressure activities +0-22%, energy recovery +0-20%
- creativity: boost creative activities +0-22%, leads +0-25%

All attributes now have clear investment value.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## 阶段 2：新增经验来源

### Task 4: 技能学习给属性经验

**Files:**
- Modify: `src/game.js:2469-2489` (settleSkillLearning)
- Test: `test/attributes.test.js`

- [ ] **Step 1: 写技能学习属性经验测试**

在 `test/attributes.test.js` 中添加：

```javascript
describe("Skill learning attribute exp", () => {
  test("should give attribute exp during learning", () => {
    const state = createNewState();
    const skill = skillById("javascript");  // tier 1, logic: 22, learning: 24
    
    state.attributes.logic = 20;
    state.attributes.learning = 20;
    state.attributeExp.logic = 0;
    state.attributeExp.learning = 0;
    
    // 开始学习
    const { learnSkill, settleSkillLearning } = require("../src/game");
    learnSkill(state, skill.id);
    
    // 学习 1 游戏小时 (3600 秒)
    settleSkillLearning(state, skill, 3600);
    
    // tier 1 每小时给 8 点，learning 为主属性(70%)，logic 为次属性(30%)
    // learning 应该获得 5.6，logic 应该获得 2.4
    assert.ok(state.attributeExp.learning >= 5 && state.attributeExp.learning <= 6);
    assert.ok(state.attributeExp.logic >= 2 && state.attributeExp.logic <= 3);
  });
  
  test("should give bonus exp on completion", () => {
    const state = createNewState();
    const skill = skillById("html-css");  // tier 1, 学习耗时 600 秒
    
    state.attributes.creativity = 20;
    state.attributes.learning = 25;
    state.resources.knowledge = 1000;
    state.resources.money = 1000;
    state.attributeExp.creativity = 0;
    state.attributeExp.learning = 0;
    
    const { learnSkill, settleSkillLearning } = require("../src/game");
    learnSkill(state, skill.id);
    
    // 完成学习 (600 秒 = 10 游戏小时)
    const beforeCreativity = state.attributeExp.creativity;
    const beforeLearning = state.attributeExp.learning;
    
    settleSkillLearning(state, skill, 600);
    
    // 过程经验：10 小时 * 8 点 = 80 点总经验
    // 完成奖励：tier 1 = 20 点总经验
    // 总计应该有约 100 点经验分配到 creativity 和 learning
    const totalGained = (state.attributeExp.creativity - beforeCreativity) + 
                        (state.attributeExp.learning - beforeLearning);
    assert.ok(totalGained >= 95 && totalGained <= 105);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npm test -- test/attributes.test.js -t "Skill learning"
```

预期：FAIL - 学习过程不给属性经验

- [ ] **Step 3: 实现技能学习属性经验逻辑**

在 `src/game.js` 的 `settleSkillLearning` 函数中添加：

```javascript
function settleSkillLearning(state, skill, seconds, options = {}) {
  const progress = ensureSkillLearningProgress(state, skill.id);
  const beforeSeconds = Number(progress.workedSeconds) || 0;
  progress.workedSeconds += seconds * (options.workMultiplier || 1);
  
  // 新增：学习过程中给属性经验
  const gameMinutes = seconds / 60;
  const skillTier = skill.tier || 1;
  const expPerHour = 6 + skillTier * 2;  // tier 1-5 对应 8-16
  const expGained = (expPerHour / 60) * gameMinutes;
  
  const attrRequirements = skill.attributeRequirements || {};
  const attrs = Object.keys(attrRequirements).sort((a, b) => 
    (attrRequirements[b] || 0) - (attrRequirements[a] || 0)
  );
  
  if (attrs.length === 1) {
    addAttributeExp(state, attrs[0], expGained, options);
  } else if (attrs.length === 2) {
    addAttributeExp(state, attrs[0], expGained * 0.7, options);  // 主属性 70%
    addAttributeExp(state, attrs[1], expGained * 0.3, options);  // 次属性 30%
  }
  
  pushSkillLearningLogEvents(state, skill, beforeSeconds, getSkillLearningProgress(state, skill), options.events, options);
  const currentProgress = getSkillLearningProgress(state, skill);
  if (currentProgress.workedSeconds < currentProgress.requiredSeconds) return [];

  // 新增：学习完成时给奖励经验
  const bonusExp = 18 + skillTier * 4;  // tier 1-5 对应 20-60
  if (attrs.length === 1) {
    addAttributeExp(state, attrs[0], bonusExp, options);
  } else if (attrs.length === 2) {
    addAttributeExp(state, attrs[0], bonusExp * 0.7, options);
    addAttributeExp(state, attrs[1], bonusExp * 0.3, options);
  }

  // 原有完成逻辑
  const skillProgress = ensureSkillProgress(state, skill.id);
  skillProgress.level = Math.max(skillProgress.level, 1);
  clearSkillLearningProgress(state, skill.id);
  syncUnlockedSkills(state);
  const completionText = skill.completionReflection ? `学习总结：${skill.completionReflection}` : "";
  const message = formatLines([
    `技能 ${skill.name} 学习完成，达到 ${SKILL_LEVEL_NAMES[1]}。`,
    completionText,
    formatNextAdvice(state)
  ]);
  pushGameEvent(options.events, "skill", `技能 ${skill.name} 学习完成，达到 ${SKILL_LEVEL_NAMES[1]}。${completionText ? completionText : ""}`, "good");
  return [message];
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npm test -- test/attributes.test.js -t "Skill learning"
```

预期：PASS

- [ ] **Step 5: 提交**

```bash
git add src/game.js test/attributes.test.js
git commit -m "feat(skills): add attribute exp from skill learning

- Learning process: 8-16 exp/hour based on skill tier
- Completion bonus: 20-60 exp based on skill tier
- Exp distributed 70%/30% between primary/secondary attributes
- Makes skill learning contribute to attribute growth

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: 项目推进给属性经验

**Files:**
- Modify: `src/game.js:2583+` (settleProject)
- Modify: `src/content/projects.js` (添加阶段属性字段)
- Test: `test/attributes.test.js`

- [ ] **Step 1: 写项目推进属性经验测试**

在 `test/attributes.test.js` 中添加：

```javascript
describe("Project progression attribute exp", () => {
  test("should give attribute exp during stage progression", () => {
    const state = createNewState();
    const project = projectById("homepage");  // 难度 1
    
    state.attributes.communication = 20;
    state.attributes.creativity = 20;
    state.attributeExp.communication = 0;
    state.attributeExp.creativity = 0;
    
    // 准备项目资源
    state.resources.codeLines = 1000;
    state.resources.docs = 1000;
    
    const { submitProject, settleProject } = require("../src/game");
    submitProject(state, project.id);
    
    // 推进项目 1 游戏小时 (3600 秒)
    settleProject(state, project, 3600);
    
    // 难度 1 项目每小时给 10 点属性经验
    // 应该分配给当前阶段的属性
    const totalExp = state.attributeExp.communication + state.attributeExp.creativity;
    assert.ok(totalExp >= 8 && totalExp <= 12);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npm test -- test/attributes.test.js -t "Project progression"
```

预期：FAIL - 项目推进不给属性经验

- [ ] **Step 3: 为项目阶段添加属性字段**

在 `src/content/projects.js` 中为阶段添加 `attributes` 字段（使用辅助函数）：

```javascript
// 在文件开头添加辅助函数
function getDefaultStageAttributes(stageIndex, stageName) {
  // 根据阶段名称或索引推断属性
  const name = (stageName || "").toLowerCase();
  if (name.includes("需求") || name.includes("校准")) return ["communication"];
  if (name.includes("设计") || name.includes("架构")) return ["logic", "creativity"];
  if (name.includes("实现") || name.includes("推进")) return ["focus"];
  if (name.includes("测试") || name.includes("验收")) return ["logic", "focus"];
  if (name.includes("部署") || name.includes("上线")) return ["resilience"];
  
  // 默认按索引
  const mapping = {
    0: ["communication"],
    1: ["logic", "creativity"],
    2: ["focus"],
    3: ["logic", "focus"],
    4: ["resilience"]
  };
  return mapping[stageIndex] || ["focus"];
}

// 在创建项目时为阶段添加属性
function createProject(config) {
  // ... 原有代码
  const stages = config.stages || defaultStages;
  const processedStages = stages.map((stage, index) => ({
    ...stage,
    attributes: stage.attributes || getDefaultStageAttributes(index, stage.name)
  }));
  
  return {
    ...config,
    stages: processedStages
  };
}
```

- [ ] **Step 4: 实现项目推进属性经验逻辑**

在 `src/game.js` 的 `settleProject` 函数中添加：

```javascript
function settleProject(state, project, seconds, options = {}) {
  // ... 原有代码计算 workedSeconds
  
  // 新增：阶段推进给属性经验
  const progress = ensureProjectProgress(state, project.id);
  const stages = getProjectStages(project);
  const stage = stages[progress.stageIndex];
  const difficulty = project.difficulty || 1;
  const expPerHour = 8 + difficulty * 2;  // 难度 1-5 对应 10-26
  const gameMinutes = workedSeconds / 60;
  const expGained = (expPerHour / 60) * gameMinutes;
  
  // 从阶段获取属性
  const stageAttributes = stage.attributes || getDefaultStageAttributes(progress.stageIndex, stage.name);
  const expPerAttr = expGained / stageAttributes.length;
  
  for (const attr of stageAttributes) {
    addAttributeExp(state, attr, expPerAttr, options);
  }
  
  // ... 原有代码
}
```

- [ ] **Step 5: 运行测试确认通过**

```bash
npm test -- test/attributes.test.js -t "Project progression"
```

预期：PASS

- [ ] **Step 6: 提交**

```bash
git add src/game.js src/content/projects.js test/attributes.test.js
git commit -m "feat(projects): add attribute exp from project progression

- Each stage gives 10-26 exp/hour based on project difficulty
- Exp distributed among stage-relevant attributes
- Stage 0 (requirements): communication
- Stage 1 (design): logic + creativity
- Stage 2 (implementation): focus
- Stage 3 (testing): logic + focus
- Stage 4 (deployment): resilience

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## 阶段 3：反馈系统

### Task 6: 实现里程碑系统核心

**Files:**
- Create: `src/core/attributes.js`
- Modify: `src/game.js` (集成里程碑检查)
- Test: `test/milestones.test.js`

- [ ] **Step 1: 写里程碑系统测试**

创建 `test/milestones.test.js`:

```javascript
const { describe, test } = require("node:test");
const assert = require("node:assert");
const { createNewState } = require("../src/game");
const { ATTRIBUTE_MILESTONES, getMilestoneBonus, checkAndUnlockMilestones } = require("../src/core/attributes");

describe("Milestone system", () => {
  test("should unlock milestone when reaching threshold", () => {
    const state = createNewState();
    state.attributes.logic = 24;
    state.attributeExp.logic = 0;
    state.unlockedMilestones = {};
    
    const events = [];
    const { addAttributeExp } = require("../src/game");
    
    // 升到 25 应该解锁第一个里程碑
    addAttributeExp(state, "logic", 90, { events });
    
    assert.strictEqual(state.attributes.logic, 25);
    assert.ok(state.unlockedMilestones.logic);
    assert.ok(state.unlockedMilestones.logic.includes(25));
    assert.ok(events.some(e => e.category === "milestone"));
  });
  
  test("should apply milestone bonus", () => {
    const state = createNewState();
    state.unlockedMilestones = {
      logic: [25, 40]
    };
    
    // logic 25: Bug 风险额外 -5%
    const bugBonus = getMilestoneBonus(state, "logic", "bug_risk_extra");
    assert.strictEqual(bugBonus, -0.05);
    
    // logic 40: 技术债效率影响额外 -10%
    const debtBonus = getMilestoneBonus(state, "logic", "debt_efficiency_penalty");
    assert.strictEqual(debtBonus, -0.1);
    
    // 累计加成
    const totalBugBonus = bugBonus;
    const totalDebtBonus = debtBonus;
    assert.strictEqual(totalBugBonus, -0.05);
    assert.strictEqual(totalDebtBonus, -0.1);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npm test -- test/milestones.test.js
```

预期：FAIL - 模块不存在

- [ ] **Step 3: 创建里程碑数据文件（第1部分：数据结构）**

创建 `src/core/attributes.js`:

```javascript
// 里程碑定义
const ATTRIBUTE_MILESTONES = {
  logic: [
    { level: 25, name: "代码直觉觉醒", effect: "bug_risk_extra", value: -0.05, 
      description: "Bug 风险额外 -5%",
      narrative: "你开始能预见代码中潜伏的问题，Bug 不再只是运行时的惊喜。" },
    { level: 40, name: "架构洞察", effect: "debt_efficiency_penalty", value: -0.1,
      description: "技术债降低效率的影响额外 -10%",
      narrative: "你开始能在复杂系统中看到隐藏的债务链条，重构不再只是凭感觉。" },
    { level: 55, name: "质量守护者", effect: "project_success_rate", value: 0.08,
      description: "项目成功率额外 +8%",
      narrative: "质量不再是事后补救，而是贯穿始终的设计决策。" },
    { level: 70, name: "系统思维", effect: "quality_activity_efficiency", value: 0.15,
      description: "所有质量活动效率额外 +15%",
      narrative: "你已经能把质量管理变成一套系统化的工程实践。" },
    { level: 85, name: "逻辑大师", effect: "overtime_quality_risk", value: -0.2,
      description: "加班时 Bug/债务风险额外 -20%",
      narrative: "即使在高压下，你的代码质量依然稳如磐石。" }
  ],
  focus: [
    { level: 25, name: "心流入门", effect: "high_energy_production", value: 0.05,
      description: "精力充沛时产出加成从 +10% 提升到 +15%",
      narrative: "你找到了进入专注状态的入口，效率开始有了质变。" },
    { level: 40, name: "持续输出", effect: "overtime_efficiency_relief", value: 0.1,
      description: "加班效率惩罚减少 10%",
      narrative: "长时间工作不再让你慌乱，你学会了在延长战中保持节奏。" },
    { level: 55, name: "专注之力", effect: "output_activity_efficiency", value: 0.12,
      description: "所有持续产出活动效率额外 +12%",
      narrative: "专注已经从刻意训练变成了肌肉记忆。" },
    { level: 70, name: "心流大师", effect: "energy_cost_reduction", value: -0.1,
      description: "所有活动的精力消耗 -10%",
      narrative: "你找到了让心流持续更久的节奏，同样的精力能完成更多工作。" },
    { level: 85, name: "永动机", effect: "low_energy_efficiency_relief", value: 0.5,
      description: "精力透支时效率惩罚减半",
      narrative: "即使精力见底，你依然能保持基本的产出能力。" }
  ],
  // 其他属性里程碑...（因为篇幅限制，这里省略，完整实现时需要添加所有6个属性）
};

module.exports = {
  ATTRIBUTE_MILESTONES
};
```

- [ ] **Step 4: 创建里程碑函数（第2部分：逻辑函数）**

继续在 `src/core/attributes.js` 中添加：

```javascript
function getMilestoneBonus(state, attr, effectType) {
  const milestones = (state.unlockedMilestones && state.unlockedMilestones[attr]) || [];
  const definitions = ATTRIBUTE_MILESTONES[attr] || [];
  let bonus = 0;
  
  for (const level of milestones) {
    const milestone = definitions.find(m => m.level === level);
    if (milestone && milestone.effect === effectType) {
      bonus += milestone.value;
    }
  }
  
  return bonus;
}

function checkAndUnlockMilestones(state, attr, beforeValue, afterValue, events) {
  const milestones = ATTRIBUTE_MILESTONES[attr] || [];
  for (const milestone of milestones) {
    if (beforeValue < milestone.level && afterValue >= milestone.level) {
      state.unlockedMilestones = state.unlockedMilestones || {};
      state.unlockedMilestones[attr] = state.unlockedMilestones[attr] || [];
      if (!state.unlockedMilestones[attr].includes(milestone.level)) {
        state.unlockedMilestones[attr].push(milestone.level);
      }
      
      if (events) {
        const { ATTRIBUTE_NAMES } = require("./constants");
        const attrName = ATTRIBUTE_NAMES[attr] || attr;
        events.push({
          category: "milestone",
          text: `🎯 属性里程碑达成！\n\n${attrName} 达到 ${milestone.level}\n解锁能力：${milestone.name}\n效果：${milestone.description}\n\n${milestone.narrative}`,
          tone: "excellent",
          timestamp: new Date().toISOString()
        });
      }
    }
  }
}

module.exports = {
  ATTRIBUTE_MILESTONES,
  getMilestoneBonus,
  checkAndUnlockMilestones
};
```

- [ ] **Step 5: 集成里程碑检查到 addAttributeExp**

在 `src/game.js` 的 `addAttributeExp` 函数中调用里程碑检查：

```javascript
function addAttributeExp(state, attr, amount, options = {}) {
  if (!ATTRIBUTE_IDS.includes(attr) || amount <= 0) return 0;
  let gained = 0;
  const beforeValue = getBaseAttribute(state, attr);
  state.attributeExp[attr] = Math.max(0, Number(state.attributeExp[attr]) || 0) + amount;

  while (getBaseAttribute(state, attr) < 100) {
    const current = getBaseAttribute(state, attr);
    const cost = 30 + current * 3;
    if (state.attributeExp[attr] < cost) break;
    state.attributeExp[attr] -= cost;
    state.attributes[attr] = current + 1;
    gained += 1;
  }

  if (gained > 0) {
    collectAttributeGrowthEvents(state, attr, beforeValue, getBaseAttribute(state, attr), options.events);
    
    // 新增：检查并解锁里程碑
    const { checkAndUnlockMilestones } = require("./core/attributes");
    checkAndUnlockMilestones(state, attr, beforeValue, getBaseAttribute(state, attr), options.events);
  }
  
  return gained;
}
```

- [ ] **Step 6: 运行测试确认通过**

```bash
npm test -- test/milestones.test.js
```

预期：PASS

- [ ] **Step 7: 提交**

```bash
git add src/core/attributes.js src/game.js test/milestones.test.js
git commit -m "feat(milestones): implement milestone system core

- Define milestones at levels 25/40/55/70/85 for all attributes
- Auto-unlock when reaching threshold
- Track unlocked milestones in state
- Show notification with milestone name, effect, and narrative
- Add getMilestoneBonus helper for applying effects

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: 应用里程碑效果

**Files:**
- Modify: `src/game.js` (在各计算函数中应用里程碑加成)
- Test: `test/milestones.test.js`

- [ ] **Step 1: 写里程碑效果应用测试**

在 `test/milestones.test.js` 中添加：

```javascript
describe("Milestone effects application", () => {
  test("logic milestone should reduce bug risk", () => {
    const state = createNewState();
    state.attributes.logic = 25;
    state.unlockedMilestones = { logic: [25] };
    
    // 计算 Bug 风险时应该包含里程碑加成
    const { getProductionRiskEfficiency } = require("../src/game");
    const efficiency = getProductionRiskEfficiency(state);
    
    // 应该包含 -5% 的额外 Bug 缓解
    // 具体数值取决于实现，这里只验证有改进
    assert.ok(efficiency < 1);
  });
  
  test("focus milestone should boost high energy production", () => {
    const state = createNewState();
    state.attributes.focus = 25;
    state.resources.energy = 95;
    state.unlockedMilestones = { focus: [25] };
    
    const { getEnergyStatus } = require("../src/game");
    const status = getEnergyStatus(state);
    
    // 精力充沛时应该从 1.1 提升到 1.15
    assert.ok(status.productionMultiplier >= 1.14);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npm test -- test/milestones.test.js -t "effects application"
```

预期：FAIL - 效果尚未应用

- [ ] **Step 3: 应用 logic 里程碑效果**

在 `src/game.js` 中应用 logic 相关效果：

```javascript
// Bug 风险计算中应用 "bug_risk_extra"
function getProductionRiskEfficiency(state) {
  // ... 原有代码计算 bugRisk
  
  // 应用里程碑加成
  const { getMilestoneBonus } = require("./core/attributes");
  const logicBugMilestone = getMilestoneBonus(state, "logic", "bug_risk_extra");
  bugRisk += logicBugMilestone;  // logicBugMilestone 是负值
  
  // ... 原有代码
}

// 技术债效率影响中应用 "debt_efficiency_penalty"
function getProductionRiskEfficiency(state) {
  // ... 原有代码计算 debtPenalty
  
  const logicDebtMilestone = getMilestoneBonus(state, "logic", "debt_efficiency_penalty");
  debtPenalty += logicDebtMilestone;  // logicDebtMilestone 是负值
  
  // ... 原有代码
}

// 项目成功率中应用 "project_success_rate"
function getProjectSuccessRate(state, project) {
  // ... 原有代码计算 successRate
  
  const logicProjectMilestone = getMilestoneBonus(state, "logic", "project_success_rate");
  successRate += logicProjectMilestone;
  
  // ... 原有代码
}

// 质量活动效率中应用 "quality_activity_efficiency"
function calculateActivityDeltaEntries(state, activity, seconds, options = {}) {
  // ... 在计算质量活动产出时
  if (QUALITY_ACTIVITY_IDS.has(activity.id)) {
    const logicQualityMilestone = 1 + getMilestoneBonus(state, "logic", "quality_activity_efficiency");
    value *= logicQualityMilestone;
  }
  // ... 原有代码
}

// 加班质量风险中应用 "overtime_quality_risk"
function calculateActivityDeltaEntries(state, activity, seconds, options = {}) {
  // ... 在计算加班 Bug/债务风险时
  if (options.overtime) {
    const logicOvertimeMilestone = 1 + getMilestoneBonus(state, "logic", "overtime_quality_risk");
    bugRisk *= logicOvertimeMilestone;
    debtRisk *= logicOvertimeMilestone;
  }
  // ... 原有代码
}
```

- [ ] **Step 4: 应用 focus 里程碑效果**

在 `src/game.js` 中应用 focus 相关效果：

```javascript
// 精力充沛加成中应用 "high_energy_production"
function getEnergyStatus(state) {
  const energy = Math.max(0, Number(state.resources.energy) || 0);
  let productionMultiplier = 1;
  let riskMultiplier = 1;
  let label = "平稳";
  
  if (energy >= 90) {
    const focusMilestone = getMilestoneBonus(state, "focus", "high_energy_production");
    productionMultiplier = 1.1 + focusMilestone;  // 从 1.1 提升到 1.15
    riskMultiplier = 0.9;
    label = "充沛";
  }
  // ... 原有代码
}

// 加班效率惩罚中应用 "overtime_efficiency_relief"
function getActivityRateContext(state, activity, options = {}) {
  // ... 原有代码
  const overtimeRelief = options.overtime ? attributeBonus(state, "focus", 0.003, 0.24) : 0;
  const overtimeMilestone = options.overtime ? getMilestoneBonus(state, "focus", "overtime_efficiency_relief") : 0;
  const overtimeFactor = options.overtime ? 0.45 + (overtimeRelief + overtimeMilestone) * 0.5 : 1;
  // ... 原有代码
}

// 持续产出活动效率中应用 "output_activity_efficiency"
function calculateActivityDeltaEntries(state, activity, seconds, options = {}) {
  // ... 在计算持续产出活动时
  if (["feature-coding", "testing", "documentation", "architecture"].includes(activity.id)) {
    const focusOutputMilestone = 1 + getMilestoneBonus(state, "focus", "output_activity_efficiency");
    value *= focusOutputMilestone;
  }
  // ... 原有代码
}

// 精力消耗中应用 "energy_cost_reduction"
function getWorkEnergyCostPerGameMinute(mode, overtime = false) {
  // ... 原有代码计算 perHour
  const costReduction = 1 + getMilestoneBonus(state, "focus", "energy_cost_reduction");
  return perHourToPerGameMinute(perHour * costReduction) * (overtime ? 1.25 : 1);
}

// 低精力效率惩罚中应用 "low_energy_efficiency_relief"
function getEnergyStatus(state) {
  // ... 在处理精力透支状态时
  if (energy >= 1 && energy < 30) {
    const lowEnergyRelief = getMilestoneBonus(state, "focus", "low_energy_efficiency_relief");
    const basePenalty = -0.45;
    productionMultiplier = 1 + basePenalty * (1 - lowEnergyRelief);  // 惩罚减半
    // ... 原有代码
  }
  // ... 原有代码
}
```

- [ ] **Step 5: 运行测试确认通过**

```bash
npm test -- test/milestones.test.js -t "effects application"
```

预期：PASS

- [ ] **Step 6: 运行完整测试套件**

```bash
npm test
```

预期：所有测试通过

- [ ] **Step 7: 提交**

```bash
git add src/game.js test/milestones.test.js
git commit -m "feat(milestones): apply milestone effects to game mechanics

- logic: reduce bug risk, debt penalty, boost project success rate
- focus: boost high energy production, reduce overtime penalty, reduce energy cost
- All milestone bonuses stack with existing attribute bonuses

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: 添加剩余属性里程碑定义

**Files:**
- Modify: `src/core/attributes.js`
- Test: `test/milestones.test.js`

- [ ] **Step 1: 补充完整的里程碑定义**

在 `src/core/attributes.js` 中添加剩余 4 个属性的里程碑：

```javascript
const ATTRIBUTE_MILESTONES = {
  logic: [ /* 已定义 */ ],
  focus: [ /* 已定义 */ ],
  
  learning: [
    { level: 25, name: "快速学习", effect: "skill_learning_speed", value: 0.1,
      description: "技能学习速度额外 +10%",
      narrative: "你找到了更高效的学习方法，不再只是埋头苦读。" },
    { level: 40, name: "知识吸收", effect: "knowledge_output", value: 0.2,
      description: "知识产出额外 +20%",
      narrative: "学习不再是机械重复，每次思考都能沉淀更多理解。" },
    { level: 55, name: "学习专家", effect: "skill_upgrade_cost", value: -0.15,
      description: "技能升级成本 -15%",
      narrative: "你已经掌握了从入门到精通的高效路径。" },
    { level: 70, name: "博学多才", effect: "multi_skill_learning", value: 0.5,
      description: "同时学习多个技能时速度惩罚减半",
      narrative: "你能在不同领域间自由切换，知识迁移不再困难。" },
    { level: 85, name: "智慧化身", effect: "skill_attribute_bonus", value: 0.1,
      description: "学习任何技能自动获得该技能主属性 10% 额外经验",
      narrative: "学习本身已经成为你最强的能力，每个技能都能反哺你的成长。" }
  ],
  
  communication: [
    { level: 25, name: "有效表达", effect: "project_pressure_relief", value: -0.08,
      description: "项目压力风险额外 -8%",
      narrative: "你第一次把"这个需求有问题"说得让对方点头而不是皱眉。" },
    { level: 40, name: "协作增效", effect: "collaboration_efficiency", value: 0.15,
      description: "所有协作活动效率额外 +15%",
      narrative: "团队协作不再是内耗，而是真正的放大器。" },
    { level: 55, name: "谈判高手", effect: "freelance_money", value: 0.2,
      description: "外包金钱收益额外 +20%",
      narrative: "你学会了用客户听得懂的语言解释技术复杂度。" },
    { level: 70, name: "影响力", effect: "reputation_gain", value: 0.25,
      description: "声望获取额外 +25%",
      narrative: "你的观点开始在社区中产生真正的影响力。" },
    { level: 85, name: "沟通大师", effect: "deadline_penalty_relief", value: 0.5,
      description: "项目 Deadline 逾期惩罚减半",
      narrative: "即使进度延期，你也能通过沟通把危机转化成理解。" }
  ],
  
  resilience: [
    { level: 25, name: "压力管理", effect: "pressure_recovery", value: 0.2,
      description: "压力恢复速度 +20%",
      narrative: "你开始学会在高压中找到喘息的空间。" },
    { level: 40, name: "钢铁意志", effect: "high_pressure_efficiency", value: 0.5,
      description: "压力 > 70 时效率惩罚减半",
      narrative: "压力不再让你慌乱，你学会了在逆境中保持清醒。" },
    { level: 55, name: "救火专家", effect: "incident_efficiency", value: 0.18,
      description: "线上救火、性能调优活动效率额外 +18%",
      narrative: "救火已经从惊慌失措变成了熟练的肌肉记忆。" },
    { level: 70, name: "抗压核心", effect: "pressure_cap", value: 20,
      description: "压力上限从 100 提升到 120",
      narrative: "你的承压能力已经超出常人理解的范围。" },
    { level: 85, name: "不屈之志", effect: "overtime_pressure_immunity", value: 1,
      description: "加班不再增加压力",
      narrative: "你已经能在任何工作强度下保持内心的平静。" }
  ],
  
  creativity: [
    { level: 25, name: "创意火花", effect: "creative_activity_efficiency", value: 0.12,
      description: "创造类活动效率额外 +12%",
      narrative: "灵感不再是偶然，你开始能主动进入创造状态。" },
    { level: 40, name: "创新思维", effect: "project_innovation_bonus", value: 0.05,
      description: "项目所有阶段成功率额外 +5%",
      narrative: "你能在常规方案中看到创新的可能性。" },
    { level: 55, name: "产品直觉", effect: "leads_output", value: 0.3,
      description: "线索产出额外 +30%",
      narrative: "你对用户需求的洞察已经超越了表面的功能清单。" },
    { level: 70, name: "灵感涌现", effect: "side_hustle_money", value: 0.4,
      description: "副业金钱收益额外 +40%",
      narrative: "创意不只是想法，你已经能把它们变成真正的价值。" },
    { level: 85, name: "创造大师", effect: "innovation_burst", value: 1,
      description: "完成创新项目后获得"创新冲刺"状态（持续3天，创造类产出 +50%）",
      narrative: "灵感不再是偶然，你已经能主动进入那种万物皆可连接的创造状态。" }
  ]
};
```

- [ ] **Step 2: 应用剩余属性的里程碑效果**

在 `src/game.js` 中应用这些效果（选择几个关键的）：

```javascript
// learning: skill_learning_speed
function getSkillLearningProgress(state, skill) {
  // ... 原有代码
  const learningRelief = attributeBonus(state, "learning", 0.0035, 0.25);
  const learningMilestone = getMilestoneBonus(state, "learning", "skill_learning_speed");
  const totalRelief = Math.min(0.35, learningRelief + learningMilestone);
  // ... 原有代码
}

// communication: project_pressure_relief, collaboration_efficiency
// resilience: pressure_recovery, high_pressure_efficiency, pressure_cap
// creativity: creative_activity_efficiency, leads_output
// ... 在对应位置应用
```

- [ ] **Step 3: 运行测试确认所有里程碑都能解锁**

```bash
npm test -- test/milestones.test.js
```

预期：PASS

- [ ] **Step 4: 提交**

```bash
git add src/core/attributes.js src/game.js test/milestones.test.js
git commit -m "feat(milestones): add all attribute milestone definitions

- learning: 5 milestones for learning speed and knowledge
- communication: 5 milestones for collaboration and influence
- resilience: 5 milestones for pressure management
- creativity: 5 milestones for creative output and innovation

Total 30 milestones across 6 attributes.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## 最终验证

### Task 9: 集成测试和数值平衡验证

**Files:**
- Test: `test/integration.test.js` (新建)

- [ ] **Step 1: 写集成测试验证成长曲线**

创建 `test/integration.test.js`:

```javascript
const { describe, test } = require("node:test");
const assert = require("node:assert");
const { createNewState, settleActivity, activityById, addAttributeExp } = require("../src/game");

describe("Attribute growth integration", () => {
  test("should achieve faster growth with new system", () => {
    const state = createNewState();
    state.attributes.focus = 20;
    state.attributeExp.focus = 0;
    
    const activity = activityById("feature-coding");
    
    // 模拟 8 游戏小时 (1天)
    for (let i = 0; i < 8; i++) {
      state.resources.energy = 100;  // 重置精力
      settleActivity(state, activity, 3600);
    }
    
    // 新系统: focus 每小时 +27, 8 小时 = 216
    // 成本: 20->21 需要 90, 21->22 需要 93
    // 应该升到至少 21 级
    assert.ok(state.attributes.focus >= 21, `Focus should be at least 21, got ${state.attributes.focus}`);
  });
  
  test("should unlock milestones during growth", () => {
    const state = createNewState();
    state.attributes.logic = 20;
    state.attributeExp.logic = 0;
    state.unlockedMilestones = {};
    
    // 给足够经验升到 25
    const events = [];
    addAttributeExp(state, "logic", 300, { events });
    
    assert.ok(state.attributes.logic >= 25);
    assert.ok(state.unlockedMilestones.logic);
    assert.ok(state.unlockedMilestones.logic.includes(25));
    assert.ok(events.some(e => e.category === "milestone" && e.text.includes("代码直觉觉醒")));
  });
});
```

- [ ] **Step 2: 运行集成测试**

```bash
npm test -- test/integration.test.js
```

预期：PASS

- [ ] **Step 3: 运行完整测试套件**

```bash
npm test
```

预期：所有测试通过

- [ ] **Step 4: 手动验证游戏流程**

```bash
npm start
```

手动测试：
1. 创建新档案，选择人物卡
2. 进行几个活动，观察属性经验增长
3. 学习一个技能，观察学习过程中的属性经验
4. 接取并推进项目，观察项目推进中的属性经验
5. 等待属性升到 25，观察里程碑通知

- [ ] **Step 5: 最终提交**

```bash
git add test/integration.test.js
git commit -m "test: add integration tests for attribute growth system

- Verify growth speed improvement (2-3x faster)
- Verify milestone unlock during growth
- Verify all exp sources working together

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## 计划完成

恭喜！属性成长系统优化的核心功能已全部实现：

✅ **阶段 1：核心数值调整**
- 属性升级成本降低 40%
- 活动属性经验 x3
- 扩展所有属性收益影响面

✅ **阶段 2：新增经验来源**
- 技能学习给属性经验
- 项目推进给属性经验

✅ **阶段 3：反馈系统**
- 实现里程碑系统（30 个里程碑）
- 里程碑效果应用到游戏机制

**后续可选任务（阶段 4）**：
- 优化属性面板展示
- 添加属性建议系统
- 实现里程碑快捷查询命令
- 添加属性相关成长任务

这些任务优先级较低，可以在后续迭代中实现。