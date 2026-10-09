// Real hub vs demo hub decisions (src/api/routes.ts).  npm run test:patient

import assert from "node:assert/strict";
import { test } from "node:test";

import { chooseSource, featureOf, parseOpenApi } from "../src/api/routes";

// the shape FastAPI publishes at /openapi.json (trimmed): what main + Medications serve
const HUB = parseOpenApi({
  paths: {
    "/patient": { get: {}, put: {} },
    "/settings": { get: {}, put: {} },
    "/medications/today": { get: {} },
    "/medications/logs/{log_id}": { post: {} },
    "/medications/{med_id}": { get: {}, put: {}, delete: {} },
  },
});

test("matches path templates and methods", () => {
  assert.equal(HUB.has("GET", "/medications/today"), true);
  assert.equal(HUB.has("POST", "/medications/logs/abc-123"), true);
  assert.equal(HUB.has("get", "/patient?x=1"), true);
  assert.equal(HUB.has("DELETE", "/patient"), false);
  assert.equal(HUB.has("POST", "/medications/logs/a/b"), false);
  assert.equal(HUB.has("GET", "/schedule/today"), false);
});

test("auto: real hub for its routes, demo for the rest", () => {
  assert.equal(chooseSource("auto", HUB, "GET", "/medications/today"), "hub");
  assert.equal(chooseSource("auto", HUB, "GET", "/games/name_recall/round"), "demo");
});

test("an unreached hub is never replaced by demo data", () => {
  // routes unknown (hub not reached yet): the request goes to the hub and fails as
  // "can"t reach", so the patient sees cached data, not invented data
  assert.equal(chooseSource("auto", null, "GET", "/medications/today"), "hub");
  assert.equal(chooseSource("hub", null, "GET", "/medications/today"), "hub");
});

test("hub-only mode reports missing routes instead of using demo data", () => {
  assert.equal(chooseSource("hub", HUB, "GET", "/games/name_recall/round"), "missing");
  assert.equal(chooseSource("hub", HUB, "GET", "/patient"), "hub");
});

test("demo mode never calls the hub", () => {
  assert.equal(chooseSource("demo", HUB, "GET", "/patient"), "demo");
});

test("feature names for the demo notice", () => {
  assert.equal(featureOf("/medications/logs/x?y=1"), "medications");
  assert.equal(featureOf("/patient"), "patient");
});
