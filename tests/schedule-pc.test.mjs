// 人事異動預約（schedule-pc-core.js）：照生效日分段預排
// 執行：node tests/schedule-pc.test.mjs（不連 Ragic、不連網路）
import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8").replace(/\r\n/g, "\n");
const mkSC = () => {
    const ctx = { console, Math, Date, Object, Set, Array, String, JSON, parseInt, Promise, Error, Number, Map, RegExp };
    vm.createContext(ctx);
    vm.runInContext(read("schedule-common.js") + "\n;globalThis.SC = SC;", ctx);
    ["schedule-duty-v2.js", "schedule-next-core.js", "schedule-pc-core.js"].forEach((f) => vm.runInContext(read(f), ctx));
    return ctx.SC;
};

const E = { NAME: "3000933", DEPT: "3000937", STATUS: "3000945", HIRE: "3000955", HIRE_DATE: "3000943", BIRTHDAY: "3000954" };
const emp = (name, dept, hire, hireDate, status = "在職") => ({ [E.NAME]: name, [E.DEPT]: dept, [E.STATUS]: status, [E.HIRE]: hire, [E.HIRE_DATE]: hireDate, [E.BIRTHDAY]: "" });
const BIZ = ["業務甲", "業務乙", "業務丙", "業務丁", "業務戊", "業務己", "業務庚", "業務辛"];
const mkEmpJson = () => {
    const o = {};
    [
        emp("張瓊安", "管理部", "正職", "2025/10/07"), emp("韓珊珊", "管理部", "正職", "2024/03/01"),
        ...BIZ.map((n) => emp(n, "租賃部", "承攬", "2025/01/01")),
        emp("轉兼職者", "租賃部", "承攬", "2025/01/01"),
        emp("留停者", "租賃部", "承攬", "2025/01/01"),
        emp("新人", "租賃部", "", "2026/12/10", "試用"),
        emp("兼職丙", "租賃部", "兼職", "2026/04/01"),
    ].forEach((f, i) => { o[String(200 + i)] = f; });
    return o;
};
const ridOf = (j, name) => Object.keys(j).find((k) => j[k][E.NAME] === name);
const D = (d) => `2026/12/${String(d).padStart(2, "0")}`;

const J = (x) => JSON.parse(JSON.stringify(x));
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test("沒有預約：結果和原本的人員池、值班候選完全相同", () => {
    const SC = mkSC();
    const j = mkEmpJson();
    const base = SC.nextBuildEmployees(j, 2026, 12);
    const pc = SC.pcMonthPlan(j, [], 2026, 12, null);
    assert.deepEqual(J(pc.allEmployees.map((e) => e.name)), J(base.allEmployees.map((e) => e.name)));
    assert.deepEqual(J(pc.zhibanEligible.map((e) => e.name)), J(SC.nextZhibanEligible(base.employees, 2026, 12, null).map((e) => e.name)));
    assert.deepEqual(J(Object.keys(pc.dutyBlocked)), []);
    assert.deepEqual(J(pc.notes), []);
});

test("套用規則：轉兼職改聘雇類別；留職停薪改在職狀態；離職填前一天為離職日期；新報到補到職日", () => {
    const SC = mkSC();
    const f = emp("某人", "租賃部", "承攬", "");
    assert.equal(SC.pcApplyFields(f, { kind: "轉兼職", effective: D(15) })[E.HIRE], "兼職");
    assert.equal(SC.pcApplyFields(f, { kind: "留職停薪", effective: D(15) })[E.STATUS], "留職停薪");
    const q = SC.pcApplyFields(f, { kind: "離職", effective: "2027/01/01" });
    assert.equal(q[E.STATUS], "離職");
    assert.equal(q["3000944"], "2026/12/31");
    const n = SC.pcApplyFields({ ...f, [E.STATUS]: "試用", [E.HIRE]: "" }, { kind: "新報到", hire: "承攬", effective: D(10) });
    assert.equal(n[E.STATUS], "在職"); assert.equal(n[E.HIRE], "承攬"); assert.equal(n[E.HIRE_DATE], D(10));
    assert.equal(f[E.HIRE], "承攬", "不改原物件");
});

test("轉兼職 12/15：值班只排到 12/14；值日兩段都在池內", () => {
    const SC = mkSC();
    const j = mkEmpJson();
    const changes = [{ id: "a", rid: ridOf(j, "轉兼職者"), kind: "轉兼職", effective: D(15) }];
    const pc = SC.pcMonthPlan(j, changes, 2026, 12, null);
    assert.ok(pc.zhibanEligible.some((e) => e.name === "轉兼職者"));
    assert.ok(!pc.zhibanBlocked[D(14)]?.has("轉兼職者"));
    assert.ok(pc.zhibanBlocked[D(15)].has("轉兼職者"));
    assert.ok(pc.zhibanBlocked[D(31)].has("轉兼職者"));
    assert.equal(pc.notes.length, 1);
    assert.match(pc.notes[0].text, /轉兼職者　12\/15 起轉兼職/);
    for (let seed = 1; seed <= 5; seed++) {
        const r = SC.nextPlanZhiban({ year: 2026, month: 12, todayStr: "2026/11/16", employees: [], raw: {}, noRest: {}, eligible: pc.zhibanEligible, blockedByDate: pc.zhibanBlocked });
        const days = Object.entries(r.newZhiban).filter(([, n]) => n === "轉兼職者").map(([ds]) => ds);
        assert.ok(days.length > 0, "生效日前應該排得到");
        assert.ok(days.every((ds) => ds < D(15)), "生效日起不排：" + days.join(","));
    }
});

test("留職停薪 12/10：值日、值班生效日起都不排", () => {
    const SC = mkSC();
    const j = mkEmpJson();
    const changes = [{ id: "b", rid: ridOf(j, "留停者"), kind: "留職停薪", effective: D(10) }];
    const pc = SC.pcMonthPlan(j, changes, 2026, 12, null);
    for (let seed = 0; seed < 5; seed++) {
        let s = seed + 1;
        const rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
        const d = SC.nextPlanDuty({ year: 2026, month: 12, todayStr: "2026/11/16", allEmployees: pc.allEmployees, raw: {}, noRest: {}, blockedByDate: pc.dutyBlocked, rand });
        const bad = d.creates.filter((c) => c["1000961"] === "留停者" && c["1000963"] >= D(10));
        assert.equal(bad.length, 0, "留停後還排到值日：" + bad.map((c) => c["1000963"]).join(","));
    }
    const z = SC.nextPlanZhiban({ year: 2026, month: 12, todayStr: "2026/11/16", employees: [], raw: {}, noRest: {}, eligible: pc.zhibanEligible, blockedByDate: pc.zhibanBlocked });
    assert.ok(Object.entries(z.newZhiban).every(([ds, n]) => n !== "留停者" || ds < D(10)));
});

test("新報到 12/10：原本不在名單（試用、聘雇類別空白），生效日起才進值日池", () => {
    const SC = mkSC();
    const j = mkEmpJson();
    assert.ok(!SC.nextBuildEmployees(j, 2026, 12).allEmployees.some((e) => e.name === "新人"));
    const changes = [{ id: "c", rid: ridOf(j, "新人"), kind: "新報到", hire: "承攬", effective: D(10) }];
    const pc = SC.pcMonthPlan(j, changes, 2026, 12, null);
    assert.ok(pc.allEmployees.some((e) => e.name === "新人"));
    assert.ok(pc.dutyBlocked[D(9)].has("新人"));
    assert.ok(!pc.dutyBlocked[D(10)]?.has("新人"));
});

test("已套用、取消或對不到人的預約不算；生效日在月初以前但還沒套用的照新身分並註明", () => {
    const SC = mkSC();
    const j = mkEmpJson();
    const rid = ridOf(j, "留停者");
    const pc1 = SC.pcMonthPlan(j, [{ id: "d", rid, kind: "留職停薪", effective: D(10), appliedAt: "2026-12-10T07:30:00Z" }, { id: "e", rid: "99999", kind: "離職", effective: D(5) }], 2026, 12, null);
    assert.equal(pc1.notes.length, 0);
    assert.deepEqual(J(Object.keys(pc1.dutyBlocked)), []);
    const pc2 = SC.pcMonthPlan(j, [{ id: "f", rid, kind: "留職停薪", effective: "2026/11/20" }], 2026, 12, null);
    assert.ok(!pc2.allEmployees.some((e) => e.name === "留停者"));
    assert.match(pc2.notes[0].text, /還沒改好/);
});

test("下個月才生效的不列、不影響這個月", () => {
    const SC = mkSC();
    const j = mkEmpJson();
    const pc = SC.pcMonthPlan(j, [{ id: "g", rid: ridOf(j, "留停者"), kind: "離職", effective: "2027/01/05" }], 2026, 12, null);
    assert.equal(pc.notes.length, 0);
    assert.ok(pc.allEmployees.some((e) => e.name === "留停者"));
    assert.deepEqual(J(Object.keys(pc.dutyBlocked)), []);
});

let fail = 0;
for (const t of tests) {
    try { await t.fn(); console.log("✅", t.name); }
    catch (e) { fail++; console.log("❌", t.name, "\n   ", e.message); }
}
console.log(fail ? `\n${fail} 項失敗` : "\n全部通過");
process.exit(fail ? 1 : 0);
