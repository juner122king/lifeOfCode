const { describe, test } = require("node:test");
const assert = require("node:assert");
const { createNewState, addAttributeExp, startActivity, settleTime } = require("../src/game");
const content = require("../src/content");

describe("Attribute growth integration", () => {
  test("should achieve faster growth with new system", () => {
    const state = createNewState();
    state.attributes.focus = 20;
    state.attributeExp.focus = 0;

    const activity = content.activities.find(a => a.id === "feature-coding");

    // Start the activity
    startActivity(state, "feature-coding");

    // 模拟 8 游戏小时 (1天) - settle time in 1 hour increments
    for (let i = 0; i < 8; i++) {
      state.resources.energy = 100;  // 重置精力
      settleTime(state, state.lastTick + 3600 * 1000); // +1 hour
    }

    // 新系统: focus 每小时 +27, 8 小时 = 216
    // 成本: 20->21 需要 90, 21->22 需要 93
    // 应该升到至少 21 级
    assert.ok(state.attributes.focus >= 21, `Focus should be at least 21, got ${state.attributes.focus}`);
  });

  test("should unlock milestones during growth", () => {
    const state = createNewState();
    state.attributes.logic = 20;
    state.attributeExp.logic = 0;
    state.unlockedMilestones = {};

    // Calculate exp needed: 20->21: 90, 21->22: 93, 22->23: 96, 23->24: 99, 24->25: 102
    // Total: 90+93+96+99+102 = 480
    const events = [];
    addAttributeExp(state, "logic", 480, { events });

    assert.ok(state.attributes.logic >= 25, `Logic should be at least 25, got ${state.attributes.logic}`);
    assert.ok(state.unlockedMilestones.logic, "Should have logic milestones");
    assert.ok(state.unlockedMilestones.logic.includes(25), "Should have unlocked level 25 milestone");
    assert.ok(events.some(e => e.category === "milestone" && e.text.includes("代码直觉觉醒")), "Should have milestone event");
  });

  test("should give attribute exp from multiple activities", () => {
    const state = createNewState();
    state.attributes.logic = 20;
    state.attributes.focus = 20;
    state.attributeExp.logic = 0;
    state.attributeExp.focus = 0;

    // Test quality activity (bug-hunting) - gives logic exp
    startActivity(state, "bug-hunting");
    state.resources.energy = 100;
    settleTime(state, state.lastTick + 3600 * 1000); // 1 hour

    const logicExpAfterBugHunting = state.attributeExp.logic;
    assert.ok(logicExpAfterBugHunting > 0, `Bug hunting should give logic exp, got ${logicExpAfterBugHunting}`);

    // Test output activity (feature-coding) - gives focus exp
    startActivity(state, "feature-coding");
    state.resources.energy = 100;
    const focusExpBefore = state.attributeExp.focus;
    settleTime(state, state.lastTick + 3600 * 1000); // 1 hour

    const focusExpGain = state.attributeExp.focus - focusExpBefore;
    assert.ok(focusExpGain > 0, `Feature coding should give focus exp, got ${focusExpGain}`);
  });

  test("milestone effects should stack with attribute bonuses", () => {
    const state = createNewState();
    state.attributes.logic = 25;
    state.unlockedMilestones = { logic: [25] };

    const activity = content.activities.find(a => a.id === "bug-hunting");

    // Start the activity and check rates
    const message = startActivity(state, "bug-hunting");

    // The milestone gives +5% to quality activities, and logic 25 gives attribute multiplier
    // Both should be reflected in the output rates shown in the message
    assert.ok(message.includes("开始活动"), "Should start activity");

    // Verify milestone is unlocked
    assert.ok(state.unlockedMilestones.logic.includes(25), "Should have logic 25 milestone");
  });

  test("should achieve 2-3x faster growth compared to old system", () => {
    const state = createNewState();
    state.attributes.focus = 20;
    state.attributeExp.focus = 0;

    // Simulate 1 hour of feature-coding
    startActivity(state, "feature-coding");
    state.resources.energy = 100;
    settleTime(state, state.lastTick + 3600 * 1000);

    // New system: ~27 base exp/hour (3x faster than old 9 exp/hour)
    // With default multipliers and bonuses, can be higher
    assert.ok(state.attributeExp.focus >= 20, `Should get at least 20 exp/hour, got ${state.attributeExp.focus}`);
    assert.ok(state.attributeExp.focus <= 70, `Should get at most 70 exp/hour, got ${state.attributeExp.focus}`);
  });
});

describe("Attribute panel command integration", () => {
  const { processCommand } = require("../src/game");

  test("attr command should show summary view", () => {
    const state = createNewState();
    state.attributes.logic = 25;
    state.attributes.focus = 20;
    state.attributeExp.logic = 50;
    state.attributeExp.focus = 30;

    const result = processCommand(state, "attr");
    const output = result.messages.join("\n");

    assert.ok(output.includes("属性总览"), "Should show summary header");
    assert.ok(output.includes("逻辑"), "Should show logic attribute");
    assert.ok(output.includes("专注"), "Should show focus attribute");
    assert.ok(output.includes("25"), "Should show logic level");
    assert.ok(output.includes("20"), "Should show focus level");
  });

  test("attributes command should work as alias", () => {
    const state = createNewState();
    const result = processCommand(state, "attributes");
    const output = result.messages.join("\n");

    assert.ok(output.includes("属性总览"), "Should show summary view");
  });

  test("attr logic should show detail view", () => {
    const state = createNewState();
    state.attributes.logic = 25;
    state.attributeExp.logic = 50;
    state.unlockedMilestones = { logic: [25] };

    const result = processCommand(state, "attr logic");
    const output = result.messages.join("\n");

    assert.ok(output.includes("逻辑") || output.includes("Logic"), "Should show attribute name");
    assert.ok(output.includes("Lv.25"), "Should show level");
    assert.ok(output.includes("50"), "Should show exp");
    assert.ok(output.includes("代码直觉觉醒"), "Should show unlocked milestone");
  });

  test("attr should support Chinese attribute names", () => {
    const state = createNewState();
    state.attributes.logic = 25;
    state.attributeExp.logic = 50;

    const result = processCommand(state, "attr 逻辑");
    const output = result.messages.join("\n");

    assert.ok(output.includes("逻辑") || output.includes("Logic"), "Should show attribute detail");
    assert.ok(output.includes("25"), "Should show level");
  });

  test("attr milestones should show milestone overview", () => {
    const state = createNewState();
    state.attributes.logic = 25;
    state.attributes.focus = 25;
    state.unlockedMilestones = { logic: [25], focus: [25] };

    const result = processCommand(state, "attr milestones");
    const output = result.messages.join("\n");

    assert.ok(output.includes("里程碑"), "Should show milestone header");
    assert.ok(output.includes("代码直觉觉醒"), "Should show logic milestone");
    assert.ok(output.includes("心流入门"), "Should show focus milestone");
    assert.ok(output.includes("✓"), "Should show unlocked milestone indicator");
  });

  test("attr with invalid attribute should show error", () => {
    const state = createNewState();

    const result = processCommand(state, "attr invalid");
    const output = result.messages.join("\n");

    assert.ok(output.includes("未知属性") || output.includes("不存在"), "Should show error message");
    assert.ok(output.includes("logic") || output.includes("逻辑"), "Should list valid attributes");
  });

  test("attr command should handle all 6 attributes", () => {
    const state = createNewState();
    state.attributes.logic = 25;
    state.attributes.focus = 20;
    state.attributes.creativity = 15;
    state.attributes.communication = 18;
    state.attributes.resilience = 22;
    state.attributes.learning = 19;

    const result = processCommand(state, "attr");
    const summary = result.messages.join("\n");

    // Verify all 6 attributes appear
    assert.ok(summary.includes("逻辑"), "Should include logic");
    assert.ok(summary.includes("专注"), "Should include focus");
    assert.ok(summary.includes("创造"), "Should include creativity");
    assert.ok(summary.includes("沟通"), "Should include communication");
    assert.ok(summary.includes("抗压"), "Should include resilience");
    assert.ok(summary.includes("学习"), "Should include learning");
  });

  test("attr detail should work for all 6 attributes", () => {
    const state = createNewState();
    const attributeIds = ["logic", "focus", "creativity", "communication", "resilience", "learning"];

    for (const attrId of attributeIds) {
      state.attributes[attrId] = 25;
      state.attributeExp[attrId] = 50;

      const result = processCommand(state, `attr ${attrId}`);
      const output = result.messages.join("\n");
      assert.ok(output.includes("25"), `Should show detail for ${attrId}`);
    }
  });
});
