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

function pushLogs(current, messages) {
  const entries = messages.filter(Boolean).flatMap((message) => String(message).split("\n").filter(Boolean));
  return [...entries, ...current].slice(0, MAX_LOGS);
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

  function Header({ view, paused }) {
    const active = view.activeActivity ? `${view.activeActivity.name} Lv.${view.activeActivity.level}` : "无";
    const project = view.activeProject ? `${view.activeProject.name} ${view.activeProject.progressPercent}% 成功率 ${Math.round(view.activeProject.successRate * 100)}%` : "无";
    const learning = view.activeSkillLearning ? `${view.activeSkillLearning.name} ${view.activeSkillLearning.progressPercent}%` : "无";
    return h(Box, { borderStyle: "round", paddingX: 1, flexDirection: "column" },
      h(Text, { bold: true }, `《${view.title}》  ${view.profile.id}/${view.profile.name}  人物卡：${view.profile.characterCardName}  ${view.role.name}  当前活动：${active}  当前项目：${project}  当前学习：${learning}  ${paused ? "已暂停" : "自动结算中"}`),
      h(Text, null, view.nextAdvice)
    );
  }

  function ResourcePanel({ view }) {
    const leftResources = view.resources.slice(0, 8);
    const rightResources = view.resources.slice(8);
    const attrs = view.attributes.map((attr) => `${attr.name} ${attr.value}${attr.breakthrough ? `(+${attr.breakthrough})` : ""}`);
    const activityLevels = view.activityLevels.map((activity) => `${activity.active ? "*" : ""}${activity.name} Lv.${activity.level}`);
    return h(Box, { gap: 2 },
      h(Box, { borderStyle: "single", paddingX: 1, flexDirection: "column", flexGrow: 1 },
        h(Text, { bold: true }, "资源"),
        h(Box, { gap: 2 },
          h(Box, { flexDirection: "column" },
            ...leftResources.map((item) => h(Text, { key: item.id }, `${item.name.padEnd(4, " ")} ${item.value}`))
          ),
          h(Box, { flexDirection: "column" },
            ...rightResources.map((item) => h(Text, { key: item.id }, `${item.name.padEnd(4, " ")} ${item.value}`))
          )
        )
      ),
      h(Box, { borderStyle: "single", paddingX: 1, flexDirection: "column", flexGrow: 1 },
        h(Text, { bold: true }, "属性"),
        h(Text, null, attrs.slice(0, 3).join("  ")),
        h(Text, null, attrs.slice(3).join("  ")),
        h(Text, null, `目标可领取：${view.goals.claimableCount}`),
        h(Text, null, `累计活动：${view.stats.totalActiveSeconds}s`),
        h(Text, { bold: true }, "活动等级"),
        h(Text, null, activityLevels.slice(0, 5).join("  ")),
        h(Text, null, activityLevels.slice(5).join("  "))
      )
    );
  }

  function TabBar({ activePanel }) {
    return h(Box, { gap: 1 },
      ...PANELS.map((panel) => h(Text, {
        key: panel.id,
        inverse: panel.id === activePanel,
        bold: panel.id === activePanel
      }, ` ${panel.key} ${panel.label} `))
    );
  }

  function getPanelOptions(state, activePanel) {
    if (activePanel === "profiles") return getProfileOptions(state);
    if (activePanel === "activities") return getActivityOptions(state);
    if (activePanel === "goals") return getGoalOptions(state);
    if (["skills", "tools", "projects"].includes(activePanel)) return getManagementOptions(state, activePanel);
    return [];
  }

  function MainPanel({ activePanel, options, selectedIndex }) {
    return h(Box, { borderStyle: "round", paddingX: 1, flexDirection: "column", minHeight: 12 },
      ...options.map((option, index) => {
        const selected = index === selectedIndex;
        const command = commandForPanel(activePanel, option);
        const marker = selected ? ">" : " ";
        const action = command ? "Enter" : "";
        const detail = option.progress
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
        return h(Box, { key: option.id, flexDirection: "column" },
          h(Text, { inverse: selected, bold: selected },
            `${marker} ${option.name} [${option.status}] ${action}`
          ),
          h(Text, { dimColor: true },
            `  ${trimText([option.description, detail].filter(Boolean).join("  "), 100)}`
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

    return h(Box, { borderStyle: "round", paddingX: 1, flexDirection: "column", minHeight: 12 },
      h(Text, { bold: true }, `${card.name}${card.id ? ` (${card.id})` : ""}`),
      h(Text, { dimColor: true }, trimText(card.description, 110)),
      card.background ? h(Text, { dimColor: true }, trimText(card.background, 110)) : null,
      h(Text, { bold: true }, "初始卡面属性"),
      h(Text, null, initialAttrs.slice(0, 3).join("  ")),
      h(Text, null, initialAttrs.slice(3).join("  ")),
      h(Text, { bold: true }, "当前属性"),
      h(Text, null, currentAttrs.slice(0, 3).join("  ")),
      h(Text, null, currentAttrs.slice(3).join("  ")),
      h(Text, { bold: true }, "初始配置"),
      h(Text, null, card.initialBonuses ? `资源：${card.initialBonuses.resources}` : "资源：未记录"),
      h(Text, null, card.initialBonuses ? `技能：${card.initialBonuses.skills}` : "技能：未记录"),
      h(Text, null, card.initialBonuses ? `活动等级：${card.initialBonuses.activityLevels}` : "活动等级：未记录"),
      h(Text, { bold: true }, "当前成长"),
      h(Text, null, `技能：${learnedSkills.length ? learnedSkills.join("，") : "暂无"}`),
      h(Text, null, activityLevels.slice(0, 5).join("  ")),
      h(Text, null, activityLevels.slice(5).join("  "))
    );
  }

  function LogPanel({ logs }) {
    return h(Box, { borderStyle: "single", paddingX: 1, flexDirection: "column", minHeight: 5 },
      h(Text, { bold: true }, "日志"),
      ...(logs.length ? logs : ["暂无日志。"]).map((log, index) => h(Text, { key: `${index}-${log}` }, trimText(log, 110)))
    );
  }

  function Footer({ paused }) {
    return h(Box, { borderStyle: "single", paddingX: 1 },
      h(Text, null, `Tab 切换  ↑/↓ 选择  Enter 执行/加载  D 两次删除档案  Space ${paused ? "恢复" : "暂停"}  Q 保存退出`)
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
    const { exit } = useApp();

    useEffect(() => {
      if (needsInitialProfile) {
        setLogs((current) => pushLogs(current, ["请选择人物卡创建 default 档案。"]));
        refresh();
        return;
      }
      const offline = settleTime(stateRef.current, Date.now(), { randomEvents: true });
      saveProfile(stateRef.current);
      if (offline.seconds > 0 || offline.messages.length) {
        setLogs((current) => pushLogs(current, [`离线结算 ${offline.seconds} 秒。`, ...offline.messages]));
      }
      refresh();
    }, []);

    useEffect(() => {
      const timer = setInterval(() => {
        if (needsInitialProfile) return;
        if (paused) return;
        const result = settleTime(stateRef.current, Date.now(), { randomEvents: true });
        if (result.messages.length) setLogs((current) => pushLogs(current, result.messages));
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
            setLogs((current) => pushLogs(current, [`已创建 default - 默认档案（${selectedOption.name}）。`]));
            refresh();
          } catch (error) {
            setLogs((current) => pushLogs(current, [error && error.message ? error.message : String(error)]));
          }
          return;
        }
        const command = commandForPanel(activePanel, selectedOption);
        if (!command) return;
        const result = processCommand(stateRef.current, command, { randomEvents: true });
        setLogs((current) => pushLogs(current, [`> ${command}`, ...result.messages]));
        if (result.exit) exit();
        refresh();
      }
      if (input.toLowerCase() === "d" && activePanel === "profiles") {
        const option = options[selectedIndex];
        const command = option && option.deleteCommand;
        if (!command) return;
        if (pendingDeleteProfileId !== option.id) {
          setPendingDeleteProfileId(option.id);
          setLogs((current) => pushLogs(current, [`再次按 D 删除档案：${option.id}`]));
          return;
        }
        const result = processCommand(stateRef.current, command, { randomEvents: true });
        setLogs((current) => pushLogs(current, [`> ${command}`, ...result.messages]));
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
      h(LogPanel, { logs }),
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

module.exports = { startTui };
