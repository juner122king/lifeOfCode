const { describe, test } = require("node:test");
const assert = require("node:assert");
const { createNewState } = require("../src/game");
const { ATTRIBUTE_MILESTONES, getMilestoneBonus, checkAndUnlockMilestones } = require("../src/core/attributes");

describe("Milestone system", () => {
  test("should unlock milestone when reaching threshold", () => {
    const state = createNewState();
    state.attributes.logic = 24;
    state.attributeExp.logic = 0;
    state.unlockedMilestones = {};

    const events = [];
    const { addAttributeExp } = require("../src/game");

    // 升到 25 应该解锁第一个里程碑 (level 24->25 需要 30+24*3=102 经验)
    addAttributeExp(state, "logic", 102, { events });

    assert.strictEqual(state.attributes.logic, 25);
    assert.ok(state.unlockedMilestones.logic);
    assert.ok(state.unlockedMilestones.logic.includes(25));
    assert.ok(events.some(e => e.category === "milestone"));
  });

  test("should apply milestone bonus", () => {
    const state = createNewState();
    state.unlockedMilestones = {
      logic: [25, 40]
    };

    // logic 25: Bug 风险额外 -5%
    const bugBonus = getMilestoneBonus(state, "logic", "bug_risk_extra");
    assert.strictEqual(bugBonus, -0.05);

    // logic 40: 技术债效率影响额外 -10%
    const debtBonus = getMilestoneBonus(state, "logic", "debt_efficiency_penalty");
    assert.strictEqual(debtBonus, -0.1);
  });
});
