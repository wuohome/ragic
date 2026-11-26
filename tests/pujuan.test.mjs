// 聘雇類別「普專」（2026-11-26 瓊安拍板）：普專是有底薪的業務（僱傭制）。
// 排班、值班、工作日誌看板當承攬處理；公基金從報酬代扣當正職處理（不開放）。
// 執行：node tests/pujuan.test.mjs（不連 Ragic、不連網路）
import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const ctx = { console, Math, Date, Object, Set, Array, String, JSON, parseInt, Number, Map, RegExp, Error };
vm.createContext(ctx);
vm.runInContext(read("schedule-common.js") + "\n;globalThis.SC = SC;", ctx);
for (const f of ["schedule-duty-v2.js", "schedule-next-core.js", "schedule-pc-core.js", "schedule-fund-core.js"]) vm.runInContext(read(f), ctx);
const SC = ctx.SC;

let fails = 0;
const test = (name, fn) => { try { fn(); console.log("ok  " + name); } catch (e) { fails++; console.log("FAIL " + name + "\n  " + e.message); } };
const E = SC.F_EMP;
const rec = (name, dept, hire, hireDate) => ({ [E.NAME]: name, [E.DEPT]: dept, [E.STATUS]: "在職", [E.HIRE]: hire, [E.HIRE_DATE]: hireDate, [E.BIRTHDAY]: "" });
const names = (a) => a.map((e) => e.name);

test("普專會出現在排班表人員名單", () => {
    const { employees } = SC.nextBuildEmployees({ 1: rec("普專甲", "租賃部", "普專", "2025/01/01") }, 2026, 12);
    assert.deepEqual(names(employees), ["普專甲"]);
});

test("普專進值班：沒存值班名單照舊規則、值班名單面板也列得到", () => {
    const list = [{ name: "普專甲", hire: "普專", dept: "租賃部", hireDate: "2025/01/01" }, { name: "承攬乙", hire: "承攬", dept: "租賃部", hireDate: "2025/01/01" }];
    assert.deepEqual(names(SC.nextZhibanEligible(list, 2026, 12, null)), ["普專甲", "承攬乙"]);
    assert.deepEqual(names(SC.nextZhibanCandidates(list)), ["普專甲", "承攬乙"]);
});

test("普專的到職三個月保護照舊", () => {
    const list = [{ name: "甘佑仁", hire: "普專", dept: "租賃部", hireDate: "2026/11/04" }];
    assert.deepEqual(names(SC.nextZhibanEligible(list, 2027, 2, null)), []);
    assert.deepEqual(names(SC.nextZhibanEligible(list, 2027, 3, null)), ["甘佑仁"]);
});

test("普專算值班公平帳", () => {
    const emps = [{ name: "普專甲", hire: "普專", dept: "租賃部", hireDate: "2020/01/01" }];
    const led = SC.computeFairnessLedger(emps, {}, "2026/07/10");
    assert.ok(led["普專甲"].zhiban.post701.expected > 0);
});

test("普專在新制打掃算業務，不算內勤或兼職", () => {
    assert.equal(SC.dutyV2Kind({ name: "普專甲", hire: "普專" }), "biz");
});

test("普專不能從報酬代扣（勞工）", () => {
    assert.equal(SC.fundCanPayroll({ hire: "普專" }), false);
    assert.equal(SC.fundCanPayroll({ hire: "承攬" }), true);
});

test("人事異動預約可選普專", () => {
    assert.ok(SC.PC_NEW_HIRES.includes("普專"));
    assert.equal(SC.pcApplyFields(rec("甲", "租賃部", "承攬", "2025/01/01"), { kind: "轉普專", effective: "2026/12/01" })[E.HIRE], "普專");
});

if (fails) { console.log(fails + " 項失敗"); process.exit(1); }
console.log("全部通過");
