const roles = [
  {
    id: "intern",
    name: "实习程序员",
    codePerSecond: 0.45,
    expPerSecond: 0.08,
    moneyPerSecond: 0.025,
    maxEnergy: 100,
    promoteTo: "junior",
    promoteRequirements: {
      exp: 120,
      reputation: 2,
      completedProjects: 1,
      skills: ["html-css", "javascript"]
    }
  },
  {
    id: "junior",
    name: "初级程序员",
    codePerSecond: 0.9,
    expPerSecond: 0.14,
    moneyPerSecond: 0.055,
    maxEnergy: 120,
    promoteTo: "middle",
    promoteRequirements: {
      exp: 520,
      reputation: 8,
      completedProjects: 3,
      skills: ["git", "sql"]
    }
  },
  {
    id: "middle",
    name: "中级程序员",
    codePerSecond: 1.8,
    expPerSecond: 0.24,
    moneyPerSecond: 0.12,
    maxEnergy: 140,
    promoteTo: "senior",
    promoteRequirements: {
      exp: 1600,
      reputation: 18,
      completedProjects: 5,
      skills: ["docker", "communication"]
    }
  },
  {
    id: "senior",
    name: "高级程序员",
    codePerSecond: 3.2,
    expPerSecond: 0.42,
    moneyPerSecond: 0.25,
    maxEnergy: 160,
    promoteTo: null,
    promoteRequirements: null
  }
];

const skills = [
  {
    id: "html-css",
    name: "HTML/CSS",
    description: "页面终于不会像调试日志一样朴素。",
    cost: { exp: 35, money: 15 },
    multipliers: { code: 1.08, exp: 1.03 }
  },
  {
    id: "javascript",
    name: "JavaScript",
    description: "开始理解为什么 undefined 不是 bug。",
    cost: { exp: 60, money: 30 },
    multipliers: { code: 1.16, exp: 1.06, bug: 1.05 }
  },
  {
    id: "git",
    name: "Git",
    description: "至少知道 push 前要 pull。",
    cost: { exp: 110, money: 65 },
    multipliers: { code: 1.08, bug: 0.9, debt: 0.9 }
  },
  {
    id: "sql",
    name: "SQL",
    description: "能把需求翻译成 SELECT，也能把 SELECT 翻译成加班。",
    cost: { exp: 170, money: 120 },
    multipliers: { money: 1.12, exp: 1.08 }
  },
  {
    id: "docker",
    name: "Docker",
    description: "本地能跑，线上也有机会能跑。",
    cost: { exp: 360, money: 320 },
    multipliers: { code: 1.1, debt: 0.78, bug: 0.88 }
  },
  {
    id: "communication",
    name: "沟通能力",
    description: "把“这个做不了”说成“我们换个更稳的方案”。",
    cost: { exp: 420, money: 260 },
    multipliers: { money: 1.18, exp: 1.12, debt: 0.86 }
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
    multipliers: { code: 1.22, bug: 0.9 }
  },
  {
    id: "ai-assistant",
    name: "AI 编程助手",
    description: "产出更快，但 code review 还是要自己扛。",
    cost: { money: 900 },
    multipliers: { code: 1.36, exp: 1.1, debt: 1.08 }
  }
];

const projects = [
  {
    id: "homepage",
    name: "个人主页",
    requirements: { codeLines: 80, skills: ["html-css"] },
    rewards: { exp: 55, money: 70, reputation: 2 }
  },
  {
    id: "todo",
    name: "Todo App",
    requirements: { codeLines: 180, skills: ["javascript"] },
    rewards: { exp: 120, money: 160, reputation: 3 }
  },
  {
    id: "blog",
    name: "博客系统",
    requirements: { codeLines: 420, skills: ["git", "sql"] },
    rewards: { exp: 260, money: 380, reputation: 5 }
  },
  {
    id: "admin",
    name: "电商后台",
    requirements: { codeLines: 900, skills: ["sql", "communication"] },
    rewards: { exp: 620, money: 900, reputation: 8 }
  },
  {
    id: "flash-sale",
    name: "秒杀系统",
    requirements: { codeLines: 1600, skills: ["docker", "sql"] },
    rewards: { exp: 1250, money: 1800, reputation: 14 }
  }
];

const randomEvents = [
  {
    id: "requirement-change",
    name: "需求变更",
    message: "产品说只是改一个小需求，技术债增加了。",
    apply(state) {
      state.resources.techDebt += 12;
    }
  },
  {
    id: "production-bug",
    name: "线上 Bug",
    message: "监控报警，Bug 增加了。",
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
    message: "导师认真 review 了你的代码，经验增加了。",
    apply(state) {
      state.resources.exp += 80;
    }
  },
  {
    id: "ai-upgrade",
    name: "AI 工具升级",
    message: "AI 工具更新，今天写代码特别顺。",
    apply(state) {
      state.resources.codeLines += 60;
    }
  }
];

module.exports = {
  roles,
  skills,
  tools,
  projects,
  randomEvents
};
