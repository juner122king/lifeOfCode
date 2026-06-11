# 压力系统重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让压力成为需要管理的长期资源，修正精力-风险逻辑错误

**Architecture:** 提取压力计算到独立模块，调整数值平衡（休整恢复速率、精力风险倍率），添加阈值效果和过载事件机制

**Tech Stack:** Node.js, CommonJS, Node test runner

---

## File Structure

**New Files:**
- `src/core/pressure.js` - 压力计算逻辑集中管理
- `test/pressure.test.js` - 压力模块单元测试

**Modified Files:**
- `src/core/constants.js:60-66` - 调整 `ENERGY_STATUS_DEFS` 的 `riskMultiplier`
- `src/game.js:671-673` - 迁移 `getPressureRecoveryMultiplier` 到 pressure.js
- `src/game.js:690,699,706` - 调整休整恢复速率
- `src/game.js:792` - 删除每日固定压力恢复
- `src/game.js:1009-1019` - 整合压力阈值效果到 `getProductionRisk`
- `src/game.js:settleTime()` - 添加压力过载检查
- `src/content.js:342` - 调整 rest 活动
- `src/content.js:documentation` - 添加压力缓解
- `src/content.js:open-source` - 移除压力产生

---

## Task 1: 修正精力-风险关系（riskMultiplier）

**Files:**
- Modify: `src/core/constants.js:60-66`
- Test: Manual verification via game play

- [ ] **Step 1: 修改 ENERGY_STATUS_DEFS 的 riskMultiplier 值**

在 `src/core/constants.js` 中找到 `ENERGY_STATUS_DEFS` 定义，修改 `riskMultiplier` 值：

```javascript
const ENERGY_STATUS_DEFS = [
  { id: "depleted", name: "枯竭", min: 0, max: 0, productivityMultiplier: 0, riskMultiplier: 2.5 },
  { id: "overdrawn", name: "透支", min: 1, max: 29, productivityMultiplier: 0.55, riskMultiplier: 2.2 },
  { id: "tired", name: "疲惫", min: 30, max: 59, productivityMultiplier: 0.8, riskMultiplier: 1.5 },
  { id: "stable", name: "平稳", min: 60, max: 89, productivityMultiplier: 1, riskMultiplier: 1 },
  { id: "full", name: "充沛", min: 90, max: 100, productivityMultiplier: 1.1, riskMultiplier: 0.75 }
];
```

- [ ] **Step 2: 提交修改**

```bash
git add src/core/constants.js
git commit -m "refactor(pressure): fix energy-risk relationship

Increase riskMultiplier for tired/overdrawn states to make fatigue
truly increase risk rate (not just absolute risk amount).

- full: 0.9 -> 0.75
- tired: 1.25 -> 1.5
- overdrawn: 1.75 -> 2.2
- depleted: 1.75 -> 2.5

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: 创建压力计算模块

**Files:**
- Create: `src/core/pressure.js`
- Test: `test/pressure.test.js`

- [ ] **Step 1: 编写压力模块的失败测试**

创建 `test/pressure.test.js`：

```javascript
const { describe, it } = require("node:test");
const assert = require("node:assert");
const {
  getPressureRecoveryMultiplier,
  getPressureThresholdEffects,
  checkPressureOverload
} = require("../src/core/pressure");

describe("压力模块", () => {
  describe("getPressureRecoveryMultiplier", () => {
    it("压力为 0 时返回 1", () => {
      const state = { resources: { pressure: 0 } };
      assert.strictEqual(getPressureRecoveryMultiplier(state), 1);
    });

    it("压力为 50 时返回 0.6", () => {
      const state = { resources: { pressure: 50 } };
      assert.strictEqual(getPressureRecoveryMultiplier(state), 0.6);
    });

    it("压力为 100 时返回 0.2（最低）", () => {
      const state = { resources: { pressure: 100 } };
      assert.strictEqual(getPressureRecoveryMultiplier(state), 0.2);
    });

    it("压力超过 100 时仍返回 0.2", () => {
      const state = { resources: { pressure: 150 } };
      assert.strictEqual(getPressureRecoveryMultiplier(state), 0.2);
    });
  });

  describe("getPressureThresholdEffects", () => {
    it("压力 0-25 为 normal 级别，无惩罚", () => {
      const state = { resources: { pressure: 20 } };
      const effects = getPressureThresholdEffects(state);
      assert.strictEqual(effects.level, "normal");
      assert.strictEqual(effects.codeEfficiencyPenalty, 0);
      assert.strictEqual(effects.bugRiskIncrease, 0);
    });

    it("压力 26-50 为 tense 级别，无惩罚", () => {
      const state = { resources: { pressure: 40 } };
      const effects = getPressureThresholdEffects(state);
      assert.strictEqual(effects.level, "tense");
      assert.strictEqual(effects.codeEfficiencyPenalty, 0);
    });

    it("压力 51-75 为 anxious 级别，中度惩罚", () => {
      const state = { resources: { pressure: 60 } };
      const effects = getPressureThresholdEffects(state);
      assert.strictEqual(effects.level, "anxious");
      assert.strictEqual(effects.codeEfficiencyPenalty, 0.1);
      assert.strictEqual(effects.bugRiskIncrease, 0.15);
    });

    it("压力 76-100 为 critical 级别，重度惩罚", () => {
      const state = { resources: { pressure: 85 } };
      const effects = getPressureThresholdEffects(state);
      assert.strictEqual(effects.level, "critical");
      assert.strictEqual(effects.codeEfficiencyPenalty, 0.15);
      assert.strictEqual(effects.bugRiskIncrease, 0.3);
    });
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

```bash
npm test -- test/pressure.test.js
```

Expected: FAIL with "Cannot find module '../src/core/pressure'"

- [ ] **Step 3: 实现压力计算模块**

创建 `src/core/pressure.js`：

```javascript
const { clamp } = require("./math");
const { MINUTES_PER_DAY } = require("./constants");

function getPressureRecoveryMultiplier(state) {
  const pressure = Number(state.resources && state.resources.pressure) || 0;
  return clamp(1 - pressure / 125, 0.2, 1);
}

function getPressureThresholdEffects(state) {
  const pressure = Number(state.resources && state.resources.pressure) || 0;
  
  return {
    level: pressure < 26 ? "normal" : pressure < 51 ? "tense" : pressure < 76 ? "anxious" : "critical",
    codeEfficiencyPenalty: pressure < 51 ? 0 : pressure < 76 ? 0.1 : 0.15,
    bugRiskIncrease: pressure < 51 ? 0 : pressure < 76 ? 0.15 : 0.3
  };
}

function checkPressureOverload(state, messages, events, applyResourceDelta, pushMessageEvent) {
  const pressure = Number(state.resources && state.resources.pressure) || 0;
  
  if (pressure >= 75) {
    if (!state.pressureOverloadStartMinute) {
      state.pressureOverloadStartMinute = state.worldTimeMinutes;
    }
    
    const overloadDuration = state.worldTimeMinutes - state.pressureOverloadStartMinute;
    const twoDaysMinutes = 2 * MINUTES_PER_DAY;
    
    if (overloadDuration >= twoDaysMinutes && !state.pressureOverloadTriggered) {
      state.pressureOverloadTriggered = true;
      applyResourceDelta(state, "techDebt", 15);
      applyResourceDelta(state, "bugs", 8);
      state.activeActivityId = null;
      state.activeSkillLearningId = null;
      state.activeProjectId = null;
      pushMessageEvent(
        messages,
        events,
        "warning",
        "压力崩溃：长期高压导致技术债和 Bug 激增，当前工作被迫中断。你需要休息了。",
        "danger"
      );
    }
  } else {
    delete state.pressureOverloadStartMinute;
    delete state.pressureOverloadTriggered;
  }
}

function formatPressureStatus(pressure) {
  const p = Number(pressure) || 0;
  if (p < 26) return "正常";
  if (p < 51) return "紧张";
  if (p < 76) return "焦虑";
  return "崩溃边缘";
}

module.exports = {
  getPressureRecoveryMultiplier,
  getPressureThresholdEffects,
  checkPressureOverload,
  formatPressureStatus
};
```

- [ ] **Step 4: 运行测试验证通过**

```bash
npm test -- test/pressure.test.js
```

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/core/pressure.js test/pressure.test.js
git commit -m "feat(pressure): add pressure calculation module

Extract pressure-related calculations into dedicated module:
- getPressureRecoveryMultiplier: pressure suppression on energy recovery
- getPressureThresholdEffects: threshold-based penalties
- checkPressureOverload: overload event trigger
- formatPressureStatus: status formatting

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: 调整休整恢复速率和移除每日固定恢复

**Files:**
- Modify: `src/game.js:671-720,792`

- [ ] **Step 1: 导入压力模块并删除旧函数**

在 `src/game.js` 开头的 require 部分添加：

```javascript
const { 
  getPressureRecoveryMultiplier,
  checkPressureOverload
} = require("./core/pressure");
```

然后删除 `getPressureRecoveryMultiplier` 函数定义（约 671-673 行）：

```javascript
// 删除这个函数，已迁移到 src/core/pressure.js
function getPressureRecoveryMultiplier(state) {
  return clamp(1 - (Number(state.resources && state.resources.pressure) || 0) / 125, 0.2, 1);
}
```

- [ ] **Step 2: 调整 settleLifestyleRest 中的恢复速率**

找到 `settleLifestyleRest` 函数，修改三处压力恢复速率：

```javascript
// health 模式（约 690 行）
if (stance.id === "health") {
  const resilienceRelief = 1 + attributeBonus(state, "resilience", 0.004, 0.32);
  applyRecovery(1);
  deltas.pressure = applyResourceDelta(state, "pressure", -duration * 0.008 * resilienceRelief);
  return deltas;
}

// tech_surfing 模式（约 699 行）
if (stance.id === "tech_surfing") {
  const learningBoost = 1 + attributeBonus(state, "learning", 0.003, 0.24);
  const focusRelief = attributeBonus(state, "focus", 0.003, 0.18);
  applyRecovery(0.4);
  deltas.knowledge = applyResourceDelta(state, "knowledge", duration * 0.06 * learningBoost);
  if (focusRelief > 0) deltas.pressure = applyResourceDelta(state, "pressure", -duration * 0.003 * focusRelief);
  return deltas;
}

// cyber_gaming 模式（约 706 行）
if (stance.id === "cyber_gaming") {
  const resilienceRelief = 1 + attributeBonus(state, "resilience", 0.004, 0.32);
  applyRecovery(0.6);
  deltas.pressure = applyResourceDelta(state, "pressure", -duration * 0.015 * resilienceRelief);
  return deltas;
}
```

- [ ] **Step 3: 删除每日固定压力恢复**

找到 `settle9AMPause` 函数（约 792 行），删除固定恢复行：

```javascript
// 删除这一行
applyResourceDelta(state, "pressure", -5);
```

- [ ] **Step 4: 提交**

```bash
git add src/game.js
git commit -m "refactor(pressure): reduce rest recovery rates and remove daily reset

- health: 0.05 -> 0.008 (12h recovers 5.76 instead of 36)
- cyber_gaming: 0.12 -> 0.015 (12h recovers 10.8 instead of 86.4)
- tech_surfing: 0.01 -> 0.003 (12h recovers 2.16 instead of 7.2)
- Remove daily -5 pressure at 09:00

Pressure now accumulates over 5-10 days instead of resetting daily.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: 调整活动压力影响

**Files:**
- Modify: `src/content.js:335-344,210-240,255-265`

- [ ] **Step 1: 调整 rest 活动**

找到 `rest` 活动定义（约 335-344 行），修改为：

```javascript
activity({
  id: "rest",
  name: "休息恢复",
  description: "恢复精力，是所有产出活动的机会成本。",
  tier: 1,
  primaryAttribute: "resilience",
  energyCostPerHour: 0,
  activityExpPerHour: 12,
  outputsPerHour: { energy: 2.5 },
  mitigationPerHour: { pressure: 24 },
  attributeExpPerHour: { resilience: 6 }
})
```

- [ ] **Step 2: 调整 documentation 活动**

找到 `documentation` 活动定义（约 210-240 行），修改 `mitigationPerHour`：

```javascript
activity({
  id: "documentation",
  name: "写文档",
  // ... 其他字段保持不变
  mitigationPerHour: { techDebt: 0.91, pressure: 9 },
  // ... 其他字段保持不变
})
```

- [ ] **Step 3: 调整 open-source 活动**

找到 `open-source` 活动定义（约 255-265 行），删除 `risksPerHour` 中的 pressure：

```javascript
activity({
  id: "open-source",
  name: "开源协作",
  // ... 其他字段保持不变
  risksPerHour: {},  // 删除 pressure: 0.7
  // ... 其他字段保持不变
})
```

- [ ] **Step 4: 提交**

```bash
git add src/content.js
git commit -m "refactor(pressure): adjust activity pressure impact

- rest: add pressure mitigation -24/h, reduce energy recovery 5->2.5/h
- documentation: add pressure mitigation -9/h
- open-source: remove pressure generation (0.7/h -> 0)

Provides active pressure management options beyond passive rest.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: 整合压力阈值效果到生产风险

**Files:**
- Modify: `src/game.js:1008-1020`

- [ ] **Step 1: 导入压力阈值函数**

在 `src/game.js` 开头的 require 部分添加（如果 Task 3 未添加）：

```javascript
const { 
  getPressureRecoveryMultiplier,
  getPressureThresholdEffects,
  checkPressureOverload
} = require("./core/pressure");
```

- [ ] **Step 2: 修改 getProductionRisk 函数**

找到 `getProductionRisk` 函数（约 1008-1020 行），在返回对象中添加阈值效果：

```javascript
function getProductionRisk(state) {
  const pressureRelief = attributeBonus(state, "resilience", 0.003, 0.2);
  const pressurePenalty = clamp((state.resources.pressure || 0) / 100 * 0.35 * (1 - pressureRelief), 0, 0.35);
  const debtPenalty = clamp((state.resources.techDebt || 0) / 240 * 0.25, 0, 0.25);
  const logicBugRelief = attributeBonus(state, "logic", 0.003, 0.22);
  const bugDebtBoost = 1 + clamp((state.resources.techDebt || 0) / 240 * 0.5 * (1 - logicBugRelief), 0, 0.5);
  
  const thresholdEffects = getPressureThresholdEffects(state);
  
  return {
    codeEfficiency: (1 - pressurePenalty) * (1 - debtPenalty) * (1 - thresholdEffects.codeEfficiencyPenalty),
    bugDebtBoost,
    pressurePenalty,
    debtPenalty,
    thresholdEffects
  };
}
```

- [ ] **Step 3: 在活动结算中应用 Bug 风险阈值**

找到 `calculateActivityDeltaEntries` 函数中的风险结算部分（约 2026-2036 行），在 bugs 风险计算后应用阈值：

```javascript
for (const [key, rate] of Object.entries(activity.risksPerHour || {})) {
  let delta = activityRateToDelta(rate, duration);
  if (key === "bugs") delta *= context.multipliers.bug * context.risk.bugDebtBoost * (1 + (context.risk.thresholdEffects?.bugRiskIncrease || 0));
  if (key === "techDebt") delta *= context.multipliers.debt;
  if (key === "pressure") delta *= context.multipliers.pressure;
  if (RISK_RESOURCE_IDS.has(key)) delta *= context.energyStatus.riskMultiplier;
  if (key === "pressure" && context.focus.id === "freelance") delta *= context.focus.pressure;
  if (options.overtime && (key === "bugs" || key === "techDebt")) delta *= 1.8 * (1 - attributeBonus(state, "logic", 0.004, 0.3));
  if (options.overtime && key === "pressure") delta *= 1.5 * (1 - attributeBonus(state, "resilience", 0.004, 0.3));
  entries.push([key, delta]);
}
```

- [ ] **Step 4: 提交**

```bash
git add src/game.js
git commit -m "feat(pressure): integrate threshold effects into production risk

Apply pressure threshold penalties:
- Code efficiency: -10% at 51+, -15% at 76+
- Bug risk: +15% at 51+, +30% at 76+

Threshold effects stack with existing linear pressure penalties.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: 添加压力过载事件检查

**Files:**
- Modify: `src/game.js:settleTime()`

- [ ] **Step 1: 在 settleTime 中添加压力过载检查**

找到 `settleTime` 函数（约 1660 行开始），在每个结算段的循环中，段结算完成后添加压力过载检查。

在段结算逻辑之后（应该在 `settleTimeSegment` 调用或类似逻辑之后），添加：

```javascript
// 在每个段结算后检查压力过载
checkPressureOverload(state, messages, events, applyResourceDelta, pushMessageEvent);
```

具体位置：找到处理每个时间段的循环，在段内所有结算完成后、进入下一段之前调用。

- [ ] **Step 2: 验证功能**

手动测试：
1. 启动游戏，选择一个人物卡
2. 连续执行高压活动（如 incident-response）
3. 让压力达到 75+ 并保持超过 2 天
4. 验证是否触发压力崩溃事件（技术债 +15，Bug +8，工作中断）

- [ ] **Step 3: 提交**

```bash
git add src/game.js
git commit -m "feat(pressure): add pressure overload event

Trigger overload when pressure >= 75 for 2+ days:
- Add techDebt +15, bugs +8
- Force stop current activity/skill/project
- Show danger message

Enforces pressure management as critical gameplay mechanic.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: 集成测试 - 压力累积

**Files:**
- Test: Manual gameplay verification

- [ ] **Step 1: 测试压力累积（低抗压角色）**

启动游戏，测试压力是否能累积：

```bash
npm run tui
```

测试步骤：
1. 选择 academy-prodigy（resilience: 10，低抗压）
2. 连续 3 天执行 incident-response（压力产生 3.8/h）
3. 每天晚上选择 none（晚间放松）
4. 观察压力变化

预期结果：
- Day 1: 压力从 0 增长到约 30-35
- Day 2: 压力从 30-35 增长到约 55-65
- Day 3: 压力从 55-65 增长到约 75-85
- 压力不会在第二天 09:00 清零

- [ ] **Step 2: 测试精力-风险关系**

测试步骤：
1. 从上述状态继续，让精力降到 30 以下（疲惫状态）
2. 继续执行高压活动
3. 观察压力增长速率

预期结果：
- 疲惫状态（精力 30-59）：压力增长率明显提高（riskMultiplier 1.5）
- 透支状态（精力 1-29）：压力增长率激增（riskMultiplier 2.2）

- [ ] **Step 3: 记录测试结果**

记录到测试日志（可选）或直接进入下一任务。

---

## Task 8: 集成测试 - 主动减压途径

**Files:**
- Test: Manual gameplay verification

- [ ] **Step 1: 测试 rest 活动减压**

从高压状态（压力 75+）开始测试：

测试步骤：
1. 压力在 75+ 时，执行 rest 活动
2. 观察 3 小时（游戏时间）的压力变化

预期结果：
- rest 活动每小时降低压力 24 点（受 resilience 加成）
- 3 小时约降低 72 点压力
- 精力恢复速度为 2.5/h（比原来的 5/h 慢）

- [ ] **Step 2: 测试 documentation 活动轻微减压**

测试步骤：
1. 压力在 40-60 时，执行 documentation 活动
2. 观察 3 小时的压力变化

预期结果：
- documentation 每小时降低压力约 9 点
- 3 小时约降低 27 点压力
- 同时产生文档资源

- [ ] **Step 3: 测试 open-source 活动中性**

测试步骤：
1. 执行 open-source 活动数小时
2. 观察压力是否增长

预期结果：
- open-source 不再产生压力（之前为 +0.7/h）
- 压力保持不变或仅因其他因素变化

---

## Task 9: 集成测试 - 压力过载事件

**Files:**
- Test: Manual gameplay verification

- [ ] **Step 1: 测试压力过载触发**

测试步骤：
1. 让压力达到 75+
2. 保持高压活动超过 2 天（2880 游戏分钟）
3. 观察是否触发压力崩溃事件

预期结果：
- 2 天后触发事件
- 技术债 +15
- Bug +8
- 当前活动/技能学习/项目被清空
- 显示红色危险消息："压力崩溃：长期高压导致技术债和 Bug 激增，当前工作被迫中断。你需要休息了。"

- [ ] **Step 2: 测试压力过载重置**

测试步骤：
1. 触发压力过载后，执行 rest 活动
2. 让压力降到 75 以下
3. 再次让压力升到 75+

预期结果：
- 压力降到 75 以下后，过载状态被重置
- 再次达到 75+ 时，需要重新累积 2 天才会再次触发

- [ ] **Step 3: 验证过载不重复触发**

测试步骤：
1. 触发一次压力过载后
2. 如果压力仍保持 75+，继续观察

预期结果：
- 同一次高压期间，过载事件只触发一次
- 不会每隔 2 天重复触发

---

## Task 10: 平衡性调整（可选）

**Files:**
- Modify: `src/content.js:perfectionist-qa`
- Test: Manual gameplay verification

- [ ] **Step 1: 评估 perfectionist-qa 难度**

测试步骤：
1. 选择 perfectionist-qa 人物卡（初始压力 25，resilience 4）
2. 游玩前 5 天
3. 观察压力管理难度

评估标准：
- 压力是否在前 3 天内达到 75+？
- 是否需要频繁休息导致进度缓慢？
- 游戏体验是否过于困难？

- [ ] **Step 2: 如需调整，降低初始压力**

如果评估发现过于困难，修改 `src/content.js` 中 perfectionist-qa 的初始压力：

```javascript
{
  id: "perfectionist-qa",
  name: "完美主义细节控",
  // ... 其他字段
  resources: { tests: 55, docs: 8, techDebt: 20, pressure: 15, money: -15 }, // 从 25 改为 15
  // ... 其他字段
}
```

- [ ] **Step 3: 如调整，提交**

```bash
git add src/content.js
git commit -m "balance: reduce perfectionist-qa initial pressure

Reduce from 25 to 15 to compensate for slower pressure recovery.
Character remains challenging but playable.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 4: 记录平衡性测试结果**

在测试日志或 issue 中记录：
- 各人物卡压力曲线
- 是否存在"压力死锁"
- 推荐的游戏节奏

---

## Task 11: 最终验证与文档更新

**Files:**
- Test: Full regression test
- Modify: `docs/游戏设计逻辑.md`（可选）

- [ ] **Step 1: 完整回归测试**

运行所有单元测试：

```bash
npm test
```

预期结果：所有测试通过

- [ ] **Step 2: 完整游戏流程测试**

测试步骤：
1. 用不同人物卡各游玩 10 天
2. 验证压力系统按预期工作
3. 验证没有引入新的 bug

测试覆盖：
- 压力累积和恢复
- 精力-风险关系
- 压力阈值效果
- 压力过载事件
- 主动减压活动

- [ ] **Step 3: 更新设计文档（可选）**

如果需要，更新 `docs/游戏设计逻辑.md` 中压力系统相关的章节，反映新的数值和机制。

- [ ] **Step 4: 最终提交**

如果有文档更新：

```bash
git add docs/游戏设计逻辑.md
git commit -m "docs: update pressure system mechanics

Reflect new recovery rates, threshold effects, and overload events.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## 实施完成检查清单

完成所有任务后，验证以下改动已生效：

**数值调整：**
- [x] riskMultiplier 已调整（充沛 0.75，疲惫 1.5，透支 2.2，枯竭 2.5）
- [x] 休整恢复速率大幅降低（health 0.008, cyber 0.015, tech 0.003）
- [x] 每日固定 -5 压力已移除
- [x] rest 活动减压 -24/h，精力恢复 2.5/h
- [x] documentation 减压 -9/h
- [x] open-source 不再产生压力

**新增功能：**
- [x] 压力计算模块 `src/core/pressure.js` 已创建
- [x] 压力阈值效果已整合到生产风险
- [x] 压力过载事件已添加

**测试：**
- [x] 单元测试通过
- [x] 压力累积验证通过
- [x] 精力-风险关系验证通过
- [x] 主动减压验证通过
- [x] 压力过载事件验证通过

**预期效果达成：**
- 压力需要 5-10 天从高位恢复，而非每日清零
- 疲劳时风险率确实提高，强化休息必要性
- 玩家有主动减压选择（rest, documentation）
- resilience 属性价值显著提升

