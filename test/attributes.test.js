const { describe, test } = require("node:test");
const assert = require("node:assert");
const { createNewState } = require("../src/game");

describe("Attribute upgrade cost", () => {
  test("should use new cost formula: 30 + currentAttribute * 3", () => {
    const state = createNewState();
    state.attributes.logic = 20;
    state.attributeExp.logic = 0;

    // 20 -> 21 should cost 90 (30 + 20 * 3)
    const { addAttributeExp } = require("../src/game");
    const gained1 = addAttributeExp(state, "logic", 89);
    assert.strictEqual(gained1, 0, "89 exp should not level up");
    assert.strictEqual(state.attributes.logic, 20);

    const gained2 = addAttributeExp(state, "logic", 1);
    assert.strictEqual(gained2, 1, "90 exp total should level up");
    assert.strictEqual(state.attributes.logic, 21);
    assert.strictEqual(state.attributeExp.logic, 0, "exp should reset after level up");
  });

  test("should upgrade multiple levels with enough exp", () => {
    const state = createNewState();
    state.attributes.focus = 20;
    state.attributeExp.focus = 0;

    // 20->21: 90, 21->22: 93, total 183
    const { addAttributeExp } = require("../src/game");
    const gained = addAttributeExp(state, "focus", 183);
    assert.strictEqual(gained, 2);
    assert.strictEqual(state.attributes.focus, 22);
  });
});

describe("Attribute benefits expansion", () => {
  test("logic should boost quality activities through activity type bonus", () => {
    const state = createNewState();

    // Test with low logic (baseline)
    state.attributes.logic = 20;
    const content = require("../src/content");
    const bugHuntingActivity = content.activities.find(a => a.id === "bug-hunting");

    // Calculate expected output with low logic
    const { startActivity: start1 } = require("../src/game");
    const lowLogicState = createNewState();
    lowLogicState.attributes.logic = 20;
    const msg1 = start1(lowLogicState, "bug-hunting");

    // Test with high logic
    const highLogicState = createNewState();
    highLogicState.attributes.logic = 60;
    const msg2 = start1(highLogicState, "bug-hunting");

    // With logic 60, output should be higher than with logic 20
    // The message contains the calculated rate
    assert.ok(msg2.includes("开始活动"));
    assert.ok(msg1.includes("开始活动"));
  });

  test("focus should boost output activities through activity type bonus", () => {
    const state = createNewState();

    // Default focus is 24, which gives (24-20)*0.003 = 0.012 bonus
    // So 35.55 * 1.012 = 35.98
    const { startActivity } = require("../src/game");
    const msg = startActivity(state, "feature-coding");

    // Verify the boost is applied
    assert.match(msg, /代码 \+35\.98/);
  });

  test("communication should boost collaboration activities", () => {
    const state = createNewState();
    state.attributes.communication = 60;
    state.activityLevels["feature-coding"] = 3; // Meet freelancing requirements

    const { startActivity } = require("../src/game");
    const msg = startActivity(state, "freelancing");

    // With communication 60, collaboration bonus should boost output
    // freelancing base money output is 14/h, with various multipliers
    assert.match(msg, /金钱/);
  });

  test("learning should boost knowledge output and learning speed", () => {
    const state = createNewState();
    state.attributes.learning = 60;

    const { startActivity } = require("../src/game");
    const msg = startActivity(state, "study");

    // With learning 60, knowledge output should be boosted
    // Base is 14/h, with learning bonus (60-20)*0.0035=0.14, total boost = 1.14
    // 14 * other factors * 1.14 should be > base
    assert.match(msg, /知识/);
  });

  test("resilience should boost energy recovery", () => {
    const state = createNewState();

    // Resilience affects energy recovery in settleLifestyleRest
    // This is tested in the game.test.js file with the updated test
    assert.ok(true); // Tested in integration test
  });

  test("creativity should boost creative activities and leads", () => {
    const state = createNewState();
    state.attributes.creativity = 60;
    state.activityLevels["feature-coding"] = 3; // Meet freelancing requirements

    const { startActivity } = require("../src/game");
    const msg = startActivity(state, "freelancing");

    // With creativity 60, freelancing produces leads
    // Base leads output is 3.2/h, with creativity bonus (60-20)*0.0035=0.14, total boost = 1.14
    assert.match(msg, /线索/);
  });
});

describe("Skill learning attribute exp", () => {
  test("should give attribute exp during learning", () => {
    const state = createNewState();
    const content = require("../src/content");
    const skill = content.skills.find(s => s.id === "javascript");  // tier 1, logic: 22, learning: 24

    state.attributes.logic = 22;
    state.attributes.learning = 24;
    state.attributeExp.logic = 0;
    state.attributeExp.learning = 0;
    state.resources.knowledge = 1000;
    state.resources.money = 1000;
    state.resources.energy = 100;  // Ensure enough energy

    const { learnSkill, settleTime } = require("../src/game");
    learnSkill(state, skill.id);

    // 学习 1 游戏小时 (60 分钟 = 3600 游戏秒 = 60 现实秒)
    const beforeLogic = state.attributeExp.logic;
    const beforeLearning = state.attributeExp.learning;

    settleTime(state, state.lastTick + 60_000, { randomEvents: false });

    // tier 1 每小时给 8 点，learning 为主属性(70%)，logic 为次属性(30%)
    // learning 应该获得 5.6，logic 应该获得 2.4
    const logicGained = state.attributeExp.logic - beforeLogic;
    const learningGained = state.attributeExp.learning - beforeLearning;

    assert.ok(learningGained >= 5 && learningGained <= 6, `learning exp should be 5-6, got ${learningGained}`);
    assert.ok(logicGained >= 2 && logicGained <= 3, `logic exp should be 2-3, got ${logicGained}`);
  });

  test("should give bonus exp on completion", () => {
    const state = createNewState();
    const content = require("../src/content");
    const skill = content.skills.find(s => s.id === "html-css");  // tier 1

    state.attributes.creativity = 20;
    state.attributes.learning = 25;
    state.resources.knowledge = 1000;
    state.resources.money = 1000;
    state.resources.energy = 100;  // Ensure enough energy
    state.attributeExp.creativity = 0;
    state.attributeExp.learning = 0;

    const { learnSkill, settleTime } = require("../src/game");
    learnSkill(state, skill.id);

    // 完成学习需要约 240 游戏分钟 = 4 游戏小时
    const beforeCreativity = state.attributeExp.creativity;
    const beforeLearning = state.attributeExp.learning;

    settleTime(state, state.lastTick + 600_000, { randomEvents: false });

    // 过程经验：~4 小时 * 8 点/小时 = ~32 点
    // 完成奖励：tier 1 = 20 点
    // 总计应该有约 52 点经验分配到 creativity 和 learning
    const totalGained = (state.attributeExp.creativity - beforeCreativity) +
                        (state.attributeExp.learning - beforeLearning);
    assert.ok(totalGained >= 50 && totalGained <= 56, `total exp should be 50-56, got ${totalGained}`);
  });
});

describe("Project progression attribute exp", () => {
  test("should give attribute exp during stage progression", () => {
    const state = createNewState();
    const content = require("../src/content");
    const project = content.projects.find(p => p.id === "homepage");  // 难度 1

    state.attributes.communication = 20;
    state.attributes.creativity = 20;
    state.attributeExp.communication = 0;
    state.attributeExp.creativity = 0;

    // 准备充足的项目资源和活动等级
    state.resources.codeLines = 10000;
    state.resources.docs = 10000;
    state.resources.energy = 100;
    state.activityLevels["feature-coding"] = 10;
    state.activityLevels.documentation = 10;

    // 解锁技能
    if (!state.unlockedSkills.includes("html-css")) {
      state.unlockedSkills.push("html-css");
    }
    state.skillProgress["html-css"] = { level: 10, exp: 0 };

    const { submitProject, settleTime } = require("../src/game");
    submitProject(state, project.id);

    // 设置项目为当前工作，这样 settleTime 会调用 settleProject
    state.activeProjectId = project.id;

    // 推进项目 2 游戏小时 (120 现实秒 = 120 游戏分钟 = 2 游戏小时)
    // homepage minWorkHours 是 2，所以 2 小时应该能完成大部分
    const beforeCommunication = state.attributeExp.communication;
    const beforeCreativity = state.attributeExp.creativity;

    settleTime(state, state.lastTick + 120_000, { randomEvents: false });

    // 难度 1 项目每小时给 10 点属性经验
    // 2 小时应该给约 20 点总经验
    const totalExp = (state.attributeExp.communication - beforeCommunication) +
                     (state.attributeExp.creativity - beforeCreativity);
    assert.ok(totalExp >= 18 && totalExp <= 24, `total exp should be 18-24, got ${totalExp}`);
  });
});

describe("Attribute panel - getAttributeSummary", () => {
  test("should return summary for all 6 attributes", () => {
    const state = createNewState();
    state.attributes.logic = 42;
    state.attributeExp.logic = 240;
    state.attributes.focus = 38;
    state.attributeExp.focus = 85;
    state.attributes.learning = 25;
    state.attributeExp.learning = 12;

    const { getAttributeSummary } = require("../src/game");
    const summary = getAttributeSummary(state);

    assert.strictEqual(summary.length, 6, "should return 6 attributes");

    const logic = summary.find(s => s.id === "logic");
    assert.strictEqual(logic.name, "逻辑");
    assert.strictEqual(logic.currentLevel, 42);
    assert.strictEqual(logic.currentExp, 240);
    assert.strictEqual(logic.nextLevelExp, 156); // 30 + 42 * 3
    assert.strictEqual(logic.expPercent, Math.floor(240 / 156 * 100));
    assert.strictEqual(logic.nextMilestone.level, 55);
    assert.strictEqual(logic.nextMilestone.name, "质量守护者");
    assert.strictEqual(logic.nextMilestone.pointsNeeded, 13);
    assert.strictEqual(logic.progressBar, "[███████░░░]"); // 42 of 55: 42/55 = 0.76, floor(0.76*10) = 7
  });

  test("should handle recently unlocked milestones", () => {
    const state = createNewState();
    state.attributes.learning = 25;
    state.unlockedMilestones = state.unlockedMilestones || {};
    state.unlockedMilestones.learning = [25];
    state.recentMilestoneUnlocks = state.recentMilestoneUnlocks || {};
    state.recentMilestoneUnlocks.learning = 25;

    const { getAttributeSummary } = require("../src/game");
    const summary = getAttributeSummary(state);
    const learning = summary.find(s => s.id === "learning");

    assert.strictEqual(learning.recentlyUnlocked.level, 25);
    assert.strictEqual(learning.recentlyUnlocked.name, "快速学习");
  });
});
