# 属性成长系统优化设计

## 一、设计目标

优化《代码人生》的属性成长系统，解决以下四个核心问题：

1. **成长速度太慢** - 属性升级需要的经验过多，且经验来源单一
2. **属性收益不平衡** - 某些属性（logic、focus）明显比其他属性更有价值
3. **成长路径单一** - 玩家缺少主动规划属性成长的选择空间
4. **反馈感不足** - 缺少明确的里程碑提示，属性提升后收益不够明显

## 二、当前系统分析

### 2.1 属性升级成本

当前公式：`cost = 50 + currentAttribute * 5`

| 当前属性 | 升级成本 | 累计成本（从20开始） |
|---------|---------|---------------------|
| 20 → 21 | 120 | 120 |
| 30 → 31 | 200 | 1,620 |
| 50 → 51 | 300 | 6,120 |
| 70 → 71 | 400 | 13,620 |

### 2.2 属性经验来源

**当前来源**：
- 活动：每游戏小时 5-14 点（主要来源）
- 项目：首次完成里程碑一次性奖励（10-45 点）
- 晋升：职业晋升一次性奖励（30-120 点）
- 目标：领取目标一次性奖励

**问题**：学习技能和项目推进过程中不给属性经验，导致成长感断档

### 2.3 属性影响面

| 属性 | 当前影响 | 覆盖度评级 |
|-----|---------|----------|
| logic | Bug/技术债缓解、加班风险缓解、多个活动倍率 | ★★★★★ |
| focus | 加班缓解、少数活动倍率 | ★★★☆☆ |
| learning | 学习时间缩短（上限 -20%） | ★★☆☆☆ |
| communication | 项目压力缓解、少数活动倍率 | ★★☆☆☆ |
| resilience | 压力缓解、作息收益、少数活动倍率 | ★★★☆☆ |
| creativity | 极少活动倍率、副业金钱加成 | ★☆☆☆☆ |

**问题**：creativity 和 communication 的投资回报率明显低于 logic 和 focus

## 三、优化方案

### 3.1 成长速度优化

#### 3.1.1 降低属性升级成本

**新公式**：`cost = 30 + currentAttribute * 3`

**成本对比**：

| 当前属性 | 旧成本 | 新成本 | 降低幅度 |
|---------|-------|-------|---------|
| 20 → 21 | 120 | 90 | -25% |
| 30 → 31 | 200 | 120 | -40% |
| 50 → 51 | 300 | 180 | -40% |
| 70 → 71 | 400 | 240 | -40% |
| 90 → 91 | 500 | 300 | -40% |

**累计成本对比（从属性20升到目标值）**：

| 目标属性 | 旧累计成本 | 新累计成本 | 总降低 |
|---------|----------|----------|--------|
| 30 | 1,620 | 1,020 | -37% |
| 50 | 6,120 | 3,780 | -38% |
| 70 | 13,620 | 8,280 | -39% |

#### 3.1.2 活动属性经验倍增

**调整**：所有活动的 `attributeExpPerHour` 数值 **x3**

**示例**：

| 活动 | 旧经验/小时 | 新经验/小时 |
|-----|-----------|-----------|
| 写功能 | focus: 9, logic: 5 | focus: 27, logic: 15 |
| 系统学习 | learning: 14 | learning: 42 |
| 排查 Bug | logic: 9, resilience: 5 | logic: 27, resilience: 15 |
| 线上救火 | resilience: 9, logic: 5, focus: 5 | resilience: 27, logic: 15, focus: 15 |
| 开源协作 | communication: 9, creativity: 5 | communication: 27, creativity: 15 |

**计算示例**：
- 假设玩家每天工作 8 游戏小时
- 写功能 8 小时：focus +216, logic +120（旧值：focus +72, logic +40）
- 配合新成本公式，从 focus 20 升到 30 的时间从约 22.5 小时缩短到约 4.7 小时

#### 3.1.3 技能学习给属性经验

**新增机制**：学习技能过程中持续获得相关属性经验

**设计规则**：
- 技能学习期间，每游戏小时给予属性经验
- 经验量根据技能 tier（1-5）确定
- 经验分配对应技能的 `attributeRequirements`
- 学习完成时，额外获得一次性奖励

**每小时经验量（按 tier）**：

| Tier | 每小时经验（单属性） | 完成奖励（单属性） |
|------|-------------------|------------------|
| 1 | 8 | 20 |
| 2 | 10 | 30 |
| 3 | 12 | 40 |
| 4 | 14 | 50 |
| 5 | 16 | 60 |

**经验分配方式**：
- 技能有 1 个 `attributeRequirement`：100% 给该属性
- 技能有 2 个 `attributeRequirement`：70% 给主属性，30% 给次属性
- 主属性定义：要求值更高的属性

**示例**：

```javascript
// JavaScript (tier 1): logic: 22, learning: 24
// learning 要求更高，为主属性
// 学习时每小时: learning +5.6, logic +2.4 (总计 8)
// 学习耗时 600 秒 = 10 游戏小时
// 学习过程: learning +56, logic +24
// 完成奖励: learning +14, logic +6 (总计 20)
// 总获得: learning +70, logic +30

// Docker (tier 3): resilience: 30, logic: 28
// resilience 要求更高，为主属性
// 学习时每小时: resilience +8.4, logic +3.6 (总计 12)
// 学习耗时 2100 秒 = 35 游戏小时
// 学习过程: resilience +294, logic +126
// 完成奖励: resilience +28, logic +12 (总计 40)
// 总获得: resilience +322, logic +138

// LLM Agent (tier 5): creativity: 44, learning: 42
// 学习时每小时: creativity +11.2, learning +4.8 (总计 16)
// 学习耗时 5400 秒 = 90 游戏小时
// 学习过程: creativity +1008, learning +432
// 完成奖励: creativity +42, learning +18 (总计 60)
// 总获得: creativity +1050, learning +450
```

#### 3.1.4 项目推进给属性经验

**新增机制**：项目每个阶段推进时，持续获得相关属性经验

**设计规则**：
- 每个项目阶段绑定 1-2 个核心属性
- 阶段推进时按游戏小时给予属性经验
- 经验量与项目难度成正比

**每小时经验量（按难度）**：

| 难度 | 每小时经验 |
|------|----------|
| 1 | 10 |
| 2 | 14 |
| 3 | 18 |
| 4 | 22 |
| 5 | 26 |

**阶段属性分配策略**：
- **需求阶段**：communication（业务沟通、需求理解）
- **设计阶段**：logic + creativity（架构设计、方案选型）
- **实现阶段**：focus + 项目主技能对应属性
- **测试阶段**：logic + focus（测试用例、边界处理）
- **部署阶段**：resilience（上线压力、问题应对）

**示例**：

```javascript
// "个人主页"项目 (难度 1, 3 阶段)
// 需求校准 (3h): communication +30
// 实现推进 (8h): focus +40, creativity +40
// 验收收口 (2h): logic +20
// 总计: communication +30, focus +40, creativity +40, logic +20

// "API 网关"项目 (难度 3, 3 阶段)
// 需求校准 (4h): communication +72
// 实现推进 (12h): logic +108, resilience +108
// 验收收口 (4h): logic +72
// 总计: communication +72, logic +180, resilience +108

// "AI 评测平台"项目 (难度 5, 4 阶段)
// 需求阶段 (6h): communication +156
// 设计阶段 (8h): logic +104, creativity +104  
// 实现阶段 (20h): focus +260, learning +260
// 验收阶段 (6h): logic +156
// 总计: communication +156, logic +260, creativity +104, focus +260, learning +260
```

**首次完成奖励保留**：
- 项目 `attributeExp` 字段的一次性奖励仍然保留
- 这是对首次完成里程碑的额外认可
- 推进经验是持续产出，首次奖励是里程碑奖励

### 3.2 属性收益全面化

#### 3.2.1 当前问题

部分属性影响面过窄，导致投资回报率低：
- `creativity` 只影响极少数活动和副业金钱
- `communication` 只影响项目压力和少数活动
- `learning` 只影响学习速度，对日常产出无帮助

#### 3.2.2 属性收益扩展

**设计原则**：每个属性都应该影响所有相关行动类型的收益

**扩展方案**：

##### Logic（逻辑）

**新增影响**：
- 所有质量活动收益 +0-22%
  - 适用活动：bug-hunting, refactoring, testing, code-review, incident-response
  - 公式：`outputMultiplier *= (1 + attributeBonus(logic, 0.003, 0.22))`

**完整影响汇总**：
- Bug 风险缓解 ✓（已有）
- 技术债缓解 ✓（已有）
- 加班 Bug/债务风险缓解 ✓（已有）
- 质量活动效率 +0-22% ✓（新增）

##### Focus（专注）

**新增影响**：
- 所有持续产出活动收益 +0-22%
  - 适用活动：feature-coding, testing, documentation, architecture
  - 公式：`outputMultiplier *= (1 + attributeBonus(focus, 0.003, 0.22))`

**完整影响汇总**：
- 加班效率缓解 ✓（已有）
- 持续产出活动效率 +0-22% ✓（新增）

##### Learning（学习）

**新增影响**：
- 知识产出 +0-25%
  - 适用活动：study, prompt-engineering
  - 公式：`knowledgeOutput *= (1 + attributeBonus(learning, 0.0035, 0.25))`
- 所有技能学习速度 +0-25%（从当前 -20% 提升到 -25%）
  - 公式：`learningRelief = attributeBonus(learning, 0.0035, 0.25)`
- 技能升级时获得相关属性经验 +0-20%
  - 公式：`expBonus = attributeBonus(learning, 0.003, 0.2)`

**完整影响汇总**：
- 技能学习速度 +0-25% ✓（增强）
- 知识产出 +0-25% ✓（新增）
- 技能升级经验加成 +0-20% ✓（新增）

##### Communication（沟通）

**新增影响**：
- 所有协作活动收益 +0-22%
  - 适用活动：freelancing, open-source, documentation, code-review
  - 公式：`outputMultiplier *= (1 + attributeBonus(communication, 0.003, 0.22))`
- 金钱获取 +0-18%
  - 适用：所有金钱产出（活动、项目奖励）
  - 公式：`moneyMultiplier *= (1 + attributeBonus(communication, 0.0025, 0.18))`

**完整影响汇总**：
- 项目压力风险缓解 ✓（已有）
- 协作活动效率 +0-22% ✓（新增）
- 金钱获取 +0-18% ✓（新增）

##### Resilience（抗压）

**新增影响**：
- 高压活动收益 +0-22%
  - 适用活动：incident-response, performance-tuning, freelancing（高压力活动）
  - 公式：`outputMultiplier *= (1 + attributeBonus(resilience, 0.003, 0.22))`
- 精力恢复 +0-20%
  - 适用：所有作息恢复、rest 活动
  - 公式：`energyRecovery *= (1 + attributeBonus(resilience, 0.003, 0.2))`

**完整影响汇总**：
- 压力惩罚缓解 ✓（已有）
- 压力降低效率提升 ✓（已有）
- 加班压力缓解 ✓（已有）
- 高压活动效率 +0-22% ✓（新增）
- 精力恢复 +0-20% ✓（新增）

##### Creativity（创造）

**新增影响**：
- 所有创造类活动收益 +0-22%
  - 适用活动：architecture, prompt-engineering, open-source
  - 公式：`outputMultiplier *= (1 + attributeBonus(creativity, 0.003, 0.22))`
- 线索产出 +0-25%
  - 适用：所有线索产出
  - 公式：`leadsOutput *= (1 + attributeBonus(creativity, 0.0035, 0.25))`
- 项目创新阶段成功率加成 +0-8%
  - 适用：项目设计阶段、创新类项目
  - 公式：`successRateBonus = attributeBonus(creativity, 0.001, 0.08)`

**完整影响汇总**：
- 副业金钱加成 ✓（已有）
- 创造类活动效率 +0-22% ✓（新增）
- 线索产出 +0-25% ✓（新增）
- 项目创新加成 +0-8% ✓（新增）

#### 3.2.3 收益平衡性验证

**测试场景**：属性从 20 提升到 40 时的收益对比

| 属性 | 主要收益 | 受益频率 | 投资价值 |
|-----|---------|---------|---------|
| logic | 质量活动 +22%，Bug/债务缓解增强 | 高（质量活动、所有项目） | ★★★★★ |
| focus | 持续产出 +22%，加班缓解增强 | 高（主要产出活动） | ★★★★★ |
| learning | 学习速度 +25%，知识产出 +25% | 中（学习技能、知识活动） | ★★★★☆ |
| communication | 协作活动 +22%，金钱 +18% | 中高（协作活动、所有金钱） | ★★★★☆ |
| resilience | 高压活动 +22%，精力恢复 +20% | 中高（压力管理、恢复） | ★★★★☆ |
| creativity | 创造活动 +22%，线索 +25% | 中（创造活动、创新项目） | ★★★★☆ |

**结论**：优化后，所有属性的投资价值趋于平衡，不再有明显的"废属性"

### 3.3 里程碑与反馈系统

#### 3.3.1 里程碑设计原则

1. **质变而非量变**：里程碑应解锁新能力或显著改变游戏机制
2. **符合属性特性**：能力效果应强化该属性的核心定位
3. **分布合理**：覆盖从中期到后期的成长节点
4. **清晰可感知**：效果要足够明显，玩家能立即感受到

#### 3.3.2 里程碑阈值

**选定阈值**：25、40、55、70、85

**分布逻辑**：
- 25：早期目标，新手也能较快达到
- 40：中期目标，开始专精某个方向
- 55：进阶目标，需要持续投入
- 70：高级目标，深度专精的标志
- 85：大师级目标，接近属性上限

#### 3.3.3 里程碑能力详细设计

##### Logic（逻辑）

| 阈值 | 名称 | 效果 | 设计意图 |
|-----|------|------|---------|
| 25 | 代码直觉觉醒 | Bug 风险额外 -5% | 早期质量意识养成 |
| 40 | 架构洞察 | 技术债降低效率的影响额外 -10% | 中期债务管理能力 |
| 55 | 质量守护者 | 项目成功率额外 +8% | 进阶质量保障能力 |
| 70 | 系统思维 | 所有质量活动效率额外 +15% | 高级质量专精 |
| 85 | 逻辑大师 | 加班时 Bug/债务风险额外 -20% | 大师级加班质量控制 |

##### Focus（专注）

| 阈值 | 名称 | 效果 | 设计意图 |
|-----|------|------|---------|
| 25 | 心流入门 | 精力充沛（90-100）时产出加成从 +10% 提升到 +15% | 强化高精力状态 |
| 40 | 持续输出 | 加班效率惩罚减少 10%（从 0.45 基数提升） | 中期加班能力 |
| 55 | 专注之力 | 所有持续产出活动效率额外 +12% | 进阶专注产出 |
| 70 | 心流大师 | 精力消耗 -10%（所有活动） | 高级持久力 |
| 85 | 永动机 | 精力透支（1-29）时效率惩罚减半（从 -45% 变为 -22.5%） | 大师级低精力续航 |

##### Learning（学习）

| 阈值 | 名称 | 效果 | 设计意图 |
|-----|------|------|---------|
| 25 | 快速学习 | 技能学习速度额外 +10% | 早期学习加速 |
| 40 | 知识吸收 | 知识产出额外 +20% | 中期知识积累 |
| 55 | 学习专家 | 技能升级成本 -15%（所有资源） | 进阶技能成长 |
| 70 | 博学多才 | 同时学习多个技能时，学习速度惩罚减半 | 高级多线成长 |
| 85 | 智慧化身 | 学习任何技能自动获得该技能主属性 10% 额外经验 | 大师级融会贯通 |

##### Communication（沟通）

| 阈值 | 名称 | 效果 | 设计意图 |
|-----|------|------|---------|
| 25 | 有效表达 | 项目压力风险额外 -8% | 早期协作减压 |
| 40 | 协作增效 | 所有协作活动效率额外 +15% | 中期协作产出 |
| 55 | 谈判高手 | 外包金钱收益额外 +20% | 进阶商务能力 |
| 70 | 影响力 | 声望获取额外 +25% | 高级社区影响力 |
| 85 | 沟通大师 | 项目 Deadline 逾期惩罚减半 | 大师级危机沟通 |

##### Resilience（抗压）

| 阈值 | 名称 | 效果 | 设计意图 |
|-----|------|------|---------|
| 25 | 压力管理 | 压力恢复速度 +20% | 早期压力控制 |
| 40 | 钢铁意志 | 压力 > 70 时效率惩罚减半 | 中期高压续航 |
| 55 | 救火专家 | 线上救火、性能调优活动效率额外 +18% | 进阶救火能力 |
| 70 | 抗压核心 | 压力上限从 100 提升到 120 | 高级压力承受 |
| 85 | 不屈之志 | 加班不再增加压力（加班压力为 0） | 大师级加班免疫 |

##### Creativity（创造）

| 阈值 | 名称 | 效果 | 设计意图 |
|-----|------|------|---------|
| 25 | 创意火花 | 创造类活动效率额外 +12% | 早期创新产出 |
| 40 | 创新思维 | 项目所有阶段成功率额外 +5% | 中期创新优势 |
| 55 | 产品直觉 | 线索产出额外 +30% | 进阶产品能力 |
| 70 | 灵感涌现 | 副业金钱收益额外 +40% | 高级变现能力 |
| 85 | 创造大师 | 解锁"创新冲刺"特殊状态（完成创新项目后获得，持续 3 天，创造类产出 +50%） | 大师级创新爆发 |

#### 3.3.4 里程碑通知系统

**触发时机**：属性达到里程碑阈值时立即通知

**通知内容**：
1. 里程碑名称和达成的属性值
2. 解锁的能力效果（具体数值）
3. 主题性的成长描述（增强沉浸感）

**通知格式示例**：

```
🎯 属性里程碑达成！

逻辑 达到 40
解锁能力：架构洞察
效果：技术债降低代码效率的影响减少 10%

你开始能在复杂系统中看到隐藏的债务链条，重构不再只是凭感觉。
```

```
🎯 属性里程碑达成！

专注 达到 70
解锁能力：心流大师
效果：所有活动的精力消耗 -10%

你找到了让心流持续更久的节奏，同样的精力能完成更多工作。
```

```
🎯 属性里程碑达成！

创造 达到 85
解锁能力：创造大师
效果：完成创新项目后获得"创新冲刺"状态，持续 3 天，创造类产出 +50%

灵感不再是偶然，你已经能主动进入那种万物皆可连接的创造状态。
```

#### 3.3.5 属性面板增强

**新增显示内容**：

1. **进度信息**：
   - 当前属性值 / 下一里程碑
   - 距离下一里程碑的经验进度条
   - 经验数值：当前经验 / 所需经验

2. **里程碑列表**：
   - 已解锁的里程碑能力（带 ✓ 标记）
   - 下一个里程碑预览（带说明）

3. **收益汇总**：
   - 该属性对各类行动的具体加成百分比
   - 区分基础加成和里程碑加成

**面板示例**：

```
========== 属性详情 ==========

逻辑 42 [████████░░] 55
  经验：240 / 396

已解锁里程碑：
  ✓ 代码直觉觉醒 (Lv.25) - Bug 风险额外 -5%
  ✓ 架构洞察 (Lv.40) - 技术债效率影响额外 -10%

下一里程碑：
  质量守护者 (Lv.55) - 项目成功率额外 +8%
  还需经验：156 点

当前收益：
  • Bug 风险缓解：基础 -13% + 直觉 -5% = -18%
  • 技术债效率影响：基础 -12% + 洞察 -10% = -22%
  • 质量活动效率：+17%
  • 加班 Bug/债务风险缓解：+13%
```

### 3.4 成长路径引导

虽然暂不实施专精路线系统，但通过以下方式引导玩家规划成长路径：

#### 3.4.1 属性建议系统

**触发时机**：
- 选择人物卡时
- 学习新技能前
- 晋升时
- 玩家主动查询属性信息时

**建议内容**：根据当前属性分布和已解锁内容，给出成长建议

**示例**：

```
属性建议：

你的 logic 42、focus 38 已经较高，适合专精质量和产出路线。
建议优先目标：
  • logic 达到 55 - 解锁"质量守护者"，项目成功率大幅提升
  • focus 达到 40 - 解锁"持续输出"，加班效率提升

当前短板：
  • communication 只有 18，限制了外包和协作活动收益
  • 建议通过"写文档"、"开源协作"活动补强
```

#### 3.4.2 里程碑快捷查询

**命令**：`milestones` 或在属性面板中按键查看

**显示内容**：
- 所有属性的里程碑列表
- 当前已解锁和未解锁状态
- 距离下一个里程碑的差距

**示例**：

```
========== 属性里程碑总览 ==========

逻辑 (42/100):
  ✓ Lv.25 代码直觉觉醒
  ✓ Lv.40 架构洞察
  ⬜ Lv.55 质量守护者 (还需 13 点)
  ⬜ Lv.70 系统思维 (还需 28 点)
  ⬜ Lv.85 逻辑大师 (还需 43 点)

专注 (38/100):
  ✓ Lv.25 心流入门
  ⬜ Lv.40 持续输出 (还需 2 点)
  ⬜ Lv.55 专注之力 (还需 17 点)
  ⬜ Lv.70 心流大师 (还需 32 点)
  ⬜ Lv.85 永动机 (还需 47 点)

... (其他属性)
```

#### 3.4.3 成长任务（可选）

在目标系统中添加属性相关的成长任务，引导玩家关注属性提升：

**示例任务**：

```javascript
{
  id: "attribute_milestone_logic_40",
  name: "逻辑精进",
  type: "支线",
  description: "将逻辑属性提升到 40，解锁架构洞察能力",
  requirements: { attributes: { logic: 40 } },
  rewards: { money: 100, reputation: 1 }
}

{
  id: "balanced_growth_30",
  name: "全面发展",
  type: "支线",
  description: "将所有属性提升到至少 30",
  requirements: { 
    attributes: { 
      logic: 30, focus: 30, learning: 30, 
      communication: 30, resilience: 30, creativity: 30 
    } 
  },
  rewards: { money: 200, reputation: 2, attributeExp: { 所有属性: 50 } }
}
```

## 四、实施计划

### 4.1 开发优先级

**阶段 1：核心数值调整（高优先级）**
1. 修改属性升级成本公式：`cost = 30 + currentAttribute * 3`
2. 活动属性经验 x3（修改 `content.js` 中所有活动的 `attributeExpPerHour`）
3. 扩展属性收益影响面（修改 `game.js` 中的倍率计算函数）

**阶段 2：新增经验来源（中优先级）**
4. 技能学习给属性经验
   - 学习过程中持续给经验
   - 学习完成时给奖励经验
5. 项目推进给属性经验
   - 为每个项目阶段分配属性
   - 阶段推进时按工时给经验

**阶段 3：反馈系统（中优先级）**
6. 实现里程碑系统
   - 定义里程碑数据结构
   - 实现里程碑能力效果
   - 添加里程碑达成通知
7. 优化属性面板展示
   - 显示进度条和里程碑信息
   - 显示详细收益汇总

**阶段 4：引导优化（低优先级）**
8. 添加属性建议系统
9. 实现里程碑快捷查询
10. 添加属性相关成长任务（可选）

### 4.2 关键文件改动

| 文件 | 改动内容 | 难度 |
|------|---------|------|
| `src/game.js` | 属性升级成本公式、属性收益计算、里程碑系统 | 中 |
| `src/content.js` | 活动属性经验 x3 | 低 |
| `src/skills/skills.js` | 技能学习属性经验 | 中 |
| `src/projects/projects.js` | 项目阶段属性分配、推进经验 | 中 |
| `src/content/projects.js` | 为项目阶段添加属性字段 | 低 |
| `src/tui.js` / `src/ui/formatting.js` | 属性面板展示优化 | 低 |

### 4.3 数据迁移

**兼容性考虑**：
- 旧存档的属性经验仍然有效
- 升级成本降低后，部分玩家可能立即升级多个属性点（这是预期行为）
- 里程碑系统向前兼容，已达到阈值的属性会自动解锁里程碑能力

**测试重点**：
- 验证新成本公式下的成长曲线
- 验证新经验来源的数值平衡
- 验证里程碑能力的效果叠加

## 五、数值平衡验证

### 5.1 成长速度测试

**场景 1：专注于单个活动**

玩家每天工作 8 游戏小时，持续做"写功能"活动：

| 天数 | 旧系统 focus | 新系统 focus | 差距 |
|-----|-------------|-------------|------|
| 1 | 20 | 20 | 0 |
| 3 | 20 | 22 | +2 |
| 7 | 21 | 26 | +5 |
| 14 | 23 | 32 | +9 |
| 30 | 27 | 42 | +15 |

**场景 2：学习 + 项目混合**

玩家用 7 天学习 Docker（tier 3），然后做 14 天项目（难度 3）：

| 阶段 | 旧系统 | 新系统 | 差距 |
|-----|-------|-------|------|
| 学习 Docker (7天) | resilience: +0, logic: +0 | resilience: +322, logic: +138 | 仅学习就获得大量经验 |
| 项目推进 (14天) | resilience: +42（首次奖励） | resilience: +42 + 1512（推进经验）= +1554 | 持续产出 |
| 总计 | resilience: +42 | resilience: +1876 | **44倍差距** |

**结论**：新系统下，属性成长速度大幅提升，且学习技能和做项目不再是"只为技能不为属性"的选择

### 5.2 属性收益平衡性

**测试属性**：从 20 提升到 50 时的综合收益

| 属性 | 旧系统主要收益 | 新系统主要收益 | 收益提升 |
|-----|--------------|--------------|---------|
| logic | Bug -13%，质量活动部分提升 | Bug -18%，质量活动 +22%，项目成功率 +8% | ★★★ |
| focus | 加班缓解，少数活动提升 | 加班缓解增强，持续产出 +22%，精力消耗 -10% | ★★★ |
| learning | 学习速度 -20% | 学习速度 -25%，知识产出 +25%，技能升级加成 +20% | ★★★ |
| communication | 项目压力缓解 | 项目压力缓解增强，协作活动 +22%，金钱 +18%，声望 +25% | ★★★★ |
| resilience | 压力缓解 | 压力缓解增强，高压活动 +22%，精力恢复 +20%，压力上限 +20 | ★★★★ |
| creativity | 副业金钱少量加成 | 创造活动 +22%，线索 +30%，项目成功率 +5%，副业金钱 +40% | ★★★★★ |

**结论**：communication、resilience、creativity 的投资价值显著提升，不再是"鸡肋属性"

### 5.3 里程碑影响力

**测试场景**：logic 从 20 → 85 的质变过程

| 阶段 | 属性值 | 里程碑 | 累计特殊效果 | 质量活动效率 |
|-----|-------|-------|------------|------------|
| 初期 | 20-24 | 无 | 无 | 基础 |
| 早期 | 25 | 代码直觉觉醒 | Bug 风险额外 -5% | +2% |
| 中期 | 40 | 架构洞察 | + 技术债影响 -10% | +10% |
| 进阶 | 55 | 质量守护者 | + 项目成功率 +8% | +18% |
| 高级 | 70 | 系统思维 | + 质量活动 +15% | +37% |
| 大师 | 85 | 逻辑大师 | + 加班风险 -20% | +52% |

**结论**：里程碑带来的质变非常明显，玩家会有清晰的成长目标感

## 六、潜在风险与应对

### 6.1 风险：成长过快导致游戏周期缩短

**表现**：玩家可能在较短时间内达到属性上限

**应对措施**：
1. 属性上限仍为 100，后期升级成本仍然很高
2. 里程碑系统提供了除数值外的成长目标
3. 可以通过后续更新引入"突破系统"扩展成长空间

### 6.2 风险：旧存档玩家突然获得大量属性点

**表现**：存档升级后，部分玩家可能立即升级多个属性点

**应对措施**：
1. 这是预期行为，作为对长期玩家的"补偿"
2. 在更新说明中明确告知玩家
3. 升级后显示特殊通知："属性系统优化，你积累的经验转化为实力提升"

### 6.3 风险：里程碑能力叠加后过强

**表现**：高属性玩家可能因里程碑叠加而过于强大

**应对措施**：
1. 里程碑效果已经过平衡性验证，85 级里程碑需要极大投入
2. 可以在后续版本中调整具体数值
3. 引入更高难度的内容来匹配高属性玩家

### 6.4 风险：属性成长路径趋同

**表现**：所有玩家都追求相同的属性成长路线

**应对措施**：
1. 人物卡的初始属性差异仍然存在
2. 不同职业和项目路线需要不同的属性重点
3. 后续可以引入"专精路线系统"进一步增加差异化

## 七、总结

### 7.1 核心改进

1. **成长速度提升 2-3 倍**：通过降低成本、提升活动经验、新增经验来源
2. **属性价值平衡**：所有属性都有明确的收益，不再有"废属性"
3. **清晰的成长目标**：里程碑系统提供了 25/40/55/70/85 五个质变节点
4. **持续反馈感**：学习技能和做项目过程中持续获得属性经验

### 7.2 实施建议

**优先实施**：
- 阶段 1：核心数值调整（成本公式、活动经验倍增、收益扩展）
- 阶段 2：技能学习和项目推进给经验
- 阶段 3：里程碑系统

**后续考虑**：
- 属性建议系统
- 成长任务
- 专精路线系统（作为未来扩展）

### 7.3 预期效果

- 玩家能更快感受到属性成长
- 所有属性都有投资价值，路线选择更丰富
- 里程碑提供清晰的短期和长期目标
- 学习技能和做项目不再是"纯消耗"，而是成长的一部分

---

## 附录：具体实现伪代码

### A.1 属性升级成本

```javascript
// src/game.js - 修改 addAttributeExp 中的成本计算
function getAttributeUpgradeCost(currentAttribute) {
  return 30 + currentAttribute * 3;  // 旧：50 + currentAttribute * 5
}
```

### A.2 活动属性经验倍增

```javascript
// src/content.js - 批量修改所有活动
activity({
  id: "feature-coding",
  attributeExpPerHour: { focus: 27, logic: 15 }  // 旧：{ focus: 9, logic: 5 }
}),
activity({
  id: "study",
  attributeExpPerHour: { learning: 42 }  // 旧：{ learning: 14 }
}),
// ... 其他活动类似处理
```

### A.3 技能学习给经验

```javascript
// src/game.js - settleSkillLearning 中添加
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
  
  // 学习完成时给奖励
  const currentProgress = getSkillLearningProgress(state, skill);
  if (currentProgress.workedSeconds >= currentProgress.requiredSeconds) {
    const bonusExp = 18 + skillTier * 4;  // tier 1-5 对应 20-60
    if (attrs.length === 1) {
      addAttributeExp(state, attrs[0], bonusExp, options);
    } else if (attrs.length === 2) {
      addAttributeExp(state, attrs[0], bonusExp * 0.7, options);
      addAttributeExp(state, attrs[1], bonusExp * 0.3, options);
    }
    // ... 原有完成逻辑
  }
  
  // ... 原有代码
}
```

### A.4 项目推进给经验

```javascript
// src/projects/projects.js - settleProject 中添加
function settleProject(state, project, seconds, options = {}) {
  // ... 原有代码
  
  // 新增：阶段推进给属性经验
  const stage = project.stages[progress.stageIndex];
  const difficulty = project.difficulty || 1;
  const expPerHour = 8 + difficulty * 2;  // 难度 1-5 对应 10-26
  const gameMinutes = workedSeconds / 60;
  const expGained = (expPerHour / 60) * gameMinutes;
  
  // 从阶段元数据中获取属性（需要在项目配置中添加）
  const stageAttributes = stage.attributes || getDefaultStageAttributes(progress.stageIndex);
  for (const attr of stageAttributes) {
    addAttributeExp(state, attr, expGained / stageAttributes.length, options);
  }
  
  // ... 原有代码
}

function getDefaultStageAttributes(stageIndex) {
  // 默认阶段属性映射
  const mapping = {
    0: ['communication'],           // 需求阶段
    1: ['logic', 'creativity'],     // 设计阶段
    2: ['focus'],                   // 实现阶段
    3: ['logic', 'focus'],          // 测试阶段
    4: ['resilience']               // 部署阶段
  };
  return mapping[stageIndex] || ['focus'];
}
```

### A.5 里程碑系统

```javascript
// src/game.js - 添加里程碑数据和检查逻辑
const ATTRIBUTE_MILESTONES = {
  logic: [
    { level: 25, name: '代码直觉觉醒', effect: 'bug_risk_extra', value: -0.05 },
    { level: 40, name: '架构洞察', effect: 'debt_efficiency_penalty', value: -0.1 },
    { level: 55, name: '质量守护者', effect: 'project_success_rate', value: 0.08 },
    { level: 70, name: '系统思维', effect: 'quality_activity_efficiency', value: 0.15 },
    { level: 85, name: '逻辑大师', effect: 'overtime_quality_risk', value: -0.2 }
  ],
  // ... 其他属性的里程碑
};

function checkAndUnlockMilestones(state, attr, beforeValue, afterValue, events) {
  const milestones = ATTRIBUTE_MILESTONES[attr] || [];
  for (const milestone of milestones) {
    if (beforeValue < milestone.level && afterValue >= milestone.level) {
      state.unlockedMilestones = state.unlockedMilestones || {};
      state.unlockedMilestones[attr] = state.unlockedMilestones[attr] || [];
      state.unlockedMilestones[attr].push(milestone.level);
      
      pushGameEvent(events, 'milestone', 
        `🎯 属性里程碑达成！\n\n${ATTRIBUTE_NAMES[attr]} 达到 ${milestone.level}\n解锁能力：${milestone.name}\n效果：${getMilestoneEffectDescription(milestone)}`,
        'excellent'
      );
    }
  }
}

// 在各个计算函数中应用里程碑效果
function getMilestoneBonus(state, attr, effectType) {
  const milestones = state.unlockedMilestones?.[attr] || [];
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
```

---

**文档版本**：v1.0  
**创建日期**：2026-06-16  
**最后更新**：2026-06-16

