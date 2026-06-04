const {
  createNewState,
  createProfile,
  defaultProfileExists,
  getActivityOptions,
  getCharacterCardOptions,
  getGameViewModel,
  getGoalOptions,
  getManagementOptions,
  getProfileOptions,
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
  { id: "activities", label: "活动", key: "A" },
  { id: "goals", label: "目标", key: "G" },
  { id: "skills", label: "技能", key: "S" },
  { id: "tools", label: "工具", key: "T" },
  { id: "projects", label: "项目", key: "P" }
];

const MAX_LOGS = 6;
const MIN_LIST_PAGE_SIZE = 3;
const DEFAULT_TERMINAL_ROWS = 24;
const DEFAULT_TERMINAL_COLUMNS = 80;

function trimText(value, length) {
  const text = String(value || "");
  return text.length > length ? `${text.slice(0, Math.max(0, length - 1))}…` : text;
}

function normalizeLogMessages(messages) {
  return messages.filter(Boolean).flatMap((message) => String(message).split("\n").filter(Boolean));
}

function createLogEntries(messages, startId = 0) {
  let nextId = Math.max(0, Math.floor(Number(startId) || 0));
  const entries = normalizeLogMessages(messages).map((text) => ({
    id: nextId++,
    text
  }));
  return { entries, nextId };
}

function appendLogEntries(current, entries, maxLogs = MAX_LOGS) {
  const safeMax = Math.max(1, Math.floor(Number(maxLogs) || MAX_LOGS));
  return [...current, ...entries].slice(-safeMax);
}

function getLogRows(logs, maxLogs = MAX_LOGS) {
  const safeMax = Math.max(1, Math.floor(Number(maxLogs) || MAX_LOGS));
  const visible = logs.slice(-safeMax);
  if (!visible.length) {
    return [
      ...Array.from({ length: safeMax - 1 }, (_, index) => ({ id: `empty-${index}`, text: "", empty: true })),
      { id: "empty-message", text: "暂无日志。", empty: true }
    ];
  }
  return [
    ...Array.from({ length: safeMax - visible.length }, (_, index) => ({ id: `empty-${index}`, text: "", empty: true })),
    ...visible
  ];
}

function commandForPanel(panelId, option) {
  if (!option) return null;
  return option.command;
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
  const headerHeight = 4;
  const resourceHeight = 5;
  const tabHeight = 1;
  const footerHeight = 3;
  const logHeight = compact ? 4 : terminalRows < 30 ? 5 : 6;
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

  function Header({ view, paused, budget }) {
    const active = view.activeActivity ? `${view.activeActivity.name} Lv.${view.activeActivity.level}` : "无";
    const project = view.activeProject ? `${view.activeProject.name} 工时 ${view.activeProject.progressPercent}% 成功率 ${Math.round(view.activeProject.successRate * 100)}%` : "无";
    const learning = view.activeSkillLearning ? `${view.activeSkillLearning.name} 学习 ${view.activeSkillLearning.progressPercent}%` : "无";
    const detail = `活动 ${active}  项目 ${project}  学习 ${learning}`;
    const width = Math.max(48, budget.terminalColumns - 6);
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
      h(Text, { color: THEME.muted }, trimText(`${detail}  ${view.nextAdvice}`, width))
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
    if (activePanel === "activities") return getActivityOptions(state);
    if (activePanel === "goals") return getGoalOptions(state);
    if (["skills", "tools", "projects"].includes(activePanel)) return getManagementOptions(state, activePanel);
    return [];
  }

  function optionProgress(option) {
    if (!Number.isFinite(option.progressPercent)) return null;
    return {
      label: option.progressLabel || "进度",
      percent: option.progressPercent,
      active: option.progressActive === true,
      text: option.progressText || ""
    };
  }

  function compactOptionMeta(option) {
    const progress = optionProgress(option);
    return [
      Number.isFinite(option.level) ? `Lv.${option.level}` : "",
      progress ? `${progress.label} ${progress.percent}%` : "",
      option.missing ? "有缺口" : ""
    ].filter(Boolean).join("  ");
  }

  function DetailPanel({ activePanel, option, height, width }) {
    const accent = THEME.panels[activePanel] || THEME.panel;
    const details = formatOptionDetail(option);
    const progress = optionProgress(option);
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

  function MainPanel({ activePanel, options, selectedIndex, budget }) {
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
    const detail = h(DetailPanel, { activePanel, option: selectedOption, height: budget.detailHeight, width: detailWidth });
    return h(Box, { flexDirection: budget.narrow ? "column" : "row", gap: budget.narrow ? 0 : 1, height: budget.mainHeight },
      list,
      detail
    );
  }

  function CharacterCardPanel({ view, budget }) {
    const card = view.characterCard;
    const currentAttrs = view.attributes.map((attr) => {
      const effective = Number(attr.effective).toFixed(1).replace(/\.0$/, "");
      const breakthrough = attr.breakthrough ? ` +${attr.breakthrough}` : "";
      return `${attr.name} ${attr.value}${breakthrough} / 有效 ${effective} / 经验 ${Math.floor(attr.exp || 0)}`;
    });
    const initialAttrs = card.initialAttributes.length
      ? card.initialAttributes.map((attr) => `${attr.name} ${attr.value}`)
      : ["未记录初始属性"];
    const learnedSkills = view.skillLevels
      .filter((skill) => skill.level > 0)
      .map((skill) => `${skill.name} ${skill.levelName}`);
    const activityLevels = view.activityLevels.map((activity) => `${activity.active ? "*" : ""}${activity.name} Lv.${activity.level}`);

    const width = Math.max(48, budget.terminalColumns - 6);
    const rows = [
      { color: THEME.muted, text: card.description },
      { color: THEME.muted, text: card.background || "" },
      { title: "初始卡面属性", color: THEME.status.info },
      { text: initialAttrs.join("  ") },
      { title: "当前属性", color: THEME.status.good },
      { color: THEME.text, text: currentAttrs.join("  ") },
      { title: "初始配置", color: THEME.status.info },
      { text: card.initialBonuses ? `资源：${card.initialBonuses.resources}` : "资源：未记录" },
      { text: card.initialBonuses ? `技能：${card.initialBonuses.skills}` : "技能：未记录" },
      { text: card.initialBonuses ? `活动等级：${card.initialBonuses.activityLevels}` : "活动等级：未记录" },
      { title: "当前成长", color: THEME.title },
      { color: learnedSkills.length ? THEME.status.good : THEME.muted, text: `技能：${learnedSkills.length ? learnedSkills.join("，") : "暂无"}` },
      { color: THEME.muted, text: activityLevels.join("  ") }
    ];
    const maxRows = Math.max(1, budget.mainHeight - 3);
    return h(Box, { borderStyle: "round", borderColor: THEME.panels.cards, paddingX: 1, flexDirection: "column", height: budget.mainHeight },
      h(Text, { bold: true, color: THEME.panels.cards }, `${card.name}${card.id ? ` (${card.id})` : ""}`),
      ...rows.filter((row) => row.title || row.text).slice(0, maxRows).map((row, index) => (
        row.title
          ? h(SectionTitle, { key: `card-${index}`, color: row.color }, row.title)
          : h(Text, { key: `card-${index}`, color: row.color || THEME.text }, trimText(row.text, width))
      ))
    );
  }

  function LogPanel({ logs, budget }) {
    const visibleLogCount = Math.max(1, budget.logHeight - 2);
    const rows = getLogRows(logs, visibleLogCount);
    const latestId = logs.length ? logs[logs.length - 1].id : null;
    return h(Box, { borderStyle: "single", borderColor: THEME.panel, paddingX: 1, flexDirection: "column", height: budget.logHeight },
      h(SectionTitle, { color: THEME.title }, "日志"),
      ...rows.map((log) => {
        const tone = log.empty
          ? { color: THEME.muted, bold: false, dim: true }
          : toneForLog(log.text, log.id === latestId ? 0 : 1);
        return h(Text, {
          key: log.id,
          color: tone.color,
          bold: tone.bold,
          dimColor: tone.dim
        }, trimText(log.text || " ", Math.max(32, budget.terminalColumns - 6)));
      })
    );
  }

  const MemoLogPanel = React.memo(LogPanel);

  function Footer({ paused }) {
    return h(Box, { borderStyle: "single", borderColor: THEME.panel, paddingX: 1, gap: 1, flexWrap: "wrap" },
      h(KeyHint, { label: "Tab", text: "切换" }),
      h(KeyHint, { label: "↑/↓", text: "选择" }),
      h(KeyHint, { label: "PgUp/PgDn", text: "翻页" }),
      h(KeyHint, { label: "Enter", text: "执行/加载" }),
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
    const [pendingDeleteProfileId, setPendingDeleteProfileId] = useState(null);
    const [logs, setLogs] = useState([]);
    const [revision, refresh] = useReducer((value) => value + 1, 0);
    const nextLogIdRef = useRef(0);
    const { exit } = useApp();
    const { stdout } = useStdout();

    function addLogs(messages) {
      const created = createLogEntries(messages, nextLogIdRef.current);
      if (!created.entries.length) return;
      nextLogIdRef.current = created.nextId;
      setLogs((current) => appendLogEntries(current, created.entries));
    }

    useEffect(() => {
      if (needsInitialProfile) {
        addLogs(["请选择人物卡创建 default 档案。"]);
        refresh();
        return;
      }
      const offline = settleTime(stateRef.current, Date.now(), { randomEvents: true });
      saveProfile(stateRef.current);
      if (offline.seconds > 0 || offline.messages.length) {
        addLogs([`离线结算 ${offline.seconds} 秒。`, ...offline.messages]);
      }
      refresh();
    }, []);

    useEffect(() => {
      const timer = setInterval(() => {
        if (needsInitialProfile) return;
        if (paused) return;
        const result = settleTime(stateRef.current, Date.now(), { randomEvents: true });
        if (result.messages.length) addLogs(result.messages);
        saveProfile(stateRef.current);
        refresh();
      }, 3000);
      return () => clearInterval(timer);
    }, [paused, needsInitialProfile]);

    const options = useMemo(() => {
      if (needsInitialProfile && activePanel === "cards") return getCharacterCardOptions();
      return getPanelOptions(stateRef.current, activePanel);
    }, [activePanel, revision, needsInitialProfile]);
    const selectedIndex = Math.min(selected[activePanel] || 0, Math.max(0, options.length - 1));
    const view = getGameViewModel(stateRef.current);
    const budget = calculateLayoutBudget(stdout && stdout.rows, stdout && stdout.columns);

    useInput((input, key) => {
      if (input.toLowerCase() === "q") {
        if (!needsInitialProfile) saveProfile(stateRef.current);
        exit();
        return;
      }
      if (input === " ") {
        setPaused((value) => !value);
        return;
      }
      if (key.tab) {
        const currentIndex = PANELS.findIndex((panel) => panel.id === activePanel);
        setActivePanel(PANELS[(currentIndex + 1) % PANELS.length].id);
        setPendingDeleteProfileId(null);
        return;
      }
      const shortcut = PANELS.find((panel) => panel.key.toLowerCase() === input.toLowerCase());
      if (shortcut) {
        setActivePanel(shortcut.id);
        setPendingDeleteProfileId(null);
        return;
      }
      if (key.upArrow) {
        setSelected((current) => ({ ...current, [activePanel]: Math.max(0, selectedIndex - 1) }));
        setPendingDeleteProfileId(null);
        return;
      }
      if (key.downArrow) {
        setSelected((current) => ({ ...current, [activePanel]: Math.min(Math.max(0, options.length - 1), selectedIndex + 1) }));
        setPendingDeleteProfileId(null);
        return;
      }
      if (key.pageUp) {
        setSelected((current) => ({ ...current, [activePanel]: Math.max(0, selectedIndex - budget.pageSize) }));
        setPendingDeleteProfileId(null);
        return;
      }
      if (key.pageDown) {
        setSelected((current) => ({ ...current, [activePanel]: Math.min(Math.max(0, options.length - 1), selectedIndex + budget.pageSize) }));
        setPendingDeleteProfileId(null);
        return;
      }
      if (key.return) {
        const selectedOption = options[selectedIndex];
        if (needsInitialProfile && activePanel === "cards" && selectedOption) {
          try {
            const next = createProfile("default", "默认档案", Date.now(), { characterCardId: selectedOption.id });
            replaceStateContents(stateRef.current, next);
            setActivePanel("activities");
            addLogs([`已创建 default - 默认档案（${selectedOption.name}）。`]);
            refresh();
          } catch (error) {
            addLogs([error && error.message ? error.message : String(error)]);
          }
          return;
        }
        const command = commandForPanel(activePanel, selectedOption);
        if (!command) return;
        const result = processCommand(stateRef.current, command, { randomEvents: true });
        addLogs([`> ${command}`, ...result.messages]);
        if (result.exit) exit();
        refresh();
      }
      if (input.toLowerCase() === "d" && activePanel === "profiles") {
        const option = options[selectedIndex];
        const command = option && option.deleteCommand;
        if (!command) return;
        if (pendingDeleteProfileId !== option.id) {
          setPendingDeleteProfileId(option.id);
          addLogs([`再次按 D 删除档案：${option.id}`]);
          return;
        }
        const result = processCommand(stateRef.current, command, { randomEvents: true });
        addLogs([`> ${command}`, ...result.messages]);
        setPendingDeleteProfileId(null);
        refresh();
      }
    });

    return h(Box, { flexDirection: "column", paddingX: 1 },
      h(Header, { view, paused, budget }),
      h(ResourcePanel, { view, budget }),
      h(TabBar, { activePanel }),
      activePanel === "cards" && !needsInitialProfile
        ? h(CharacterCardPanel, { view, budget })
        : h(MainPanel, { activePanel, options, selectedIndex, budget }),
      h(MemoLogPanel, { logs, budget }),
      h(Footer, { paused })
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
  appendLogEntries,
  calculateLayoutBudget,
  createLogEntries,
  formatOptionDetail,
  getPageWindow,
  getLogRows,
  normalizeLogMessages,
  startTui
};
