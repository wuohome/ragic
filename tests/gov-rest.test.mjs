// 預排見紅休（新版排班頁 2026-11-25 補回舊版「一鍵預排見紅休」）驗收測試
// 執行：node tests/gov-rest.test.mjs（不連 Ragic、不連網路）
import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const mkSC = () => {
    const ctx = { console: { log() {}, error() {} }, Math, Date, Object, Set, Array, String, JSON, parseInt, Promise, setTimeout, Error, Number, Map, RegExp };
    vm.createContext(ctx);
    vm.runInContext(read("schedule-common.js") + "\n;globalThis.SC = SC;", ctx);
    vm.runInContext(read("schedule-duty-v2.js"), ctx);
    vm.runInContext(read("schedule-next-core.js"), ctx);
    return ctx.SC;
};
const F = { EMP: "1000961", DATE: "1000963", YEAR: "1000964", MONTH: "1000965", TYPE: "1002025", DEPT: "1002026", NOTE: "1000967", IS_AUTO: "1000966" };
let seq = 1;
const rec = (emp, date, type, extra = {}) => [String(seq++), { [F.EMP]: emp, [F.DATE]: date, [F.TYPE]: type, ...extra }];
const emps = (SC, over = {}) => SC.GOV_REST_NAMES.map((name) => ({ name, hireDate: over[name] || "2020/01/01" }));
const keys = (r) => r.creates.map((c) => c[F.EMP] + "|" + c[F.DATE]).sort();

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// 2026/12 紅日：5,6,12,13,19,20,25(行憲紀念日),26,27 共 9 天
const DEC_RED = ["05", "06", "12", "13", "19", "20", "25", "26", "27"].map((d) => "2026/12/" + d);

test("十二月整月沒排過：五人 × 9 個紅日都補上，型別見紅休、標系統預排", () => {
    const SC = mkSC();
    const r = SC.nextPlanGovRest({ year: 2026, month: 12, todayStr: "2026/11/25", raw: {}, noRest: {}, employees: emps(SC) });
    assert.equal(r.creates.length, 5 * 9);
    const c = r.creates[0];
    assert.equal(c[F.TYPE], "見紅休");
    assert.equal(c[F.DEPT], "系統預排見紅休");
    assert.equal(c[F.YEAR], "2026");
    assert.equal(c[F.MONTH], "12");
    assert.deepEqual([...new Set(r.creates.map((x) => x[F.DATE]))].sort(), DEC_RED);
});

test("那天已有任何紀錄（排休、已取消、打掃）就不動", () => {
    const SC = mkSC();
    const raw = Object.fromEntries([
        rec("曾琬容", "2026/12/12", "排休"),
        rec("張瓊安", "2026/12/05", "見紅休", { [F.IS_AUTO]: SC.GOV_REST_CANCELLED }),
        rec("沈郁雯", "2026/12/06", "值日", { [F.NOTE]: "1F" }),
    ]);
    const r = SC.nextPlanGovRest({ year: 2026, month: 12, todayStr: "2026/11/25", raw, noRest: {}, employees: emps(SC) });
    const k = keys(r);
    assert.equal(r.creates.length, 45 - 3);
    assert.ok(!k.includes("曾琬容|2026/12/12"));
    assert.ok(!k.includes("張瓊安|2026/12/05"));
    assert.ok(!k.includes("沈郁雯|2026/12/06"));
    assert.equal(r.kept, 3);
});

test("禁休日、今天以前、到職日以前、不在職的人都不排", () => {
    const SC = mkSC();
    const employees = emps(SC, { 曾琬容: "2026/12/13" }).filter((e) => e.name !== "王芳瑜");
    const r = SC.nextPlanGovRest({ year: 2026, month: 12, todayStr: "2026/12/06", raw: {}, noRest: { "2026/12/19": { reason: "活動" } }, employees });
    const k = keys(r);
    assert.ok(!k.some((x) => x.endsWith("2026/12/05") || x.endsWith("2026/12/06")), "今天以前鎖定");
    assert.ok(!k.some((x) => x.endsWith("2026/12/19")), "禁休日");
    assert.ok(!k.includes("曾琬容|2026/12/12") && k.includes("曾琬容|2026/12/13"), "到職當天起才排");
    assert.ok(!k.some((x) => x.startsWith("王芳瑜|")), "不在職");
    assert.deepEqual([...r.notEmployed], ["王芳瑜"]);
});

test("重跑不重複：已預排過的月份沒有要新增的", () => {
    const SC = mkSC();
    const first = SC.nextPlanGovRest({ year: 2026, month: 12, todayStr: "2026/11/25", raw: {}, noRest: {}, employees: emps(SC) });
    const raw = Object.fromEntries(first.creates.map((c) => [String(seq++), c]));
    const again = SC.nextPlanGovRest({ year: 2026, month: 12, todayStr: "2026/11/25", raw, noRest: {}, employees: emps(SC) });
    assert.equal(again.creates.length, 0);
});

test("2026/08 以前是舊制，不預排", () => {
    const SC = mkSC();
    const r = SC.nextPlanGovRest({ year: 2026, month: 8, todayStr: "2026/07/01", raw: {}, noRest: {}, employees: emps(SC) });
    assert.equal(r.creates.length, 0);
    assert.ok(r.error);
});

let fail = 0;
for (const t of tests) {
    try { t.fn(); console.log("✓ " + t.name); } catch (e) { fail++; console.log("✗ " + t.name + "\n  " + e.message); }
}
console.log(`${tests.length - fail}/${tests.length} 通過`);
if (fail) process.exit(1);
