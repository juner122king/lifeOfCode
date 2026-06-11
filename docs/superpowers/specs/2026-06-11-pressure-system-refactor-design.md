# 压力系统重构设计

**日期：** 2026-06-11  
**状态：** 设计完成，待实施  
**目标：** 让压力成为需要管理的长期资源，修正精力-风险的逻辑错误

---

## 一、问题诊断

### 1.1 压力每日清零问题

**玩法体验：** 压力在游戏过程中基本在第二天 09:00 清零，玩家感受不到压力的累积效应

**数值分析：**
- 每天 09:00 固定恢复 -5 压力
- 夜间休整 12 小时（health 模式）：0.05/秒 × 43200秒 = 最多恢复 36 点
- 日常工作产生压力：约 3-15 点/天
- **结果：** 压力每天清零，无法成为长期威胁

### 1.2 精力-风险关系错误

**当前逻辑缺陷：** `riskMultiplier` 设计方向错误

```javascript
// src/core/constants.js ENERGY_STATUS_DEFS
{ id: "full", min: 90, max: 100, riskMultiplier: 0.9 }      // 充沛：风险-10%
{ id: "stable", min: 60, max: 89, riskMultiplier: 1 }       // 平稳：风险正常
{ id: "tired", min: 30, max: 59, riskMultiplier: 1.25 }     // 疲惫：风险+25%
{ id: "overdrawn", min: 1, max: 29, riskMultiplier: 1.75 }  // 透支：风险+75%
{ id: "depleted", min: 0, max: 0, riskMultiplier: 1.75 }    // 枯竭：风险+75%
```

**问题：** 当前 `riskMultiplier` 用于放大风险资源（bugs、techDebt、pressure）的产生

**错误效果链：**
1. 精力低 → `productivityMultiplier` 低 → 产出少
2. 产出少 → 实际工作时长少（因为精力不足）
3. 工作时长少 → 风险产生总量也少
4. **即使** `riskMultiplier` 更高，因为工作时长减少，风险总量反而可能更低

**应该的逻辑：**
- 精力低 → 容易犯错 → **单位时间风险率更高**
- 但当前实现让"工作时长"成为主导因素，掩盖了风险率的提升

---

## 二、重构目标

1. **让压力能够累积** - 大幅降低恢复速率，移除每日固定恢复
2. **修正精力-风险关系** - 调整 `riskMultiplier`，让疲劳时风险率真正提高
3. **让压力有意义** - 添加压力阈值效果
4. **增加管理深度** - 提供主动减压途径

---

## 三、设计方案

### 3.1 调整压力恢复机制

#### 移除每日固定恢复

**代码位置：** `game.js` 的 `settle9AMPause()` 函数，约 792 行

```javascript
// 删除这一行
applyResourceDelta(state, "pressure", -5);
```

---

#### 大幅降低休整恢复速率

**代码位置：** `game.js` 的 `settleLifestyleRest()` 函数

| 作息模式 | 当前速率 | 第一版调整 | 最终调整 | 12h恢复量 |
|----------|----------|-----------|----------|----------|
| health | 0.05/秒 | 0.015/秒 | **0.008/秒** | **5.76点** |
| cyber_gaming | 0.12/秒 | 0.025/秒 | **0.015/秒** | **10.8点** |
| tech_surfing | 0.01/秒 | 0.005/秒 | **0.003/秒** | **2.16点** |

**调整理由：**
- 第一版仍然偏高，压力在 3-4 天可能清零
- 最终版让压力恢复需要 5-10 天，成为真正的长期资源

**实施代码：**

```javascript
// health 模式
deltas.pressure = applyResourceDelta(state, "pressure", -duration * 0.008 * resilienceRelief);

// cyber_gaming 模式
deltas.pressure = applyResourceDelta(state, "pressure", -duration * 0.015 * resilienceRelief);

// tech_surfing 模式
if (focusRelief > 0) {
  deltas.pressure = applyResourceDelta(state, "pressure", -duration * 0.003 * focusRelief);
}
```

---

### 3.2 修正精力-风险关系

#### 当前问题分析

**错误的风险倍率设计：**

精力低时虽然 `riskMultiplier` 更高，但因为：
1. `productivityMultiplier` 低导致工作推进慢
2. 精力不足导致实际工作时长短
3. **风险总量 = 风险率 × 工作时长**，时长减少抵消了风险率提升

**结果：** 疲劳时反而产生更少的 Bug、技术债、压力

---

#### 调整方案

**代码位置：** `src/core/constants.js` 的 `ENERGY_STATUS_DEFS`

**调整 `riskMultiplier`：**

| 精力状态 | 当前值 | 调整后 | 理由 |
|---------|--------|--------|------|
| 充沛 (90-100) | 0.9 | **0.75** | 状态好时显著降低风险 |
| 平稳 (60-89) | 1.0 | **1.0** | 基准 |
| 疲惫 (30-59) | 1.25 | **1.5** | 疲劳时明显更易出错 |
| 透支 (1-29) | 1.75 | **2.2** | 透支时风险激增 |
| 枯竭 (0) | 1.75 | **2.5** | 完全枯竭时最高风险 |

**实施代码：**

```javascript
const ENERGY_STATUS_DEFS = [
  { id: "depleted", name: "枯竭", min: 0, max: 0, productivityMultiplier: 0, riskMultiplier: 2.5 },
  { id: "overdrawn", name: "透支", min: 1, max: 29, productivityMultiplier: 0.55, riskMultiplier: 2.2 },
  { id: "tired", name: "疲惫", min: 30, max: 59, productivityMultiplier: 0.8, riskMultiplier: 1.5 },
  { id: "stable", name: "平稳", min: 60, max: 89, productivityMultiplier: 1, riskMultiplier: 1 },
  { id: "full", name: "充沛", min: 90, max: 100, productivityMultiplier: 1.1, riskMultiplier: 0.75 }
];
```

**预期效果：**
- 精力 30 时：产出 -20%，但压力产生 +50%（单位时间）
- 精力 15 时：产出 -45%，但压力产生 +120%（单位时间）
- 透支工作会快速累积压力，强化"休息的必要性"

---

### 3.3 主动减压途径

#### 调整现有活动

**1. rest（休息恢复）活动**

**当前：** 主要恢复精力，不降压

**调整：**
- 精力恢复：5/h → 2.5/h
- 新增压力恢复：-24/h（0.4/分钟）

**代码位置：** `src/content.js`

```javascript
activity({
  id: "rest",
  name: "休息恢复",
  tier: 0,
  primaryAttribute: "resilience",
  energyCostPerHour: 0,
  activityExpPerHour: 12,
  outputsPerHour: { energy: 2.5 },
  mitigationPerHour: { pressure: 24 },
  attributeExpPerHour: { resilience: 9 }
})
```

---

**2. documentation（写文档）活动**

**调整：** 增加轻微降压

```javascript
mitigationPerHour: { techDebt: 0.91, pressure: 9 }
```

---

**3. open-source（开源协作）活动**

**调整：** 从产生压力改为中性

```javascript
risksPerHour: {} // 删除 pressure: 0.7
```

---

#### 活动压力影响汇总

| 活动 | 当前压力 | 调整后 | 变化 |
|------|---------|--------|------|
| rest | 0 | -24/h | 主动减压 |
| documentation | 0 | -9/h | 轻微减压 |
| open-source | +0.7/h | 0 | 移除压力 |

---

### 3.4 压力阈值与可见效果

#### 压力分级

```
0-25:  【正常】无额外影响
26-50:【紧张】轻度负面效果
51-75:【焦虑】中度负面效果 + 黄色警告
76-100:【崩溃边缘】重度负面效果 + 红色警告
```

#### 阈值额外惩罚

**保持现有线性公式不变，叠加阈值固定惩罚**

创建新函数 `getPressureThresholdEffects(state)`：

```javascript
function getPressureThresholdEffects(state) {
  const pressure = state.resources.pressure || 0;
  
  return {
    level: pressure < 26 ? 'normal' : pressure < 51 ? 'tense' : pressure < 76 ? 'anxious' : 'critical',
    codeEfficiencyPenalty: pressure < 51 ? 0 : pressure < 76 ? 0.1 : 0.15,
    bugRiskIncrease: pressure < 51 ? 0 : pressure < 76 ? 0.15 : 0.3
  };
}
```

**整合位置：**
1. 代码效率：`getProductionRisk()` 中叠加惩罚
2. Bug 风险：活动结算时额外乘系数

---

### 3.5 压力过载事件

**触发条件：** 压力 ≥ 75 且持续 ≥ 2 天

**后果：**
- 技术债 +15
- Bug +8
- 中断当前工作
- 提示："压力崩溃：长期高压导致质量崩塌，工作被迫中断。"

**实施位置：** `settleTime()` 中每段结算后检查

```javascript
function checkPressureOverload(state, messages, events) {
  const pressure = state.resources.pressure || 0;
  
  if (pressure >= 75) {
    if (!state.pressureOverloadStartMinute) {
      state.pressureOverloadStartMinute = state.worldTimeMinutes;
    }
    
    const overloadDuration = state.worldTimeMinutes - state.pressureOverloadStartMinute;
    if (overloadDuration >= 2 * MINUTES_PER_DAY && !state.pressureOverloadTriggered) {
      state.pressureOverloadTriggered = true;
      applyResourceDelta(state, "techDebt", 15);
      applyResourceDelta(state, "bugs", 8);
      state.activeActivityId = null;
      state.activeSkillLearningId = null;
      state.activeProjectId = null;
      pushMessageEvent(messages, events, "warning", 
        "压力崩溃：长期高压导致技术债和 Bug 激增，当前工作被迫中断。你需要休息了。", "danger");
    }
  } else {
    delete state.pressureOverloadStartMinute;
    delete state.pressureOverloadTriggered;
  }
}
```

---

## 四、代码结构重构

### 4.1 提取压力计算模块

**创建新文件：** `src/core/pressure.js`

**导出函数：**
```javascript
function getPressureThresholdEffects(state)      // 压力阈值效果
function getPressureRecoveryMultiplier(state)    // 压力对精力恢复的抑制
function checkPressureOverload(state, messages, events)  // 压力过载检查
function formatPressureStatus(pressure)          // 格式化压力状态
```

---

### 4.2 修改点清单

**文件：** `src/core/constants.js`

```javascript
// 修改 ENERGY_STATUS_DEFS 的 riskMultiplier
const ENERGY_STATUS_DEFS = [
  { id: "depleted", name: "枯竭", min: 0, max: 0, productivityMultiplier: 0, riskMultiplier: 2.5 },
  { id: "overdrawn", name: "透支", min: 1, max: 29, productivityMultiplier: 0.55, riskMultiplier: 2.2 },
  { id: "tired", name: "疲惫", min: 30, max: 59, productivityMultiplier: 0.8, riskMultiplier: 1.5 },
  { id: "stable", name: "平稳", min: 60, max: 89, productivityMultiplier: 1, riskMultiplier: 1 },
  { id: "full", name: "充沛", min: 90, max: 100, productivityMultiplier: 1.1, riskMultiplier: 0.75 }
];
```

---

**文件：** `src/game.js`

1. **删除每日固定恢复**（`settle9AMPause()`，约 792 行）
   ```javascript
   // 删除这一行
   applyResourceDelta(state, "pressure", -5);
   ```

2. **调整休整恢复速率**（`settleLifestyleRest()`）
   - health: `0.05` → `0.008`
   - cyber_gaming: `0.12` → `0.015`
   - tech_surfing: `0.01` → `0.003`

3. **添加压力过载检查**（`settleTime()`）
   - 在每个结算段结束时调用 `checkPressureOverload()`

4. **整合压力阈值效果**（`getProductionRisk()`）
   - 调用 `getPressureThresholdEffects()` 并应用

---

**文件：** `src/content.js`

1. **rest 活动**
   ```javascript
   outputsPerHour: { energy: 2.5 },
   mitigationPerHour: { pressure: 24 }
   ```

2. **documentation 活动**
   ```javascript
   mitigationPerHour: { techDebt: 0.91, pressure: 9 }
   ```

3. **open-source 活动**
   ```javascript
   risksPerHour: {} // 删除 pressure
   ```

---

## 五、测试策略

### 5.1 单元测试

**新增：** `test/pressure.test.js`

**覆盖：**
- `getPressureThresholdEffects()` 各阈值正确返回
- `getPressureRecoveryMultiplier()` 计算正确
- 压力过载检查触发和重置逻辑

---

### 5.2 集成测试

**场景 1：压力累积测试**
- 连续进行 incident-response 3 天
- 验证压力能累积到 50+、75+
- 验证夜间恢复后压力不会清零

**场景 2：精力-风险关系测试**
- 在精力 90/60/30/15 时执行相同活动
- 验证疲劳时压力产生率确实更高
- 验证 `riskMultiplier` 调整生效

**场景 3：主动减压测试**
- 执行 rest 活动验证压力降低
- 验证 documentation/open-source 压力变化

**场景 4：压力过载测试**
- 让压力保持 75+ 超过 2 天
- 验证事件触发、资源变化、工作中断

---

### 5.3 平衡性测试

**测试 1：正常流程**
- 用 academy-prodigy（低抗压）游戏 10 天
- 观察压力曲线，确认不会过于惩罚

**测试 2：高压流派**
- 用 determined-switcher（高抗压）连续外包/救火
- 验证高抗压玩家能承受更高压力

**测试 3：数值边界**
- 压力从 0 到 100 需要多久？
- 压力从 100 到 25 需要多久？
- 是否存在"压力死锁"？

---

## 六、人物卡平衡

**需要重新评估：**

| 人物卡 | 初始压力 | resilience | 建议调整 |
|--------|---------|------------|----------|
| perfectionist-qa | 25 | 4 | 降低初始压力至 15 |

---

## 七、实施计划

### 阶段 1：代码结构（1 天）
- [ ] 创建 `src/core/pressure.js`
- [ ] 编写单元测试

### 阶段 2：数值调整（1 天）
- [ ] 修改 `ENERGY_STATUS_DEFS`
- [ ] 移除每日固定恢复
- [ ] 调整休整恢复速率
- [ ] 调整活动压力影响

### 阶段 3：阈值与过载（1 天）
- [ ] 实现 `getPressureThresholdEffects()`
- [ ] 实现 `checkPressureOverload()`
- [ ] 整合到结算流程

### 阶段 4：测试与平衡（2 天）
- [ ] 集成测试
- [ ] 完整游戏流程测试
- [ ] 调整数值

**总计：** 5 天

---

## 八、预期效果

1. **压力成为战略资源** - 需要 5-10 天才能从高压恢复
2. **疲劳时风险激增** - 透支工作会快速累积压力，强化休息必要性
3. **管理深度增加** - 主动减压 vs 被动恢复的权衡
4. **resilience 价值提升** - 从边缘属性变为核心生存属性

---

## 九、风险与应对

**风险 1：压力过难管理**
- 应对：微调恢复速率（上调 10-20%）

**风险 2：精力-风险倍率过高**
- 应对：降低 `riskMultiplier`（透支从 2.2 降至 2.0）

**风险 3：perfectionist-qa 过难**
- 应对：降低初始压力（25 → 15）

