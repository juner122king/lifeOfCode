# TUI 人物卡面板里程碑显示优化设计

## 一、设计目标

在 TUI 界面中直观展示属性里程碑信息，帮助玩家：
1. 快速了解已获得的里程碑能力
2. 看到距离下一里程碑的进度
3. 在顶部持久显示属性成长状态

## 二、改动概述

### 2.1 顶部状态栏扩展

在现有的玩家信息右侧新增"属性成长"面板，完整复制当前人物卡面板中的属性详情显示样式。

### 2.2 人物卡面板优化

1. **删除**：六维雷达图
2. **扩展**：每个属性从1行扩展为3行
   - 第1行：经验进度（保留原样）
   - 第2行：已获得里程碑列表（新增）
   - 第3行：下一里程碑进度（新增）

## 三、详细设计

### 3.1 顶部"属性成长"面板

**位置**：顶部状态区域，在玩家信息（InfoPanel）右侧

**显示内容**：
- 完整复制当前属性详情的显示样式
- 包括：属性名、等级、成长进度条、成长值、经验进度条、经验数值

**示例布局**：
```
┌─ 玩家信息 ─────────────┬─ 属性成长 ──────────────────────────────┐
│ 档案：xxx              │ 逻辑 42  [████░] +10  经验 [████░] 240/396 │
│ 世界时间：xxx          │ 专注 38  [███░░] +5   经验 [███░░] 85/147  │
│ 当前阶段：上午         │ 学习 73  [████░] +15  经验 [██░░░] 20/249  │
│ 精力：50  压力：0      │ 沟通 11  [█░░░░] +2   经验 [███░░] 31/63   │
└────────────────────────┴─────────────────────────────────────────┘
```

**技术实现**：
- 创建新组件 `AttributeGrowthPanel`
- 复用 `getCharacterCardAttributeRows()` 函数获取数据
- 复用现有的 `AttributeProgress` 和 `Progress` 组件

### 3.2 人物卡面板 - 属性详情区域

**改动1：删除六维雷达图**
- 移除 `radarRows` 相关代码
- 移除 `getCharacterCardRadarRows()` 函数调用

**改动2：扩展属性显示为3行**

每个属性显示：
```
逻辑 42  经验 [████░░░░] 240/396
已获得：✓ Lv.25 代码直觉觉醒  ✓ Lv.40 架构洞察
下一个：[████████░░] → Lv.55 质量守护者 (还需13点)
```

**第1行（经验行）**：保持原样
- 属性名 + 等级
- 经验进度条
- 经验数值

**第2行（已获得里程碑）**：新增
- 标签："已获得："
- 已解锁里程碑列表，格式：`✓ Lv.X 里程碑名`
- 用空格分隔，一行显示（如果太长则截断）
- 如果没有已获得里程碑，显示："已获得：暂无"

**第3行（下一里程碑）**：新增
- 标签："下一个："
- 里程碑进度条（显示当前等级到下一里程碑等级的进度）
- 箭头 + 里程碑等级和名称
- 括号内显示还需多少点

**数据来源**：
- 使用 `getAttributeDetails(state, attrId)` 获取里程碑数据
- `unlockedMilestones` - 已解锁列表
- `nextMilestone` - 下一里程碑信息

## 四、数据结构

### 4.1 扩展 attributeRows 数据

在 `getCharacterCardAttributeRows()` 返回的每个属性对象中添加：

```javascript
{
  // ... 现有字段
  unlockedMilestones: [
    { level: 25, name: "代码直觉觉醒" },
    { level: 40, name: "架构洞察" }
  ],
  nextMilestone: {
    level: 55,
    name: "质量守护者",
    pointsNeeded: 13,
    progressBar: "[████████░░]",  // 10字符进度条
    progressPercent: 76  // 42/55 = 76%
  }
}
```

### 4.2 里程碑进度条计算

```javascript
// 当前等级到下一里程碑的进度
const current = 42;  // 当前等级
const target = 55;   // 下一里程碑等级
const progress = current / target;  // 0.76
const barLength = 10;
const filled = Math.floor(progress * barLength);  // 7
const progressBar = "[" + "█".repeat(filled) + "░".repeat(barLength - filled) + "]";
// 结果: "[███████░░░]"
```

## 五、技术实现

### 5.1 文件修改清单

| 文件 | 改动内容 |
|------|---------|
| `src/game.js` | 在 `getGameViewModel()` 中添加属性成长面板所需数据 |
| `src/tui.js` | 修改 `getCharacterCardAttributeRows()` 添加里程碑数据 |
| `src/tui.js` | 修改 `CharacterCardPanel` 删除雷达图，扩展属性显示 |
| `src/tui.js` | 新增 `AttributeGrowthPanel` 组件 |
| `src/tui.js` | 修改顶部布局，集成 `AttributeGrowthPanel` |

### 5.2 关键函数

**getCharacterCardAttributeRows() 扩展**：
```javascript
function getCharacterCardAttributeRows(view) {
  // ... 现有代码
  
  return view.attributes.map((attr) => {
    // ... 现有字段计算
    
    // 新增：获取里程碑数据
    const details = getAttributeDetails(state, attr.id);
    
    return {
      // ... 现有字段
      unlockedMilestones: details.unlockedMilestones.map(m => ({
        level: m.level,
        name: m.name
      })),
      nextMilestone: details.nextMilestone ? {
        level: details.nextMilestone.level,
        name: details.nextMilestone.name,
        pointsNeeded: details.nextMilestone.pointsNeeded,
        progressBar: calculateProgressBar(attr.currentValue, details.nextMilestone.level, 10),
        progressPercent: Math.floor(attr.currentValue / details.nextMilestone.level * 100)
      } : null
    };
  });
}
```

**AttributeGrowthPanel 组件**：
```javascript
function AttributeGrowthPanel({ view, budget }) {
  const attributeRows = getCharacterCardAttributeRows(view);
  const height = Math.min(8, attributeRows.length + 2);
  const width = Math.max(40, Math.floor(budget.terminalColumns * 0.4));
  
  return h(Box, {
    borderStyle: "round",
    borderColor: THEME.status.good,
    paddingX: 1,
    flexDirection: "column",
    height,
    width
  },
    h(SectionTitle, { color: THEME.status.good }, "属性成长"),
    ...attributeRows.map((row) => h(Box, { key: row.id, gap: 1 },
      h(Text, { color: THEME.text, bold: true }, trimText(row.label, 7)),
      h(AttributeProgress, { row, width: 10 }),
      h(Text, { color: THEME.status.good }, row.growthText),
      h(Text, { color: THEME.muted }, "经验"),
      h(Progress, { percent: row.upgradePercent, width: 10 }),
      h(Text, { color: THEME.muted }, row.expText)
    ))
  );
}
```

**CharacterCardPanel 修改**：
```javascript
function CharacterCardPanel({ view, budget }) {
  const attributeRows = getCharacterCardAttributeRows(view);
  
  // 删除 radarRows 相关代码
  
  const attributes = h(Box, { flexDirection: "column", flexGrow: 1 },
    h(SectionTitle, { color: THEME.status.good }, "属性详情"),
    ...attributeRows.map((row) => [
      // 第1行：经验进度
      h(Box, { key: `${row.id}-exp`, gap: 1 },
        h(Text, { color: THEME.text, bold: true }, trimText(row.label, 7)),
        h(Text, { color: THEME.muted }, "经验"),
        h(Progress, { percent: row.upgradePercent, width: 12 }),
        h(Text, { color: THEME.muted }, row.expText)
      ),
      
      // 第2行：已获得里程碑
      h(Box, { key: `${row.id}-unlocked`, gap: 1 },
        h(Text, { color: THEME.muted }, "已获得："),
        h(Text, { color: THEME.status.good }, 
          row.unlockedMilestones.length > 0
            ? row.unlockedMilestones.map(m => `✓ Lv.${m.level} ${m.name}`).join("  ")
            : "暂无"
        )
      ),
      
      // 第3行：下一里程碑
      row.nextMilestone ? h(Box, { key: `${row.id}-next`, gap: 1 },
        h(Text, { color: THEME.muted }, "下一个："),
        h(Text, { color: THEME.text }, row.nextMilestone.progressBar),
        h(Text, { color: THEME.status.info }, 
          `→ Lv.${row.nextMilestone.level} ${row.nextMilestone.name} (还需${row.nextMilestone.pointsNeeded}点)`
        )
      ) : null
    ].filter(Boolean)).flat()
  );
  
  return h(Box, { ... });
}
```

## 六、布局调整

### 6.1 顶部区域布局

**原布局**：
```
InfoPanel (全宽)
```

**新布局**：
```
┌─ InfoPanel ──────────┬─ AttributeGrowthPanel ─┐
│ (玩家信息)           │ (属性成长)             │
└──────────────────────┴────────────────────────┘
```

**实现**：
在顶部渲染逻辑中，将 InfoPanel 和 AttributeGrowthPanel 并排显示

### 6.2 响应式处理

- **宽屏模式**（terminalColumns > 100）：InfoPanel 和 AttributeGrowthPanel 并排
- **窄屏模式**（terminalColumns <= 100）：AttributeGrowthPanel 不显示（空间不足）

## 七、用户体验

### 7.1 快速浏览

玩家在顶部始终能看到：
- 所有属性的当前值
- 经验进度
- 成长情况

### 7.2 深入了解

切换到人物卡面板（按 C）可以看到：
- 每个属性已获得的里程碑能力
- 距离下一个里程碑的精确距离
- 视觉化的里程碑进度条

### 7.3 信息密度

- 顶部面板：紧凑显示，6个属性约占4-6行
- 人物卡面板：每个属性3行，信息丰富但不拥挤

## 八、测试验证

### 8.1 功能测试

- [ ] 顶部显示属性成长面板
- [ ] 属性成长面板内容与人物卡面板一致
- [ ] 人物卡面板删除了雷达图
- [ ] 每个属性显示3行（经验、已获得、下一个）
- [ ] 已解锁里程碑正确显示 ✓ 标记
- [ ] 下一里程碑进度条准确
- [ ] 宽屏/窄屏响应式正常

### 8.2 视觉验证

- [ ] 布局整齐，对齐良好
- [ ] 颜色搭配合理
- [ ] 信息层次清晰
- [ ] 无文本截断错误

---

**文档版本**：v1.0  
**创建日期**：2026-06-17  
**设计者**：Claude Code