const {
  createNewState,
  createTuiTicker,
  createProfile,
  defaultProfileExists,
  formatGameEvent,
  getActivityOptions,
  getCharacterCardOptions,
  getGameViewModel,
  getGoalOptions,
  getManagementOptions,
  getProfileOptions,
  getScheduleOptions,
  loadProfile,
  processCommand,
  replaceStateContents,
  saveProfile,
  settleTime
} = require("./game");
const {
  THEME,
  renderProgressBar,
  toneForLog,
  toneForResource,
  toneForStatus
} = require("./tuiTheme");

const PANELS = [
  { id: "profiles", label: "档案", key: "F" },
  { id: "cards", label: "人物卡", key: "C" },
  { id: "schedule", label: "日程", key: "N" },
  { id: "activities", label: "活动", key: "A" },
  { id: "goals", label: "目标", key: "G" },
  { id: "skills", label: "技能", key: "S" },
  { id: "tools", label: "工具", key: "T" },
  { id: "projects", label: "项目", key: "P" }
];

const MAX_LOGS = 80;
const MIN_EVENT_HISTORY_ROWS = 8;
const MIN_LOG_PANEL_HEIGHT = MIN_EVENT_HISTORY_ROWS + 3;
const EVENT_LOG_CATEGORIES = new Set(["project", "skill", "career", "warning", "focus", "world", "random", "system"]);
const CURRENT_RESOURCE_IDS = ["energy", "pressure", "bugs", "techDebt"];
const MIN_LIST_PAGE_SIZE = 3;
const DEFAULT_TERMINAL_ROWS = 24;
const DEFAULT_TERMINAL_COLUMNS = 80;
const TUI_SETTLE_TICK_MS = 3000;

function trimText(value, length) {
  const text = String(value || "");
  return text.length > length ? `${text.slice(0, Math.max(0, length - 1))}…` : text;
}

function normalizeLogMessages(messages, defaultCategory = null) {
  return messages.filter(Boolean).flatMap((message) => {
    if (typeof message === "object" && message !== null && "text" in message) {
      return String(message.text || "")
        .split("\n")
        .filter(Boolean)
        .map((text) => ({
          category: message.category || defaultCategory || null,
          severity: message.severity || "info",
          text
        }));
    }
    return String(message)
      .split("\n")
      .filter(Boolean)
      .map((text) => ({
        category: defaultCategory,
        severity: defaultCategory ? "info" : null,
        text
      }));
  });
}

function createLogEntries(messages, startId = 0, defaultCategory = null) {
  let nextId = Math.max(0, Math.floor(Number(startId) || 0));
  const entries = normalizeLogMessages(messages, defaultCategory).map((entry) => {
    const log = {
      id: nextId++,
      text: entry.category ? formatGameEvent(entry) : entry.text
    };
    if (entry.category) log.category = entry.category;
    if (entry.severity) log.severity = entry.severity;
    return log;
  });
  return { entries, nextId };
}

function appendLogEntries(current, entries, maxLogs = MAX_LOGS) {
  const safeMax = Math.max(1, Math.floor(Number(maxLogs) || MAX_LOGS));
  return [...current, ...entries].slice(-safeMax);
}

function normalizeTickerRows(ticker) {
  const rows = Array.isArray(ticker) ? ticker : String(ticker || "").split("\n");
  return [0, 1].map((index) => {
    const text = String(rows[index] || "").trim();
    return {
      id: `ticker-${index}`,
      text: text || (index === 0 ? "[当前状态] 休整。" : "[当前时间] --"),
      ticker: true
    };
  });
}

function isEventLog(log) {
  if (!log || log.empty) return true;
  if (log.category) return EVENT_LOG_CATEGORIES.has(log.category);
  const text = String(log.text || "");
  return !text.startsWith("[命令]") && !text.startsWith(">");
}

function getLogRows(logs, maxHistoryRows = MAX_LOGS, ticker = null) {
  const safeMax = Math.max(1, Math.floor(Number(maxHistoryRows) || MAX_LOGS));
  const visible = logs.filter(isEventLog).slice(-safeMax);
  const historyRows = !visible.length
    ? [
      ...Array.from({ length: safeMax - 1 }, (_, index) => ({ id: `empty-${index}`, text: "", empty: true })),
      { id: "empty-message", text: "暂无日志。", empty: true }
    ]
    : [
      ...Array.from({ length: safeMax - visible.length }, (_, index) => ({ id: `empty-${index}`, text: "", empty: true })),
      ...visible
    ];
  if (ticker === null || ticker === undefined) return historyRows;
  return {
    tickerRows: normalizeTickerRows(ticker),
    historyRows
  };
}

function getCurrentLogRows(view, ticker = null) {
  const tickerRows = normalizeTickerRows(ticker);
  const resources = view && Array.isArray(view.resources) ? view.resources : [];
  const byId = new Map(resources.map((item) => [item.id, item]));
  const dailyTime = view && view.dailyTime ? view.dailyTime : null;
  const budgetLabel = dailyTime && dailyTime.label
    ? `今日预算 ${dailyTime.label}${dailyTime.overtime ? " 超时" : ` 剩余 ${Math.floor(Number(dailyTime.remaining) || 0)}m`}`
    : "今日预算 --";
  return [
    { id: "current-status", kind: "status", text: tickerRows[0].text },
    { id: "current-time", kind: "time", text: tickerRows[1].text },
    { id: "current-budget", kind: "resource", resourceId: "dailyTime", text: budgetLabel },
    ...CURRENT_RESOURCE_IDS.map((id) => {
      const resource = byId.get(id);
      return {
        id: `current-${id}`,
        kind: "resource",
        resourceId: id,
        resource,
        text: resource ? `${resource.name} ${resource.value}` : `${id} --`
      };
    })
  ];
}

function getCommandLogCategory(command, message = "") {
  const text = `${command || ""}\n${message || ""}`;
  if (/promote|晋升成功/.test(text)) return "career";
  if (/upgrade|learn|技能|学习完成|提升到/.test(text)) return "skill";
  if (/week|本周重点/.test(text)) return "focus";
  if (/project|项目|交付|Deadline/.test(text)) return "project";
  if (/events|世界事件|当前事件/.test(text)) return "world";
  if (/不足|失败|耗尽|逾期|不能|未知|错误|删除/.test(text)) return "warning";
  return "command";
}

function createCommandLogMessages(command, messages = []) {
  const normalized = normalizeLogMessages([`> ${command}`, ...messages]);
  return normalized.map((entry, index) => ({
    category: index === 0 ? "command" : getCommandLogCategory(command, entry.text),
    severity: /不足|失败|耗尽|逾期|不能|未知|错误|删除/.test(entry.text) ? "warn" : "info",
    text: entry.text
  }));
}

function shouldSaveSettleResult(result) {
  return Boolean(result && (result.seconds > 0 || (result.messages && result.messages.length) || (result.events && result.events.length)));
}

function commandForPanel(panelId, option, schedulePhase = "morning") {
  if (!option) return null;
  if (panelId === "activities") return option.unlocked ? `plan ${schedulePhase} activity ${option.id}` : null;
  if (panelId === "skills") return option.command && option.command.startsWith("learn ") ? `plan ${schedulePhase} skill ${option.id}` : option.command;
  if (panelId === "projects") return option.id === "promote" ? option.command : `plan ${schedulePhase} project ${option.id}`;
  return option.command;
}

function shouldExitProfileCreationMode(input, key = {}) {
  const value = String(input || "").toLowerCase();
  return Boolean(key.escape || key.tab || PANELS.some((panel) => panel.key.toLowerCase() === value));
}

function getProfilePageOptions(state, options = {}) {
  if (options.creatingProfile) return getCharacterCardOptions({ now: options.profileCreationStartedAt || options.now });
  return getProfileOptions(state, options);
}

function handleProfileEnterKeypress(state, option, options = {}) {
  if (!option) {
    return {
      creatingProfile: Boolean(options.creatingProfile),
      profileCreationStartedAt: options.profileCreationStartedAt || null,
      messages: [],
      changed: false,
      exit: false
    };
  }

  if (!options.creatingProfile && option.id === "profile-new") {
    return {
      creatingProfile: true,
      profileCreationStartedAt: options.now ?? Date.now(),
      messages: ["请选择人物卡创建新档案。"],
      changed: false,
      exit: false
    };
  }

  const command = option.command;
  if (!command) {
    return {
      creatingProfile: Boolean(options.creatingProfile),
      profileCreationStartedAt: options.profileCreationStartedAt || null,
      messages: [],
      changed: false,
      exit: false
    };
  }

  const result = processTuiCommand(state, command, options);
  return {
    creatingProfile: false,
    profileCreationStartedAt: null,
    messages: [`> ${command}`, ...result.messages],
    changed: true,
    exit: result.exit
  };
}

function resolveProfileDeleteKeypress(option, pendingProfileId) {
  const command = option && option.deleteCommand;
  if (!command) return { pendingProfileId: null, command: null, message: null };
  if (pendingProfileId !== option.id) {
    return {
      pendingProfileId: option.id,
      command: null,
      message: `再次按 D 删除档案：${option.id}`
    };
  }
  return { pendingProfileId: null, command, message: null };
}

function profileDeleteUnavailableMessage(option) {
  if (!option) return "没有选中可删除的档案。";
  if (option.id === "profile-new" || option.id === "profile-save") return "请选择具体档案后再按 D D 删除。";
  if (option.current) return "不能删除当前正在使用的档案。";
  if (option.id === "default") return "default 档案不能删除。";
  return `这个档案不能删除：${option.id}`;
}

function handleProfileDeleteKeypress(state, option, pendingProfileId, options = {}) {
  if (options.creatingProfile) {
    return {
      pendingProfileId: null,
      messages: ["正在选择人物卡，请先取消或完成新建档案。"],
      changed: false,
      exit: false
    };
  }

  const action = resolveProfileDeleteKeypress(option, pendingProfileId);
  if (action.message) {
    return {
      pendingProfileId: action.pendingProfileId,
      messages: [action.message],
      changed: false,
      exit: false
    };
  }
  if (!action.command) {
    return {
      pendingProfileId: action.pendingProfileId,
      messages: [profileDeleteUnavailableMessage(option)],
      changed: false,
      exit: false
    };
  }
  const result = processTuiCommand(state, action.command, options);
  return {
    pendingProfileId: action.pendingProfileId,
    messages: [`> ${action.command}`, ...result.messages],
    changed: true,
    exit: result.exit
  };
}

function getPageWindow(optionsLength, selectedIndex, pageSize) {
  const length = Math.max(0, Math.floor(Number(optionsLength) || 0));
  const size = Math.max(MIN_LIST_PAGE_SIZE, Math.floor(Number(pageSize) || MIN_LIST_PAGE_SIZE));
  if (length === 0) return { start: 0, end: 0, page: 0, pageCount: 0, pageSize: size };
  const safeSelected = Math.max(0, Math.min(length - 1, Math.floor(Number(selectedIndex) || 0)));
  const pageCount = Math.max(1, Math.ceil(length / size));
  const page = Math.min(pageCount - 1, Math.floor(safeSelected / size));
  const start = page * size;
  const end = Math.min(length, start + size);
  return { start, end, page, pageCount, pageSize: size };
}

function calculateLayoutBudget(rows, columns) {
  const terminalRows = Math.max(12, Math.floor(Number(rows) || DEFAULT_TERMINAL_ROWS));
  const terminalColumns = Math.max(40, Math.floor(Number(columns) || DEFAULT_TERMINAL_COLUMNS));
  const compact = terminalRows <= 24;
  const narrow = terminalColumns < 100;
  const headerHeight = 5;
  const resourceHeight = 5;
  const tabHeight = 1;
  const footerHeight = 3;
  const logHeight = Math.max(MIN_LOG_PANEL_HEIGHT, compact ? 8 : terminalRows < 30 ? 9 : 10);
  const reserved = headerHeight + resourceHeight + tabHeight + footerHeight + logHeight;
  const mainHeight = Math.max(5, terminalRows - reserved);
  const listHeight = narrow ? Math.max(5, Math.floor(mainHeight / 2)) : mainHeight;
  const detailHeight = narrow ? Math.max(3, mainHeight - listHeight) : mainHeight;
  const pageSize = Math.max(MIN_LIST_PAGE_SIZE, listHeight - 2);

  return {
    terminalRows,
    terminalColumns,
    narrow,
    headerHeight,
    resourceHeight,
    tabHeight,
    footerHeight,
    logHeight,
    mainHeight,
    listHeight,
    detailHeight,
    pageSize
  };
}

function formatOptionDetail(option) {
  if (!option) return [];
  return [
    option.description && { label: "描述", value: option.description },
    Number.isFinite(option.level) && { label: "等级", value: `${option.levelName || `Lv.${option.level}`}${Number.isFinite(option.exp) && Number.isFinite(option.nextExp) && option.nextExp > 0 ? ` ${option.exp}/${option.nextExp}` : ""}` },
    option.requirements && { label: "需求", value: option.requirements },
    option.attributes && { label: "属性", value: option.attributes },
    option.resources && { label: "资源", value: option.resources },
    option.skills && { label: "技能", value: option.skills },
    option.activityLevels && { label: "活动", value: option.activityLevels },
    option.progress && { label: "进度", value: option.progress },
    option.output && { label: "输出", value: option.output },
    option.rewards && { label: "奖励", value: option.rewards },
    option.cost && { label: "花费", value: option.cost },
    option.effects && { label: "作用", value: option.effects },
    option.missing && { label: "缺口", value: option.missing },
    option.command && { label: "命令", value: option.command }
  ].filter((entry) => entry && String(entry.value || "").trim());
}

function getOptionProgress(option, options = {}) {
  if (!option || !Number.isFinite(option.progressPercent)) return null;
  return {
    label: option.progressLabel || "进度",
    percent: option.progressPercent,
    active: option.progressActive === true && !options.paused,
    text: option.progressText || ""
  };
}

function pauseGameClock(state, now = Date.now(), options = {}) {
  return settleTime(state, now, options);
}

function syncPausedClock(state, now = Date.now()) {
  state.lastTick = now;
  return state.lastTick;
}

function resumeGameClock(state, now = Date.now()) {
  return syncPausedClock(state, now);
}

function processTuiCommand(state, command, options = {}) {
  const now = options.now ?? Date.now();
  if (options.paused) syncPausedClock(state, now);
  return processCommand(state, command, { ...options, now });
}

function clampProgressPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.floor(numeric)));
}

function formatTuiNumber(value, digits = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "0";
  return numeric.toFixed(digits).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function roundTuiNumber(value, digits = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  const scale = 10 ** digits;
  return Math.round(numeric * scale) / scale;
}

function getAttributeUpgradeRequired(currentValue) {
  const value = Math.floor(Number(currentValue) || 0);
  return value >= 100 ? 0 : 50 + value * 5;
}

function getCharacterCardAttributeRows(view) {
  const initialAttributes = new Map(
    ((view && view.characterCard && view.characterCard.initialAttributes) || [])
      .map((attr) => [attr.id, attr])
  );

  return ((view && view.attributes) || []).map((attr) => {
    const currentValue = Math.floor(Number(attr.value) || 0);
    const effectiveValue = Number(attr.effective) || 0;
    const exp = Math.floor(Number(attr.exp) || 0);
    const initial = initialAttributes.get(attr.id);
    const hasInitialValue = Boolean(initial && Number.isFinite(Number(initial.value)));
    const numericInitialValue = hasInitialValue ? Math.floor(Number(initial.value) || 0) : 0;
    const initialValue = hasInitialValue ? numericInitialValue : "未记录";
    const growthValue = roundTuiNumber(hasInitialValue ? Math.max(0, effectiveValue - numericInitialValue) : Math.max(0, effectiveValue));
    const initialPercent = hasInitialValue ? clampProgressPercent(numericInitialValue) : 0;
    const totalPercent = clampProgressPercent(effectiveValue);
    const growthPercent = Math.max(0, totalPercent - initialPercent);
    const upgradeRequired = getAttributeUpgradeRequired(currentValue);
    const upgradePercent = upgradeRequired > 0 ? clampProgressPercent(exp / upgradeRequired * 100) : 100;
    return {
      id: attr.id,
      name: attr.name,
      label: `${attr.name} ${currentValue}`,
      initialValue,
      currentValue,
      effectiveValue,
      growthValue,
      exp,
      upgradeRequired,
      upgradePercent,
      progressPercent: clampProgressPercent(currentValue),
      initialPercent,
      growthPercent,
      growthText: `+${formatTuiNumber(growthValue)}`,
      expText: upgradeRequired > 0 ? `${exp}/${upgradeRequired}` : "满级",
      expMeter: { id: "exp", label: "经验", percent: upgradePercent, color: "exp" },
      progressText: `成长+加成 +${formatTuiNumber(growthValue)}`
    };
  });
}

async function startTui() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    if (!defaultProfileExists()) {
      console.log("首次创建 default 档案必须选择人物卡。请在 TTY 中启动 TUI，或使用 CLI：profile new default --card <cardId> 默认档案。");
      console.log("可用人物卡：");
      for (const card of getCharacterCardOptions()) {
        console.log(`${card.id} - ${card.name}：${card.description}`);
      }
      return;
    }
    const state = loadProfile();
    const offline = settleTime(state, Date.now(), { randomEvents: true });
    saveProfile(state);
    console.log("《代码人生》TUI 需要 TTY 环境。已完成离线结算并保存。");
    console.log(`当前档案：${state.profileId} - ${state.profileName}`);
    if (offline.seconds > 0) console.log(`离线结算 ${offline.seconds} 秒。`);
    for (const message of offline.messages) console.log(message);
    return;
  }

  const React = await import("react");
  const ink = await import("ink");
  const Spinner = (await import("ink-spinner")).default;
  const h = React.createElement;
  const { Box, Text, render, useApp, useInput, useStdout } = ink;
  const { useEffect, useMemo, useReducer, useRef, useState } = React;

  function SectionTitle({ children, color = THEME.title }) {
    return h(Text, { bold: true, color }, children);
  }

  function Badge({ status }) {
    const tone = toneForStatus(status);
    return h(Text, { color: tone.color, dimColor: tone.dim, bold: tone.label === "ready" || tone.label === "live" }, `[${status}]`);
  }

  function KeyHint({ label, text }) {
    return h(Text, null,
      h(Text, { bold: true, color: THEME.title }, ` ${label} `),
      h(Text, { color: THEME.muted }, text)
    );
  }

  function Progress({ percent, width = 14, animated = true }) {
    const [tick, setTick] = useState(0);
    useEffect(() => {
      if (!animated) return undefined;
      const timer = setInterval(() => {
        setTick((value) => value + 1);
      }, 500);
      return () => clearInterval(timer);
    }, [animated]);
    return h(Text, { color: percent >= 100 ? THEME.status.done : THEME.status.info }, renderProgressBar(percent, width, tick, animated));
  }

  function AttributeProgress({ row, width = 14 }) {
    const safeWidth = Math.max(4, Math.floor(Number(width) || 14));
    const initialCells = Math.min(safeWidth, Math.round(clampProgressPercent(row.initialPercent) / 100 * safeWidth));
    const totalCells = Math.min(safeWidth, Math.round(clampProgressPercent(row.initialPercent + row.growthPercent) / 100 * safeWidth));
    const growthCells = Math.max(0, totalCells - initialCells);
    const emptyCells = Math.max(0, safeWidth - initialCells - growthCells);
    return h(Text, null,
      h(Text, { color: THEME.muted }, "["),
      initialCells ? h(Text, { color: THEME.status.info }, "#".repeat(initialCells)) : null,
      growthCells ? h(Text, { color: THEME.status.good }, "#".repeat(growthCells)) : null,
      emptyCells ? h(Text, { color: THEME.panel }, "-".repeat(emptyCells)) : null,
      h(Text, { color: THEME.muted }, "]")
    );
  }

  function MiniProgress({ label, percent, color = THEME.status.neutral, width = 4, text = "", showPercent = false }) {
    const safeWidth = Math.max(3, Math.floor(Number(width) || 4));
    const safePercent = clampProgressPercent(percent);
    const filled = Math.round(safePercent / 100 * safeWidth);
    const empty = Math.max(0, safeWidth - filled);
    return h(Text, null,
      h(Text, { color: THEME.muted }, label),
      h(Text, { color: THEME.muted }, "["),
      filled ? h(Text, { color }, "#".repeat(filled)) : null,
      empty ? h(Text, { color: THEME.panel }, "-".repeat(empty)) : null,
      h(Text, { color: THEME.muted }, "]"),
      showPercent ? h(Text, { color: THEME.muted }, ` ${String(safePercent).padStart(3, " ")}%`) : null,
      text ? h(Text, { color: THEME.muted }, ` ${text}`) : null
    );
  }

  function Header({ view, paused, budget }) {
    const active = view.activeActivity ? `${view.activeActivity.name} Lv.${view.activeActivity.level}` : "无";
    const project = view.activeProject ? `${view.activeProject.name} 工时 ${view.activeProject.progressPercent}% 成功率 ${Math.round(view.activeProject.successRate * 100)}%` : "无";
    const learning = view.activeSkillLearning ? `${view.activeSkillLearning.name} 学习 ${view.activeSkillLearning.progressPercent}%` : "无";
    const detail = `活动 ${active}  项目 ${project}  学习 ${learning}`;
    const width = Math.max(48, budget.terminalColumns - 6);
    const phaseLabel = view.schedule.currentPhase ? `${view.schedule.currentPhase.name} ${view.schedule.currentPhase.timeRange}` : "休整";
    const scheduleLabel = view.schedule.confirmed ? "日程已确认" : "等待排程";
    const lifestyleLabel = view.lifestyle && view.lifestyle.pending
      ? `作息 ${view.lifestyle.current.name}->${view.lifestyle.pending.name}`
      : `作息 ${view.lifestyle ? view.lifestyle.current.name : "Health First"}`;
    const calendarLine = budget.narrow
      ? `${view.calendar.short} | ${phaseLabel} | ${scheduleLabel}`
      : `${view.calendar.short}  ${phaseLabel}  ${scheduleLabel}  本周 ${view.weeklyFocus.name}  ${lifestyleLabel}  ${view.nearestDeadline ? `Deadline ${view.nearestDeadline.name} D${String(view.nearestDeadline.dueDay).padStart(3, "0")}` : "Deadline 暂无"}`;
    const eventLine = view.activeWorldEvents.length
      ? `事件 ${view.activeWorldEvents.map((event) => event.name).join("，")}  ${view.nearestDeadline ? `最近 ${view.nearestDeadline.name} D${String(view.nearestDeadline.dueDay).padStart(3, "0")}` : "最近 Deadline 暂无"}`
      : `${view.nearestDeadline ? `最近 Deadline ${view.nearestDeadline.name} D${String(view.nearestDeadline.dueDay).padStart(3, "0")}` : "最近 Deadline 暂无"}`;
    return h(Box, { borderStyle: "round", borderColor: THEME.title, paddingX: 1, flexDirection: "column", height: budget.headerHeight },
      h(Box, { gap: 1 },
        h(Text, { bold: true, color: THEME.title }, `《${view.title}》`),
        h(Text, { color: THEME.muted }, `${view.profile.id}/${view.profile.name}`),
        h(Text, { color: THEME.panels.cards }, `人物卡：${view.profile.characterCardName}`),
        h(Text, { color: THEME.status.info }, view.role.name),
        paused
          ? h(Text, { color: THEME.status.paused, bold: true }, "暂停")
          : h(Text, { color: THEME.status.good }, h(Spinner, { type: "dots" }), " 自动结算")
      ),
      h(Text, { color: THEME.status.info }, trimText(calendarLine, width)),
      h(Text, { color: THEME.muted }, trimText(detail, width)),
      h(Text, { color: THEME.muted }, trimText(`${eventLine}  ${view.nextAdvice}`, width))
    );
  }

  function ResourceLine({ item }) {
    const tone = toneForResource(item);
    return h(Text, { color: tone.color, bold: tone.label === "critical" },
      `${item.name.padEnd(4, " ")} ${String(item.value).padStart(4, " ")}`
    );
  }

  function ResourcePanel({ view, budget }) {
    const resourceRows = [
      view.resources.slice(0, 4),
      view.resources.slice(4, 8),
      view.resources.slice(8, 13)
    ].map((items) => items.map((item) => `${item.name} ${item.value}`).join("  "));
    const attrs = view.attributes.map((attr) => `${attr.name} ${attr.value}${attr.breakthrough ? `(+${attr.breakthrough})` : ""}`);
    const activityLevels = view.activityLevels.map((activity) => `${activity.active ? "*" : ""}${activity.name} Lv.${activity.level}`);
    const width = Math.max(38, Math.floor((budget.terminalColumns - 8) / 2));
    return h(Box, { gap: 2, height: budget.resourceHeight },
      h(Box, { borderStyle: "single", borderColor: THEME.panel, paddingX: 1, flexDirection: "column", flexGrow: 1, height: budget.resourceHeight },
        h(SectionTitle, { color: THEME.status.info }, "资源"),
        ...resourceRows.map((line, index) => h(Text, { key: `res-${index}`, color: index === 2 ? THEME.muted : THEME.text }, trimText(line, width)))
      ),
      h(Box, { borderStyle: "single", borderColor: THEME.panel, paddingX: 1, flexDirection: "column", flexGrow: 1, height: budget.resourceHeight },
        h(SectionTitle, { color: THEME.panels.cards }, "成长"),
        h(Text, null, trimText(attrs.join("  "), width)),
        h(Text, null, trimText(`目标可领取：${view.goals.claimableCount}  累计活动：${view.stats.totalActiveSeconds}s`, width)),
        h(Text, { color: THEME.muted }, trimText(activityLevels.join("  "), width))
      )
    );
  }

  function TabBar({ activePanel }) {
    return h(Box, { gap: 1 },
      ...PANELS.map((panel) => {
        const active = panel.id === activePanel;
        const color = THEME.panels[panel.id] || THEME.status.neutral;
        return h(Text, {
          key: panel.id,
          color,
          inverse: active,
          bold: active,
          dimColor: !active
        }, ` ${panel.key} ${panel.label} `);
      })
    );
  }

  function getPanelOptions(state, activePanel) {
    if (activePanel === "profiles") return getProfileOptions(state);
    if (activePanel === "schedule") return getScheduleOptions(state);
    if (activePanel === "activities") return getActivityOptions(state);
    if (activePanel === "goals") return getGoalOptions(state);
    if (["skills", "tools", "projects"].includes(activePanel)) return getManagementOptions(state, activePanel);
    return [];
  }

  function compactOptionMeta(option) {
    const progress = getOptionProgress(option);
    return [
      option.difficultyLabel || "",
      Number.isFinite(option.level) ? `Lv.${option.level}` : "",
      progress ? `${progress.label} ${progress.percent}%` : "",
      option.missing ? "有缺口" : ""
    ].filter(Boolean).join("  ");
  }

  function DetailPanel({ activePanel, option, height, width, paused }) {
    const accent = THEME.panels[activePanel] || THEME.panel;
    const details = formatOptionDetail(option);
    const progress = getOptionProgress(option, { paused });
    const contentWidth = Math.max(24, width - 4);
    const maxRows = Math.max(1, height - 3 - (progress ? 1 : 0));
    return h(Box, { borderStyle: "round", borderColor: accent, paddingX: 1, flexDirection: "column", height },
      option
        ? h(Box, { gap: 1 },
            h(Text, { color: accent, bold: true }, trimText(option.name, Math.max(10, contentWidth - 14))),
            h(Badge, { status: option.status })
          )
        : h(Text, { color: THEME.muted }, "暂无选项"),
      progress ? h(Box, { gap: 1 },
        h(Text, { color: THEME.muted }, progress.label),
        h(Progress, { percent: progress.percent, width: Math.min(18, Math.max(8, contentWidth - 18)), animated: progress.active }),
        progress.text ? h(Text, { color: THEME.muted }, trimText(progress.text, 18)) : null
      ) : null,
      ...details.slice(0, maxRows).map((entry, index) => h(Text, { key: `${entry.label}-${index}`, color: entry.label === "缺口" ? THEME.status.warn : THEME.text },
        `${entry.label}：${trimText(entry.value, contentWidth - entry.label.length - 1)}`
      ))
    );
  }

  function MainPanel({ activePanel, options, selectedIndex, budget, paused }) {
    const accent = THEME.panels[activePanel] || THEME.panel;
    const page = getPageWindow(options.length, selectedIndex, budget.pageSize);
    const visibleOptions = options.slice(page.start, page.end);
    const selectedOption = options[selectedIndex];
    const mainWidth = budget.terminalColumns - 2;
    const listWidth = budget.narrow ? mainWidth : Math.max(30, Math.floor(mainWidth * 0.38));
    const detailWidth = budget.narrow ? mainWidth : Math.max(34, mainWidth - listWidth - 2);
    const list = h(Box, { borderStyle: "round", borderColor: accent, paddingX: 1, flexDirection: "column", height: budget.listHeight, width: budget.narrow ? undefined : listWidth },
      h(Text, { color: THEME.muted }, `第 ${page.pageCount ? page.page + 1 : 0}/${page.pageCount} 页  ${options.length} 项`),
      ...visibleOptions.map((option, offset) => {
        const absoluteIndex = page.start + offset;
        const selected = absoluteIndex === selectedIndex;
        const meta = compactOptionMeta(option);
        const nameWidth = Math.max(8, listWidth - 22);
        return h(Box, { key: option.id, gap: 1 },
          h(Text, { color: selected ? accent : THEME.muted, bold: selected }, selected ? ">" : " "),
          h(Text, { color: selected ? accent : THEME.text, bold: selected }, trimText(option.name, nameWidth)),
          h(Badge, { status: option.status }),
          meta ? h(Text, { color: THEME.muted }, trimText(meta, 18)) : null
        );
      })
    );
    const detail = h(DetailPanel, { activePanel, option: selectedOption, height: budget.detailHeight, width: detailWidth, paused });
    return h(Box, { flexDirection: budget.narrow ? "column" : "row", gap: budget.narrow ? 0 : 1, height: budget.mainHeight },
      list,
      detail
    );
  }

  function CharacterCardPanel({ view, budget }) {
    const card = view.characterCard;
    const attributeRows = getCharacterCardAttributeRows(view);
    const learnedSkills = view.skillLevels
      .filter((skill) => skill.level > 0)
      .map((skill) => `${skill.name} ${skill.levelName}`);
    const activityLevels = view.activityLevels.map((activity) => `${activity.active ? "*" : ""}${activity.name} Lv.${activity.level}`);

    const mainWidth = Math.max(48, budget.terminalColumns - 6);
    const summaryWidth = budget.narrow ? mainWidth : Math.max(28, Math.floor(mainWidth * 0.36));
    const detailWidth = budget.narrow ? mainWidth : Math.max(34, mainWidth - summaryWidth - 3);
    const attrBarWidth = Math.min(14, Math.max(6, detailWidth - 36));
    const maxAttributeRows = Math.max(1, budget.mainHeight - (budget.narrow ? 8 : 4));
    const summaryRows = [
      { color: THEME.muted, text: card.description },
      { color: THEME.muted, text: card.background || "" },
      { title: "初始配置", color: THEME.status.info },
      { text: card.initialBonuses ? `资源：${card.initialBonuses.resources}` : "资源：未记录" },
      { text: card.initialBonuses ? `技能：${card.initialBonuses.skills}` : "技能：未记录" },
      { text: card.initialBonuses ? `活动等级：${card.initialBonuses.activityLevels}` : "活动等级：未记录" },
      { title: "当前成长", color: THEME.title },
      { color: learnedSkills.length ? THEME.status.good : THEME.muted, text: `技能：${learnedSkills.length ? learnedSkills.join("，") : "暂无"}` },
      { color: THEME.muted, text: `活动：${activityLevels.join("  ")}` }
    ];
    const summary = h(Box, { flexDirection: "column", width: budget.narrow ? undefined : summaryWidth },
      h(Text, { bold: true, color: THEME.panels.cards }, `${card.name}${card.id ? ` (${card.id})` : ""}`),
      card.legacy ? h(Text, { color: THEME.status.warn }, "旧档案：未绑定初始人物卡。") : null,
      ...summaryRows.filter((row) => row.title || row.text).slice(0, Math.max(1, budget.mainHeight - 3)).map((row, index) => (
        row.title
          ? h(SectionTitle, { key: `summary-${index}`, color: row.color }, row.title)
          : h(Text, { key: `summary-${index}`, color: row.color || THEME.text }, trimText(row.text, summaryWidth))
      ))
    );
    const attributes = h(Box, { flexDirection: "column", flexGrow: 1 },
      h(Box, { gap: 1 },
        h(SectionTitle, { color: THEME.status.good }, "属性详情")
      ),
      ...attributeRows.slice(0, maxAttributeRows).map((row) => h(Box, { key: row.id, gap: 1 },
        h(Text, { color: THEME.text, bold: true }, trimText(row.label, 7).padEnd(7, " ")),
        h(AttributeProgress, { row, width: attrBarWidth }),
        h(Text, { color: THEME.status.good }, row.growthText),
        h(MiniProgress, {
          label: row.expMeter.label,
          percent: row.expMeter.percent,
          color: THEME.status.warn,
          width: 6,
          text: row.expText,
          showPercent: true
        })
      ))
    );

    return h(Box, { borderStyle: "round", borderColor: THEME.panels.cards, paddingX: 1, flexDirection: budget.narrow ? "column" : "row", gap: budget.narrow ? 0 : 2, height: budget.mainHeight },
      summary,
      attributes
    );
  }

  function LogPanel({ ticker, logs, view, budget }) {
    const visibleEventCount = Math.max(MIN_EVENT_HISTORY_ROWS, budget.logHeight - 3);
    const currentRows = getCurrentLogRows(view, ticker);
    const historyRows = getLogRows(logs, visibleEventCount);
    const latestId = historyRows.filter((log) => !log.empty).at(-1)?.id ?? null;
    const columnWidth = Math.max(24, Math.floor((budget.terminalColumns - 8) / 2));
    return h(Box, { flexDirection: "row", gap: 1, height: budget.logHeight },
      h(Box, { borderStyle: "single", borderColor: THEME.panel, paddingX: 1, flexDirection: "column", height: budget.logHeight, width: columnWidth },
        h(SectionTitle, { color: THEME.title }, "当前"),
        ...currentRows.map((row) => {
          const resourceTone = row.resource ? toneForResource(row.resource) : row.resourceId === "dailyTime" ? { color: THEME.status.info } : null;
          return h(Text, {
            key: row.id,
            color: resourceTone ? resourceTone.color : row.kind === "status" ? THEME.status.info : THEME.muted,
            bold: row.kind === "status" || (resourceTone && resourceTone.label === "critical")
          }, trimText(row.text || " ", Math.max(16, columnWidth - 4)));
        })
      ),
      h(Box, { borderStyle: "single", borderColor: THEME.panel, paddingX: 1, flexDirection: "column", height: budget.logHeight, width: columnWidth },
        h(SectionTitle, { color: THEME.title }, "事件"),
        ...historyRows.map((log) => {
          const tone = log.empty
            ? { color: THEME.muted, bold: false, dim: true }
            : toneForLog(log, log.id === latestId ? 0 : 1);
          return h(Text, {
            key: log.id,
            color: tone.color,
            bold: tone.bold,
            dimColor: tone.dim
          }, trimText(log.text || " ", Math.max(16, columnWidth - 4)));
        })
      )
    );
  }

  const MemoLogPanel = React.memo(LogPanel);

  function Footer({ paused, creatingProfile, schedulePhase }) {
    if (creatingProfile) {
      return h(Box, { borderStyle: "single", borderColor: THEME.panel, paddingX: 1, gap: 1, flexWrap: "wrap" },
        h(KeyHint, { label: "Tab", text: "切换" }),
        h(KeyHint, { label: "↑/↓", text: "选择" }),
        h(KeyHint, { label: "PgUp/PgDn", text: "翻页" }),
        h(KeyHint, { label: "Enter", text: "选择人物卡" }),
        h(KeyHint, { label: "Esc", text: "取消" }),
        h(KeyHint, { label: "Space", text: paused ? "恢复" : "暂停" }),
        h(KeyHint, { label: "Q", text: "保存退出" })
      );
    }
    return h(Box, { borderStyle: "single", borderColor: THEME.panel, paddingX: 1, gap: 1, flexWrap: "wrap" },
      h(KeyHint, { label: "Tab", text: "切换" }),
      h(KeyHint, { label: "↑/↓", text: "选择" }),
      h(KeyHint, { label: "PgUp/PgDn", text: "翻页" }),
      h(KeyHint, { label: "Enter", text: "执行/加载" }),
      h(KeyHint, { label: "1/2/3", text: `阶段 ${schedulePhase}` }),
      h(KeyHint, { label: "D D", text: "删除档案" }),
      h(KeyHint, { label: "Space", text: paused ? "恢复" : "暂停" }),
      h(KeyHint, { label: "Q", text: "保存退出" })
    );
  }

  function App() {
    const needsInitialProfile = !defaultProfileExists();
    const stateRef = useRef(needsInitialProfile ? createNewState() : loadProfile());
    const [activePanel, setActivePanel] = useState(needsInitialProfile ? "cards" : "activities");
    const [selected, setSelected] = useState({});
    const [paused, setPaused] = useState(false);
    const [schedulePhase, setSchedulePhase] = useState("morning");
    const [profileCreationStartedAt, setProfileCreationStartedAt] = useState(null);
    const pendingDeleteProfileIdRef = useRef(null);
    const [logs, setLogs] = useState([]);
    const [ticker, setTicker] = useState(() => createTuiTicker(stateRef.current));
    const [revision, refresh] = useReducer((value) => value + 1, 0);
    const nextLogIdRef = useRef(0);
    const { exit } = useApp();
    const { stdout } = useStdout();

    function addLogs(messages, defaultCategory = null) {
      const created = createLogEntries(messages, nextLogIdRef.current, defaultCategory);
      if (!created.entries.length) return;
      nextLogIdRef.current = created.nextId;
      setLogs((current) => appendLogEntries(current, created.entries));
    }

    useEffect(() => {
      if (needsInitialProfile) {
        addLogs(["请选择人物卡创建 default 档案。"], "system");
        refresh();
        return;
      }
      const offline = settleTime(stateRef.current, Date.now(), { randomEvents: true });
      saveProfile(stateRef.current);
      setTicker(offline.ticker || createTuiTicker(stateRef.current));
      if (offline.seconds > 0 || (offline.events && offline.events.length)) {
        addLogs([{ category: "system", severity: "info", text: `离线结算 ${offline.seconds} 秒。` }, ...(offline.events || [])]);
      }
      refresh();
    }, []);

    useEffect(() => {
      const timer = setInterval(() => {
        if (needsInitialProfile) return;
        if (paused) return;
        const now = Date.now();
        const result = settleTime(stateRef.current, now, { randomEvents: true });
        setTicker(result.ticker || createTuiTicker(stateRef.current));
        if (result.events && result.events.length) addLogs(result.events);
        if (shouldSaveSettleResult(result)) saveProfile(stateRef.current);
        refresh();
      }, TUI_SETTLE_TICK_MS);
      return () => clearInterval(timer);
    }, [paused, needsInitialProfile]);

    const options = useMemo(() => {
      if (needsInitialProfile && activePanel === "cards") return getCharacterCardOptions();
      if (activePanel === "profiles") {
        return getProfilePageOptions(stateRef.current, {
          creatingProfile: profileCreationStartedAt !== null,
          profileCreationStartedAt
        });
      }
      return getPanelOptions(stateRef.current, activePanel);
    }, [activePanel, revision, needsInitialProfile, profileCreationStartedAt]);
    const selectedIndex = Math.min(selected[activePanel] || 0, Math.max(0, options.length - 1));
    const view = getGameViewModel(stateRef.current);
    const budget = calculateLayoutBudget(stdout && stdout.rows, stdout && stdout.columns);
    const creatingProfile = activePanel === "profiles" && profileCreationStartedAt !== null;

    useInput((input, key) => {
      if (input.toLowerCase() === "q") {
        if (!needsInitialProfile) {
          if (paused) syncPausedClock(stateRef.current, Date.now());
          saveProfile(stateRef.current);
        }
        exit();
        return;
      }
      if (input === " ") {
        const now = Date.now();
        if (!needsInitialProfile) {
          if (paused) {
            resumeGameClock(stateRef.current, now);
          } else {
            const result = pauseGameClock(stateRef.current, now, { randomEvents: true });
            setTicker(result.ticker || createTuiTicker(stateRef.current));
            if (result.events && result.events.length) addLogs(result.events);
            saveProfile(stateRef.current);
          }
          refresh();
        }
        setPaused((value) => !value);
        return;
      }
      if (["1", "2", "3"].includes(input)) {
        const phases = ["morning", "afternoon", "evening"];
        setSchedulePhase(phases[Number(input) - 1]);
        addLogs([`当前排程阶段：${phases[Number(input) - 1]}`], "command");
        return;
      }
      if (key.tab) {
        const currentIndex = PANELS.findIndex((panel) => panel.id === activePanel);
        setActivePanel(PANELS[(currentIndex + 1) % PANELS.length].id);
        if (shouldExitProfileCreationMode(input, key)) setProfileCreationStartedAt(null);
        pendingDeleteProfileIdRef.current = null;
        return;
      }
      const shortcut = PANELS.find((panel) => panel.key.toLowerCase() === input.toLowerCase());
      if (shortcut) {
        setActivePanel(shortcut.id);
        if (shouldExitProfileCreationMode(input, key)) setProfileCreationStartedAt(null);
        pendingDeleteProfileIdRef.current = null;
        return;
      }
      if (creatingProfile && shouldExitProfileCreationMode(input, key)) {
        setProfileCreationStartedAt(null);
        pendingDeleteProfileIdRef.current = null;
        addLogs(["已取消新建档案。"], "command");
        return;
      }
      if (key.upArrow) {
        setSelected((current) => ({ ...current, [activePanel]: Math.max(0, selectedIndex - 1) }));
        pendingDeleteProfileIdRef.current = null;
        return;
      }
      if (key.downArrow) {
        setSelected((current) => ({ ...current, [activePanel]: Math.min(Math.max(0, options.length - 1), selectedIndex + 1) }));
        pendingDeleteProfileIdRef.current = null;
        return;
      }
      if (key.pageUp) {
        setSelected((current) => ({ ...current, [activePanel]: Math.max(0, selectedIndex - budget.pageSize) }));
        pendingDeleteProfileIdRef.current = null;
        return;
      }
      if (key.pageDown) {
        setSelected((current) => ({ ...current, [activePanel]: Math.min(Math.max(0, options.length - 1), selectedIndex + budget.pageSize) }));
        pendingDeleteProfileIdRef.current = null;
        return;
      }
      if (key.return) {
        const selectedOption = options[selectedIndex];
        if (activePanel === "schedule" && selectedOption && selectedOption.phaseId) {
          setSchedulePhase(selectedOption.phaseId);
          addLogs([`当前排程阶段：${selectedOption.name}`], "command");
          refresh();
          return;
        }
        if (needsInitialProfile && activePanel === "cards" && selectedOption) {
          try {
            const next = createProfile("default", "默认档案", Date.now(), { characterCardId: selectedOption.id });
            replaceStateContents(stateRef.current, next);
            setActivePanel("activities");
            setTicker(createTuiTicker(stateRef.current));
            addLogs([`已创建 default - 默认档案（${selectedOption.name}）。`], "system");
            refresh();
          } catch (error) {
            addLogs([error && error.message ? error.message : String(error)], "warning");
          }
          return;
        }
        if (activePanel === "profiles") {
          const selectedOption = options[selectedIndex];
          const result = handleProfileEnterKeypress(stateRef.current, selectedOption, {
            creatingProfile,
            profileCreationStartedAt,
            paused,
            randomEvents: true
          });
          setProfileCreationStartedAt(result.creatingProfile ? result.profileCreationStartedAt : null);
          addLogs(result.messages, result.changed ? "command" : "system");
          if (result.exit) exit();
          if (result.changed || result.creatingProfile !== creatingProfile) refresh();
          return;
        }
        const command = commandForPanel(activePanel, selectedOption, schedulePhase);
        if (!command) return;
        const result = processTuiCommand(stateRef.current, command, { paused, randomEvents: true });
        addLogs(createCommandLogMessages(command, result.messages));
        setTicker(createTuiTicker(stateRef.current));
        if (result.exit) exit();
        refresh();
      }
      if (input.toLowerCase() === "d" && activePanel === "profiles") {
        const option = options[selectedIndex];
        const result = handleProfileDeleteKeypress(stateRef.current, option, pendingDeleteProfileIdRef.current, { creatingProfile, paused, randomEvents: true });
        pendingDeleteProfileIdRef.current = result.pendingProfileId;
        addLogs(result.messages, result.changed ? "command" : "system");
        if (result.exit) exit();
        if (result.changed) refresh();
      }
    });

    return h(Box, { flexDirection: "column", paddingX: 1 },
      h(Header, { view, paused, budget }),
      h(ResourcePanel, { view, budget }),
      h(TabBar, { activePanel }),
      activePanel === "cards" && !needsInitialProfile
        ? h(CharacterCardPanel, { view, budget })
        : h(MainPanel, { activePanel, options, selectedIndex, budget, paused }),
      h(MemoLogPanel, { ticker, logs, view, budget }),
      h(Footer, { paused, creatingProfile, schedulePhase })
    );
  }

  render(h(App));
}

if (require.main === module) {
  startTui().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  });
}

module.exports = {
  MAX_LOGS,
  TUI_SETTLE_TICK_MS,
  appendLogEntries,
  calculateLayoutBudget,
  createCommandLogMessages,
  createLogEntries,
  formatOptionDetail,
  getCharacterCardAttributeRows,
  getCurrentLogRows,
  getOptionProgress,
  getProfilePageOptions,
  getPageWindow,
  getLogRows,
  handleProfileEnterKeypress,
  handleProfileDeleteKeypress,
  normalizeLogMessages,
  pauseGameClock,
  profileDeleteUnavailableMessage,
  processTuiCommand,
  resumeGameClock,
  resolveProfileDeleteKeypress,
  shouldExitProfileCreationMode,
  syncPausedClock,
  startTui
};
