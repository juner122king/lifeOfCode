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
  ],
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
      narrative: "你第一次把\"这个需求有问题\"说得让对方点头而不是皱眉。" },
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
      description: "完成创新项目后获得\"创新冲刺\"状态（持续3天，创造类产出 +50%）",
      narrative: "灵感不再是偶然，你已经能主动进入那种万物皆可连接的创造状态。" }
  ]
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
