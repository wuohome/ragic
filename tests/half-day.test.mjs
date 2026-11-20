// 半天假（上休／下休）驗收測試：統計各算 0.5 天、上休當天照常排值日值班、下休當天不排、月休上限
// 執行：node tests/half-day.test.mjs（不連 Ragic、不連網路）
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
const pad = (n) => String(n).padStart(2, "0");
const ds = (y, m, d) => `${y}/${pad(m)}/${pad(d)}`;
let seq = 1;
const rec = (emp, date, type, extra = {}) => [String(seq++), { [F.EMP]: emp, [F.DATE]: date, [F.TYPE]: type, ...extra }];
const rawOf = (list) => Object.fromEntries(list);
// 整個月每天都給同一種假
const everyDay = (emp, y, m, type) => Array.from({ length: new Date(y, m, 0).getDate() }, (_, i) => rec(emp, ds(y, m, i + 1), type));

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test("類型表：上休、下休各 0.5 天；只有上休傍晚還在", () => {
    const SC = mkSC();
    assert.equal(SC.leaveDays("上休"), 0.5);
    assert.equal(SC.leaveDays("下休"), 0.5);
    assert.equal(SC.leaveDays("排休"), 1);
    assert.equal(SC.inForEvening("上休"), true);
    assert.equal(SC.inForEvening("下休"), false);
    assert.equal(SC.inForEvening("排休"), false);
    assert.deepEqual([...SC.REST_CYCLE], ["排休", "上休", "下休"]);
});

test("休假統計：花那 11 月 8 天排休＋上休＋下休＝9 天，上限 9 時不顯示多休", () => {
    const SC = mkSC();
    const raw = rawOf([
        ...[3, 4, 10, 11, 17, 24, 26, 27].map((d) => rec("曾琬容", ds(2026, 11, d), "排休")),
        rec("曾琬容", ds(2026, 11, 18), "上休"),
        rec("曾琬容", ds(2026, 11, 25), "下休"),
    ]);
    const M = SC.nextBuildMonth(SC.nextParse(raw), 2026, 11);
    const t = SC.nextRestTally(M)["曾琬容"];
    assert.equal(t.paixiu, 8);
    assert.equal(t.half, 1);
    assert.equal(t.total, 9);
    assert.deepEqual({ ...SC.nextRestStatus(t, 9) }, { side: "ok", diff: 0 });
    assert.deepEqual({ ...SC.nextRestStatus(t, 8) }, { side: "over", diff: 1 });
});

test("月休上限：8 天排休再加一個上休，多休 0.5 天；7 天排休加兩個下休剛好 8 天", () => {
    const SC = mkSC();
    const emp = { name: "甲", hire: "承攬" };
    const limit = SC.monthLeaveLimit(2026, 12);
    const monthOf = (list) => SC.nextBuildMonth(SC.nextParse(rawOf(list)), 2026, 12);
    const over = monthOf([...[1, 2, 3, 4, 5, 6, 7, 8].map((d) => rec("甲", ds(2026, 12, d), "排休")), rec("甲", ds(2026, 12, 9), "上休")]);
    const st = SC.nextRestStatus(SC.nextRestTally(over)["甲"], SC.nextRestTarget(over, emp));
    assert.equal(limit, 8);
    assert.deepEqual({ ...st }, { side: "over", diff: 0.5 });
    const exact = monthOf([...[1, 2, 3, 4, 5, 6, 7].map((d) => rec("甲", ds(2026, 12, d), "排休")), rec("甲", ds(2026, 12, 8), "下休"), rec("甲", ds(2026, 12, 9), "下休")]);
    assert.deepEqual({ ...SC.nextRestStatus(SC.nextRestTally(exact)["甲"], limit) }, { side: "ok", diff: 0 });
});

test("格子：上休、下休進休假欄，種類照存", () => {
    const SC = mkSC();
    const M = SC.nextBuildMonth(SC.nextParse(rawOf([rec("甲", ds(2026, 12, 2), "上休"), rec("甲", ds(2026, 12, 3), "下休")])), 2026, 12);
    assert.equal(SC.nextCell(M, "甲", 2).rest.kind, "上休");
    assert.equal(SC.nextCell(M, "甲", 3).rest.kind, "下休");
});

test("值班預排：整月上休的人照常排得到；整月下休的人一次都不排", () => {
    const SC = mkSC();
    const employees = ["甲", "乙", "丙"].map((name) => ({ name, hire: "承攬", dept: "租賃部", hireDate: "2020/01/01" }));
    const plan = (type) => SC.nextPlanZhiban({ year: 2026, month: 12, todayStr: "2026/11/20", employees, raw: rawOf(everyDay("甲", 2026, 12, type)), noRest: {} });
    const count = (r) => Object.values(r.newZhiban).filter((n) => n === "甲").length;
    assert.ok(count(plan("上休")) >= 9, "上休的人要照常分到值班");
    assert.equal(count(plan("下休")), 0);
    assert.equal(count(plan("排休")), 0);
});

test("值日預排：整月上休的人照常排打掃；整月下休的人不排", () => {
    const SC = mkSC();
    const allEmployees = ["甲", "乙", "丙", "丁"].map((name) => ({ name, hire: "承攬", dept: "租賃部", hireDate: "2020/01/01", birthday: "" }));
    const plan = (type) => SC.nextPlanDuty({ year: 2026, month: 12, todayStr: "2026/11/20", allEmployees, raw: rawOf(everyDay("甲", 2026, 12, type)), noRest: {}, rand: () => 0.5 });
    const count = (r) => r.creates.filter((c) => c[F.EMP] === "甲").length;
    assert.ok(count(plan("上休")) > 0, "上休的人要照常分到打掃");
    assert.equal(count(plan("下休")), 0);
});

test("檢查清單：下休當天有值班要提醒衝突；上休當天有值班不提醒", () => {
    const SC = mkSC();
    const checks = (type) => {
        const M = SC.nextBuildMonth(SC.nextParse(rawOf([rec("甲", ds(2026, 12, 10), type), rec("甲", ds(2026, 12, 10), "值班")])), 2026, 12);
        return SC.nextChecks(M, "2026/11/20").filter((c) => c.text.includes("，但同一天排了"));
    };
    assert.equal(checks("下休").length, 1);
    assert.equal(checks("上休").length, 0);
    assert.equal(checks("排休").length, 1);
});

let fail = 0;
for (const t of tests) {
    try { await t.fn(); console.log("✅", t.name); }
    catch (e) { fail++; console.log("❌", t.name, "\n   ", e.message); }
}
console.log(fail ? `\n${fail} 項失敗` : "\n全部通過");
process.exit(fail ? 1 : 0);
