import assert from "node:assert/strict";
import test from "node:test";
import { classifyTurnInput } from "./turn-input-classification.js";

test("classifyTurnInput keeps parser verbs and grounded dialogue phrasing as action attempts", () => {
  assert.equal(classifyTurnInput("look around").kind, "action_attempt");
  assert.equal(classifyTurnInput("I ask Nila where the power comes from").kind, "action_attempt");
  assert.equal(classifyTurnInput('"Where does it draw power from?"').kind, "action_attempt");
});

test("classifyTurnInput keeps referential follow-ups and raw internal tokens on the safe paths", () => {
  assert.equal(classifyTurnInput("what do you mean?").kind, "clarification");
  assert.equal(classifyTurnInput("tell me more about that").kind, "clarification");
  assert.equal(classifyTurnInput("nila_guidance").kind, "meta_internal");
});