// 里程碑定义 - 只需要实现 logic 和 focus，其他4个属性在 Task 8 实现
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
  ]
  // 其他4个属性在 Task 8 添加
};

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
