const {
  activity,
  createTrainingProjectBuilder,
  project,
  roundCost,
  skill
} = require("./content/builders");

const roles = [
  {
    id: "intern",
    name: "实习程序员",
    promoteTo: "junior",
    attributeExp: { focus: 30, learning: 30 },
    promoteRequirements: {
      reputation: 2,
      completedProjects: 1,
      skills: ["html-css", "javascript"],
      activityLevels: { "feature-coding": 3, study: 2 }
    }
  },
  {
    id: "junior",
    name: "初级程序员",
    promoteTo: "middle",
    attributeExp: { learning: 70, communication: 50 },
    promoteRequirements: {
      reputation: 8,
      completedProjects: 3,
      skills: ["git", "sql"],
      activityLevels: { testing: 4, documentation: 3, refactoring: 4 }
    }
  },
  {
    id: "middle",
    name: "中级程序员",
    promoteTo: "senior",
    attributeExp: { logic: 90, resilience: 70 },
    promoteRequirements: {
      reputation: 18,
      completedProjects: 5,
      skills: ["docker", "communication"],
      activityLevels: { architecture: 6, "open-source": 5, freelancing: 4 }
    }
  },
  {
    id: "senior",
    name: "高级程序员",
    promoteTo: null,
    attributeExp: { logic: 120, communication: 100 },
    promoteRequirements: null
  }
];

const characterCards = [
  {
    id: "academy-prodigy",
    name: "象牙塔学霸",
    background: "理论与算法的巨子，学习效率拉满。但温室里的花朵从未面对过真实的生产环境，抗压和沟通能力极度匮乏，极易在连环 Bug 中破防。",
    description: "高学习、高逻辑，适合系统学习开局；资金、沟通和抗压明显偏弱。",
    attributes: { learning: 72, logic: 58, focus: 32, creativity: 20, resilience: 10, communication: 4 },
    resources: { knowledge: 80, money: -10 },
    skills: {},
    activityLevels: { study: 2 },
    ownedTools: []
  },
  {
    id: "indie-hacker",
    name: "野路子独立开发者",
    background: "满脑子商业点子和奇思妙想，天生的产品变现大师。极度鄙视学院派死记硬背的理论，底层逻辑和系统学习能力偏弱。",
    description: "高创造、高专注，自带 JavaScript 和写功能 Lv.2，适合快速做产品。",
    attributes: { creativity: 70, focus: 58, communication: 44, resilience: 24, learning: 10, logic: 6 },
    resources: { leads: 4, money: 15 },
    skills: { javascript: 1 },
    activityLevels: { "feature-coding": 2 },
    ownedTools: []
  },
  {
    id: "seasoned-contractor",
    name: "熟练外包枪手",
    background: "常年浸淫于低端外包 and 快餐式开发，练就了坚如磐石的抗压能力和机械化的专注度。毫无创造力可言，留下的代码是所有维护者的噩梦。",
    description: "高抗压、高专注，自带大量代码和 HTML/CSS，但技术债、Bug、压力也很高。",
    attributes: { resilience: 72, focus: 64, logic: 28, communication: 22, learning: 8, creativity: 4 },
    resources: { codeLines: 500, money: 35, techDebt: 45, bugs: 16, pressure: 12 },
    skills: { "html-css": 1 },
    activityLevels: {},
    ownedTools: []
  },
  {
    id: "open-source-zealot",
    name: "开源社区极客",
    background: "逻辑严密、视规范如生命的极客。能够洞察代码中最微小的逻辑硬伤，由于长期沉浸于纯粹的技术世界，严重缺乏世故的沟通技巧。",
    description: "高逻辑、高创造，自带 Git、文档和声望，但初始资金吃紧。",
    attributes: { logic: 70, creativity: 58, learning: 46, focus: 28, resilience: 14, communication: 4 },
    resources: { docs: 35, reputation: 3, money: -20 },
    skills: { git: 1 },
    activityLevels: {},
    ownedTools: []
  },
  {
    id: "determined-switcher",
    name: "破釜沉舟转行者",
    background: "步入中年、砸下重金转型软件开发。拥有无与伦比的社会沟通手腕与面对绝境的抗压能力，虽然代码逻辑 and 学习曲线极为陡峭，但他带足了钞票和速成技巧。",
    description: "高沟通、高抗压、资金充足，自带沟通能力；逻辑和学习较弱，质量风险偏高。",
    attributes: { communication: 72, resilience: 66, focus: 28, creativity: 18, learning: 10, logic: 4 },
    resources: { money: 180, techDebt: 35, pressure: 15 },
    skills: { communication: 1 },
    activityLevels: {},
    ownedTools: []
  },
  {
    id: "product-minded-dev",
    name: "产品型前端",
    background: "最懂业务、站在用户视角思考的交互流前端。沟通 and 美感创意是其王牌，但在面对长串代码逻辑和深度排错时，注意力极易涣散。",
    description: "高沟通、高创造，自带业务线索、文档和 HTML/CSS；逻辑与专注较弱。",
    attributes: { communication: 66, creativity: 64, learning: 30, resilience: 20, logic: 10, focus: 13 },
    resources: { leads: 5, docs: 25 },
    skills: { "html-css": 1 },
    activityLevels: {},
    ownedTools: []
  },
  {
    id: "perfectionist-qa",
    name: "完美主义细节控",
    background: "拥有鹰一般的专注力，对代码质量的嗅觉极其灵敏。强迫症晚期，开局就因为无法忍受前人的烂代码而把大量时间耗在清理质量风险上，进度被技术债和压力拖住。",
    description: "高专注、高逻辑，自带测试自动化和测试资产；抗压、沟通和现金流较弱。",
    attributes: { focus: 72, logic: 60, learning: 34, creativity: 12, communication: 6, resilience: 4 },
    resources: { tests: 55, docs: 8, techDebt: 20, pressure: 25, money: -15 },
    skills: { "testing-automation": 1 },
    activityLevels: {},
    ownedTools: []
  },
  {
    id: "laid-back-slacker",
    name: "乐天派“面条哥”",
    background: "心态稳如宇宙奇点，线上大火也无法动摇其分毫。极具亲和力，但属于典型的“多动症”人格，专注度和创造力低得可怜，写出的代码全是堆叠的面条。",
    description: "高抗压、沟通尚可，休息恢复 Lv.2；专注和创造很低，初始 Bug 与技术债偏高。",
    attributes: { resilience: 72, communication: 48, learning: 20, logic: 16, creativity: 4, focus: 2 },
    resources: { money: 15, bugs: 16, techDebt: 20 },
    skills: {},
    activityLevels: { rest: 2 },
    ownedTools: []
  }
];

const activities = [
  activity({
    id: "feature-coding",
    name: "写功能",
    description: "把需求变成代码，核心产出最高，但也会制造 Bug 和技术债。",
    tier: 1,
    primaryAttribute: "focus",
    energyCostPerHour: 11.2,
    activityExpPerHour: 45,
    outputsPerHour: { codeLines: 32 },
    risksPerHour: { bugs: 1.61, techDebt: 1.04, pressure: 0.35 },
    attributeExpPerHour: { focus: 6, logic: 3 }
  }),
  activity({
    id: "bug-hunting",
    name: "排查 Bug",
    description: "降低 Bug，积累测试用例，适合在质量风险升高时切换。",
    tier: 1,
    primaryAttribute: "logic",
    energyCostPerHour: 11.2,
    activityExpPerHour: 36,
    outputsPerHour: { tests: 3 },
    mitigationPerHour: { bugs: 3.64 },
    attributeExpPerHour: { logic: 6, resilience: 3 }
  }),
  activity({
    id: "refactoring",
    name: "重构代码",
    description: "降低技术债，积累架构资产，为中后期项目铺路。",
    tier: 1,
    primaryAttribute: "logic",
    energyCostPerHour: 11.2,
    activityExpPerHour: 36,
    outputsPerHour: { architecture: 1.5 },
    mitigationPerHour: { techDebt: 3.19 },
    attributeExpPerHour: { logic: 6, focus: 3 }
  }),
  activity({
    id: "study",
    name: "系统学习",
    description: "产出知识，用于学习技能，压力较低但不会直接交付项目。",
    tier: 1,
    primaryAttribute: "learning",
    energyCostPerHour: 8.4,
    activityExpPerHour: 40,
    outputsPerHour: { knowledge: 14 },
    risksPerHour: { pressure: 0.2 },
    attributeExpPerHour: { learning: 9 }
  }),
  activity({
    id: "testing",
    name: "写测试",
    description: "产出测试用例，并小幅压低 Bug。",
    tier: 2,
    primaryAttribute: "focus",
    requirements: { activityLevels: { "feature-coding": 2 } },
    energyCostPerHour: 11.2,
    activityExpPerHour: 40,
    outputsPerHour: { tests: 8.5 },
    mitigationPerHour: { bugs: 1.14 },
    attributeExpPerHour: { focus: 6, logic: 3 }
  }),
  activity({
    id: "documentation",
    name: "写文档",
    description: "产出文档，降低交接成本，并小幅减少技术债。",
    tier: 2,
    primaryAttribute: "communication",
    requirements: { activityLevels: { study: 2 } },
    energyCostPerHour: 8.4,
    activityExpPerHour: 42,
    outputsPerHour: { docs: 10 },
    mitigationPerHour: { techDebt: 0.91 },
    attributeExpPerHour: { communication: 9 }
  }),
  activity({
    id: "freelancing",
    name: "接外包",
    description: "产出金钱和客户线索，但会带来压力和质量风险。",
    tier: 2,
    primaryAttribute: "communication",
    requirements: { activityLevels: { "feature-coding": 3 } },
    energyCostPerHour: 14,
    activityExpPerHour: 42,
    outputsPerHour: { money: 14, leads: 3.2, reputation: 0.08 },
    risksPerHour: { bugs: 1.15, techDebt: 1.15, pressure: 1.6 },
    attributeExpPerHour: { communication: 6, resilience: 3 }
  }),
  activity({
    id: "open-source",
    name: "开源协作",
    description: "积累声望和少量代码，适合走长期影响力路线。",
    tier: 3,
    primaryAttribute: "communication",
    requirements: { skills: ["git"], activityLevels: { documentation: 3 } },
    energyCostPerHour: 11.2,
    activityExpPerHour: 42,
    outputsPerHour: { reputation: 0.8, codeLines: 8, docs: 2 },
    risksPerHour: { pressure: 0.7 },
    attributeExpPerHour: { communication: 6, creativity: 3 }
  }),
  activity({
    id: "architecture",
    name: "架构设计",
    description: "高效产出架构资产，并明显压低技术债。",
    tier: 3,
    primaryAttribute: "logic",
    requirements: { skills: ["sql"], activityLevels: { refactoring: 4 } },
    energyCostPerHour: 14,
    activityExpPerHour: 42,
    outputsPerHour: { architecture: 11, docs: 4 },
    mitigationPerHour: { techDebt: 2.28 },
    attributeExpPerHour: { logic: 9, creativity: 3 }
  }),
  activity({
    id: "code-review",
    name: "代码评审",
    description: "LGTM 不是结论，是一段复杂人际关系的开始。",
    tier: 3,
    primaryAttribute: "communication",
    requirements: { skills: ["git"], activityLevels: { "feature-coding": 3, testing: 2 } },
    energyCostPerHour: 11.2,
    activityExpPerHour: 40,
    outputsPerHour: { docs: 3 },
    mitigationPerHour: { bugs: 3.64, techDebt: 2.28 },
    risksPerHour: { pressure: 0.7 },
    attributeExpPerHour: { communication: 6, logic: 3 }
  }),
  activity({
    id: "performance-tuning",
    name: "性能调优",
    description: "把 P99 从玄学指标调成老板看得懂的 KPI。",
    tier: 4,
    primaryAttribute: "logic",
    requirements: { skills: ["sql"], activityLevels: { refactoring: 4, architecture: 2 } },
    energyCostPerHour: 14,
    activityExpPerHour: 40,
    outputsPerHour: { codeLines: 12, architecture: 6, money: 1.5 },
    mitigationPerHour: { techDebt: 1.37 },
    risksPerHour: { bugs: 0.69, pressure: 1.2 },
    attributeExpPerHour: { logic: 9, resilience: 3 }
  }),
  activity({
    id: "prompt-engineering",
    name: "提示词工程",
    description: "把“帮我写个功能”包装成结构化上下文和验收标准。",
    tier: 3,
    primaryAttribute: "creativity",
    requirements: { activityLevels: { study: 3, documentation: 2 } },
    energyCostPerHour: 8.4,
    activityExpPerHour: 40,
    outputsPerHour: { knowledge: 8, docs: 6, leads: 1.5, codeLines: 4 },
    risksPerHour: { techDebt: 1.04, pressure: 0.9 },
    attributeExpPerHour: { creativity: 6, learning: 3 }
  }),
  activity({
    id: "incident-response",
    name: "线上救火",
    description: "先止血，再复盘，最后把 TODO 留给未来的自己。",
    tier: 3,
    primaryAttribute: "resilience",
    requirements: { activityLevels: { "bug-hunting": 3, testing: 3 } },
    energyCostPerHour: 16.8,
    activityExpPerHour: 44,
    outputsPerHour: { tests: 2, reputation: 0.2 },
    mitigationPerHour: { bugs: 5.46 },
    risksPerHour: { pressure: 3.8, techDebt: 0.92 },
    attributeExpPerHour: { resilience: 9, logic: 3 }
  }),
  activity({
    id: "rest",
    name: "休息恢复",
    description: "恢复精力，是所有产出活动的机会成本。",
    tier: 1,
    primaryAttribute: "resilience",
    energyCostPerHour: 0,
    activityExpPerHour: 12,
    outputsPerHour: { energy: 5 },
    attributeExpPerHour: { resilience: 6 }
  })
];

const skills = [
  skill({ id: "html-css", name: "HTML/CSS", tier: 1, description: "页面终于不会像调试日志一样朴素。", cost: roundCost({ knowledge: 18, money: 10 }, 2), attributeRequirements: { creativity: 16, learning: 22 }, upgradeResourceBase: { codeLines: 70, docs: 10 }, multipliers: { code: 1.018 } }),
  skill({ id: "javascript", name: "JavaScript", tier: 1, description: "开始理解为什么 undefined 不是 bug。", cost: roundCost({ knowledge: 38, money: 25 }, 2), attributeRequirements: { logic: 22, learning: 24 }, upgradeResourceBase: { codeLines: 90, tests: 10 }, multipliers: { code: 1.024, bug: 1.008 } }),
  skill({ id: "git", name: "Git", tier: 1, description: "至少知道 push 前要 pull。", cost: roundCost({ knowledge: 70, money: 50 }, 2), attributeRequirements: { logic: 22, resilience: 20 }, upgradeResourceBase: { docs: 12, tests: 10 }, multipliers: { code: 1.012, bug: 0.976, debt: 0.976 } }),
  skill({ id: "linux", name: "Linux", tier: 1, description: "能在终端里解决问题，而不是只会重启 IDE。", attributeRequirements: { resilience: 24, logic: 24 }, upgradeResourceBase: { docs: 10, tests: 15 }, multipliers: { pressure: 0.986 } }),
  skill({ id: "http-networking", name: "HTTP/网络协议", tier: 1, description: "看懂请求、响应、缓存和那些藏在 header 里的真相。", attributeRequirements: { logic: 24, learning: 24 }, upgradeResourceBase: { docs: 10, tests: 10 }, multipliers: { bug: 0.984 } }),

  skill({ id: "sql", name: "SQL", tier: 2, description: "能把需求翻译成 SELECT，也能把 SELECT 翻译成加班。", cost: roundCost({ knowledge: 110, money: 90 }, 3), attributeRequirements: { logic: 28, learning: 24 }, upgradeResourceBase: { docs: 12, architecture: 10 }, multipliers: { money: 1.018 } }),
  skill({ id: "typescript", name: "TypeScript", tier: 2, description: "给 any 戴上镣铐，从此报错提前到编译期。", cost: roundCost({ knowledge: 80, money: 60 }, 3), attributeRequirements: { logic: 26, learning: 24 }, upgradeResourceBase: { codeLines: 90, tests: 15 }, multipliers: { code: 1.016, bug: 0.978, debt: 0.984 } }),
  skill({ id: "react", name: "React", tier: 2, description: "学会和 useEffect 依赖数组进行长期拉扯。", cost: roundCost({ knowledge: 120, money: 80 }, 3), attributeRequirements: { creativity: 26, focus: 24 }, upgradeResourceBase: { codeLines: 100, docs: 12 }, multipliers: { code: 1.022, pressure: 1.006 } }),
  skill({ id: "vue", name: "Vue", tier: 2, description: "用响应式状态把页面拆成更安静的组件。", attributeRequirements: { creativity: 26, focus: 24 }, upgradeResourceBase: { codeLines: 90, docs: 12 }, multipliers: { code: 1.02 } }),
  skill({ id: "communication", name: "沟通能力", tier: 2, description: "把“这个做不了”说成“我们换个更稳的方案”。", cost: roundCost({ knowledge: 220, money: 180 }, 3), attributeRequirements: { communication: 24, resilience: 22 }, upgradeResourceBase: { docs: 25, leads: 4 }, multipliers: { money: 1.02, debt: 0.984, pressure: 0.98 } }),
  skill({ id: "postgresql", name: "PostgreSQL", tier: 2, description: "把数据建模、约束和事务当成后端的地基。", attributeRequirements: { logic: 30, learning: 26 }, upgradeResourceBase: { docs: 12, architecture: 12 }, multipliers: { money: 1.014, debt: 0.986 } }),
  skill({ id: "testing-automation", name: "测试自动化", tier: 2, description: "让测试从手工祈祷变成可重复反馈。", attributeRequirements: { focus: 30, logic: 28 }, upgradeResourceBase: { tests: 40, docs: 10 }, multipliers: { bug: 0.972, debt: 0.988 } }),
  skill({ id: "accessibility", name: "可访问性", tier: 2, description: "让界面不仅能看，还能被更多人真正使用。", attributeRequirements: { communication: 28, creativity: 26 }, upgradeResourceBase: { docs: 25, tests: 12 }, multipliers: { money: 1.01 } }),

  skill({ id: "node-api", name: "Node API", tier: 3, description: "把接口写成 REST，再把 REST 写成需求变更。", cost: roundCost({ knowledge: 150, money: 90 }, 4.5), attributeRequirements: { logic: 30, communication: 24 }, upgradeResourceBase: { codeLines: 110, tests: 18 }, multipliers: { code: 1.016, money: 1.012 } }),
  skill({ id: "redis", name: "Redis", tier: 3, description: "缓存一时爽，缓存击穿火葬场，但你至少知道要加锁。", cost: roundCost({ knowledge: 190, money: 120 }, 4.5), attributeRequirements: { logic: 32, resilience: 28 }, upgradeResourceBase: { architecture: 15, tests: 18 }, multipliers: { money: 1.01, bug: 0.988, pressure: 0.986 } }),
  skill({ id: "ci-cd", name: "CI/CD", tier: 3, description: "让机器替你羞辱没跑测试就提交的人。", cost: roundCost({ knowledge: 210, money: 140 }, 4.5), attributeRequirements: { focus: 30, resilience: 28 }, upgradeResourceBase: { tests: 28, docs: 16 }, multipliers: { bug: 0.97, debt: 0.984, pressure: 0.986 } }),
  skill({ id: "docker", name: "Docker", tier: 3, description: "本地能跑，线上也有机会能跑。", cost: roundCost({ knowledge: 240, money: 240 }, 4.5), attributeRequirements: { resilience: 30, logic: 28 }, upgradeResourceBase: { architecture: 18, docs: 16 }, multipliers: { code: 1.012, debt: 0.97, bug: 0.982 } }),
  skill({ id: "nextjs", name: "Next.js", tier: 3, description: "把路由、缓存、渲染和部署压进同一套前端工程。", attributeRequirements: { creativity: 34, logic: 32 }, upgradeResourceBase: { codeLines: 120, docs: 20 }, multipliers: { code: 1.018, money: 1.012, pressure: 1.004 } }),
  skill({ id: "state-management", name: "状态管理", tier: 3, description: "让页面状态从散落的变量变成可推理的数据流。", attributeRequirements: { logic: 32, focus: 30 }, upgradeResourceBase: { codeLines: 90, tests: 15 }, multipliers: { bug: 0.982, debt: 0.978 } }),
  skill({ id: "web-performance", name: "Web 性能", tier: 3, description: "把等待时间从用户体感里抠出来。", attributeRequirements: { logic: 34, focus: 32 }, upgradeResourceBase: { codeLines: 80, architecture: 12 }, multipliers: { money: 1.014, pressure: 0.99 } }),
  skill({ id: "graphql", name: "GraphQL", tier: 3, description: "把多端数据需求聚合成一张可协商的 schema。", attributeRequirements: { logic: 34, communication: 28 }, upgradeResourceBase: { codeLines: 110, docs: 15 }, multipliers: { code: 1.012, debt: 0.986 } }),
  skill({ id: "auth-security", name: "认证与安全", tier: 3, description: "让登录、权限和密钥少一点侥幸。", attributeRequirements: { logic: 36, resilience: 32 }, upgradeResourceBase: { tests: 30, docs: 20 }, multipliers: { bug: 0.966, pressure: 0.988 } }),
  skill({ id: "message-queue", name: "消息队列", tier: 3, description: "把同步压力拆成可靠的异步边界。", attributeRequirements: { logic: 34, resilience: 32 }, upgradeResourceBase: { architecture: 20, tests: 20 }, multipliers: { pressure: 0.984, debt: 0.988 } }),
  skill({ id: "database-indexing", name: "索引与查询优化", tier: 3, description: "让数据库少扫几座山，多走几条路。", attributeRequirements: { logic: 36, focus: 32 }, upgradeResourceBase: { architecture: 18, tests: 15 }, multipliers: { money: 1.016, bug: 0.99 } }),
  skill({ id: "vector-db", name: "向量数据库", tier: 3, description: "把语义相似度变成可检索的工程资产。", attributeRequirements: { learning: 34, logic: 32 }, upgradeResourceBase: { architecture: 18, tests: 20 }, multipliers: { code: 1.012 } }),

  skill({ id: "observability", name: "可观测性", tier: 4, description: "从“线上炸了”进化到“P95 在 14:03 开始抖”。", cost: roundCost({ knowledge: 320, money: 260 }, 6), attributeRequirements: { logic: 38, resilience: 34 }, upgradeResourceBase: { docs: 24, architecture: 24 }, multipliers: { bug: 0.964, pressure: 0.978 } }),
  skill({ id: "kubernetes", name: "Kubernetes", tier: 4, description: "把一个进程部署问题升级成一堆 YAML 组织行为学。", cost: roundCost({ knowledge: 360, money: 360 }, 6), attributeRequirements: { resilience: 40, logic: 38 }, upgradeResourceBase: { architecture: 28, docs: 22 }, multipliers: { code: 1.01, bug: 0.984, debt: 0.974, pressure: 1.008 } }),
  skill({ id: "terraform", name: "Terraform", tier: 4, description: "把云资源变成可以 review 的声明式代码。", attributeRequirements: { logic: 42, resilience: 38 }, upgradeResourceBase: { architecture: 30, docs: 20 }, multipliers: { debt: 0.976, pressure: 0.988 } }),
  skill({ id: "llm-evaluation", name: "LLM 评测", tier: 4, description: "把模型表现从感觉不错变成可比较、可回归。", attributeRequirements: { logic: 42, learning: 40 }, upgradeResourceBase: { docs: 30, tests: 30 }, multipliers: { bug: 0.988 } }),

  skill({ id: "llm-agent", name: "LLM Agent", tier: 5, description: "把复制粘贴升级成多轮工具调用，幻觉也开始自动化。", cost: roundCost({ knowledge: 420, money: 520 }, 8), attributeRequirements: { creativity: 44, learning: 42 }, upgradeResourceBase: { architecture: 35, tests: 30 }, multipliers: { code: 1.032, bug: 1.006, debt: 1.01, pressure: 1.008 } })
];

const tools = [
  {
    id: "used-laptop",
    name: "二手笔记本",
    description: "风扇声音像 CI 在跑全量测试。",
    cost: { money: 80 },
    multipliers: { code: 1.06 }
  },
  {
    id: "keyboard",
    name: "机械键盘",
    description: "手感提升，同事忍耐力下降。",
    cost: { money: 180 },
    multipliers: { code: 1.06 }
  },
  {
    id: "jetbrains",
    name: "JetBrains 全家桶",
    description: "自动补全让你短暂相信自己很聪明。",
    cost: { money: 520 },
    multipliers: { code: 1.12, bug: 0.9, pressure: 0.94 }
  },
  {
    id: "ai-assistant",
    name: "AI 编程助手",
    description: "产出更快，但 code review 还是要自己扛。",
    cost: { money: 900 },
    multipliers: { code: 1.18, debt: 1.1, pressure: 1.06 }
  },
  {
    id: "api-client",
    name: "API 调试套件",
    description: "不是接口错了，是你少传了那个没人写进文档的 header。",
    cost: { money: 240 },
    multipliers: { bug: 0.94 }
  },
  {
    id: "cloud-ide",
    name: "云端开发环境",
    description: "本地环境再也不会坏了，因为坏的是云端环境。",
    cost: { money: 360 },
    multipliers: { code: 1.09, pressure: 0.98 }
  },
  {
    id: "github-actions",
    name: "流水线会员",
    description: "红灯不是失败，是自动化给你的即时反馈。",
    cost: { money: 640 },
    multipliers: { bug: 0.88, debt: 0.9, pressure: 0.95 }
  },
  {
    id: "status-page",
    name: "监控大屏",
    description: "只要图够多，事故复盘就显得很专业。",
    cost: { money: 960 },
    multipliers: { bug: 0.86, pressure: 0.82 }
  }
];

const trainingProject = createTrainingProjectBuilder(skills);

const projects = [
  project({ id: "homepage", name: "个人主页", description: "把个人品牌、静态页面和基础交付资产打包成一份能对外验收的最小作品集。", difficulty: 1, maxSuccessRate: 0.98, minWorkHours: 2, resources: { codeLines: 80, docs: 8 }, skills: ["html-css"], activityLevels: { "feature-coding": 2, documentation: 1 }, rewards: { money: 80, reputation: 2 }, skillExpRewards: { "html-css": 80 }, attributeExp: { creativity: 24, communication: 12 } }),
  project({ id: "todo", name: "Todo App", description: "用状态流、交互闭环和基础测试把玩具需求做成可维护的小型产品切片。", difficulty: 2, maxSuccessRate: 0.95, minWorkHours: 4, resources: { codeLines: 180, tests: 20 }, skills: ["javascript"], activityLevels: { "feature-coding": 4, testing: 2 }, rewards: { money: 170, reputation: 3 }, skillExpRewards: { javascript: 120 }, attributeExp: { focus: 28, logic: 18 } }),
  project({ id: "blog", name: "博客系统", description: "把内容模型、版本协作和数据查询串成一条可持续发布的内容管线。", difficulty: 3, maxSuccessRate: 0.92, minWorkHours: 8, resources: { codeLines: 420, docs: 35, architecture: 12 }, skills: ["git", "sql"], activityLevels: { documentation: 4, refactoring: 4 }, rewards: { money: 420, reputation: 5 }, skillExpRewards: { git: 120, sql: 140 }, attributeExp: { communication: 32, creativity: 28 } }),
  project({ id: "admin", name: "电商后台", description: "拉通商品、订单和运营视图，把后台链路从需求清单推进到可交接的业务中台。", difficulty: 4, maxSuccessRate: 0.88, minWorkHours: 18, resources: { codeLines: 900, tests: 90, architecture: 55, leads: 8 }, skills: ["sql", "communication"], activityLevels: { freelancing: 4, architecture: 4, testing: 5 }, rewards: { money: 980, reputation: 8 }, skillExpRewards: { sql: 180, communication: 180 }, attributeExp: { communication: 42, resilience: 30 } }),
  project({ id: "flash-sale", name: "秒杀系统", description: "围绕高并发入口、库存一致性和降级策略做一次压力驱动的核心链路交付。", difficulty: 5, maxSuccessRate: 0.84, minWorkHours: 30, resources: { codeLines: 1600, tests: 180, architecture: 120 }, skills: ["docker", "sql"], activityLevels: { architecture: 7, refactoring: 7, "open-source": 4 }, rewards: { money: 1900, reputation: 14 }, skillExpRewards: { docker: 240, sql: 220 }, attributeExp: { logic: 54, resilience: 48 } }),
  project({ id: "component-library", name: "组件库内卷", description: "把组件 API、类型约束和示例文档统一成能被团队复用的前端资产包。", difficulty: 2, maxSuccessRate: 0.94, minWorkHours: 4, resources: { codeLines: 260, docs: 18, tests: 25 }, skills: ["typescript", "react"], activityLevels: { "feature-coding": 4, documentation: 2, testing: 2 }, rewards: { money: 220, reputation: 3 }, skillExpRewards: { typescript: 90, react: 90 }, attributeExp: { creativity: 28, focus: 20 } }),
  project({ id: "api-gateway", name: "接口网关", description: "收敛接口契约、鉴权入口和数据编排，把后端边界做成稳定的流量门面。", difficulty: 3, maxSuccessRate: 0.91, minWorkHours: 8, resources: { codeLines: 500, tests: 60, architecture: 30 }, skills: ["node-api", "sql"], activityLevels: { refactoring: 4, testing: 3 }, rewards: { money: 500, reputation: 5 }, skillExpRewards: { "node-api": 150, sql: 120 }, attributeExp: { logic: 32, communication: 18 } }),
  project({ id: "ci-pipeline", name: "祖传项目流水线改造", description: "把手工发布、隐性依赖和测试缺口塞进流水线，让交付风险在合并前暴露。", difficulty: 3, maxSuccessRate: 0.9, minWorkHours: 8, resources: { codeLines: 360, tests: 80, docs: 35, architecture: 20 }, skills: ["git", "ci-cd", "docker"], activityLevels: { testing: 4, documentation: 3 }, rewards: { money: 520, reputation: 5 }, skillExpRewards: { git: 90, "ci-cd": 120, docker: 120 }, attributeExp: { focus: 30, resilience: 22 } }),
  project({ id: "legacy-rescue", name: "祖传单体抢救", description: "在高耦合代码里切出可控边界，用回归测试和渐进重构把风险降到可交付区间。", difficulty: 4, maxSuccessRate: 0.78, minWorkHours: 18, resources: { codeLines: 700, tests: 70, docs: 40, architecture: 50 }, skills: ["git", "sql", "typescript"], activityLevels: { refactoring: 6, "bug-hunting": 5 }, rewards: { money: 900, reputation: 6 }, skillExpRewards: { git: 120, sql: 150, typescript: 150 }, attributeExp: { logic: 42, resilience: 34 } }),
  project({ id: "observability-platform", name: "可观测性平台", description: "把指标、日志和告警聚合成可行动的运行视图，让线上问题进入可定位状态。", difficulty: 5, maxSuccessRate: 0.86, minWorkHours: 30, resources: { codeLines: 800, docs: 50, tests: 120, architecture: 90 }, skills: ["observability", "docker"], activityLevels: { architecture: 5, testing: 5 }, rewards: { money: 1000, reputation: 9 }, skillExpRewards: { observability: 260, docker: 180 }, attributeExp: { logic: 38, communication: 26 } }),
  project({ id: "rag-assistant", name: "RAG 知识库助手", description: "把文档清洗、向量检索和生成链路封装成可评估的知识库问答交付包。", difficulty: 5, maxSuccessRate: 0.82, minWorkHours: 36, resources: { codeLines: 1100, docs: 90, tests: 140, architecture: 100, leads: 10 }, skills: ["llm-agent", "node-api"], activityLevels: { study: 5, documentation: 5, architecture: 5 }, rewards: { money: 1500, reputation: 12 }, skillExpRewards: { "llm-agent": 260, "node-api": 180 }, attributeExp: { creativity: 48, learning: 36 } }),

  trainingProject("vanilla-widget", "原生 JS 小组件", "javascript"),
  trainingProject("repo-cleanup", "Git 仓库清扫", "git"),
  trainingProject("sql-report", "SQL 报表练习", "sql"),
  trainingProject("container-demo", "容器化 Demo", "docker"),
  trainingProject("requirement-workshop", "需求澄清演练", "communication"),
  project({ id: "typed-form", name: "类型化表单", description: "用类型约束和表单状态把输入校验前移，做一条低风险的前端数据入口。", difficulty: 1, minWorkHours: 2, skills: ["typescript", "react"], skillExpRewards: { typescript: 70, react: 70 }, activityLevels: { "feature-coding": 1 }, attributeExp: { learning: 8 } }),
  trainingProject("api-mock-service", "API Mock 服务", "node-api"),
  trainingProject("cache-lab", "缓存实验", "redis"),
  trainingProject("pipeline-sandbox", "流水线沙盒", "ci-cd"),
  trainingProject("observability-sandbox", "观测性沙盒", "observability"),
  trainingProject("llm-prompt-bench", "LLM 提示词评测", "llm-agent"),
  trainingProject("linux-cli-dojo", "Linux 命令行道场", "linux"),
  trainingProject("http-debug-lab", "HTTP 抓包实验", "http-networking"),
  trainingProject("vue-widget", "Vue 组件练习", "vue"),
  trainingProject("nextjs-cache-page", "Next.js 缓存页面", "nextjs"),
  trainingProject("state-store-refactor", "状态仓库重构", "state-management"),
  trainingProject("web-vitals-sprint", "Web Vitals 优化", "web-performance"),
  trainingProject("a11y-fix-pass", "可访问性修复", "accessibility"),
  trainingProject("graphql-bff-demo", "GraphQL BFF Demo", "graphql"),
  trainingProject("auth-hardening-lab", "认证加固实验", "auth-security"),
  trainingProject("queue-worker-lab", "队列 Worker 实验", "message-queue"),
  trainingProject("postgres-report", "PostgreSQL 报表", "postgresql"),
  trainingProject("index-tuning-lab", "索引调优实验", "database-indexing"),
  trainingProject("test-harness", "测试脚手架", "testing-automation"),
  trainingProject("terraform-sandbox", "Terraform 沙盒", "terraform"),
  trainingProject("vector-search-demo", "向量检索 Demo", "vector-db"),
  trainingProject("eval-harness", "LLM 评测脚手架", "llm-evaluation"),

  project({ id: "secure-admin-auth", name: "安全后台登录", description: "把前端会话、服务端鉴权和安全回归测试接成一条可审计的登录链路。", difficulty: 3, skills: ["react", "node-api", "auth-security"], activityLevels: { testing: 4, documentation: 3 } }),
  project({ id: "realtime-notification-center", name: "实时通知中心", description: "用队列、缓存和 API 编排承接消息扇出，压住实时场景的丢消息风险。", difficulty: 3, skills: ["message-queue", "redis", "node-api"], activityLevels: { architecture: 3, testing: 4 } }),
  project({ id: "analytics-dashboard", name: "数据分析看板", description: "把数据建模、索引策略和交互视图整合成面向运营的指标工作台。", difficulty: 3, skills: ["postgresql", "database-indexing", "react"], activityLevels: { "feature-coding": 5, testing: 4 } }),
  project({ id: "graphql-portal", name: "GraphQL 聚合门户", description: "把多端查询契约、BFF 聚合和类型边界收拢成稳定的数据门户。", difficulty: 3, skills: ["graphql", "node-api", "typescript"], activityLevels: { documentation: 4, refactoring: 4 } }),
  project({ id: "multi-tenant-saas", name: "多租户 SaaS", description: "围绕租户隔离、权限模型和数据边界交付一套可扩展的 SaaS 核心骨架。", difficulty: 4, skills: ["nextjs", "postgresql", "auth-security"], activityLevels: { architecture: 5, testing: 5 } }),
  project({ id: "cloud-infra-bootstrap", name: "云基础设施初始化", description: "把运行环境、容器边界和基础设施代码沉淀成可重复拉起的交付底座。", difficulty: 4, skills: ["linux", "docker", "terraform"], activityLevels: { architecture: 5, documentation: 4 } }),
  project({ id: "web-quality-overhaul", name: "前端质量专项", description: "以性能、可访问性和自动化测试为抓手，把前端体验债务压回可控水位。", difficulty: 4, skills: ["web-performance", "accessibility", "testing-automation"], activityLevels: { testing: 6, documentation: 4 } }),
  project({ id: "ai-eval-platform", name: "AI 评测平台", description: "把检索链路、模型评测和向量资产纳入同一套可迭代的 AI 质量基线。", difficulty: 5, skills: ["llm-agent", "llm-evaluation", "vector-db"], activityLevels: { study: 6, architecture: 5, testing: 5 } })
];

const goals = [
  {
    id: "choose-work",
    name: "选择第一项活动",
    description: "启动任意活动，让时间开始产生明确方向。",
    type: "main",
    requirements: { activityStats: { totalActiveSeconds: 30 } },
    rewards: { attributeExp: { focus: 8 } },
    requiresGoals: []
  },
  {
    id: "first-feature-level",
    name: "写功能入门",
    description: "把写功能提升到 2 级，建立主要产出来源。",
    type: "main",
    requirements: { activityLevels: { "feature-coding": 2 } },
    rewards: { money: 20, attributeExp: { focus: 12 } },
    requiresGoals: ["choose-work"]
  },
  {
    id: "learn-web-basics",
    name: "网页基础入门",
    description: "通过学习活动积累知识并学会 HTML/CSS。",
    type: "main",
    requirements: { skills: ["html-css"] },
    rewards: { attributeExp: { creativity: 10, learning: 10 } },
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
    rewards: { attributeExp: { logic: 12, focus: 12 } },
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
    rewards: { money: 80, attributeExp: { learning: 20, communication: 20 } },
    requiresGoals: ["ship-todo"]
  },
  {
    id: "architecture-track",
    name: "进入架构路线",
    description: "解锁并提升架构设计，为复杂项目准备。",
    type: "main",
    requirements: { activityLevels: { architecture: 4 } },
    rewards: { money: 120, attributeExp: { logic: 28, creativity: 14 } },
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
    rewards: { reputation: 1, attributeExp: { logic: 20, resilience: 15 } },
    requiresGoals: ["quality-loop"]
  },
  {
    id: "learn-typescript",
    name: "学会 TypeScript",
    description: "把运行时报错提前到编辑器里，让红线成为日常同事。",
    type: "side",
    requirements: { skills: ["typescript"] },
    rewards: { money: 60, attributeExp: { logic: 18, learning: 12 } },
    requiresGoals: ["learn-web-basics"]
  },
  {
    id: "unlock-ci-cd",
    name: "点亮 CI/CD",
    description: "让流水线先替你发现那些本该本地跑出来的问题。",
    type: "side",
    requirements: { skills: ["ci-cd"] },
    rewards: { money: 120, reputation: 1, attributeExp: { focus: 18, resilience: 14 } },
    requiresGoals: ["junior-promotion"]
  },
  {
    id: "code-review-lv3",
    name: "完成代码评审 Lv.3",
    description: "从 LGTM 进化到能指出变量名背后的人生选择。",
    type: "side",
    requirements: { activityLevels: { "code-review": 3 } },
    rewards: { reputation: 2, attributeExp: { communication: 24, logic: 16 } },
    requiresGoals: ["quality-loop"]
  },
  {
    id: "ship-observability-platform",
    name: "交付可观测性平台",
    description: "让线上问题终于能被图表解释，而不是靠群里猜。",
    type: "side",
    requirements: { completedProjects: ["observability-platform"] },
    rewards: { money: 320, reputation: 3, attributeExp: { logic: 28, resilience: 22 } },
    requiresGoals: ["architecture-track"]
  },
  {
    id: "ship-rag-assistant",
    name: "交付 RAG 助手",
    description: "把知识库、向量检索和模型幻觉塞进同一个交付包。",
    type: "side",
    requirements: { completedProjects: ["rag-assistant"] },
    rewards: { money: 520, reputation: 4, attributeExp: { creativity: 32, learning: 28 } },
    requiresGoals: ["middle-promotion"]
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
    message: "导师认真 review 了你的代码，知识增加了。",
    attributeExp: { learning: 20 },
    apply(state) {
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
  },
  {
    id: "dependency-hell",
    name: "依赖地狱",
    message: "升级一个包，顺手把半个 lockfile 送去火化，Bug 和技术债增加了。",
    apply(state) {
      state.resources.bugs += 4;
      state.resources.techDebt += 8;
      state.resources.pressure += 3;
    }
  },
  {
    id: "works-on-my-machine",
    name: "我本地是好的",
    message: "复现失败，但生产环境很诚实，压力和 Bug 都上来了。",
    apply(state) {
      state.resources.bugs += 3;
      state.resources.pressure += 5;
    }
  },
  {
    id: "merge-conflict",
    name: "合并冲突",
    message: "三个人同时改了同一段祖传代码，技术债和压力同步上涨。",
    apply(state) {
      state.resources.techDebt += 6;
      state.resources.pressure += 4;
    }
  },
  {
    id: "ci-green",
    name: "CI 绿了",
    message: "流水线全绿，Bug 少了一点，测试资产多了一点。",
    apply(state) {
      state.resources.bugs = Math.max(0, state.resources.bugs - 4);
      state.resources.tests += 8;
    }
  },
  {
    id: "hotfix-release",
    name: "热修复上线",
    message: "热修复把火灭了，但 TODO 和压力留在了代码里。",
    apply(state) {
      state.resources.bugs = Math.max(0, state.resources.bugs - 6);
      state.resources.techDebt += 5;
      state.resources.pressure += 6;
      state.resources.reputation += 1;
    }
  },
  {
    id: "prompt-hallucination",
    name: "提示词幻觉",
    message: "模型一本正经编了个不存在的 API，代码和 Bug 一起增加。",
    apply(state) {
      state.resources.codeLines += 35;
      state.resources.bugs += 4;
      state.resources.techDebt += 3;
      state.stats.totalCodeLines += 35;
    }
  },
  {
    id: "stackoverflow-save",
    name: "StackOverflow 救场",
    message: "一个十年前的回答依旧能打，知识和代码都有进账。",
    apply(state) {
      state.resources.knowledge += 18;
      state.resources.codeLines += 25;
      state.stats.totalCodeLines += 25;
    }
  },
  {
    id: "friday-scope-change",
    name: "需求周五下班前改一下",
    message: "周五 17:59 的一句话，让文档、压力和技术债重新做人。",
    apply(state) {
      state.resources.docs = Math.max(0, state.resources.docs - 6);
      state.resources.pressure += 8;
      state.resources.techDebt += 7;
    }
  }
];

module.exports = {
  roles,
  characterCards,
  activities,
  skills,
  tools,
  projects,
  goals,
  randomEvents
};
