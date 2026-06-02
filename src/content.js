const roles = [
  {
    id: "intern",
    name: "实习程序员",
    maxEnergy: 100,
    promoteTo: "junior",
    attributeExp: { focus: 30, learning: 30 },
    promoteRequirements: {
      exp: 120,
      reputation: 2,
      completedProjects: 1,
      skills: ["html-css", "javascript"],
      activityLevels: { "feature-coding": 3, study: 2 }
    }
  },
  {
    id: "junior",
    name: "初级程序员",
    maxEnergy: 120,
    promoteTo: "middle",
    attributeExp: { learning: 70, communication: 50 },
    promoteRequirements: {
      exp: 520,
      reputation: 8,
      completedProjects: 3,
      skills: ["git", "sql"],
      activityLevels: { testing: 4, documentation: 3, refactoring: 4 }
    }
  },
  {
    id: "middle",
    name: "中级程序员",
    maxEnergy: 140,
    promoteTo: "senior",
    attributeExp: { logic: 90, resilience: 70 },
    promoteRequirements: {
      exp: 1600,
      reputation: 18,
      completedProjects: 5,
      skills: ["docker", "communication"],
      activityLevels: { architecture: 6, "open-source": 5, freelancing: 4 }
    }
  },
  {
    id: "senior",
    name: "高级程序员",
    maxEnergy: 160,
    promoteTo: null,
    attributeExp: { logic: 120, communication: 100 },
    promoteRequirements: null
  }
];

const activities = [
  {
    id: "feature-coding",
    name: "写功能",
    description: "把需求变成代码，核心产出最高，但也会制造 Bug 和技术债。",
    tier: 1,
    primaryAttribute: "focus",
    activityExpPerSecond: 0.5,
    energyCostPerSecond: 0.045,
    effectsPerSecond: { codeLines: 0.9, exp: 0.08 },
    risksPerSecond: { bugs: 0.018, techDebt: 0.012, pressure: 0.004 },
    attributeExpPerMinute: { focus: 2, logic: 1 }
  },
  {
    id: "bug-hunting",
    name: "排查 Bug",
    description: "降低 Bug，积累测试用例，适合在质量风险升高时切换。",
    tier: 1,
    primaryAttribute: "logic",
    activityExpPerSecond: 0.45,
    energyCostPerSecond: 0.035,
    effectsPerSecond: { bugs: -0.18, tests: 0.04, exp: 0.07, pressure: -0.01 },
    attributeExpPerMinute: { logic: 2, resilience: 1 }
  },
  {
    id: "refactoring",
    name: "重构代码",
    description: "降低技术债，积累架构资产，为中后期项目铺路。",
    tier: 1,
    primaryAttribute: "logic",
    activityExpPerSecond: 0.42,
    energyCostPerSecond: 0.04,
    effectsPerSecond: { techDebt: -0.16, architecture: 0.025, exp: 0.06, pressure: -0.006 },
    attributeExpPerMinute: { logic: 2, focus: 1 }
  },
  {
    id: "study",
    name: "系统学习",
    description: "产出知识，用于学习技能，压力较低但不会直接交付项目。",
    tier: 1,
    primaryAttribute: "learning",
    activityExpPerSecond: 0.48,
    energyCostPerSecond: 0.025,
    effectsPerSecond: { knowledge: 0.12, exp: 0.09 },
    risksPerSecond: { pressure: 0.001 },
    attributeExpPerMinute: { learning: 3 }
  },
  {
    id: "testing",
    name: "写测试",
    description: "产出测试用例，并小幅压低 Bug。",
    tier: 2,
    primaryAttribute: "focus",
    requirements: { activityLevels: { "feature-coding": 2 } },
    activityExpPerSecond: 0.42,
    energyCostPerSecond: 0.035,
    effectsPerSecond: { tests: 0.12, bugs: -0.04, exp: 0.06 },
    attributeExpPerMinute: { focus: 2, logic: 1 }
  },
  {
    id: "documentation",
    name: "写文档",
    description: "产出文档，降低交接成本，并小幅减少技术债。",
    tier: 2,
    primaryAttribute: "communication",
    requirements: { activityLevels: { study: 2 } },
    activityExpPerSecond: 0.4,
    energyCostPerSecond: 0.025,
    effectsPerSecond: { docs: 0.1, techDebt: -0.035, exp: 0.05 },
    attributeExpPerMinute: { communication: 3 }
  },
  {
    id: "freelancing",
    name: "接外包",
    description: "产出金钱和客户线索，但会带来压力和质量风险。",
    tier: 2,
    primaryAttribute: "communication",
    requirements: { activityLevels: { "feature-coding": 3 } },
    activityExpPerSecond: 0.38,
    energyCostPerSecond: 0.05,
    effectsPerSecond: { money: 0.12, leads: 0.035, exp: 0.04 },
    risksPerSecond: { bugs: 0.006, techDebt: 0.006, pressure: 0.008 },
    attributeExpPerMinute: { communication: 2, resilience: 1 }
  },
  {
    id: "open-source",
    name: "开源协作",
    description: "积累声望、经验和少量代码，适合走长期影响力路线。",
    tier: 3,
    primaryAttribute: "communication",
    requirements: { skills: ["git"], activityLevels: { documentation: 3 } },
    activityExpPerSecond: 0.36,
    energyCostPerSecond: 0.035,
    effectsPerSecond: { reputation: 0.006, exp: 0.08, codeLines: 0.16 },
    risksPerSecond: { pressure: 0.003 },
    attributeExpPerMinute: { communication: 2, creativity: 1 }
  },
  {
    id: "architecture",
    name: "架构设计",
    description: "高效产出架构资产，并明显压低技术债。",
    tier: 3,
    primaryAttribute: "logic",
    requirements: { skills: ["sql"], activityLevels: { refactoring: 5 } },
    activityExpPerSecond: 0.34,
    energyCostPerSecond: 0.045,
    effectsPerSecond: { architecture: 0.1, docs: 0.035, techDebt: -0.08, exp: 0.06 },
    attributeExpPerMinute: { logic: 3, creativity: 1 }
  },
  {
    id: "rest",
    name: "休息恢复",
    description: "恢复精力并降低压力，是所有产出活动的机会成本。",
    tier: 1,
    primaryAttribute: "resilience",
    activityExpPerSecond: 0.25,
    energyCostPerSecond: 0,
    effectsPerSecond: { energy: 0.28, pressure: -0.08 },
    attributeExpPerMinute: { resilience: 2 }
  }
];

const skills = [
  {
    id: "html-css",
    name: "HTML/CSS",
    description: "页面终于不会像调试日志一样朴素。",
    cost: { knowledge: 18, exp: 25, money: 10 },
    multipliers: { code: 1.06, exp: 1.02 },
    attributeExp: { creativity: 18, learning: 12 }
  },
  {
    id: "javascript",
    name: "JavaScript",
    description: "开始理解为什么 undefined 不是 bug。",
    cost: { knowledge: 38, exp: 50, money: 25 },
    multipliers: { code: 1.12, exp: 1.04, bug: 1.04 },
    attributeExp: { logic: 24, learning: 16 }
  },
  {
    id: "git",
    name: "Git",
    description: "至少知道 push 前要 pull。",
    cost: { knowledge: 70, exp: 90, money: 50 },
    multipliers: { code: 1.06, bug: 0.9, debt: 0.9 },
    attributeExp: { logic: 24, resilience: 16 }
  },
  {
    id: "sql",
    name: "SQL",
    description: "能把需求翻译成 SELECT，也能把 SELECT 翻译成加班。",
    cost: { knowledge: 110, exp: 140, money: 90 },
    multipliers: { money: 1.1, exp: 1.06 },
    attributeExp: { logic: 28, learning: 18 }
  },
  {
    id: "docker",
    name: "Docker",
    description: "本地能跑，线上也有机会能跑。",
    cost: { knowledge: 240, exp: 320, money: 240 },
    multipliers: { code: 1.08, debt: 0.78, bug: 0.88 },
    attributeExp: { resilience: 34, logic: 24 }
  },
  {
    id: "communication",
    name: "沟通能力",
    description: "把“这个做不了”说成“我们换个更稳的方案”。",
    cost: { knowledge: 220, exp: 360, money: 180 },
    multipliers: { money: 1.14, exp: 1.08, debt: 0.86, pressure: 0.82 },
    attributeExp: { communication: 44, resilience: 20 }
  }
];

const tools = [
  {
    id: "used-laptop",
    name: "二手笔记本",
    description: "风扇声音像 CI 在跑全量测试。",
    cost: { money: 80 },
    multipliers: { code: 1.12 }
  },
  {
    id: "keyboard",
    name: "机械键盘",
    description: "手感提升，同事忍耐力下降。",
    cost: { money: 180 },
    multipliers: { code: 1.1, exp: 1.04 }
  },
  {
    id: "jetbrains",
    name: "JetBrains 全家桶",
    description: "自动补全让你短暂相信自己很聪明。",
    cost: { money: 520 },
    multipliers: { code: 1.22, bug: 0.9, pressure: 0.94 }
  },
  {
    id: "ai-assistant",
    name: "AI 编程助手",
    description: "产出更快，但 code review 还是要自己扛。",
    cost: { money: 900 },
    multipliers: { code: 1.32, exp: 1.08, debt: 1.1, pressure: 1.06 }
  }
];

const projects = [
  {
    id: "homepage",
    name: "个人主页",
    requirements: {
      resources: { codeLines: 80, docs: 8 },
      skills: ["html-css"],
      activityLevels: { "feature-coding": 2, documentation: 1 }
    },
    rewards: { exp: 60, money: 80, reputation: 2 },
    creative: true,
    attributeExp: { creativity: 24, communication: 12 }
  },
  {
    id: "todo",
    name: "Todo App",
    requirements: {
      resources: { codeLines: 180, tests: 20 },
      skills: ["javascript"],
      activityLevels: { "feature-coding": 4, testing: 2 }
    },
    rewards: { exp: 135, money: 170, reputation: 3 },
    attributeExp: { focus: 28, logic: 18 }
  },
  {
    id: "blog",
    name: "博客系统",
    requirements: {
      resources: { codeLines: 420, docs: 35, architecture: 12 },
      skills: ["git", "sql"],
      activityLevels: { documentation: 4, refactoring: 4 }
    },
    rewards: { exp: 300, money: 420, reputation: 5 },
    creative: true,
    attributeExp: { communication: 32, creativity: 28 }
  },
  {
    id: "admin",
    name: "电商后台",
    requirements: {
      resources: { codeLines: 900, tests: 90, architecture: 55, leads: 8 },
      skills: ["sql", "communication"],
      activityLevels: { freelancing: 4, architecture: 4, testing: 5 }
    },
    rewards: { exp: 700, money: 980, reputation: 8 },
    attributeExp: { communication: 42, resilience: 30 }
  },
  {
    id: "flash-sale",
    name: "秒杀系统",
    requirements: {
      resources: { codeLines: 1600, tests: 180, architecture: 120 },
      skills: ["docker", "sql"],
      activityLevels: { architecture: 7, refactoring: 7, "open-source": 4 }
    },
    rewards: { exp: 1350, money: 1900, reputation: 14 },
    attributeExp: { logic: 54, resilience: 48 }
  }
];

const goals = [
  {
    id: "choose-work",
    name: "选择第一项活动",
    description: "启动任意活动，让时间开始产生明确方向。",
    type: "main",
    requirements: { activityStats: { totalActiveSeconds: 30 } },
    rewards: { exp: 15, attributeExp: { focus: 8 } },
    requiresGoals: []
  },
  {
    id: "first-feature-level",
    name: "写功能入门",
    description: "把写功能提升到 2 级，建立主要产出来源。",
    type: "main",
    requirements: { activityLevels: { "feature-coding": 2 } },
    rewards: { exp: 25, money: 20, attributeExp: { focus: 12 } },
    requiresGoals: ["choose-work"]
  },
  {
    id: "learn-web-basics",
    name: "网页基础入门",
    description: "通过学习活动积累知识并学会 HTML/CSS。",
    type: "main",
    requirements: { skills: ["html-css"] },
    rewards: { exp: 25, attributeExp: { creativity: 10, learning: 10 } },
    requiresGoals: ["first-feature-level"]
  },
  {
    id: "ship-homepage",
    name: "交付个人主页",
    description: "用代码和文档交付第一份作品。",
    type: "main",
    requirements: { completedProjects: ["homepage"] },
    rewards: { money: 60, reputation: 1, attributeExp: { communication: 14 } },
    requiresGoals: ["learn-web-basics"]
  },
  {
    id: "quality-loop",
    name: "建立质量循环",
    description: "把测试提升到 2 级，开始用质量产物换项目稳定性。",
    type: "main",
    requirements: { activityLevels: { testing: 2 } },
    rewards: { exp: 50, attributeExp: { logic: 12, focus: 12 } },
    requiresGoals: ["ship-homepage"]
  },
  {
    id: "ship-todo",
    name: "做出 Todo App",
    description: "完成一个有交互和测试要求的应用。",
    type: "main",
    requirements: { completedProjects: ["todo"] },
    rewards: { money: 90, reputation: 1, attributeExp: { logic: 16 } },
    requiresGoals: ["quality-loop"]
  },
  {
    id: "junior-promotion",
    name: "拿到初级头衔",
    description: "完成第一次晋升，从实习程序员进入正式岗位。",
    type: "main",
    requirements: { currentRole: "junior" },
    rewards: { exp: 90, money: 80, attributeExp: { learning: 20, communication: 20 } },
    requiresGoals: ["ship-todo"]
  },
  {
    id: "architecture-track",
    name: "进入架构路线",
    description: "解锁并提升架构设计，为复杂项目准备。",
    type: "main",
    requirements: { activityLevels: { architecture: 4 } },
    rewards: { exp: 150, money: 120, attributeExp: { logic: 28, creativity: 14 } },
    requiresGoals: ["junior-promotion"]
  },
  {
    id: "middle-promotion",
    name: "晋升中级程序员",
    description: "用项目、质量和架构资产证明独立负责能力。",
    type: "main",
    requirements: { currentRole: "middle" },
    rewards: { money: 200, reputation: 2, attributeExp: { logic: 32, resilience: 22 } },
    requiresGoals: ["architecture-track"]
  },
  {
    id: "senior-track",
    name: "完成高级路线",
    description: "晋升高级程序员，完成当前版本主线。",
    type: "main",
    requirements: { currentRole: "senior" },
    rewards: { money: 450, reputation: 4, attributeExp: { logic: 45, communication: 35 } },
    requiresGoals: ["middle-promotion"]
  },
  {
    id: "first-tool",
    name: "升级第一件装备",
    description: "购买任意工具，让活动收益开始吃到装备加成。",
    type: "side",
    requirements: { ownedToolCount: 1 },
    rewards: { money: 30, attributeExp: { focus: 10 } },
    requiresGoals: ["choose-work"]
  },
  {
    id: "bug-hunter",
    name: "Bug 猎手",
    description: "累计修复 50 个 Bug，把风险控制变成习惯。",
    type: "side",
    requirements: { stats: { totalBugsFixed: 50 } },
    rewards: { exp: 120, reputation: 1, attributeExp: { logic: 20, resilience: 15 } },
    requiresGoals: ["quality-loop"]
  }
];

const randomEvents = [
  {
    id: "requirement-change",
    name: "需求变更",
    message: "产品说只是改一个小需求，技术债增加了。",
    apply(state) {
      state.resources.techDebt += 10;
      state.resources.pressure += 4;
    }
  },
  {
    id: "production-bug",
    name: "线上 Bug",
    message: "监控报警，Bug 增加了，声望略受影响。",
    apply(state) {
      state.resources.bugs += 5;
      state.resources.reputation = Math.max(0, state.resources.reputation - 1);
    }
  },
  {
    id: "project-bonus",
    name: "项目奖金",
    message: "客户提前打款，钱包厚了一点。",
    apply(state) {
      state.resources.money += 120;
    }
  },
  {
    id: "mentor",
    name: "好导师",
    message: "导师认真 review 了你的代码，知识和经验增加了。",
    attributeExp: { learning: 20 },
    apply(state) {
      state.resources.exp += 60;
      state.resources.knowledge += 25;
    }
  },
  {
    id: "ai-upgrade",
    name: "AI 工具升级",
    message: "AI 工具更新，今天写功能特别顺。",
    attributeExp: { creativity: 12 },
    apply(state) {
      state.resources.codeLines += 60;
      state.stats.totalCodeLines += 60;
    }
  }
];

module.exports = {
  roles,
  activities,
  skills,
  tools,
  projects,
  goals,
  randomEvents
};
