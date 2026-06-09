const assert = require("node:assert/strict");
const test = require("node:test");
const game = require("../src/game");
const tui = require("../src/tui");
const {
  RESOURCE_NAMES,
  RESOURCE_ORDER,
  SCHEDULE_PHASES
} = require("../src/core/constants");

const GAME_EXPORTS = [
  "ATTRIBUTE_IDS",
  "ATTRIBUTE_NAMES",
  "DEFAULT_ATTRIBUTES",
  "ENERGY_MAX",
  "OFFLINE_CAP_SECONDS",
  "SAVE_PATH",
  "SAVE_VERSION",
  "SCHEDULE_PHASES",
  "WORLD_START_MINUTES",
  "addAttributeExp",
  "applyCharacterCard",
  "buyTool",
  "characterCardById",
  "claimGoal",
  "createNewState",
  "createProfile",
  "createTuiTicker",
  "defaultProfileExists",
  "deleteProfile",
  "estimateActivityPerHour",
  "formatActivities",
  "formatAdviceList",
  "formatChangedResources",
  "formatCharacterCards",
  "formatGameEvent",
  "formatGameEvents",
  "formatGoalSummary",
  "formatGoals",
  "formatLifestyle",
  "formatLiveStatus",
  "formatNearestDeadline",
  "formatSchedule",
  "formatState",
  "formatWorldCalendar",
  "formatWorldEvents",
  "getActivityLevel",
  "getActivityOptions",
  "getActivityProgress",
  "getAdviceList",
  "getBaseAttribute",
  "getBreakthrough",
  "getCharacterCardOptions",
  "getEffectiveAttribute",
  "getEffectiveMaxEnergy",
  "getEnergyStatus",
  "getGameViewModel",
  "getGoalOptions",
  "getLifestyleOptions",
  "getManagementOptions",
  "getMultipliers",
  "getNearestDeadline",
  "getProductionRisk",
  "getProfileOptions",
  "getProjectProgress",
  "getProjectSuccessRate",
  "getScheduleOptions",
  "getSkillProgress",
  "getWorldCalendar",
  "helpText",
  "learnSkill",
  "listContent",
  "listProfiles",
  "loadGame",
  "loadProfile",
  "normalizeState",
  "processCommand",
  "processPlanCommand",
  "promote",
  "qualityPenalty",
  "replaceStateContents",
  "resolveProfilePath",
  "saveGame",
  "saveProfile",
  "settleTime",
  "startActivity",
  "stopActivity",
  "submitProject",
  "upgradeSkill"
];

const TUI_EXPORTS = [
  "MAX_LOGS",
  "TUI_SETTLE_TICK_MS",
  "appendLogEntries",
  "calculateLayoutBudget",
  "commandForDailyPlannerSelection",
  "createCommandLogMessages",
  "createLogEntries",
  "formatOptionDetail",
  "formatTopStatusLine",
  "formatTopStatusRows",
  "formatTopStatusSegmentRows",
  "getCharacterCardAttributeRows",
  "getCurrentLogRows",
  "getDailyPlannerCandidateOptions",
  "getLogRows",
  "getNextDailyPlannerPhaseId",
  "getOptionProgress",
  "getPageWindow",
  "getProfilePageOptions",
  "getTextDisplayWidth",
  "handleDailyPlannerEnterKeypress",
  "handleProfileDeleteKeypress",
  "handleProfileEnterKeypress",
  "isDailyPlannerMode",
  "normalizeLogMessages",
  "pauseGameClock",
  "processTuiCommand",
  "profileDeleteUnavailableMessage",
  "resolveProfileDeleteKeypress",
  "resumeGameClock",
  "shouldExitProfileCreationMode",
  "shouldResetDailyPlannerPhase",
  "startTui",
  "syncPausedClock"
];

function expectSettleShape(result) {
  assert.deepEqual(Object.keys(result).sort(), ["activeSeconds", "deltas", "events", "messages", "seconds", "ticker"].sort());
  assert.equal(typeof result.seconds, "number");
  assert.ok(Array.isArray(result.messages));
  assert.ok(Array.isArray(result.events));
  assert.equal(typeof result.deltas, "object");
  assert.equal(typeof result.activeSeconds, "number");
}

test("game and tui facade exports stay compatible", () => {
  assert.deepEqual(Object.keys(game).sort(), GAME_EXPORTS.sort());
  assert.deepEqual(Object.keys(tui).sort(), TUI_EXPORTS.sort());
});

test("core constants are the single source for schedule and resources", () => {
  assert.equal(game.SCHEDULE_PHASES, SCHEDULE_PHASES);
  assert.deepEqual(game.getGameViewModel(game.createNewState()).resources.map((item) => item.id), RESOURCE_ORDER);
  assert.equal(RESOURCE_NAMES.codeLines, "代码");
  assert.equal(RESOURCE_NAMES.techDebt, "技术债");
});

test("settleTime always returns the TUI result shape", () => {
  const start = 1_700_000_000_000;
  const zero = game.createNewState(start);
  expectSettleShape(game.settleTime(zero, start + 400, { randomEvents: false }));

  const waiting = game.createNewState(start);
  waiting.worldTimeMinutes = 9 * 60;
  waiting.lastTick = start - 60_000;
  expectSettleShape(game.settleTime(waiting, start, { randomEvents: false }));

  const rest = game.createNewState(start);
  rest.worldTimeMinutes = 12 * 60;
  rest.lastTick = start;
  expectSettleShape(game.settleTime(rest, start + 60_000, { randomEvents: false }));

  const active = game.createNewState(start);
  game.startActivity(active, "feature-coding");
  const activeResult = game.settleTime(active, start + 60_000, { randomEvents: false });
  expectSettleShape(activeResult);
  assert.ok(activeResult.activeSeconds > 0);
  assert.ok(Object.keys(activeResult.deltas).length > 0);
});
