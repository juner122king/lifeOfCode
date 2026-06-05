const THEME = {
  title: "#f4d35e",
  text: "#d6deeb",
  muted: "#7f8ea3",
  panel: "#4b5563",
  panels: {
    profiles: "#60a5fa",
    cards: "#f4d35e",
    activities: "#34d399",
    goals: "#fbbf24",
    skills: "#a78bfa",
    tools: "#38bdf8",
    projects: "#fb7185"
  },
  status: {
    good: "#34d399",
    warn: "#fbbf24",
    danger: "#f87171",
    info: "#60a5fa",
    done: "#a3e635",
    paused: "#f59e0b",
    locked: "#64748b",
    neutral: "#cbd5e1"
  },
  resources: {
    codeLines: "#93c5fd",
    exp: "#c4b5fd",
    money: "#f4d35e",
    knowledge: "#7dd3fc",
    tests: "#86efac",
    docs: "#e5e7eb",
    architecture: "#a7f3d0",
    leads: "#f9a8d4",
    reputation: "#facc15",
    energy: "#34d399",
    pressure: "#fbbf24",
    bugs: "#f87171",
    techDebt: "#fb923c"
  }
};

const STATUS_TONES = [
  { matches: ["进行中", "学习中"], tone: { color: THEME.status.info, label: "live" } },
  { matches: ["可领取", "可升级", "可学习", "可购买", "可开始", "可保存", "可加载", "可选择", "可尝试"], tone: { color: THEME.status.good, label: "ready" } },
  { matches: ["资源不足", "金钱不足", "属性不足", "条件不足", "需选择人物卡", "未创建"], tone: { color: THEME.status.warn, label: "blocked" } },
  { matches: ["未解锁"], tone: { color: THEME.status.locked, label: "locked", dim: true } },
  { matches: ["已暂停"], tone: { color: THEME.status.paused, label: "paused" } },
  { matches: ["已拥有", "已完成/可重复", "已领取", "满级", "当前", "已学习"], tone: { color: THEME.status.done, label: "done" } }
];

function clampPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.floor(numeric)));
}

function toneForStatus(status) {
  const text = String(status || "");
  const entry = STATUS_TONES.find((item) => item.matches.some((match) => text.includes(match)));
  return entry ? entry.tone : { color: THEME.status.neutral, label: "neutral" };
}

function toneForResource(resource) {
  const id = typeof resource === "string" ? resource : resource && resource.id;
  const value = typeof resource === "object" && resource ? Number(resource.value) : null;
  if (id === "energy" && Number.isFinite(value)) {
    if (value <= 10) return { color: THEME.status.danger, label: "critical" };
    if (value <= 25) return { color: THEME.status.warn, label: "low" };
  }
  if (["pressure", "bugs", "techDebt"].includes(id) && Number.isFinite(value)) {
    if (value >= 70) return { color: THEME.status.danger, label: "critical" };
    if (value >= 35) return { color: THEME.status.warn, label: "rising" };
  }
  return { color: THEME.resources[id] || THEME.status.neutral, label: "normal" };
}

function renderProgressBar(percent, width = 14, tick = 0, animated = true) {
  const safeWidth = Math.max(4, Math.floor(Number(width) || 14));
  const safePercent = clampPercent(percent);
  const filled = Math.round(safePercent / 100 * safeWidth);
  const shimmerIndex = animated && filled > 0 && filled < safeWidth ? (Math.floor(Number(tick) || 0) % filled) : -1;
  const cells = Array.from({ length: safeWidth }, (_, index) => {
    if (index >= filled) return "-";
    return index === shimmerIndex ? "=" : "#";
  });
  return `[${cells.join("")}] ${String(safePercent).padStart(3, " ")}%`;
}

function toneForLog(message, index = 0) {
  const entry = typeof message === "object" && message ? message : null;
  const severity = entry && entry.severity;
  if (severity === "danger") return { color: THEME.status.danger, bold: index === 0 };
  if (severity === "warn" || severity === "warning") return { color: THEME.status.warn, bold: index === 0 };
  if (severity === "good" || severity === "success") return { color: THEME.status.good, bold: index === 0 };
  if (entry && entry.category === "command") return { color: THEME.status.info, bold: index === 0 };
  const text = String(entry ? entry.text : message || "");
  if (text.startsWith(">")) return { color: THEME.status.info, bold: index === 0 };
  if (/不足|失败|耗尽|偏高|偏低|不能|没有|未知|错误|删除/.test(text)) return { color: THEME.status.danger, bold: index === 0 };
  if (/成功|完成|领取|保存|创建|切换|提升|开始/.test(text)) return { color: THEME.status.good, bold: index === 0 };
  return { color: index === 0 ? THEME.text : THEME.muted, bold: index === 0, dim: index > 0 };
}

module.exports = {
  THEME,
  renderProgressBar,
  toneForLog,
  toneForResource,
  toneForStatus
};
