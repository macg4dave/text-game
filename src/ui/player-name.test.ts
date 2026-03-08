import assert from "node:assert/strict";
import test from "node:test";
import { getStoredPlayerName, rememberPlayerName, type StorageLike } from "./player-name.js";

test("getStoredPlayerName returns empty string when no name is stored", () => {
  const storage = createFakeStorage();

  assert.equal(getStoredPlayerName(storage), "");
});

test("rememberPlayerName trims and stores the player name", () => {
  const storage = createFakeStorage();

  const result = rememberPlayerName(storage, "  Casey  ");

  assert.equal(result, "Casey");
  assert.equal(storage.getItem("playerName"), "Casey");
});

test("rememberPlayerName clears the stored value when the input is blank", () => {
  const storage = createFakeStorage({ playerName: "Existing" });

  const result = rememberPlayerName(storage, "   ");

  assert.equal(result, "");
  assert.equal(storage.getItem("playerName"), null);
});

function createFakeStorage(initialValues: Record<string, string> = {}): StorageLike {
  const values = new Map(Object.entries(initialValues));

  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}
