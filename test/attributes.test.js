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
