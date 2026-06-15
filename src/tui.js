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
  loadLastProfile,
  processCommand,
  replaceStateContents,
  saveProfile,
  settleTime,
  writeLastProfileId
} = require("./game");
const {
  SCHEDULE_PHASES
} = require("./core/constants");
const {
  THEME,
  renderProgressBar,
  toneForLog,
  toneForResource,
  toneForStatus
} = require("./tuiTheme");
const {
  getTextDisplayWidth,
  trimText
} = require("./tui/text");
const {
  DEFAULT_TERMINAL_COLUMNS,
  DEFAULT_TERMINAL_ROWS,
  calculateLayoutBudget,
  getPageWindow
} = require("./tui/layout");

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
const EVENT_LOG_CATEGORIES = new Set(["project", "skill", "career", "warning", "focus", "world", "random", "system"]);
const CURRENT_RESOURCE_IDS = ["energy", "pressure", "bugs", "techDebt"];
const TUI_SETTLE_TICK_MS = 1000;
const TOP_RESOURCE_SUMMARY_IDS = ["codeLines", "money", "knowledge", "tests", "docs", "architecture", "leads", "reputation", "bugs", "techDebt"];
const DAILY_PLANNER_KINDS = ["activity", "skill", "project"];
const DAILY_PLANNER_KIND_TO_PANEL = {
  activity: "activities",
  skill: "skills",
  project: "projects"
};
const DAILY_PLANNER_KIND_LABELS = {
  activity: "活动",
  skill: "技能学习",
  project: "项目"
};
const SCHEDULE_PHASE_IDS = SCHEDULE_PHASES.map((phase) => phase.id);

function isHiddenTuiCommandHint(text) {
  return /^命令：/.test(String(text || "").trim());
}

function normalizeLogMessages(messages, defaultCategory = null) {
  return messages.filter(Boolean).flatMap((message) => {
    if (typeof message === "object" && message !== null && "text" in message) {
      return String(message.text || "")
        .split("\n")
        .filter((text) => text && !isHiddenTuiCommandHint(text))
        .map((text) => ({
          category: message.category || defaultCategory || null,
          severity: message.severity || "info",
          text
        }));
    }
    return String(message)
      .split("\n")
      .filter((text) => text && !isHiddenTuiCommandHint(text))
      .map((text) => ({
        category: defaultCategory,
        severity: defaultCategory ? "info" : null,
        text
      }));
  });
}

function isValidGameTimeLabel(value) {
  return /^\d{2}:\d{2}$/.test(String(value || ""));
}

function createLogEntries(messages, startId = 0, defaultCategory = null, options = {}) {
  let nextId = Math.max(0, Math.floor(Number(startId) || 0));
  const gameTimeLabel = isValidGameTimeLabel(options.gameTimeLabel) ? options.gameTimeLabel : null;
  const entries = normalizeLogMessages(messages, defaultCategory).map((entry) => {
    const log = {
      id: nextId++,
      text: entry.category ? formatGameEvent(entry) : entry.text
    };
    if (entry.category) log.category = entry.category;
    if (entry.severity) log.severity = entry.severity;
    if (entry.category && gameTimeLabel) log.gameTimeLabel = gameTimeLabel;
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
  return rows.map((text, index) => ({
    id: `ticker-${index}`,
    text: String(text || "").trim() || (index === 0 ? "[当前状态] 休整。" : ""),
    ticker: true
  })).filter(row => row.text); // 过滤空行
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

function getCurrentLogRows(view, ticker = null, availableHeight = 20, actualDeltas = null) {
  const tickerRows = normalizeTickerRows(ticker);
  const rows = [];

  // 简化版警告指示：仅显示需要注意的状态
  function getWarningIndicator(id, value) {
    const numValue = Number(value) || 0;

    if (id === "energy") {
      if (numValue <= 15) return " ⚠ 危险";
      if (numValue <= 30) return " ⚠";
      return "";
    }

    if (id === "pressure") {
      if (numValue >= 80) return " ⚠ 危险";
      if (numValue >= 60) return " ⚠";
      return "";
    }

    if (id === "bugs") {
      if (numValue >= 75) return " ⚠ 危险";
      if (numValue >= 50) return " ⚠";
      return "";
    }

    if (id === "techDebt") {
      if (numValue >= 75) return " ⚠ 危险";
      if (numValue >= 50) return " ⚠";
      return "";
    }

    return "";
  }

  // 第一组：当前状态（ticker 信息）
  if (tickerRows.length >= 3) {
    // 特殊状态：一天结束、阶段转换、提前完成
    tickerRows.forEach((row, index) => {
      rows.push({
        id: index === 0 ? "current-status" : row.id,
        kind: "status",
        text: row.text,
        priority: 1
      });
    });
  } else {
    // 常规状态
    tickerRows.forEach((row, index) => {
      rows.push({
        id: index === 0 ? "current-status" : row.id,
        kind: index === 0 ? "status" : "info",
        text: row.text,
        priority: 2
      });
    });
  }

  // 分隔行（仅在空间足够时）
  if (availableHeight >= 8 && tickerRows.length > 0) {
    rows.push({
      id: "separator-1",
      kind: "separator",
      text: "",
      priority: 2
    });
  }

  // 第二组：核心资源状态（紧凑显示）
  const resources = view && Array.isArray(view.resources) ? view.resources : [];
  const byId = new Map(resources.map((item) => [item.id, item]));

  CURRENT_RESOURCE_IDS.forEach((id) => {
    const resource = byId.get(id);
    const value = resource ? resource.value : 0;
    const warning = resource ? getWarningIndicator(id, value) : "";

    // 只在有警告时显示，或空间充足时显示所有
    const shouldShow = warning || availableHeight >= 9;

    if (shouldShow) {
      const valueText = resource && resource.id === "energy" && resource.status
        ? `${resource.value}/${resource.max || 100} ${resource.status}`
        : resource ? resource.value : "--";

      rows.push({
        id: `current-${id}`,
        kind: "resource",
        resourceId: id,
        resource,
        text: resource ? `${resource.name} ${valueText}${warning}` : `${id} --`,
        priority: warning ? 2 : 3
      });
    }
  });

  // 紧凑模式：一行显示所有资源
  if (availableHeight < 9) {
    const compactResources = CURRENT_RESOURCE_IDS
      .map((id) => {
        const resource = byId.get(id);
        const value = resource ? resource.value : 0;
        const warning = resource ? getWarningIndicator(id, value) : "";
        return resource ? `${resource.name}${value}${warning}` : null;
      })
      .filter(Boolean)
      .join(" | ");

    if (compactResources) {
      rows.push({
        id: "current-resources-compact",
        kind: "resource",
        text: compactResources,
        priority: 3
      });
    }
  }

  // 分隔行
  if (availableHeight >= 8) {
    rows.push({
      id: "separator-2",
      kind: "separator",
      text: "",
      priority: 3
    });
  }

  // 第三组：建议与关键提醒
  const adviceList = view && Array.isArray(view.adviceList) && view.adviceList.length > 0 ? view.adviceList : null;
  if (adviceList) {
    adviceList.slice(0, availableHeight >= 15 ? 2 : 1).forEach((advice, index) => {
      rows.push({
        id: index === 0 ? "current-advice" : `advice-${index}`,
        kind: "advice",
        text: `${advice.emoji} ${advice.text}`,
        priority: 4
      });
    });
  } else {
    const nextAdvice = view && view.nextAdvice ? view.nextAdvice : null;
    if (nextAdvice && availableHeight >= 6) {
      rows.push({
        id: "current-advice",
        kind: "advice",
        text: nextAdvice,
        priority: 4
      });
    }
  }

  // 根据可用高度截断
  return rows.slice(0, Math.max(1, Math.floor(Number(availableHeight) || 1)));
}

const INFO_TICKER_HIDDEN_PREFIXES = ["[当前时间]", "[阶段进度]", "[进度预览]"];
const INFO_RESOURCE_PATTERN = /精力|压力|Bug|技术债/;
const INFO_EVENT_LABELS = {
  random: "情报",
  project: "交付",
  skill: "学习",
  career: "成长",
  warning: "警戒",
  focus: "方针",
  world: "大势",
  system: "系统"
};
const INFO_TIMED_EVENT_CATEGORIES = new Set(["random", "project", "skill", "career", "warning", "focus", "world"]);

function isInfoTickerRow(row) {
  const text = String(row && row.text || "").trim();
  if (!text) return false;
  if (INFO_TICKER_HIDDEN_PREFIXES.some((prefix) => text.startsWith(prefix))) return false;
  return text.startsWith("[当前状态]") || text.startsWith("[阶段转换]") || text.startsWith("[提前完成]") || text.startsWith("[一天结束]");
}

function sanitizeInfoTickerText(text) {
  const withoutInlineMeta = String(text || "").split(" | ")[0].trim();
  if (withoutInlineMeta.startsWith("[当前状态]")) {
    if (/^\[当前状态\]\s*活动\s+/.test(withoutInlineMeta)) return "[当前状态] 行动中";
    if (/^\[当前状态\]\s*(学习|技能)\s+/.test(withoutInlineMeta)) return "[当前状态] 学习中";
    if (/^\[当前状态\]\s*(项目|交付)\s+/.test(withoutInlineMeta)) return "[当前状态] 交付推进中";
  }
  if (!INFO_RESOURCE_PATTERN.test(withoutInlineMeta)) return withoutInlineMeta;
  return withoutInlineMeta.split("：")[0].trim();
}

function formatInfoLevelProgressBar(percent, width = 18) {
  const safeWidth = Math.max(1, Math.floor(Number(width) || 18));
  const safePercent = Math.max(0, Math.min(100, Math.floor(Number(percent) || 0)));
  const filled = Math.round(safePercent / 100 * safeWidth);
  return `[${Array.from({ length: safeWidth }, (_, index) => {
    if (index >= filled) return "-";
    return index === filled - 1 && filled < safeWidth ? "=" : "#";
  }).join("")}]`;
}

function createInfoActivityLevelRow(view) {
  if (!view || !view.activeActivity || !Array.isArray(view.activityLevels)) return null;
  const activeLevel = view.activityLevels.find((activity) => activity && activity.active === true && activity.id === view.activeActivity.id);
  if (!activeLevel || !(Number(activeLevel.nextExp) > 0)) return null;
  const level = Math.max(1, Math.floor(Number(activeLevel.level) || Number(view.activeActivity.level) || 1));
  const exp = Math.max(0, Math.floor(Number(activeLevel.exp) || 0));
  const nextExp = Math.max(1, Math.floor(Number(activeLevel.nextExp) || 1));
  const percent = Math.max(0, Math.min(100, Math.floor(exp / nextExp * 100)));
  return {
    id: "context-activity-exp",
    kind: "context",
    text: `[Lv.${level}] ${formatInfoLevelProgressBar(percent)} ${percent}% ${exp}/${nextExp}`,
    priority: 2
  };
}

function createInfoCurrentActionProgressRow(view) {
  if (!view) return null;
  if (view.activeProject) {
    const project = view.activeProject;
    const percent = Math.max(0, Math.min(100, Math.floor(Number(project.stageProgressPercent ?? project.progressPercent) || 0)));
    const stageIndex = Number.isFinite(Number(project.stageIndex)) ? Math.floor(Number(project.stageIndex)) + 1 : null;
    const stageCount = Number.isFinite(Number(project.stageCount)) ? Math.floor(Number(project.stageCount)) : null;
    const stageLabel = stageIndex && stageCount ? `阶段 ${stageIndex}/${stageCount}` : "阶段进度";
    const stageName = project.stageName ? ` ${project.stageName}` : "";
    const progressText = project.progressText ? ` ${project.progressText}` : "";
    return {
      id: "context-action-progress",
      kind: "action",
      text: `[项目] ${project.name} ${stageLabel}${stageName} ${formatInfoLevelProgressBar(percent)} ${percent}%${progressText}`,
      priority: 2
    };
  }
  if (view.activeSkillLearning) {
    const skill = view.activeSkillLearning;
    const percent = Math.max(0, Math.min(100, Math.floor(Number(skill.progressPercent) || 0)));
    const label = skill.progressLabel || "学习进度";
    const progressText = skill.progressText ? ` ${skill.progressText}` : "";
    return {
      id: "context-action-progress",
      kind: "action",
      text: `[技能] ${skill.name} ${label} ${formatInfoLevelProgressBar(percent)} ${percent}%${progressText}`,
      priority: 2
    };
  }
  if (view.activeActivity) {
    const activity = view.activeActivity;
    const fallbackLevel = Array.isArray(view.activityLevels)
      ? view.activityLevels.find((entry) => entry && entry.id === activity.id)
      : null;
    const level = Math.max(1, Math.floor(Number(activity.level ?? fallbackLevel?.level) || 1));
    const exp = Math.max(0, Math.floor(Number(activity.exp ?? fallbackLevel?.exp) || 0));
    const nextExp = Math.max(0, Math.floor(Number(activity.nextExp ?? fallbackLevel?.nextExp) || 0));
    if (!(nextExp > 0)) return null;
    const percent = Math.max(0, Math.min(100, Math.floor(Number(activity.progressPercent) || exp / nextExp * 100)));
    const progressText = activity.progressText || `${exp}/${nextExp}`;
    return {
      id: "context-action-progress",
      kind: "action",
      text: `[活动] ${activity.name} Lv.${level} ${formatInfoLevelProgressBar(percent)} ${percent}% ${progressText}`,
      priority: 2
    };
  }
  return null;
}

function getInfoResourceValue(view, id) {
  const resources = view && Array.isArray(view.resources) ? view.resources : [];
  const resource = resources.find((item) => item && item.id === id);
  return resource ? Number(resource.value) || 0 : 0;
}

function createInfoMoodRow(view) {
  const energy = getInfoResourceValue(view, "energy");
  const pressure = getInfoResourceValue(view, "pressure");
  const bugs = getInfoResourceValue(view, "bugs");
  const techDebt = getInfoResourceValue(view, "techDebt");
  let mood = "节奏稳定";
  let rank = 0;
  if (energy <= 15 || pressure >= 85) {
    mood = "需要收束";
    rank = 3;
  } else if (bugs >= 75 || techDebt >= 75) {
    mood = "质量隐患升温";
    rank = 2;
  } else if (energy <= 35 || pressure >= 60 || bugs >= 50 || techDebt >= 50) {
    mood = "状态紧绷";
    rank = 1;
  }
  if (rank === 0) return null;
  return {
    id: "context-mood",
    kind: "mood",
    moodRank: rank,
    text: `[状态] ${mood}`,
    priority: 6
  };
}

function createInfoIntentRow(view) {
  if (view && view.activeProject) {
    return {
      id: "context-intent",
      kind: "intent",
      text: `[意图] 推进交付切片：${view.activeProject.name}`,
      priority: 3
    };
  }
  if (view && view.activeSkillLearning) {
    return {
      id: "context-intent",
      kind: "intent",
      text: `[意图] 巩固基础概念：${view.activeSkillLearning.name}`,
      priority: 3
    };
  }
  const activity = view && view.activeActivity;
  if (activity) {
    const intents = {
      "feature-coding": "推进功能切片",
      "bug-hunting": "追踪异常线索",
      refactoring: "整理结构边界",
      study: "巩固知识地图",
      testing: "加固验证回路",
      documentation: "沉淀交付上下文",
      freelancing: "处理客户委托",
      rest: "整理行动节奏"
    };
    return {
      id: "context-intent",
      kind: "intent",
      text: `[意图] ${intents[activity.id] || `推进 ${activity.name}`}`,
      priority: 3
    };
  }
  const schedule = view && view.schedule;
  return {
    id: "context-intent",
    kind: "intent",
    text: schedule && (schedule.waiting || !schedule.confirmed)
      ? "[意图] 整理节奏等待排程"
      : "[意图] 观察局势，等待下一步行动",
    priority: 3
  };
}

function stripInfoEventPrefix(text) {
  return String(text || "").replace(/^(?:[[【][^\]】]+[\]】]\s*)+/, "");
}

function formatInfoEventText(row) {
  if (!row || row.empty) return row && row.text || "";
  const label = INFO_EVENT_LABELS[row.category] || "情报";
  const time = INFO_TIMED_EVENT_CATEGORIES.has(row.category) && isValidGameTimeLabel(row.gameTimeLabel)
    ? `${row.gameTimeLabel} `
    : "";
  return `[${label}] ${time}${stripInfoEventPrefix(row.text)}`;
}

function createInfoContextRows(view) {
  const rows = [];

  // 第一行：[世界]
  const worldEvent = view && Array.isArray(view.activeWorldEvents) ? view.activeWorldEvents[0] : null;
  if (worldEvent) {
    rows.push({
      id: "context-world",
      kind: "context",
      text: `[世界] ${worldEvent.name}：${worldEvent.message}`,
      priority: 1
    });
  }

  // 第二行：[目标]
  const currentMain = view && view.goals && view.goals.currentMain;
  if (currentMain) {
    rows.push({
      id: "context-goal",
      kind: "context",
      text: `[目标] ${currentMain.name} ${currentMain.status} ${currentMain.progress}`,
      priority: 2
    });
  }

  // 第三行：[Deadline]
  const deadline = view && view.nearestDeadline;
  if (deadline) {
    const due = Number.isFinite(Number(deadline.dueDay)) ? `D${String(Math.floor(Number(deadline.dueDay))).padStart(3, "0")}` : "D---";
    const distance = deadline.overdue
      ? `已逾期 ${Math.abs(Math.floor(Number(deadline.daysRemaining) || 0))} 天`
      : `剩余 ${Math.floor(Number(deadline.daysRemaining) || 0)} 天`;
    rows.push({
      id: "context-deadline",
      kind: "context",
      text: `[Deadline] ${deadline.name || "项目"} ${due}（${distance}）`,
      priority: 3
    });
  }

  // 第四行：[日程]（仅等待排程时显示）
  const schedule = view && view.schedule ? view.schedule : null;
  if (schedule && (schedule.waiting || !schedule.confirmed)) {
    rows.push({
      id: "context-schedule",
      kind: "context",
      text: "[日程] 等待安排并确认今日日程。",
      priority: 4
    });
  }

  // 第五行：[状态] 节奏紧张（仅在资源紧张时显示）
  const moodRow = createInfoMoodRow(view);
  if (moodRow) rows.push(moodRow);

  // 最下方：当前行动进度（固定压在上下文区底部）
  const actionProgressRow = createInfoCurrentActionProgressRow(view) || createInfoActivityLevelRow(view);
  if (actionProgressRow) rows.push({ ...actionProgressRow, pinnedBottom: true });

  return rows;
}

function createInfoStatusRows(ticker) {
  return normalizeTickerRows(ticker)
    .map((row, index) => ({
      ...row,
      id: index === 0 ? "current-status" : row.id,
      kind: "status",
      text: sanitizeInfoTickerText(row.text),
      priority: 5
    }))
    .filter(isInfoTickerRow);
}

function uniqueInfoRows(rows) {
  const selected = [];
  const selectedIds = new Set();
  for (const row of rows) {
    if (!row || selectedIds.has(row.id)) continue;
    selected.push(row);
    selectedIds.add(row.id);
  }
  return selected;
}

function selectInfoCurrentRows(rows, limit) {
  const safeLimit = Math.max(0, Math.floor(Number(limit) || 0));
  if (safeLimit <= 0) return [];
  if (rows.length <= safeLimit) return rows;
  const pinned = rows.find((row) => row && row.pinnedBottom);
  if (!pinned) return rows.slice(0, safeLimit);
  const topRows = rows.filter((row) => row !== pinned).slice(0, Math.max(0, safeLimit - 1));
  return [...topRows, pinned];
}

function getInfoCurrentRows(view, ticker = null, limit = 6) {
  const safeLimit = Math.max(0, Math.floor(Number(limit) || 0));
  if (safeLimit <= 0) return [];
  const contextRows = createInfoContextRows(view);
  const statusRows = createInfoStatusRows(ticker);
  const insertIndex = contextRows.findIndex((row) => row && (row.id === "context-mood" || row.pinnedBottom));
  const candidates = uniqueInfoRows(
    insertIndex >= 0
      ? [...contextRows.slice(0, insertIndex), ...statusRows, ...contextRows.slice(insertIndex)]
      : [...contextRows, ...statusRows]
  )
    .filter((row) => !INFO_RESOURCE_PATTERN.test(String(row.text || "")));
  return selectInfoCurrentRows(candidates, safeLimit);
}

function getInfoWindowRows(view, ticker = null, logs = [], availableHeight = 12) {
  const capacity = Math.max(1, Math.floor(Number(availableHeight) || 1));
  const currentBase = capacity <= 6
    ? 3
    : capacity <= 12
      ? Math.min(5, Math.max(4, Math.floor(capacity * 0.45)))
      : 7;
  const reserveEventRows = capacity >= 2 ? 1 : 0;
  const reserveSeparator = capacity >= 4 ? 1 : 0;
  const currentPool = getInfoCurrentRows(view, ticker, capacity);
  const eventPool = getLogRows(logs, Math.max(MAX_LOGS, capacity))
    .filter((row) => !row.empty && !INFO_RESOURCE_PATTERN.test(String(row.text || "")))
    .map((row) => ({ ...row, displayText: formatInfoEventText(row) }));
  if (!eventPool.length) eventPool.push({ id: "empty-message", text: "暂无日志。", empty: true });

  let currentLimit = Math.min(currentBase, currentPool.length, Math.max(1, capacity - reserveEventRows - reserveSeparator));
  let eventLimit = Math.min(eventPool.length, Math.max(0, capacity - currentLimit - reserveSeparator));
  if (eventLimit < reserveEventRows && eventPool.length) {
    currentLimit = Math.min(currentLimit, Math.max(1, capacity - reserveEventRows - reserveSeparator));
    eventLimit = Math.min(eventPool.length, Math.max(0, capacity - currentLimit - reserveSeparator));
  }

  let separatorRows = currentLimit > 0 && eventLimit > 0 && capacity - currentLimit - eventLimit > 0 ? 1 : 0;
  let spareRows = capacity - currentLimit - eventLimit - separatorRows;
  if (spareRows > 0 && eventLimit >= eventPool.length && currentLimit < currentPool.length) {
    const extraCurrent = Math.min(spareRows, currentPool.length - currentLimit);
    currentLimit += extraCurrent;
    spareRows -= extraCurrent;
  }
  if (spareRows > 0 && currentLimit >= currentPool.length && eventLimit < eventPool.length) {
    eventLimit += Math.min(spareRows, eventPool.length - eventLimit);
  }
  separatorRows = currentLimit > 0 && eventLimit > 0 && capacity - currentLimit - eventLimit > 0 ? 1 : 0;

  const currentRows = selectInfoCurrentRows(currentPool, currentLimit);
  const eventRows = eventPool.slice(-eventLimit);

  const rows = [
    ...currentRows.map((row) => ({ ...row, id: `info-current-${row.id}`, source: "current" }))
  ];
  if (separatorRows) rows.push({ id: "info-separator", source: "separator", kind: "separator", text: "" });
  rows.push(...eventRows.map((row) => ({
    ...row,
    rawText: row.text,
    text: row.displayText || row.text,
    id: `info-event-${row.id}`,
    eventId: row.id,
    source: "event",
    kind: row.empty ? "empty" : "event"
  })));
  return rows.slice(0, capacity);
}

function formatTopDate(calendar) {
  if (!calendar) return "[Y--M--W-- --]";
  const year = Number.isFinite(Number(calendar.year)) ? Math.floor(Number(calendar.year)) : "--";
  const month = Number.isFinite(Number(calendar.month)) ? String(Math.floor(Number(calendar.month))).padStart(2, "0") : "--";
  const week = Number.isFinite(Number(calendar.weekOfMonth)) ? Math.floor(Number(calendar.weekOfMonth)) : "--";
  const weekday = calendar.weekday || "--";
  return `[Y${year}-M${month}-W${week} ${weekday}]`;
}

function getTopRuntimeStatus(view, paused = false) {
  if (paused) return "已暂停";
  if (view && view.dayEndReport) return "审计报告";
  const schedule = view && view.schedule ? view.schedule : {};
  if (!schedule.confirmed || schedule.waiting) return "等待排程";
  if (view && view.activeProject) return "交付推进中";
  if (view && view.activeSkillLearning) return "学习中";
  if (view && view.activeActivity) {
    const phaseName = schedule.currentPhase && schedule.currentPhase.name ? schedule.currentPhase.name : "";
    return phaseName ? `${phaseName}行动中` : "行动中";
  }
  return schedule.currentPhase ? "休整中" : "休整";
}

function formatDeadlineDistance(view) {
  const deadline = view && view.nearestDeadline;
  if (!deadline) return null;
  const currentDay = Number(view && view.calendar && view.calendar.day);
  const dueDay = Number(deadline.dueDay);
  if (!Number.isFinite(currentDay) || !Number.isFinite(dueDay)) return null;
  const diff = Math.floor(dueDay) - Math.floor(currentDay);
  if (diff < 0) return "已逾期";
  if (diff === 0) return "今天";
  return `${diff}天`;
}

function formatTopResourceValue(value) {
  const numeric = Math.floor(Number(value) || 0);
  if (numeric >= 1_000_000) return `${formatTuiNumber(numeric / 1_000_000, 1)}M`;
  if (numeric >= 1_000) return `${formatTuiNumber(numeric / 1_000, 1)}k`;
  return String(numeric);
}

function formatTopStatusMeterLine(view, columns = DEFAULT_TERMINAL_COLUMNS) {
  const width = Math.max(1, Math.floor(Number(columns) || DEFAULT_TERMINAL_COLUMNS));
  const barWidth = width >= 100 ? 16 : width >= 72 ? 12 : 8;
  const resources = view && Array.isArray(view.resources) ? view.resources : [];
  const byId = new Map(resources.map((item) => [item.id, item]));
  const energy = byId.get("energy") || { id: "energy", name: "精力", value: 0, max: 100, status: "--" };
  const pressure = byId.get("pressure") || { id: "pressure", name: "压力", value: 0 };
  const energyMax = Math.max(1, Number(energy.max) || 100);
  const energyPercent = clampProgressPercent(Number(energy.value) / energyMax * 100);
  const pressurePercent = clampProgressPercent(Number(pressure.value));
  const energyBits = [
    energy.name,
    `${formatTopResourceValue(energy.value)}/${formatTopResourceValue(energyMax)}`,
    energy.status ? energy.status : null,
    renderProgressBar(energyPercent, barWidth, 0, false)
  ].filter(Boolean);
  const pressureBits = [
    pressure.name,
    formatTopResourceValue(pressure.value),
    renderProgressBar(pressurePercent, barWidth, 0, false)
  ].filter(Boolean);
  return trimText(` ${energyBits.join(" ")}  ${pressureBits.join(" ")}`, width);
}

function getTopStatusColor(status) {
  if (status === "已暂停") return THEME.status.paused;
  if (status === "等待排程") return THEME.status.warn;
  if (status === "审计报告") return THEME.title;
  if (/行动中|交付推进中|学习中/.test(status)) return THEME.status.info;
  if (/休整/.test(status)) return THEME.muted;
  return THEME.status.neutral;
}

function getTopDeadlineColor(deadline) {
  return deadline === "已逾期" ? THEME.status.danger : THEME.status.warn;
}

function getTopResourceColor(resource, id) {
  const resourceId = resource && resource.id ? resource.id : id;
  if (["energy", "pressure", "bugs", "techDebt"].includes(resourceId)) {
    return toneForResource(resource || { id: resourceId, value: 0 }).color;
  }
  return THEME.resources[resourceId] || toneForResource(resourceId).color;
}

function getTopStatusMeterParts(view, columns = DEFAULT_TERMINAL_COLUMNS) {
  const width = Math.max(1, Math.floor(Number(columns) || DEFAULT_TERMINAL_COLUMNS));
  const barWidth = width >= 100 ? 16 : width >= 72 ? 12 : 8;
  const resources = view && Array.isArray(view.resources) ? view.resources : [];
  const byId = new Map(resources.map((item) => [item.id, item]));
  const energy = byId.get("energy") || { id: "energy", name: "精力", value: 0, max: 100, status: "--" };
  const pressure = byId.get("pressure") || { id: "pressure", name: "压力", value: 0 };
  const energyMax = Math.max(1, Number(energy.max) || 100);
  const energyPercent = clampProgressPercent(Number(energy.value) / energyMax * 100);
  const pressurePercent = clampProgressPercent(Number(pressure.value));
  const energyText = [
    energy.name,
    `${formatTopResourceValue(energy.value)}/${formatTopResourceValue(energyMax)}`,
    energy.status ? energy.status : null,
    renderProgressBar(energyPercent, barWidth, 0, false)
  ].filter(Boolean).join(" ");
  const pressureText = [
    pressure.name,
    formatTopResourceValue(pressure.value),
    renderProgressBar(pressurePercent, barWidth, 0, false)
  ].filter(Boolean).join(" ");
  return [
    { id: "meter-energy", resourceId: "energy", text: ` ${energyText}`, color: getTopResourceColor(energy, "energy") },
    { id: "meter-pressure", resourceId: "pressure", text: `  ${pressureText}`, color: getTopResourceColor(pressure, "pressure") }
  ];
}

function formatTopStatusResourcesLine(view, columns = DEFAULT_TERMINAL_COLUMNS) {
  const width = Math.max(1, Math.floor(Number(columns) || DEFAULT_TERMINAL_COLUMNS));
  const resources = view && Array.isArray(view.resources) ? view.resources : [];
  const byId = new Map(resources.map((item) => [item.id, item]));
  const summary = TOP_RESOURCE_SUMMARY_IDS.map((id) => {
    const resource = byId.get(id);
    const name = resource && resource.name ? resource.name : id;
    return `${name} ${formatTopResourceValue(resource ? resource.value : 0)}`.trim();
  }).join("  ");
  return trimText(` ${summary}`, width);
}

function formatTopStatusLine(view, paused = false, columns = DEFAULT_TERMINAL_COLUMNS) {
  const calendar = view && view.calendar ? view.calendar : {};
  const currentPhase = view && view.schedule && view.schedule.currentPhase;
  const phaseLabel = currentPhase ? currentPhase.name : "休整";
  const timeLabel = calendar.hhmm || "--:--";
  const weeklyFocus = view && view.weeklyFocus && view.weeklyFocus.name ? view.weeklyFocus.name : "--";
  const width = Math.max(1, Math.floor(Number(columns) || DEFAULT_TERMINAL_COLUMNS));
  const segments = [
    ` ${formatTopDate(calendar)}`,
    `${timeLabel} (${phaseLabel})`,
    `状态: ${getTopRuntimeStatus(view, paused)}`,
    `本周重点: ${weeklyFocus}`,
  ];
  const deadline = formatDeadlineDistance(view);
  if (deadline) segments.push(`Deadline: ${deadline}`);
  return trimText(segments.join("  "), width);
}

function getSegmentWidth(segment) {
  return getTextDisplayWidth(segment && segment.text);
}

function trimTopStatusSegments(segments, columns = DEFAULT_TERMINAL_COLUMNS) {
  const width = Math.max(1, Math.floor(Number(columns) || DEFAULT_TERMINAL_COLUMNS));
  const safeSegments = segments.filter((segment) => segment && segment.text);
  const totalWidth = safeSegments.reduce((sum, segment) => sum + getSegmentWidth(segment), 0);
  if (totalWidth <= width) return safeSegments;
  if (width === 1) {
    const first = safeSegments[0] || {};
    return [{ ...first, text: "…" }];
  }

  const targetWidth = width - 1;
  const trimmed = [];
  let currentWidth = 0;
  let stopped = false;
  for (const segment of safeSegments) {
    if (stopped) break;
    let text = "";
    for (const grapheme of splitGraphemes(segment.text)) {
      const graphemeWidth = getGraphemeWidth(grapheme);
      if (currentWidth + graphemeWidth > targetWidth) {
        stopped = true;
        break;
      }
      currentWidth += graphemeWidth;
      text += grapheme;
    }
    if (text) trimmed.push({ ...segment, text });
  }

  if (trimmed.length) {
    const lastIndex = trimmed.length - 1;
    trimmed[lastIndex] = { ...trimmed[lastIndex], text: `${trimmed[lastIndex].text}…` };
    return trimmed;
  }
  const first = safeSegments[0] || {};
  return [{ ...first, text: "…" }];
}

function formatTopStatusLineSegments(view, paused = false, columns = DEFAULT_TERMINAL_COLUMNS) {
  const calendar = view && view.calendar ? view.calendar : {};
  const currentPhase = view && view.schedule && view.schedule.currentPhase;
  const phaseLabel = currentPhase ? currentPhase.name : "休整";
  const timeLabel = calendar.hhmm || "--:--";
  const weeklyFocus = view && view.weeklyFocus && view.weeklyFocus.name ? view.weeklyFocus.name : "--";
  const runtimeStatus = getTopRuntimeStatus(view, paused);
  const segments = [
    { id: "date", text: ` ${formatTopDate(calendar)}`, color: THEME.title, bold: true },
    { id: "space-date-time", text: "  ", color: THEME.muted },
    { id: "time", text: `${timeLabel} (${phaseLabel})`, color: THEME.status.info },
    { id: "space-time-status", text: "  ", color: THEME.muted },
    { id: "runtime-status", text: `状态: ${runtimeStatus}`, color: getTopStatusColor(runtimeStatus), bold: runtimeStatus === "已暂停" },
    { id: "space-status-focus", text: "  ", color: THEME.muted },
    { id: "weekly-focus", text: `本周重点: ${weeklyFocus}`, color: THEME.status.good }
  ];
  const deadline = formatDeadlineDistance(view);
  if (deadline) {
    segments.push(
      { id: "space-focus-deadline", text: "  ", color: THEME.muted },
      { id: "deadline", text: `Deadline: ${deadline}`, color: getTopDeadlineColor(deadline), bold: deadline === "已逾期" }
    );
  }
  return trimTopStatusSegments(segments, columns);
}

function formatTopStatusMeterLineSegments(view, columns = DEFAULT_TERMINAL_COLUMNS) {
  return trimTopStatusSegments(getTopStatusMeterParts(view, columns), columns);
}

function formatTopStatusResourcesLineSegments(view, columns = DEFAULT_TERMINAL_COLUMNS) {
  const resources = view && Array.isArray(view.resources) ? view.resources : [];
  const byId = new Map(resources.map((item) => [item.id, item]));
  const segments = TOP_RESOURCE_SUMMARY_IDS.map((id, index) => {
    const resource = byId.get(id);
    const name = resource && resource.name ? resource.name : id;
    const itemText = `${name} ${formatTopResourceValue(resource ? resource.value : 0)}`;
    return {
      id: `resource-${id}`,
      resourceId: id,
      text: `${index === 0 ? " " : "  "}${itemText}`,
      color: getTopResourceColor(resource, id),
      bold: ["bugs", "techDebt"].includes(id) && toneForResource(resource || { id, value: 0 }).label === "critical"
    };
  });
  return trimTopStatusSegments(segments, columns);
}

function formatTopStatusSegmentRows(view, paused = false, columns = DEFAULT_TERMINAL_COLUMNS) {
  return [
    formatTopStatusLineSegments(view, paused, columns),
    formatTopStatusMeterLineSegments(view, columns),
    formatTopStatusResourcesLineSegments(view, columns)
  ];
}

function formatTopStatusRows(view, paused = false, columns = DEFAULT_TERMINAL_COLUMNS) {
  return [
    formatTopStatusLine(view, paused, columns),
    formatTopStatusMeterLine(view, columns),
    formatTopStatusResourcesLine(view, columns)
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

function normalizeDailyPlannerKind(kind) {
  const value = String(kind || "").toLowerCase();
  if (value === "activities" || value === "a") return "activity";
  if (value === "skills" || value === "s") return "skill";
  if (value === "projects" || value === "p") return "project";
  return DAILY_PLANNER_KINDS.includes(value) ? value : null;
}

function isDailyPlannerMode(view) {
  const schedule = view && view.schedule;
  return Boolean(schedule && schedule.waiting && !schedule.confirmed);
}

function isEarlyCompletionMode(view) {
  return Boolean(view && view.state && view.state.earlyCompletionPending);
}

function isPhaseTransitionMode(view) {
  return Boolean(view && view.state && view.state.phaseTransitionPending);
}

function isDayEndSummaryMode(view) {
  return Boolean(view && view.dayEndReport);
}

function getDailyPlannerCandidateOptions(state, kind) {
  const normalized = normalizeDailyPlannerKind(kind);
  if (!normalized) return [];
  if (normalized === "activity") return getActivityOptions(state);
  if (normalized === "skill") {
    return getManagementOptions(state, "skills")
      .filter((option) => option && option.command && option.command.startsWith("learn "));
  }
  if (normalized === "project") {
    return getManagementOptions(state, "projects")
      .filter((option) => option && option.id !== "promote");
  }
  return [];
}

function commandForDailyPlannerSelection(kind, option, phaseId) {
  const normalizedKind = normalizeDailyPlannerKind(kind);
  const normalizedPhase = SCHEDULE_PHASE_IDS.includes(phaseId) ? phaseId : null;
  if (!option || !normalizedKind || !normalizedPhase) return null;
  if (normalizedKind === "activity") return option.unlocked && !option.locked ? `plan ${normalizedPhase} activity ${option.id}` : null;
  if (normalizedKind === "skill") return option.command && option.command.startsWith("learn ") ? `plan ${normalizedPhase} skill ${option.id}` : null;
  if (normalizedKind === "project") return option.id === "promote" ? null : `plan ${normalizedPhase} project ${option.id}`;
  return null;
}

function getNextDailyPlannerPhaseId(phaseId) {
  if (phaseId === "morning") return "afternoon";
  if (phaseId === "afternoon") return "evening";
  if (phaseId === "evening") return "evening";
  return "morning";
}

function handleDailyPlannerEnterKeypress(kind, option, phaseId) {
  const command = commandForDailyPlannerSelection(kind, option, phaseId);
  return {
    command,
    nextPhaseId: command ? getNextDailyPlannerPhaseId(phaseId) : phaseId
  };
}

function normalizeDailyPlannerDay(day) {
  const numeric = Number(day);
  return Number.isFinite(numeric) ? Math.floor(numeric) : null;
}

function shouldResetDailyPlannerPhase(wasDailyPlannerMode, previousDay, nextDailyPlannerMode, nextDay) {
  if (!nextDailyPlannerMode) return false;
  if (!wasDailyPlannerMode) return true;
  const normalizedNextDay = normalizeDailyPlannerDay(nextDay);
  if (normalizedNextDay === null) return false;
  return normalizeDailyPlannerDay(previousDay) !== normalizedNextDay;
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

function formatActivityOptionDetail(option) {
  const rateSections = option && option.rateSections ? option.rateSections : {};
  return [
    option.roleSummary && { label: "定位", value: option.roleSummary },
    option.description && { label: "描述", value: option.description },
    option.growthSummary && { label: "成长", value: option.growthSummary },
    option.requirements && { label: "解锁", value: option.requirements },
    rateSections.gains && { label: "收益", value: `每小时 ${rateSections.gains}` },
    rateSections.improvements && { label: "改善", value: `每小时 ${rateSections.improvements}` },
    rateSections.risks && { label: "风险", value: `每小时 ${rateSections.risks}` },
    rateSections.energy && { label: "精力", value: `每小时 ${rateSections.energy}` },
    rateSections.lowEnergy && { label: "限制", value: rateSections.lowEnergy },
    option.useCase && { label: "适用", value: option.useCase }
  ].filter((entry) => entry && String(entry.value || "").trim());
}

function formatOptionDetail(option) {
  if (!option) return [];
  if (option.detailKind === "activity") return formatActivityOptionDetail(option);

    const isProject = Number.isFinite(option.successRate) && Number.isFinite(option.maxSuccessRate);
  if (isProject) {
    const details = [];
    const isInProgress = option.status === "进行中" || option.status === "已暂停";
    const isBlocked = option.missing && String(option.missing).trim().length > 0;

    if (option.kindLabel) {
      details.push({ label: "类型", value: option.kindLabel });
    }

    if (Number.isFinite(option.stageIndex) && Number.isFinite(option.stageCount)) {
      const formatGameTime = (seconds) => {
        const minutes = Math.floor(seconds);
        const hours = Math.floor(minutes / 60);
        return hours > 0 ? `${hours}h` : `${minutes}m`;
      };
      details.push({
        label: "当前阶段",
        value: `${option.stageIndex + 1}/${option.stageCount} ${option.stageName || ""} ${formatGameTime(option.stageWorkedSeconds)} / ${formatGameTime(option.stageRequiredSeconds)}（${option.stageProgressPercent || 0}%）`
      });
    }

    if (isBlocked) {
      details.push({ label: "缺口", value: option.missing, tone: "blocked" });
    }

    const formatPercent = (v) => `${Math.round(v * 100)}%`;
    details.push({
      label: "成功率",
      value: `${formatPercent(option.successRate)} / ${formatPercent(option.maxSuccessRate)}`,
      tone: "successRate",
      rate: option.successRate
    });

    if (option.difficultyLabel) {
      details.push({ label: "难度", value: option.difficultyLabel });
    }

    if (isInProgress && option.deadlineText) {
      details.push({
        label: "Deadline",
        value: option.deadlineText,
        tone: "deadline",
        critical: option.deadlineCritical
      });
    }

    if (option.cost) {
      details.push({ label: "素材预算", value: option.cost });
    }

    if (option.spentResourcesText) {
      details.push({ label: "已消耗", value: option.spentResourcesText });
    }

    if (option.description) {
      details.push({ label: "描述", value: option.description });
    }

    if (option.rewards) {
      details.push({ label: "奖励", value: option.rewards });
    }

    return details.filter((entry) => entry && String(entry.value || "").trim());
  }

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
    option.missing && { label: "缺口", value: option.missing }
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
  const activeAttributeExpIds = new Set(
    (view && view.activeActivity && Array.isArray(view.activeActivity.attributeExpIds))
      ? view.activeActivity.attributeExpIds
      : []
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
      expMeter: { id: "exp", label: "经验", percent: upgradePercent, color: "exp", width: 18, animated: upgradeRequired > 0 && activeAttributeExpIds.has(attr.id) },
      progressText: `成长+加成 +${formatTuiNumber(growthValue)}`
    };
  });
}

const CHARACTER_CARD_RADAR_AXES = [
  { id: "logic", label: "逻辑", dx: -1, dy: 0 },
  { id: "focus", label: "专注", dx: 1, dy: -1 },
  { id: "learning", label: "学习", dx: 0, dy: -1 },
  { id: "communication", label: "沟通", dx: 1, dy: 0 },
  { id: "resilience", label: "抗压", dx: 0, dy: 1 },
  { id: "creativity", label: "创造", dx: -1, dy: 1 }
];

function getCharacterCardRadarRows(attributeRows = []) {
  const values = new Map((Array.isArray(attributeRows) ? attributeRows : []).map((row) => [
    row && row.id,
    clampProgressPercent(row && row.currentValue)
  ]));
  const width = 28;
  const height = 7;
  const center = { x: 13, y: 3 };
  const grid = Array.from({ length: height }, () => Array.from({ length: width }, () => " "));
  const put = (x, y, value) => {
    if (x >= 0 && x < width && y >= 0 && y < height) grid[y][x] = value;
  };
  const putText = (x, y, text) => {
    String(text || "").split("").forEach((char, index) => put(x + index, y, char));
  };

  put(center.x, center.y, "+");
  CHARACTER_CARD_RADAR_AXES.forEach((axis) => {
    for (let radius = 1; radius <= 3; radius += 1) {
      put(center.x + axis.dx * radius, center.y + axis.dy * radius, "·");
    }
    const value = values.get(axis.id) || 0;
    const radius = Math.max(0, Math.min(3, Math.round(value / 100 * 3)));
    put(center.x + axis.dx * radius, center.y + axis.dy * radius, "*");
  });

  putText(center.x - 1, 0, "学习");
  putText(center.x + 6, 1, "专注");
  putText(0, center.y, "逻辑");
  putText(center.x + 7, center.y, "沟通");
  putText(2, 6, "创造");
  putText(center.x - 1, 6, "抗压");

  return grid.map((row) => row.join("").replace(/\s+$/, ""));
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
    const state = loadLastProfile();
    const offline = settleTime(state, Date.now(), { randomEvents: true });
    saveProfile(state);
    writeLastProfileId(state);
    console.log("《代码人生》TUI 需要 TTY 环境。已完成离线结算并保存。");
    console.log(`当前档案：${state.profileId} - ${state.profileName}`);
    if (offline.seconds > 0) console.log(`离线结算 ${offline.seconds} 秒。`);
    for (const message of offline.messages) console.log(message);
    return;
  }

  const React = await import("react");
  const ink = await import("ink");
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

  function TabBar({ activePanel }) {
    return h(Box, { gap: 1, height: 1, overflow: "hidden", overflowX: "hidden" },
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

  function TopBar({ view, paused, budget }) {
    const boxWidth = Math.max(20, budget.terminalColumns - 2);
    const contentWidth = Math.max(10, boxWidth);
    const rows = formatTopStatusSegmentRows(view, paused, contentWidth);
    return h(Box, { flexDirection: "column", height: budget.topHeight, width: boxWidth },
      ...rows.map((row, index) => h(Box, {
        key: `status-row-${index}`,
        width: contentWidth,
        height: 1,
        overflow: "hidden",
        overflowX: "hidden",
        flexShrink: 1
      },
        h(Text, {
          wrap: "truncate-end",
          color: paused && index === 0 ? THEME.status.paused : THEME.text
        },
          ...row.map((segment, segmentIndex) => h(Text, {
            key: segment.id || `status-row-${index}-segment-${segmentIndex}`,
            color: segment.color || THEME.text,
            bold: segment.bold
          }, segment.text))
        )
      ))
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
      ...details.slice(0, maxRows).map((entry, index) => {
        let color = THEME.text;
        if (entry.tone === "blocked") {
          color = THEME.status.warn;
        } else if (entry.tone === "successRate" && Number.isFinite(entry.rate)) {
          if (entry.rate >= 0.8) color = THEME.status.good;
          else if (entry.rate >= 0.5) color = THEME.status.warn;
          else color = THEME.status.danger;
        } else if (entry.tone === "deadline") {
          color = entry.critical ? THEME.status.danger : THEME.status.warn;
        }
        return h(Text, { key: `${entry.label}-${index}`, color },
          `${entry.label}：${trimText(entry.value, contentWidth - entry.label.length - 1)}`
        );
      })
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

  function DailyPlannerPanel({ view, phaseId, kind, options, selectedIndex, budget, paused }) {
    const normalizedKind = normalizeDailyPlannerKind(kind) || "activity";
    const activePanel = DAILY_PLANNER_KIND_TO_PANEL[normalizedKind] || "activities";
    const accent = THEME.panels.schedule || THEME.panel;
    const listAccent = THEME.panels[activePanel] || THEME.panel;
    const page = getPageWindow(options.length, selectedIndex, budget.pageSize);
    const visibleOptions = options.slice(page.start, page.end);
    const selectedOption = options[selectedIndex];
    const mainWidth = budget.terminalColumns - 2;
    const slotWidth = budget.narrow ? mainWidth : 36;
    const listWidth = budget.narrow ? mainWidth : Math.max(28, Math.floor((mainWidth - slotWidth - 3) * 0.45));
    const detailWidth = budget.narrow ? mainWidth : Math.max(30, mainWidth - slotWidth - listWidth - 3);
    const plannerSlotHeight = budget.narrow ? Math.min(4, Math.max(3, Math.floor(budget.mainHeight * 0.35))) : budget.mainHeight;
    const plannerDetailHeight = budget.narrow ? Math.max(3, Math.min(4, budget.mainHeight - plannerSlotHeight - 2)) : budget.detailHeight;
    const plannerListHeight = budget.narrow ? Math.max(2, budget.mainHeight - plannerSlotHeight - plannerDetailHeight) : budget.mainHeight;
    const contentWidth = Math.max(16, slotWidth - 4);
    const slots = view && view.schedule && Array.isArray(view.schedule.slots) ? view.schedule.slots : [];
    const slotPanel = h(Box, { borderStyle: "round", borderColor: accent, paddingX: 1, flexDirection: "column", height: plannerSlotHeight, width: budget.narrow ? undefined : slotWidth },
      h(SectionTitle, { color: accent }, "今日日程草稿"),
      ...slots.map((slot, index) => {
        const selected = slot.id === phaseId;
        const required = slot.required ? "必填" : "可选";
        const marker = selected ? ">" : " ";
        return h(Box, { key: slot.id, gap: 1 },
          h(Text, { color: selected ? accent : THEME.muted, bold: selected }, `${marker}${index + 1}`),
          h(Text, { color: selected ? accent : THEME.text, bold: selected }, trimText(`${slot.name} ${slot.timeRange}`, 14)),
          h(Text, { color: slot.required ? THEME.status.warn : THEME.muted }, required),
          h(Text, { color: THEME.text }, trimText(slot.label || "未安排", Math.max(8, contentWidth - 20)))
        );
      })
    );
    const listPanel = h(Box, { borderStyle: "round", borderColor: listAccent, paddingX: 1, flexDirection: "column", height: plannerListHeight, width: budget.narrow ? undefined : listWidth },
      h(Text, { color: THEME.muted }, `${DAILY_PLANNER_KIND_LABELS[normalizedKind]}  第 ${page.pageCount ? page.page + 1 : 0}/${page.pageCount} 页  ${options.length} 项`),
      ...visibleOptions.map((option, offset) => {
        const absoluteIndex = page.start + offset;
        const selected = absoluteIndex === selectedIndex;
        const meta = compactOptionMeta(option);
        const nameWidth = Math.max(8, listWidth - 22);
        return h(Box, { key: option.id, gap: 1 },
          h(Text, { color: selected ? listAccent : THEME.muted, bold: selected }, selected ? ">" : " "),
          h(Text, { color: selected ? listAccent : THEME.text, bold: selected }, trimText(option.name, nameWidth)),
          h(Badge, { status: option.status }),
          meta ? h(Text, { color: THEME.muted }, trimText(meta, 16)) : null
        );
      })
    );
    const detailPanel = h(DetailPanel, { activePanel, option: selectedOption, height: plannerDetailHeight, width: detailWidth, paused });
    if (budget.narrow) {
      return h(Box, { flexDirection: "column", gap: 0, height: budget.mainHeight },
        slotPanel,
        listPanel,
        detailPanel
      );
    }
    return h(Box, { flexDirection: "row", gap: 1, height: budget.mainHeight },
      slotPanel,
      listPanel,
      detailPanel
    );
  }

  function CharacterCardPanel({ view, budget }) {
    const card = view.characterCard;
    const attributeRows = getCharacterCardAttributeRows(view);
    const radarRows = getCharacterCardRadarRows(attributeRows);
    const learnedSkills = view.skillLevels
      .filter((skill) => skill.level > 0)
      .map((skill) => `${skill.name} ${skill.levelName}`);
    const activityLevels = view.activityLevels.map((activity) => `${activity.active ? "*" : ""}${activity.name} Lv.${activity.level}`);

    const mainWidth = Math.max(48, budget.terminalColumns - 6);
    const summaryWidth = budget.narrow ? mainWidth : Math.max(28, Math.floor(mainWidth * 0.36));
    const detailWidth = budget.narrow ? mainWidth : Math.max(34, mainWidth - summaryWidth - 3);
    const attrBarWidth = Math.min(14, Math.max(6, Math.floor((detailWidth - 27) * 0.36)));
    const expBarWidth = Math.min(18, Math.max(8, detailWidth - attrBarWidth - 27));
    const maxAttributeRows = Math.max(1, budget.mainHeight - (budget.narrow ? 8 : 4) - radarRows.length);
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
      ...radarRows.map((row, index) => h(Text, { key: `radar-${index}`, color: index === 0 || index === radarRows.length - 1 ? THEME.status.info : THEME.muted },
        trimText(row || " ", detailWidth)
      )),
      ...attributeRows.slice(0, maxAttributeRows).map((row) => h(Box, { key: row.id, gap: 1, height: 1, overflow: "hidden", overflowX: "hidden" },
        h(Text, { color: THEME.text, bold: true }, trimText(row.label, 7).padEnd(7, " ")),
        h(AttributeProgress, { row, width: attrBarWidth }),
        h(Text, { color: THEME.status.good }, row.growthText),
        h(Text, { color: THEME.muted }, row.expMeter.label),
        h(Progress, {
          percent: row.expMeter.percent,
          width: Math.min(row.expMeter.width || 18, expBarWidth),
          animated: row.expMeter.animated
        }),
        h(Text, { color: THEME.muted }, trimText(row.expText, Math.max(4, detailWidth - attrBarWidth - expBarWidth - 27)))
      ))
    );

    return h(Box, { borderStyle: "round", borderColor: THEME.panels.cards, paddingX: 1, flexDirection: budget.narrow ? "column" : "row", gap: budget.narrow ? 0 : 2, height: budget.mainHeight },
      summary,
      attributes
    );
  }

  function DayEndReportPanel({ view, budget }) {
    const report = view && view.dayEndReport;
    const rows = report && Array.isArray(report.rows) ? report.rows : ["暂无日报。", "⌨️ [按 Space 确认并清空缓存，迎接明天的太阳...]"];
    const height = Math.max(6, budget.logHeight + (budget.tabHeight || 1) + budget.mainHeight);
    const width = Math.max(30, budget.terminalColumns - 2);
    const contentWidth = Math.max(20, width - 4);
    const maxRows = Math.max(1, height - 2);
    const visibleRows = rows.length <= maxRows
      ? rows
      : [
          ...rows.slice(0, Math.max(1, maxRows - 2)),
          "…",
          rows[rows.length - 1]
        ];
    return h(Box, { borderStyle: "double", borderColor: THEME.title, paddingX: 1, flexDirection: "column", height, width },
      ...visibleRows.map((line, index) => {
        const text = trimText(line || " ", contentWidth);
        const isTitle = index <= 2 || line.includes("【") || line.includes("📑");
        const isPrompt = line.includes("Space");
        const isComment = line.includes("“") || line.includes("”");
        return h(Text, {
          key: `day-report-${index}`,
          color: isPrompt ? THEME.status.good : isTitle ? THEME.title : isComment ? THEME.status.info : THEME.text,
          bold: isTitle || isPrompt
        }, text);
      })
    );
  }

  function InfoPanel({ ticker, logs, view, budget }) {
    const tickerData = ticker && ticker.ticker ? ticker.ticker : ticker;
    const height = budget.infoWindowHeight || budget.logHeight;
    const width = budget.infoWindowWidth || Math.max(24, budget.terminalColumns - 2);
    const contentRows = Math.max(1, height - 2);
    const infoRows = getInfoWindowRows(view, tickerData, logs, contentRows);
    const latestEventId = infoRows.filter((row) => row.source === "event" && !row.empty).at(-1)?.eventId ?? null;

    return h(Box, { borderStyle: "single", borderColor: THEME.panel, paddingX: 1, flexDirection: "column", height, width },
      h(SectionTitle, { color: THEME.title }, "玩家信息"),
      ...infoRows.map((row) => {
        if (row.source === "separator") {
          return h(Text, { key: row.id, color: THEME.panel }, "─".repeat(Math.max(8, width - 4)));
        }
        const eventTone = row.source === "event"
          ? row.empty
            ? { color: THEME.muted, bold: false, dim: true }
            : toneForLog(row, row.eventId === latestEventId ? 0 : 1)
          : null;
        const color = eventTone
            ? eventTone.color
            : row.kind === "status"
              ? THEME.status.info
              : row.kind === "intent"
                ? THEME.status.good
                : row.kind === "mood"
                  ? row.moodRank >= 2 ? THEME.status.warn : THEME.status.info
                  : row.kind === "action"
                    ? THEME.title
                  : row.kind === "campaign"
                    ? THEME.title
                    : row.kind === "context"
                      ? THEME.text
                      : THEME.muted;
        const prefix = row.source === "event" ? "• " : "";
        const text = row.source === "event" ? row.displayText || row.text : row.text;
        return h(Text, {
          key: row.id,
          color,
          bold: row.kind === "status" || row.kind === "intent" || row.kind === "action" || row.kind === "campaign" || (eventTone && eventTone.bold),
          dimColor: eventTone ? eventTone.dim : false
        }, trimText(`${prefix}${text || " "}`, Math.max(16, width - 4)));
      })
    );
  }

  const MemoInfoPanel = React.memo(InfoPanel);

  function Footer({ paused, creatingProfile, schedulePhase, dailyPlannerMode, view }) {
    function renderHints(hints) {
      return h(Box, { borderStyle: "single", borderColor: THEME.panel, paddingX: 1, gap: 1, flexWrap: "wrap" },
        ...hints.map((hint) => h(KeyHint, { key: hint.label, label: hint.label, text: hint.text }))
      );
    }

    const pauseText = paused ? "恢复" : "暂停";

    if (creatingProfile) {
      return renderHints([
        { label: "Tab", text: "切换" },
        { label: "↑/↓", text: "选择" },
        { label: "Enter", text: "选择人物卡" },
        { label: "Esc", text: "取消" },
        { label: "Space", text: pauseText },
        { label: "Q", text: "保存退出" }
      ]);
    }
    if (dailyPlannerMode) {
      return renderHints([
        { label: "1/2/3", text: "阶段" },
        { label: "A/S/P", text: "类型" },
        { label: "↑/↓", text: "选择" },
        { label: "Enter", text: "安排" },
        { label: "0", text: "放松" },
        { label: "Y", text: "确认" },
        { label: "X", text: "清空" },
        { label: "Space", text: pauseText },
        { label: "Q", text: "保存退出" }
      ]);
    }
    if (isEarlyCompletionMode(view)) {
      return renderHints([
        { label: "R", text: "休整" },
        { label: "Tab", text: "面板" },
        { label: "Space", text: pauseText },
        { label: "Q", text: "保存退出" }
      ]);
    }
    if (isPhaseTransitionMode(view)) {
      return renderHints([
        { label: "Y/Enter", text: "继续" },
        { label: "Tab", text: "面板" },
        { label: "Space", text: pauseText },
        { label: "Q", text: "保存退出" }
      ]);
    }
    if (isDayEndSummaryMode(view)) {
      return renderHints([
        { label: "Space", text: "确认睡眠" },
        { label: "Enter/Y", text: "确认" },
        { label: "R", text: "重看" },
        { label: "Q", text: "保存退出" }
      ]);
    }
    return renderHints([
      { label: "Tab", text: "面板" },
      { label: "↑/↓", text: "选择" },
      { label: "Pg", text: "翻页" },
      { label: "Enter", text: "执行" },
      { label: "1/2/3", text: `阶段 ${schedulePhase}` },
      { label: "D D", text: "删除" },
      { label: "Space", text: pauseText },
      { label: "Q", text: "保存退出" }
    ]);
  }

  function App() {
    const needsInitialProfile = !defaultProfileExists();
    const stateRef = useRef(needsInitialProfile ? createNewState() : loadLastProfile());
    const [activePanel, setActivePanel] = useState(needsInitialProfile ? "cards" : "activities");
    const [selected, setSelected] = useState({});
    const [paused, setPaused] = useState(false);
    const [schedulePhase, setSchedulePhase] = useState("morning");
    const [dailyPlannerKind, setDailyPlannerKind] = useState("activity");
    const [profileCreationStartedAt, setProfileCreationStartedAt] = useState(null);
    const pendingDeleteProfileIdRef = useRef(null);
    const dailyPlannerModeRef = useRef(false);
    const dailyPlannerDayRef = useRef(null);
    const [logs, setLogs] = useState([]);
    const [ticker, setTicker] = useState(() => createTuiTicker(stateRef.current));
    const [revision, refresh] = useReducer((value) => value + 1, 0);
    const nextLogIdRef = useRef(0);
    const { exit } = useApp();
    const { stdout } = useStdout();

    function addLogs(messages, defaultCategory = null) {
      const view = getGameViewModel(stateRef.current);
      const created = createLogEntries(messages, nextLogIdRef.current, defaultCategory, {
        gameTimeLabel: view && view.calendar ? view.calendar.hhmm : null
      });
      if (!created.entries.length) return;
      nextLogIdRef.current = created.nextId;
      setLogs((current) => appendLogEntries(current, created.entries));
    }

    function updateDailyPlannerAutoPanel() {
      const nextView = getGameViewModel(stateRef.current);
      const nextMode = !needsInitialProfile && isDailyPlannerMode(nextView);
      const nextDay = nextMode && nextView.schedule ? nextView.schedule.day : null;
      if (nextMode && !dailyPlannerModeRef.current) setActivePanel("schedule");
      if (shouldResetDailyPlannerPhase(dailyPlannerModeRef.current, dailyPlannerDayRef.current, nextMode, nextDay)) {
        setSchedulePhase("morning");
      }
      dailyPlannerModeRef.current = nextMode;
      dailyPlannerDayRef.current = nextMode ? nextDay : null;
    }

    function runCommand(command) {
      const result = processTuiCommand(stateRef.current, command, { paused, randomEvents: true });
      addLogs(createCommandLogMessages(command, result.messages));
      setTicker(createTuiTicker(stateRef.current));
      if (result.exit) exit();
      updateDailyPlannerAutoPanel();
      refresh();
      return result;
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
      updateDailyPlannerAutoPanel();
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
        updateDailyPlannerAutoPanel();
        refresh();
      }, TUI_SETTLE_TICK_MS);
      return () => clearInterval(timer);
    }, [paused, needsInitialProfile]);

    const view = getGameViewModel(stateRef.current);
    const budget = calculateLayoutBudget(stdout && stdout.rows, stdout && stdout.columns);
    const creatingProfile = activePanel === "profiles" && profileCreationStartedAt !== null;
    const dailyPlannerMode = activePanel === "schedule" && !needsInitialProfile && !creatingProfile && isDailyPlannerMode(view);
    const selectedKey = dailyPlannerMode ? `dailyPlanner:${dailyPlannerKind}` : activePanel;
    const options = useMemo(() => {
      if (dailyPlannerMode) return getDailyPlannerCandidateOptions(stateRef.current, dailyPlannerKind);
      if (needsInitialProfile && activePanel === "cards") return getCharacterCardOptions();
      if (activePanel === "profiles") {
        return getProfilePageOptions(stateRef.current, {
          creatingProfile: profileCreationStartedAt !== null,
          profileCreationStartedAt
        });
      }
      return getPanelOptions(stateRef.current, activePanel);
    }, [activePanel, revision, needsInitialProfile, profileCreationStartedAt, dailyPlannerMode, dailyPlannerKind]);
    const selectedIndex = Math.min(selected[selectedKey] || 0, Math.max(0, options.length - 1));

    useInput((input, key) => {
      if (input.toLowerCase() === "q") {
        if (!needsInitialProfile) {
          if (paused) syncPausedClock(stateRef.current, Date.now());
          saveProfile(stateRef.current);
          writeLastProfileId(stateRef.current);
        }
        exit();
        return;
      }
      if (input === " ") {
        if (isDayEndSummaryMode(view)) {
          if (paused) setPaused(false);
          runCommand("day confirm");
          pendingDeleteProfileIdRef.current = null;
          return;
        }
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
      if (dailyPlannerMode) {
        const plannerShortcut = { a: "activity", s: "skill", p: "project" }[input.toLowerCase()];
        if (plannerShortcut) {
          setDailyPlannerKind(plannerShortcut);
          addLogs([`当前候选类型：${DAILY_PLANNER_KIND_LABELS[plannerShortcut]}`], "command");
          pendingDeleteProfileIdRef.current = null;
          return;
        }
        if (input === "0") {
          runCommand("plan evening none");
          pendingDeleteProfileIdRef.current = null;
          return;
        }
        if (input.toLowerCase() === "y") {
          runCommand("plan confirm");
          pendingDeleteProfileIdRef.current = null;
          return;
        }
        if (input.toLowerCase() === "x") {
          runCommand("plan clear");
          pendingDeleteProfileIdRef.current = null;
          return;
        }
        if (key.upArrow) {
          setSelected((current) => ({ ...current, [selectedKey]: Math.max(0, selectedIndex - 1) }));
          pendingDeleteProfileIdRef.current = null;
          return;
        }
        if (key.downArrow) {
          setSelected((current) => ({ ...current, [selectedKey]: Math.min(Math.max(0, options.length - 1), selectedIndex + 1) }));
          pendingDeleteProfileIdRef.current = null;
          return;
        }
        if (key.pageUp) {
          setSelected((current) => ({ ...current, [selectedKey]: Math.max(0, selectedIndex - budget.pageSize) }));
          pendingDeleteProfileIdRef.current = null;
          return;
        }
        if (key.pageDown) {
          setSelected((current) => ({ ...current, [selectedKey]: Math.min(Math.max(0, options.length - 1), selectedIndex + budget.pageSize) }));
          pendingDeleteProfileIdRef.current = null;
          return;
        }
        if (key.return) {
          const result = handleDailyPlannerEnterKeypress(dailyPlannerKind, options[selectedIndex], schedulePhase);
          if (result.command) {
            runCommand(result.command);
            setSchedulePhase(result.nextPhaseId);
          }
          pendingDeleteProfileIdRef.current = null;
          return;
        }
      }

      // Early Completion mode shortcuts
      if (isEarlyCompletionMode(view)) {
        if (input.toLowerCase() === "r") {
          runCommand("complete rest");
          pendingDeleteProfileIdRef.current = null;
          return;
        }
        // S key for switch - falls through to regular command processing
        // User can type "complete switch activity rest" manually
      }

      // Phase Transition mode shortcuts
      if (isPhaseTransitionMode(view)) {
        if (input.toLowerCase() === "y" || key.return) {
          runCommand("phase continue");
          pendingDeleteProfileIdRef.current = null;
          return;
        }
        // A key for adjust - falls through to regular command processing
        // User can type "phase adjust afternoon activity rest" manually
      }

      // Day End Summary mode shortcuts
      if (isDayEndSummaryMode(view)) {
        if (input.toLowerCase() === "y" || key.return) {
          runCommand("day confirm");
          pendingDeleteProfileIdRef.current = null;
          return;
        }
        if (input.toLowerCase() === "r") {
          runCommand("day review");
          pendingDeleteProfileIdRef.current = null;
          return;
        }
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
        setSelected((current) => ({ ...current, [selectedKey]: Math.max(0, selectedIndex - 1) }));
        pendingDeleteProfileIdRef.current = null;
        return;
      }
      if (key.downArrow) {
        setSelected((current) => ({ ...current, [selectedKey]: Math.min(Math.max(0, options.length - 1), selectedIndex + 1) }));
        pendingDeleteProfileIdRef.current = null;
        return;
      }
      if (key.pageUp) {
        setSelected((current) => ({ ...current, [selectedKey]: Math.max(0, selectedIndex - budget.pageSize) }));
        pendingDeleteProfileIdRef.current = null;
        return;
      }
      if (key.pageDown) {
        setSelected((current) => ({ ...current, [selectedKey]: Math.min(Math.max(0, options.length - 1), selectedIndex + budget.pageSize) }));
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
        runCommand(command);
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

    if (isDayEndSummaryMode(view)) {
      return h(Box, { flexDirection: "column", paddingX: 1 },
        h(TopBar, { view, paused, budget }),
        h(DayEndReportPanel, { view, budget }),
        h(Footer, { paused, creatingProfile, schedulePhase, dailyPlannerMode: false, view })
      );
    }

    return h(Box, { flexDirection: "column", paddingX: 1 },
      h(TopBar, { view, paused, budget }),
      h(MemoInfoPanel, { ticker, logs, view, budget }),
      h(TabBar, { activePanel }),
      dailyPlannerMode
        ? h(DailyPlannerPanel, { view, phaseId: schedulePhase, kind: dailyPlannerKind, options, selectedIndex, budget, paused })
        : activePanel === "cards" && !needsInitialProfile
        ? h(CharacterCardPanel, { view, budget })
        : h(MainPanel, { activePanel, options, selectedIndex, budget, paused }),
      h(Footer, { paused, creatingProfile, schedulePhase, dailyPlannerMode, view })
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
  commandForDailyPlannerSelection,
  createCommandLogMessages,
  createLogEntries,
  formatOptionDetail,
  formatTopStatusSegmentRows,
  formatTopStatusRows,
  formatTopStatusLine,
  getCharacterCardAttributeRows,
  getCharacterCardRadarRows,
  getCurrentLogRows,
  getDailyPlannerCandidateOptions,
  getInfoWindowRows,
  getNextDailyPlannerPhaseId,
  getTextDisplayWidth,
  getOptionProgress,
  getProfilePageOptions,
  getPageWindow,
  getLogRows,
  handleDailyPlannerEnterKeypress,
  handleProfileEnterKeypress,
  handleProfileDeleteKeypress,
  isDailyPlannerMode,
  normalizeLogMessages,
  pauseGameClock,
  profileDeleteUnavailableMessage,
  processTuiCommand,
  resumeGameClock,
  resolveProfileDeleteKeypress,
  shouldResetDailyPlannerPhase,
  shouldExitProfileCreationMode,
  syncPausedClock,
  startTui
};
