import assert from "node:assert/strict";
import test from "node:test";
import { displaySessionName, formatSessionDateTime } from "../lib/session-display.ts";

test("matching time in the session title is shown once, in the schedule", () => {
  const start = "2026-11-01T00:15:00+00:00";
  const end = "2026-11-01T01:45:00+00:00";
  assert.equal(displaySessionName("Pleasance at 12:15am-1:45am", start, end), "Pleasance");
  assert.equal(formatSessionDateTime(start, end), "Sunday 1 November · 00:15–01:45");
});

test("titles are preserved when the schedule does not match or is incomplete", () => {
  const start = "2026-11-01T00:15:00+00:00";
  const end = "2026-11-01T01:45:00+00:00";
  assert.equal(displaySessionName("Pleasance at 12:30am-1:45am", start, end), "Pleasance at 12:30am-1:45am");
  assert.equal(displaySessionName("Pleasance at 12:15am-1:45am", start, null), "Pleasance at 12:15am-1:45am");
  assert.equal(displaySessionName("Pleasance badminton", start, end), "Pleasance badminton");
});

test("the schedule follows UK local time across daylight saving", () => {
  assert.equal(formatSessionDateTime("2026-07-05T11:15:00Z", "2026-07-05T12:45:00Z"), "Sunday 5 July · 12:15–13:45");
  assert.equal(displaySessionName("Pleasance at 12:15pm-1:45pm", "2026-07-05T11:15:00Z", "2026-07-05T12:45:00Z"), "Pleasance");
});
