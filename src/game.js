const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const content = require("./content");

const SAVE_PATH = path.join(process.cwd(), ".save", "code-life.json");
const OFFLINE_CAP_SECONDS = 8 * 60 * 60;

function roleById(id) {
  return content.roles.find((role) => role.id === id);
}

function itemById(items, id) {
  return items.find((item) => item.id === id);
}

function createNewState(now = Date.now()) {
  const role = content.roles[0];
  return {
    resources: {
      codeLines: 0,
      exp: 0,
      money: 30,
      energy: role.maxEnergy,
      bugs: 0,
      techDebt: 0,
      reputation: 0
    },
    unlockedSkills: [],
    ownedTools: [],
    completedProjects: [],
    currentRole: role.id,
    lastTick: now,
    stats: {
      totalCodeLines: 0,
      totalBugsFixed: 0,
      totalProjects: 0
    }
  };
}

function normalizeState(raw, now = Date.now()) {
  const fresh = createNewState(now);
  return {
    ...fresh,
    ...raw,
    resources: { ...fresh.resources, ...(raw && raw.resources) },
    unlockedSkills: Array.isArray(raw && raw.unlockedSkills) ? raw.unlockedSkills : [],
    ownedTools: Array.isArray(raw && raw.ownedTools) ? raw.ownedTools : [],
    completedProjects: Array.isArray(raw && raw.completedProjects) ? raw.completedProjects : [],
    currentRole: raw && raw.currentRole ? raw.currentRole : fresh.currentRole,
    lastTick: Number.isFinite(raw && raw.lastTick) ? raw.lastTick : now,
    stats: { ...fresh.stats, ...(raw && raw.stats) }
  };
}

function getMultipliers(state) {
  const multipliers = { code: 1, exp: 1, money: 1, bug: 1, debt: 1 };
  const apply = (item) => {
    for (const [key, value] of Object.entries(item.multipliers || {})) {
      multipliers[key] *= value;
    }
  };

  state.unlockedSkills
    .map((id) => itemById(content.skills, id))
    .filter(Boolean)
    .forEach(apply);
  state.ownedTools
    .map((id) => itemById(content.tools, id))
    .filter(Boolean)
    .forEach(apply);

  return multipliers;
}

function settleTime(state, now = Date.now(), options = {}) {
  const maxSeconds = options.maxSeconds ?? OFFLINE_CAP_SECONDS;
  const elapsedSeconds = Math.max(0, Math.floor((now - state.lastTick) / 1000));
  const seconds = Math.min(elapsedSeconds, maxSeconds);
  const messages = [];

  if (seconds <= 0) {
    state.lastTick = now;
    return { seconds: 0, messages };
  }

  const role = roleById(state.currentRole) || content.roles[0];
  const multipliers = getMultipliers(state);
  const codeGained = role.codePerSecond * multipliers.code * seconds;
  const expGained = role.expPerSecond * multipliers.exp * seconds;
  const moneyGained = role.moneyPerSecond * multipliers.money * seconds;
  const bugGained = codeGained * 0.018 * multipliers.bug;
  const debtGained = codeGained * 0.012 * multipliers.debt;

  state.resources.codeLines += codeGained;
  state.resources.exp += expGained;
  state.resources.money += moneyGained;
  state.resources.bugs += bugGained;
  state.resources.techDebt += debtGained;
  state.resources.energy = Math.min(role.maxEnergy, state.resources.energy + seconds * 0.08);
  state.stats.totalCodeLines += codeGained;
  state.lastTick = now;

  if (options.randomEvents && seconds > 0) {
    const eventChance = Math.min(0.35, seconds / 3600 * 0.12);
    const rng = options.rng || Math.random;
    if (rng() < eventChance) {
      const event = content.randomEvents[Math.floor(rng() * content.randomEvents.length)];
      event.apply(state);
      messages.push(`随机事件：${event.name}。${event.message}`);
    }
  }

  return { seconds, messages };
}

function formatNumber(value) {
  return Math.floor(value).toString();
}

function formatState(state) {
  const role = roleById(state.currentRole);
  return [
    `职位：${role ? role.name : state.currentRole}`,
    `代码行数：${formatNumber(state.resources.codeLines)}  经验：${formatNumber(state.resources.exp)}  金钱：${formatNumber(state.resources.money)}`,
    `精力：${formatNumber(state.resources.energy)}  Bug：${formatNumber(state.resources.bugs)}  技术债：${formatNumber(state.resources.techDebt)}  声望：${formatNumber(state.resources.reputation)}`,
    `技能：${state.unlockedSkills.length ? state.unlockedSkills.join(", ") : "暂无"}`,
    `工具：${state.ownedTools.length ? state.ownedTools.join(", ") : "暂无"}`,
    `已完成项目：${state.completedProjects.length ? state.completedProjects.join(", ") : "暂无"}`
  ].join("\n");
}

function formatLiveStatus(state, spinner) {
  const role = roleById(state.currentRole);
  return `${spinner} 运行中 | ${role ? role.name : state.currentRole} | 代码 ${formatNumber(state.resources.codeLines)} | 经验 ${formatNumber(state.resources.exp)} | 金钱 ${formatNumber(state.resources.money)} | Bug ${formatNumber(state.resources.bugs)} | 技术债 ${formatNumber(state.resources.techDebt)}`;
}

function helpText() {
  return [
    "命令：",
    "  status                 查看状态",
    "  code                   主动写代码",
    "  fix                    修 Bug",
    "  learn <id>             学技能",
    "  buy <id>               买工具",
    "  project <id>           提交项目",
    "  promote                申请晋升",
    "  wait <seconds>         快进调试",
    "  list skills|tools|projects 查看可购买/可提交内容",
    "  save                   保存",
    "  help                   帮助",
    "  quit                   保存并退出"
  ].join("\n");
}

function listContent(type) {
  if (type === "skills") {
    return content.skills
      .map((skill) => `${skill.id} - ${skill.name}，花费：${skill.cost.exp} 经验 / ${skill.cost.money} 金钱。${skill.description}`)
      .join("\n");
  }
  if (type === "tools") {
    return content.tools
      .map((tool) => `${tool.id} - ${tool.name}，花费：${tool.cost.money} 金钱。${tool.description}`)
      .join("\n");
  }
  if (type === "projects") {
    return content.projects
      .map((project) => {
        const skills = project.requirements.skills.length ? project.requirements.skills.join(", ") : "无";
        return `${project.id} - ${project.name}，需要：${project.requirements.codeLines} 行代码 / 技能 ${skills}，奖励：${project.rewards.exp} 经验 / ${project.rewards.money} 金钱 / ${project.rewards.reputation} 声望`;
      })
      .join("\n");
  }
  return "可查看：list skills、list tools、list projects";
}

function canAfford(resources, cost) {
  return Object.entries(cost).every(([key, value]) => resources[key] >= value);
}

function pay(resources, cost) {
  for (const [key, value] of Object.entries(cost)) {
    resources[key] -= value;
  }
}

function learnSkill(state, id) {
  const skill = itemById(content.skills, id);
  if (!skill) return `没有这个技能：${id}`;
  if (state.unlockedSkills.includes(id)) return `你已经学会了 ${skill.name}。`;
  if (!canAfford(state.resources, skill.cost)) return `资源不足，学习 ${skill.name} 需要 ${skill.cost.exp} 经验和 ${skill.cost.money} 金钱。`;
  pay(state.resources, skill.cost);
  state.unlockedSkills.push(id);
  return `学会了 ${skill.name}。${skill.description}`;
}

function buyTool(state, id) {
  const tool = itemById(content.tools, id);
  if (!tool) return `没有这个工具：${id}`;
  if (state.ownedTools.includes(id)) return `你已经拥有 ${tool.name}。`;
  if (!canAfford(state.resources, tool.cost)) return `金钱不足，购买 ${tool.name} 需要 ${tool.cost.money}。`;
  pay(state.resources, tool.cost);
  state.ownedTools.push(id);
  return `买到了 ${tool.name}。${tool.description}`;
}

function submitProject(state, id) {
  const project = itemById(content.projects, id);
  if (!project) return `没有这个项目：${id}`;
  if (state.completedProjects.includes(id)) return `项目 ${project.name} 已经完成过了。`;

  const missingSkills = project.requirements.skills.filter((skill) => !state.unlockedSkills.includes(skill));
  if (missingSkills.length) return `技能不足，还需要：${missingSkills.join(", ")}。`;
  if (state.resources.codeLines < project.requirements.codeLines) {
    return `代码行数不足，${project.name} 需要 ${project.requirements.codeLines} 行代码。`;
  }

  state.resources.codeLines -= project.requirements.codeLines;
  state.resources.exp += project.rewards.exp;
  state.resources.money += project.rewards.money;
  state.resources.reputation += project.rewards.reputation;
  state.completedProjects.push(id);
  state.stats.totalProjects += 1;
  return `提交了 ${project.name}，获得 ${project.rewards.exp} 经验、${project.rewards.money} 金钱、${project.rewards.reputation} 声望。`;
}

function promote(state) {
  const role = roleById(state.currentRole);
  if (!role || !role.promoteTo) return "你已经是当前版本的最高职位了。";

  const req = role.promoteRequirements;
  const missing = [];
  if (state.resources.exp < req.exp) missing.push(`${req.exp} 经验`);
  if (state.resources.reputation < req.reputation) missing.push(`${req.reputation} 声望`);
  if (state.completedProjects.length < req.completedProjects) missing.push(`${req.completedProjects} 个完成项目`);
  for (const skill of req.skills) {
    if (!state.unlockedSkills.includes(skill)) missing.push(`技能 ${skill}`);
  }

  if (missing.length) return `晋升失败，还需要：${missing.join("、")}。`;

  state.currentRole = role.promoteTo;
  const nextRole = roleById(state.currentRole);
  state.resources.energy = Math.min(nextRole.maxEnergy, state.resources.energy + 20);
  return `晋升成功！当前职位：${nextRole.name}。`;
}

function activeCode(state) {
  if (state.resources.energy < 8) return "精力不足，先等等恢复一下。";
  const multipliers = getMultipliers(state);
  const gained = 18 * multipliers.code;
  state.resources.energy -= 8;
  state.resources.codeLines += gained;
  state.resources.exp += 3 * multipliers.exp;
  state.resources.bugs += gained * 0.025 * multipliers.bug;
  state.stats.totalCodeLines += gained;
  return `你专注写了一轮代码，增加 ${formatNumber(gained)} 行代码。`;
}

function fixBugs(state) {
  if (state.resources.energy < 6) return "精力不足，修 Bug 需要冷静。";
  if (state.resources.bugs < 1 && state.resources.techDebt < 1) return "暂时没有明显 Bug 或技术债。";
  const fixedBugs = Math.min(state.resources.bugs, 8);
  const reducedDebt = Math.min(state.resources.techDebt, 5);
  state.resources.energy -= 6;
  state.resources.bugs -= fixedBugs;
  state.resources.techDebt -= reducedDebt;
  state.resources.exp += fixedBugs * 1.2 + reducedDebt * 0.8;
  state.stats.totalBugsFixed += fixedBugs;
  return `修复了 ${formatNumber(fixedBugs)} 个 Bug，压低了 ${formatNumber(reducedDebt)} 点技术债。`;
}

function processCommand(state, input, options = {}) {
  const now = options.now ?? Date.now();
  const messages = [];
  const trimmed = input.trim();

  if (!trimmed) return { messages, exit: false };

  if (!trimmed.startsWith("wait ")) {
    messages.push(...settleTime(state, now, { randomEvents: options.randomEvents, rng: options.rng }).messages);
  }

  const [command, arg] = trimmed.split(/\s+/, 2);
  switch (command) {
    case "status":
      messages.push(formatState(state));
      break;
    case "code":
      messages.push(activeCode(state));
      break;
    case "fix":
      messages.push(fixBugs(state));
      break;
    case "learn":
      messages.push(arg ? learnSkill(state, arg) : "用法：learn <id>");
      break;
    case "buy":
      messages.push(arg ? buyTool(state, arg) : "用法：buy <id>");
      break;
    case "project":
      messages.push(arg ? submitProject(state, arg) : "用法：project <id>");
      break;
    case "promote":
      messages.push(promote(state));
      break;
    case "wait": {
      const seconds = Number(arg);
      if (!Number.isFinite(seconds) || seconds <= 0) {
        messages.push("用法：wait <seconds>，seconds 必须是正数。");
      } else {
        const waitNow = state.lastTick + Math.floor(seconds) * 1000;
        const result = settleTime(state, waitNow, { maxSeconds: Math.floor(seconds), randomEvents: options.randomEvents, rng: options.rng });
        messages.push(`快进了 ${result.seconds} 秒。`);
        messages.push(...result.messages);
      }
      break;
    }
    case "list":
      messages.push(listContent(arg));
      break;
    case "help":
      messages.push(helpText());
      break;
    case "save":
      saveGame(state, options.savePath);
      messages.push("已保存。");
      break;
    case "quit":
    case "exit":
      saveGame(state, options.savePath);
      messages.push("已保存，下次继续写。");
      return { messages, exit: true };
    default:
      messages.push("未知命令。输入 help 查看可用命令。");
  }

  return { messages, exit: false };
}

function loadGame(savePath = SAVE_PATH, now = Date.now()) {
  if (!fs.existsSync(savePath)) return createNewState(now);
  const raw = JSON.parse(fs.readFileSync(savePath, "utf8"));
  return normalizeState(raw, now);
}

function saveGame(state, savePath = SAVE_PATH) {
  fs.mkdirSync(path.dirname(savePath), { recursive: true });
  fs.writeFileSync(savePath, JSON.stringify(state, null, 2));
}

function startCli() {
  const state = loadGame();
  const offline = settleTime(state, Date.now(), { randomEvents: true });
  saveGame(state);

  console.log("《代码人生》CLI MVP");
  console.log("输入 help 查看命令。");
  if (offline.seconds > 0) {
    console.log(`离线结算 ${offline.seconds} 秒。`);
    for (const message of offline.messages) console.log(message);
  }
  console.log(formatState(state));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "code-life> "
  });

  let closed = false;
  let liveTicks = 0;
  let liveSpinnerIndex = 0;
  const liveSpinner = ["-", "\\", "|", "/"];

  const printLines = (messages) => {
    for (const message of messages) console.log(message);
    if (!closed) rl.prompt();
  };

  if (process.stdin.isTTY && process.stdout.isTTY) {
    console.log("自动写代码中，每 3 秒刷新状态。");
  }

  const liveTicker = process.stdin.isTTY && process.stdout.isTTY
    ? setInterval(() => {
        if (closed) return;
        const result = settleTime(state, Date.now(), { randomEvents: true });
        liveTicks += 1;
        liveSpinnerIndex = (liveSpinnerIndex + 1) % liveSpinner.length;
        if (liveTicks % 10 === 0) saveGame(state);

        if (rl.line.length > 0) return;

        readline.clearLine(process.stdout, 0);
        readline.cursorTo(process.stdout, 0);
        console.log(formatLiveStatus(state, liveSpinner[liveSpinnerIndex]));
        printLines(result.messages);
      }, 3000)
    : null;

  rl.prompt();
  rl.on("line", (line) => {
    if (closed) return;
    const result = processCommand(state, line, { randomEvents: true });
    if (result.exit) {
      for (const message of result.messages) console.log(message);
      closed = true;
      if (liveTicker) clearInterval(liveTicker);
      rl.close();
      return;
    }
    printLines(result.messages);
  });
  rl.on("close", () => {
    closed = true;
    if (liveTicker) clearInterval(liveTicker);
    saveGame(state);
  });
}

if (require.main === module) {
  startCli();
}

module.exports = {
  OFFLINE_CAP_SECONDS,
  SAVE_PATH,
  activeCode,
  buyTool,
  createNewState,
  fixBugs,
  formatLiveStatus,
  formatState,
  getMultipliers,
  helpText,
  learnSkill,
  listContent,
  loadGame,
  normalizeState,
  processCommand,
  promote,
  saveGame,
  settleTime,
  submitProject
};
