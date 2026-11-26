// 台北日期測試（2026-11-26）。執行：node --test tests/shared-date.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { twToday } from "../js/shared.js";

test("台北早上 8 點前仍是台北的今天，不是 UTC 的昨天", () => {
  // 台北 2026-11-27 07:30 ＝ UTC 2026-11-26 23:30
  assert.equal(twToday(new Date("2026-11-26T23:30:00Z")), "2026/11/27");
});
test("台北深夜不會跳到明天", () => {
  // 台北 2026-11-26 23:59 ＝ UTC 15:59
  assert.equal(twToday(new Date("2026-11-26T15:59:00Z")), "2026/11/26");
});
test("跨年", () => {
  assert.equal(twToday(new Date("2026-12-31T16:00:00Z")), "2027/01/01");
});
