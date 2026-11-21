// 預排值日不可重洗已排日期（2026-11-21 瓊安交辦）：一個月排好之後再按預排，已排好的人日期一律不動，
// 只補空格、離職或身分改變（人事異動預約）留下的格子。
// 執行：node tests/duty-keep.test.mjs（不連 Ragic、不連網路）
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
const seeded = (s) => () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };

const E = { NAME: "3000933", DEPT: "3000937", STATUS: "3000945", HIRE: "3000955", HIRE_DATE: "3000943", BIRTHDAY: "3000954" };
const emp = (name, dept, hire, hireDate, status = "在職") => ({ [E.NAME]: name, [E.DEPT]: dept, [E.STATUS]: status, [E.HIRE]: hire, [E.HIRE_DATE]: hireDate, [E.BIRTHDAY]: "" });
const OFFICE = ["張瓊安", "韓珊珊", "沈郁雯", "呂鴻墀", "王芳瑜"];
const BIZ = Array.from({ length: 13 }, (_, i) => "業務" + String(i + 1).padStart(2, "0"));
const PART = ["兼職甲", "兼職乙", "兼職丙", "兼職丁", "兼職戊", "兼職己"];
const mkEmpJson = (extra = []) => {
    const o = {};
    [
        ...OFFICE.map((n) => emp(n, "管理部", "正職", "2024/01/01")),
        ...BIZ.map((n) => emp(n, "租賃部", "承攬", "2025/01/01")),
        ...PART.map((n) => emp(n, "租賃部", "兼職", "2025/01/01")),
        ...extra,
    ].forEach((f, i) => { o[String(200 + i)] = f; });
    return o;
};
const ridOf = (j, name) => Object.keys(j).find((k) => j[k][E.NAME] === name);

const Y = 2026, M = 12;
const D = (d) => `${Y}/${M}/${String(d).padStart(2, "0")}`.replace(`/${M}/`, `/${String(M).padStart(2, "0")}/`);
const plan = (SC, { empJson, changes = [], raw, todayStr, seed }) => {
    const pc = SC.pcMonthPlan(empJson, changes, Y, M, null);
    return SC.nextPlanDuty({ year: Y, month: M, todayStr, allEmployees: pc.allEmployees, raw, noRest: {}, blockedByDate: pc.dutyBlocked, rand: seeded(seed) });
};
// 把預排結果當成已寫進 Ragic 的紀錄（id 接續編）
const commit = (SC, raw, r) => {
    const out = JSON.parse(JSON.stringify(raw));
    r.toDelete.forEach((x) => { delete out[x.id]; });
    let id = Math.max(1000, ...Object.keys(out).map(Number)) + 1;
    r.creates.forEach((c) => { out[String(id++)] = JSON.parse(JSON.stringify(c)); });
    return out;
};
const F = mkSC().F_LEAVE;
const dutyOf = (raw) => Object.entries(raw).filter(([, f]) => f[F.TYPE] === "值日").map(([id, f]) => ({ id, emp: f[F.EMP], date: f[F.DATE], floor: f[F.NOTE] }));
const daysOf = (raw, name) => [...new Set(dutyOf(raw).filter((x) => x.emp === name).map((x) => x.date))].sort();

// 12 月第一次預排（11/26 按，整月未來），再到 12/05 月中按第二次
const firstPlan = (SC, seed, empJson = mkEmpJson()) => commit(SC, {}, plan(SC, { empJson, raw: {}, todayStr: "2026/11/26", seed }));
const SEEDS = [1, 2, 3, 7, 42, 99, 2026, 31337];

// vm 裡產生的陣列原型不同，比對前先轉成一般物件
const P = (x) => JSON.parse(JSON.stringify(x));
const eq = (a, b, msg) => assert.deepEqual(P(a), P(b), msg);
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test("月中再按一次、人員沒變：一筆都不刪、一筆都不新增", () => {
    for (const seed of SEEDS) {
        const SC = mkSC();
        const raw = firstPlan(SC, seed);
        const r = plan(SC, { empJson: mkEmpJson(), raw, todayStr: "2026/12/05", seed: seed + 1 });
        assert.equal(r.toDelete.length, 0, `seed ${seed}：不該刪任何已排好的紀錄`);
        assert.equal(r.creates.length, 0, `seed ${seed}：已排滿不該再新增`);
    }
});

test("加新人：已排好的人一個都不動；整月排滿時新人排不到並提醒", () => {
    for (const seed of SEEDS) {
        const SC = mkSC();
        const raw = firstPlan(SC, seed);
        const j = mkEmpJson([emp("新業務", "租賃部", "承攬", "2026/12/01")]);
        const r = plan(SC, { empJson: j, raw, todayStr: "2026/12/05", seed: seed + 1 });
        assert.equal(r.toDelete.length, 0, `seed ${seed}：加新人不可刪別人的日子`);
        assert.equal(r.creates.length, 0, `seed ${seed}：沒有空格就不新增`);
        assert.ok(r.warnings.some((w) => w.includes("新業務")), `seed ${seed}：要提醒新人沒排到`);
    }
});

test("有空格（月中刪掉幾天）：只補空格，其他人日期不變；新人可以補進空格", () => {
    let placedNew = 0;
    for (const seed of SEEDS) {
        const SC = mkSC();
        let raw = firstPlan(SC, seed);
        const holes = [D(20), D(21)];
        Object.keys(raw).forEach((id) => { if (holes.includes(raw[id][F.DATE])) delete raw[id]; });
        const before = JSON.parse(JSON.stringify(raw));
        const j = mkEmpJson([emp("新業務", "租賃部", "承攬", "2026/12/01")]);
        const r = plan(SC, { empJson: j, raw, todayStr: "2026/12/05", seed: seed + 1 });
        assert.equal(r.toDelete.length, 0);
        const newDates = new Set(r.creates.map((c) => c[F.DATE]));
        eq([...newDates].sort(), holes, `seed ${seed}：只能補 12/20、12/21`);
        holes.forEach((h) => eq(r.creates.filter((c) => c[F.DATE] === h).map((c) => c[F.NOTE]).sort(), ["1F", "2F", "3F", "4F"]));
        // 空格可能先還給原本那天被刪掉的人（兼職、內勤組），新人沒排到就要有提醒
        assert.ok(r.creates.some((c) => c[F.EMP] === "新業務") || r.warnings.some((w) => w.includes("新業務")), `seed ${seed}：新人要嘛排進空格、要嘛提醒`);
        placedNew += r.creates.some((c) => c[F.EMP] === "新業務") ? 1 : 0;
        const after = commit(SC, before, r);
        Object.keys(before).forEach((id) => eq(after[id], before[id]));
    }
    assert.ok(placedNew > 0, "至少有幾個種子新人排進空格");
});

test("離職（員工表已改離職）：只重排他留下的日子，其他人日期不變", () => {
    for (const seed of SEEDS) {
        const SC = mkSC();
        const raw = firstPlan(SC, seed);
        const leaver = "兼職甲";
        const left = daysOf(raw, leaver).filter((d) => d > "2026/12/05");
        if (!left.length) continue;
        const j = mkEmpJson();
        j[ridOf(j, leaver)][E.STATUS] = "離職";
        const r = plan(SC, { empJson: j, raw, todayStr: "2026/12/05", seed: seed + 1 });
        assert.ok(r.toDelete.length > 0 && r.toDelete.every((x) => x.rec.emp === leaver), `seed ${seed}：只刪離職者的紀錄`);
        eq([...new Set(r.creates.map((c) => c[F.DATE]))].sort(), left, `seed ${seed}：只補他留下的日子`);
        assert.ok(r.creates.every((c) => c[F.EMP] !== leaver));
    }
});

test("人事異動預約（12/15 起留職停薪）：生效日以前的日子保留，生效日起的才重排", () => {
    let hit = 0;
    for (const seed of SEEDS) {
        const SC = mkSC();
        const raw = firstPlan(SC, seed);
        // 挑一位 12/15 以後有排、12/15 以前也有排的人；沒有就挑 12/15 以後有排的人
        const all = [...OFFICE, ...BIZ];
        const who = all.find((n) => daysOf(raw, n).some((d) => d >= D(15))) || all[0];
        const j = mkEmpJson();
        const changes = [{ id: "x", rid: ridOf(j, who), kind: "留職停薪", effective: D(15) }];
        const r = plan(SC, { empJson: j, changes, raw, todayStr: "2026/12/05", seed: seed + 1 });
        const later = daysOf(raw, who).filter((d) => d >= D(15));
        if (!later.length) continue;
        hit++;
        assert.ok(r.toDelete.every((x) => x.rec.emp === who && x.rec.date >= D(15)), `seed ${seed}：只刪 ${who} 12/15 起的紀錄`);
        eq([...new Set(r.toDelete.map((x) => x.rec.date))].sort(), later);
        assert.ok(r.creates.every((c) => later.includes(c[F.DATE]) && c[F.EMP] !== who));
    }
    assert.ok(hit > 0, "測試資料要至少有一次命中");
});

test("今天以前照舊鎖定：離職者今天以前的日子不刪", () => {
    const SC = mkSC();
    const raw = firstPlan(SC, 5);
    const who = BIZ.find((n) => daysOf(raw, n).some((d) => d <= "2026/12/05"));
    assert.ok(who);
    const j = mkEmpJson();
    j[ridOf(j, who)][E.STATUS] = "離職";
    const r = plan(SC, { empJson: j, raw, todayStr: "2026/12/05", seed: 6 });
    assert.ok(r.toDelete.every((x) => x.rec.date > "2026/12/05"));
});

test("這個月還沒排過：照舊整月排（每天 1F–4F 齊全）", () => {
    const SC = mkSC();
    const r = plan(SC, { empJson: mkEmpJson(), raw: {}, todayStr: "2026/11/26", seed: 3 });
    for (let d = 1; d <= 31; d++) {
        const fl = r.creates.filter((c) => c[F.DATE] === D(d)).map((c) => c[F.NOTE]).sort();
        eq(fl, ["1F", "2F", "3F", "4F"], `${D(d)} 樓層不齊`);
    }
});

let fail = 0;
for (const t of tests) {
    try { await t.fn(); console.log("✅ " + t.name); }
    catch (e) { fail++; console.log("❌ " + t.name + "\n   " + e.message.split("\n")[0]); }
}
if (fail) { console.log(`\n${fail} 項失敗`); process.exit(1); }
console.log("\n全部通過");
