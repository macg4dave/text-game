import assert from "node:assert/strict";
import test from "node:test";
import { isSceneLocationReachable, listReachableSceneLocations } from "./scene-travel.js";

test("listReachableSceneLocations exposes nearby authored exits from Rooftop Market", () => {
  assert.deepEqual(listReachableSceneLocations("Rooftop Market", []), ["Lantern Walk"]);
});

test("listReachableSceneLocations unlocks the Closed Stacks from Lantern Walk after Nila shares the route", () => {
  assert.deepEqual(listReachableSceneLocations("Lantern Walk", []), ["Rooftop Market"]);
  assert.deepEqual(listReachableSceneLocations("Lantern Walk", ["nila_guidance"]), ["Rooftop Market", "Closed Stacks"]);
});

test("isSceneLocationReachable only accepts adjacent authored travel with satisfied prerequisites", () => {
  assert.equal(
    isSceneLocationReachable({
      currentLocation: "Rooftop Market",
      proposedLocation: "Lantern Walk",
      flags: []
    }),
    true
  );
  assert.equal(
    isSceneLocationReachable({
      currentLocation: "Rooftop Market",
      proposedLocation: "Stormglass Causeway",
      flags: []
    }),
    false
  );
  assert.equal(
    isSceneLocationReachable({
      currentLocation: "Lantern Walk",
      proposedLocation: "Closed Stacks",
      flags: []
    }),
    false
  );
  assert.equal(
    isSceneLocationReachable({
      currentLocation: "Lantern Walk",
      proposedLocation: "Closed Stacks",
      flags: ["nila_guidance"]
    }),
    true
  );
});
