const {
  createTrainingProjectBuilder,
  project
} = require("./builders");

function createProjects(skills) {
  const trainingProject = createTrainingProjectBuilder(skills);

  const milestoneProjects = [
    project({ id: "homepage", name: "个人主页", description: "把个人品牌、静态页面和基础交付资产打包成一份能对外验收的最小作品集。", difficulty: 1, maxSuccessRate: 0.98, minWorkHours: 2, resources: { codeLines: 80, docs: 8 }, skills: ["html-css"], activityLevels: { "feature-coding": 2, documentation: 1 }, rewards: { money: 80, reputation: 2 }, skillExpRewards: { "html-css": 80 }, attributeExp: { creativity: 24, communication: 12 }, successFeedback: ["客户反馈：页面终于不像临时拼出来的占位稿，第一眼能看出你会交付。", "交付成果：个人介绍、作品入口和联系信息被收进同一个清晰页面。"], failureFeedback: ["客户反馈：页面方向是对的，但视觉和内容还没有形成可信的一次展示。", "复盘记录：这次没能过验收，不过你已经知道作品集最缺的是结构和细节。"] }),
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

  const commissionProjects = [
    project({ kind: "commission", id: "commission-landing-hotfix", name: "落地页小修", description: "客户的活动页已经上线，剩下的是把首屏样式、埋点和文案错位快速修到能投放。", difficulty: 1, maxSuccessRate: 0.96, minWorkHours: 1.5, resources: { codeLines: 55, docs: 4, tests: 4 }, skills: ["html-css"], activityLevels: { "feature-coding": 1 }, rewards: { money: 90, reputation: 1 }, skillExpRewards: { "html-css": 45 }, deadlineDays: 2, tags: ["frontend", "quick"] }),
    project({ kind: "commission", id: "commission-js-widget", name: "营销小组件", description: "把一个表单弹窗做成可嵌入组件，重点是状态清楚、校验可控、别把页面拖慢。", difficulty: 1, maxSuccessRate: 0.95, minWorkHours: 2, resources: { codeLines: 90, docs: 6, tests: 8 }, skills: ["javascript"], activityLevels: { "feature-coding": 2 }, rewards: { money: 130, reputation: 1 }, skillExpRewards: { javascript: 55 }, deadlineDays: 3, tags: ["frontend"] }),
    project({ kind: "commission", id: "commission-copy-cleanup", name: "产品文案整理", description: "把散落在页面、接口注释和说明文档里的术语统一，顺手补一版交接说明。", difficulty: 1, maxSuccessRate: 0.97, minWorkHours: 1.5, resources: { docs: 18, codeLines: 25 }, skills: ["communication"], activityLevels: { documentation: 2 }, rewards: { money: 100, reputation: 1 }, skillExpRewards: { communication: 45 }, deadlineDays: 2, tags: ["docs"] }),
    project({ kind: "commission", id: "commission-test-patch", name: "回归测试补丁", description: "一条核心流程缺少覆盖，委托方需要你补测试、压住两个已知边界。", difficulty: 2, maxSuccessRate: 0.93, minWorkHours: 3, resources: { codeLines: 90, tests: 35, docs: 6 }, skills: ["javascript", "testing-automation"], activityLevels: { testing: 2 }, rewards: { money: 220, reputation: 2 }, skillExpRewards: { javascript: 45, "testing-automation": 60 }, deadlineDays: 4, tags: ["quality"] }),
    project({ kind: "commission", id: "commission-sql-report", name: "运营 SQL 报表", description: "运营要一张稳定报表，字段口径、索引影响和查询边界都得交代清楚。", difficulty: 2, maxSuccessRate: 0.92, minWorkHours: 3.5, resources: { docs: 12, tests: 10, architecture: 8, codeLines: 100 }, skills: ["sql"], activityLevels: { documentation: 2 }, rewards: { money: 260, reputation: 2 }, skillExpRewards: { sql: 80 }, deadlineDays: 4, tags: ["data"] }),
    project({ kind: "commission", id: "commission-vue-form", name: "Vue 表单页", description: "做一页内部表单，难点不在控件数量，而在校验、默认值和提交失败后的状态恢复。", difficulty: 2, maxSuccessRate: 0.92, minWorkHours: 4, resources: { codeLines: 180, tests: 20, docs: 10 }, skills: ["vue"], activityLevels: { "feature-coding": 3, testing: 1 }, rewards: { money: 280, reputation: 2 }, skillExpRewards: { vue: 90 }, deadlineDays: 5, tags: ["frontend"] }),
    project({ kind: "commission", id: "commission-api-endpoint", name: "轻量 API 接口", description: "给现有系统补一条 API，包含参数校验、错误语义和最小可用测试。", difficulty: 3, maxSuccessRate: 0.9, minWorkHours: 6, resources: { codeLines: 300, tests: 45, docs: 18, architecture: 12 }, skills: ["node-api"], activityLevels: { testing: 3, documentation: 2 }, rewards: { money: 430, reputation: 3 }, skillExpRewards: { "node-api": 120 }, deadlineDays: 6, tags: ["backend"] }),
    project({ kind: "commission", id: "commission-ci-repair", name: "CI 红灯修复", description: "流水线已经红了一周，需要定位脚本、缓存和测试顺序，把团队信心救回来。", difficulty: 3, maxSuccessRate: 0.88, minWorkHours: 6, resources: { codeLines: 180, tests: 80, docs: 18, architecture: 18 }, skills: ["git", "ci-cd"], activityLevels: { testing: 4 }, rewards: { money: 470, reputation: 4 }, skillExpRewards: { git: 70, "ci-cd": 120 }, deadlineDays: 5, tags: ["devops", "quality"] }),
    project({ kind: "commission", id: "commission-accessibility-pass", name: "可访问性修复单", description: "一批键盘导航和标签问题挡住验收，需要在不重写页面的前提下修完整。", difficulty: 3, maxSuccessRate: 0.9, minWorkHours: 6, resources: { codeLines: 220, tests: 55, docs: 22 }, skills: ["accessibility", "react"], activityLevels: { testing: 3, documentation: 3 }, rewards: { money: 450, reputation: 4 }, skillExpRewards: { accessibility: 120, react: 70 }, deadlineDays: 6, tags: ["frontend", "quality"] }),
    project({ kind: "commission", id: "commission-legacy-module", name: "旧模块剥离", description: "从一段高耦合业务里切出独立模块，必须留测试和迁移说明。", difficulty: 4, maxSuccessRate: 0.83, minWorkHours: 11, resources: { codeLines: 460, tests: 70, docs: 28, architecture: 38 }, skills: ["typescript", "git"], activityLevels: { refactoring: 5, "bug-hunting": 3 }, rewards: { money: 760, reputation: 5 }, skillExpRewards: { typescript: 130, git: 90 }, deadlineDays: 8, tags: ["refactor"] }),
    project({ kind: "commission", id: "commission-cache-tuning", name: "缓存策略调优", description: "接口慢在缓存边界和失效策略上，交付时要给出可解释的性能收益。", difficulty: 4, maxSuccessRate: 0.82, minWorkHours: 12, resources: { codeLines: 420, tests: 75, docs: 30, architecture: 45 }, skills: ["redis", "node-api"], activityLevels: { architecture: 4, testing: 4 }, rewards: { money: 820, reputation: 5 }, skillExpRewards: { redis: 140, "node-api": 100 }, deadlineDays: 8, tags: ["backend", "performance"] }),
    project({ kind: "commission", id: "commission-observability-slice", name: "告警链路切片", description: "把一条关键链路接入指标和告警，既要能看见，也要避免把团队吵麻。", difficulty: 4, maxSuccessRate: 0.83, minWorkHours: 12, resources: { codeLines: 360, tests: 65, docs: 40, architecture: 55 }, skills: ["observability", "docker"], activityLevels: { architecture: 4, documentation: 4 }, rewards: { money: 880, reputation: 6 }, skillExpRewards: { observability: 150, docker: 90 }, deadlineDays: 9, tags: ["ops"] }),
    project({ kind: "commission", id: "commission-tenant-permission", name: "租户权限加固", description: "权限模型里有一处越权风险，需要补隔离校验、回归用例和审计说明。", difficulty: 5, maxSuccessRate: 0.78, minWorkHours: 20, resources: { codeLines: 680, tests: 120, docs: 55, architecture: 85, leads: 3 }, skills: ["auth-security", "postgresql"], activityLevels: { architecture: 5, testing: 5 }, rewards: { money: 1350, reputation: 8 }, skillExpRewards: { "auth-security": 180, postgresql: 130 }, deadlineDays: 12, tags: ["security"] }),
    project({ kind: "commission", id: "commission-rag-eval", name: "RAG 评测切片", description: "知识库回答不稳定，委托方要一套小型评测集和可复现的失败样本。", difficulty: 5, maxSuccessRate: 0.78, minWorkHours: 22, resources: { codeLines: 600, tests: 130, docs: 80, architecture: 75, leads: 4 }, skills: ["llm-agent", "llm-evaluation"], activityLevels: { study: 5, testing: 5, documentation: 5 }, rewards: { money: 1450, reputation: 9 }, skillExpRewards: { "llm-agent": 180, "llm-evaluation": 160 }, deadlineDays: 13, tags: ["ai"] }),
    project({ kind: "commission", id: "commission-vector-search", name: "向量检索优化", description: "检索召回和延迟都不理想，需要调整索引、过滤策略和验证样本。", difficulty: 5, maxSuccessRate: 0.77, minWorkHours: 22, resources: { codeLines: 650, tests: 115, docs: 70, architecture: 90, leads: 4 }, skills: ["vector-db", "database-indexing"], activityLevels: { architecture: 5, testing: 5 }, rewards: { money: 1500, reputation: 9 }, skillExpRewards: { "vector-db": 180, "database-indexing": 150 }, deadlineDays: 13, tags: ["data", "ai"] })
  ];

  return [...milestoneProjects, ...commissionProjects];
}

module.exports = {
  createProjects
};
