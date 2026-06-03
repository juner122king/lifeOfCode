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
  const h = React.createElement;
  const { Box, Text, render, useApp, useInput } = ink;
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

  function Header({ view, paused }) {
    const active = view.activeActivity ? `${view.activeActivity.name} Lv.${view.activeActivity.level}` : "无";
    const project = view.activeProject ? `${view.activeProject.name} 工时 ${view.activeProject.progressPercent}% 成功率 ${Math.round(view.activeProject.successRate * 100)}%` : "无";
    const learning = view.activeSkillLearning ? `${view.activeSkillLearning.name} 学习 ${view.activeSkillLearning.progressPercent}%` : "无";
    return h(Box, { borderStyle: "round", borderColor: THEME.title, paddingX: 1, flexDirection: "column" },
      h(Box, { gap: 1 },
        h(Text, { bold: true, color: THEME.title }, `《${view.title}》`),
        h(Text, { color: THEME.muted }, `${view.profile.id}/${view.profile.name}`),
        h(Text, { color: THEME.panels.cards }, `人物卡：${view.profile.characterCardName}`),
        h(Text, { color: THEME.status.info }, view.role.name),
        paused
          ? h(Text, { color: THEME.status.paused, bold: true }, "暂停")
          : h(Text, { color: THEME.status.good }, "自动结算")
      ),
      h(Box, { gap: 2 },
        h(Text, null, h(Text, { color: THEME.panels.activities }, "活动 "), active),
        h(Text, null, h(Text, { color: THEME.panels.projects }, "项目 "), project),
        h(Text, null, h(Text, { color: THEME.panels.skills }, "学习 "), learning)
      ),
      h(Text, { color: THEME.muted }, view.nextAdvice)
    );
  }

  function ResourceLine({ item }) {
    const tone = toneForResource(item);
    return h(Text, { color: tone.color, bold: tone.label === "critical" },
      `${item.name.padEnd(4, " ")} ${String(item.value).padStart(4, " ")}`
    );
  }

  function ResourcePanel({ view }) {
    const leftResources = view.resources.slice(0, 8);
    const rightResources = view.resources.slice(8);
    const attrs = view.attributes.map((attr) => `${attr.name} ${attr.value}${attr.breakthrough ? `(+${attr.breakthrough})` : ""}`);
    const activityLevels = view.activityLevels.map((activity) => `${activity.active ? "*" : ""}${activity.name} Lv.${activity.level}`);
    return h(Box, { gap: 2 },
      h(Box, { borderStyle: "single", borderColor: THEME.panel, paddingX: 1, flexDirection: "column", flexGrow: 1 },
        h(SectionTitle, { color: THEME.status.info }, "资源"),
        h(Box, { gap: 2 },
          h(Box, { flexDirection: "column" },
            ...leftResources.map((item) => h(ResourceLine, { key: item.id, item }))
          ),
          h(Box, { flexDirection: "column" },
            ...rightResources.map((item) => h(ResourceLine, { key: item.id, item }))
          )
        )
      ),
      h(Box, { borderStyle: "single", borderColor: THEME.panel, paddingX: 1, flexDirection: "column", flexGrow: 1 },
        h(SectionTitle, { color: THEME.panels.cards }, "成长"),
        h(Text, null, attrs.slice(0, 3).join("  ")),
        h(Text, null, attrs.slice(3).join("  ")),
        h(Text, null, `目标可领取：${view.goals.claimableCount}  累计活动：${view.stats.totalActiveSeconds}s`),
        h(Text, { color: THEME.muted }, activityLevels.slice(0, 5).join("  ")),
        h(Text, { color: THEME.muted }, activityLevels.slice(5).join("  "))
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

  function optionDetail(option) {
    return option.progress
      ? option.progress
      : [
          option.attributes && `属性 ${option.attributes}`,
          option.resources && `资源 ${option.resources}`,
          option.skills && `技能 ${option.skills}`,
          option.activityLevels && `活动 ${option.activityLevels}`,
          option.effects && `作用 ${option.effects}`,
          option.cost && `花费 ${option.cost}`,
          option.missing && `缺口 ${option.missing}`
        ].filter(Boolean).join("；");
  }

  function MainPanel({ activePanel, options, selectedIndex }) {
    const accent = THEME.panels[activePanel] || THEME.panel;
    return h(Box, { borderStyle: "round", borderColor: accent, paddingX: 1, flexDirection: "column", minHeight: 12 },
      ...options.map((option, index) => {
        const selected = index === selectedIndex;
        const command = commandForPanel(activePanel, option);
        const progress = optionProgress(option);
        return h(Box, { key: option.id, flexDirection: "column" },
          h(Box, { gap: 1 },
            h(Text, { color: selected ? accent : THEME.muted, bold: selected }, selected ? ">" : " "),
            h(Text, { color: selected ? accent : THEME.text, bold: selected }, option.name),
            h(Badge, { status: option.status }),
            command ? h(Text, { color: THEME.muted }, "Enter") : null,
            progress ? h(Text, { color: THEME.muted }, progress.label) : null,
            progress ? h(Progress, { percent: progress.percent, width: 12, animated: progress.active }) : null,
            progress && progress.text ? h(Text, { color: THEME.muted }, progress.text) : null
          ),
          h(Text, { color: selected ? THEME.text : THEME.muted, dimColor: !selected },
            `  ${trimText([option.description, optionDetail(option)].filter(Boolean).join("  "), 106)}`
          )
        );
      })
    );
  }

  function CharacterCardPanel({ view }) {
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

    return h(Box, { borderStyle: "round", borderColor: THEME.panels.cards, paddingX: 1, flexDirection: "column", minHeight: 12 },
      h(Text, { bold: true, color: THEME.panels.cards }, `${card.name}${card.id ? ` (${card.id})` : ""}`),
      h(Text, { color: THEME.muted }, trimText(card.description, 110)),
      card.background ? h(Text, { color: THEME.muted }, trimText(card.background, 110)) : null,
      h(SectionTitle, { color: THEME.status.info }, "初始卡面属性"),
      h(Text, null, initialAttrs.slice(0, 3).join("  ")),
      h(Text, null, initialAttrs.slice(3).join("  ")),
      h(SectionTitle, { color: THEME.status.good }, "当前属性"),
      h(Text, { color: THEME.text }, currentAttrs.slice(0, 3).join("  ")),
      h(Text, { color: THEME.text }, currentAttrs.slice(3).join("  ")),
      h(SectionTitle, { color: THEME.status.info }, "初始配置"),
      h(Text, null, card.initialBonuses ? `资源：${card.initialBonuses.resources}` : "资源：未记录"),
      h(Text, null, card.initialBonuses ? `技能：${card.initialBonuses.skills}` : "技能：未记录"),
      h(Text, null, card.initialBonuses ? `活动等级：${card.initialBonuses.activityLevels}` : "活动等级：未记录"),
      h(SectionTitle, { color: THEME.title }, "当前成长"),
      h(Text, { color: learnedSkills.length ? THEME.status.good : THEME.muted }, `技能：${learnedSkills.length ? learnedSkills.join("，") : "暂无"}`),
      h(Text, { color: THEME.muted }, activityLevels.slice(0, 5).join("  ")),
      h(Text, { color: THEME.muted }, activityLevels.slice(5).join("  "))
    );
  }

  function LogPanel({ logs }) {
    const rows = getLogRows(logs);
    const latestId = logs.length ? logs[logs.length - 1].id : null;
    return h(Box, { borderStyle: "single", borderColor: THEME.panel, paddingX: 1, flexDirection: "column", minHeight: 5 },
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
        }, trimText(log.text || " ", 110));
      })
    );
  }

  const MemoLogPanel = React.memo(LogPanel);

  function Footer({ paused }) {
    return h(Box, { borderStyle: "single", borderColor: THEME.panel, paddingX: 1, gap: 1, flexWrap: "wrap" },
      h(KeyHint, { label: "Tab", text: "切换" }),
      h(KeyHint, { label: "↑/↓", text: "选择" }),
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
      h(Header, { view, paused }),
      h(ResourcePanel, { view }),
      h(TabBar, { activePanel }),
      activePanel === "cards" && !needsInitialProfile
        ? h(CharacterCardPanel, { view })
        : h(MainPanel, { activePanel, options, selectedIndex }),
      h(MemoLogPanel, { logs }),
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
  createLogEntries,
  getLogRows,
  normalizeLogMessages,
  startTui
};
