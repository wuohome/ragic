// 2026/11 新制「一鍵預排值日生」驗收測試（2026-10-29）
// 用假資料直接跑 schedule.html 裡真正的 handleAutoSchedule 原始碼（含 schedule-duty-v2.js 演算法），不連 Ragic。
// 執行：node tests/duty-v2.test.mjs
import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const commonSrc = fs.readFileSync(path.join(root, "schedule-common.js"), "utf8");
const v2Src = fs.readFileSync(path.join(root, "schedule-duty-v2.js"), "utf8");
const html = fs.readFileSync(path.join(root, "schedule.html"), "utf8").replace(/\r\n/g, "\n");
const start = html.indexOf("    const handleAutoSchedule = async () => {");
assert.ok(start >= 0, "找不到 handleAutoSchedule");
const handlerSrc = html.slice(start, html.indexOf("\n    };\n", start) + "\n    };".length);

const F = { EMP: "1000961", DATE: "1000963", TYPE: "1002025", DEPT: "1002026", NOTE: "1000967", IS_AUTO: "1000966" };
const pad = (n) => String(n).padStart(2, "0");
const ds = (y, m, d) => `${y}/${pad(m)}/${pad(d)}`;
const trashNote = (n) => ["清運", "垃圾", "全棟", "全樓", "倒垃圾"].some(k => (n || "").includes(k));

const OFFICE = ["張瓊安", "韓珊珊", "沈郁雯", "呂鴻墀", "王芳瑜"];
const BIZ = ["詹張傳", "張忠豪", "蕭頤臻", "劉子碩", "吳惠慈", "林宣佑", "吳炫儒", "方鼎文", "關宗宇", "李卓威", "葉恩廷", "白欣宜", "黃帟潔"];
const PART = ["林佳燕", "鐘晟鈺", "李維", "張玉慧", "曾正煌", "陳勁豪", "賴信杰", "張嗣祥", "劉兆傑", "楊書銘"];
const EXCLUDED = ["高晶晶", "謝佳芬"];
const mkEmp = (name, hire, i) => ({ name, ragicId: String(100 + i), hire, hireDate: "2025/01/01", birthday: "", fc: { "1F": 3, "2F": 3, "3F": 3, "4F": 1 } });
const mkEmployees = () => [
    ...OFFICE.map((n, i) => mkEmp(n, "正職", i)),
    ...BIZ.map((n, i) => mkEmp(n, "承攬", 10 + i)),
    ...PART.map((n, i) => mkEmp(n, "兼職", 30 + i)),
    ...EXCLUDED.map((n, i) => mkEmp(n, "兼職", 50 + i)), // 即使被塞進池子也不可排
];

const run = async ({ todayStr, year = 2026, month = 11, records = {}, leaves = {}, noRest = {}, tweak, rand }) => {
    const log = { deleted: [], created: [], confirms: [], alerts: [], toasts: [] };
    const ctx = { console: { log() {}, error: (e) => { if (process.env.DBG) console.error(e); } }, Math, Date, Object, Set, Array, String, JSON, parseInt, Promise, setTimeout, Error };
    vm.createContext(ctx);
    vm.runInContext(commonSrc + "\n;globalThis.SC = SC;", ctx);
    vm.runInContext(v2Src, ctx);
    const SC = ctx.SC;
    if (tweak) tweak(SC);
    SC.todayStr = () => todayStr;
    SC.proxyFetch = async (action) => {
        if (action.startsWith("listLeaves")) return JSON.parse(JSON.stringify(records));
        if (action.startsWith("deleteLeave/")) { log.deleted.push(action.split("/")[1]); return { ok: true }; }
        throw new Error("unexpected " + action);
    };
    const deps = {
        SC, CONFIG: { F_EMP: SC.F_EMP, F_LEAVE: SC.F_LEAVE },
        employees: mkEmployees(), allEmployees: mkEmployees().filter(e => SC.isDutyV2Month(year, month) || e.hire !== "兼職"), leaves, // 舊制月份兼職不進池（同 schedule.html load()）
        duties: {}, noRest,
        year, month, GOV_REST_EMPLOYEES: new Set(SC.GOV_REST_NAMES), GOV_REST_CANCELLED: SC.GOV_REST_CANCELLED,
        openConfirm: async (msg) => { log.confirms.push(msg); return true; },
        openAlert: async (msg) => { log.alerts.push(msg); },
        showToast: (msg) => { log.toasts.push(msg); },
        setProgress() {}, setAutoScheduling() {}, setDuties() {}, setAllEmployees() {},
        sleep: async () => {}, exportScheduleSnapshot() {},
        apiBatchCreate: async (recs) => { log.created.push(...recs); return recs.map((_, i) => ({ ragicId: "n" + i })); },
    };
    const names = Object.keys(deps);
    const factory = vm.runInContext(`(function(${names.join(",")}) { ${handlerSrc}\n return handleAutoSchedule; })`, ctx);
    await factory(...names.map(n => deps[n]))();
    return { records, log, SC };
};

// 把寫入的紀錄整理成 date -> { name -> [floors] }
const byDay = (created) => {
    const out = {};
    created.filter(r => !trashNote(r[F.NOTE])).forEach(r => { ((out[r[F.DATE]] ||= {})[r[F.EMP]] ||= []).push(r[F.NOTE]); });
    return out;
};
const dow = (date) => new Date(date.replace(/\//g, "-")).getDay();
const kind = (n) => PART.includes(n) ? "part" : OFFICE.includes(n) ? "office" : "biz";

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const REPEAT = 20;

test("11 月每天都有人，四個樓層每天各剛好一人（4F 也是每天）", async () => {
    for (let k = 0; k < REPEAT; k++) {
        const { log } = await run({ todayStr: "2026/10/29" });
        const days = byDay(log.created);
        for (let d = 1; d <= 30; d++) {
            const date = ds(2026, 11, d);
            assert.ok(days[date], `${date} 沒有人打掃`);
            const floors = Object.values(days[date]).flat().sort();
            assert.deepEqual(floors, ["1F", "2F", "3F", "4F"], `${date} 樓層：${floors.join(",")}`);
        }
    }
});

test("業務、兼職：一個人掃整棟（同一人 1F+2F+3F+4F）", async () => {
    for (let k = 0; k < REPEAT; k++) {
        const { log } = await run({ todayStr: "2026/10/29" });
        const days = byDay(log.created);
        for (const [date, who] of Object.entries(days)) {
            const names = Object.keys(who);
            if (names.some(n => kind(n) !== "office")) {
                assert.equal(names.length, 1, `${date} 業務/兼職日卻有 ${names.join(",")}`);
                assert.deepEqual(who[names[0]].sort(), ["1F", "2F", "3F", "4F"], `${date} ${names[0]}`);
            }
        }
    }
});

test("內勤：兩人一組，一人 1F+4F、另一人 2F+3F", async () => {
    for (let k = 0; k < REPEAT; k++) {
        const { log } = await run({ todayStr: "2026/10/29" });
        const days = byDay(log.created);
        let officeDays = 0;
        for (const [date, who] of Object.entries(days)) {
            const names = Object.keys(who);
            if (!names.every(n => kind(n) === "office")) continue;
            officeDays++;
            assert.equal(names.length, 2, `${date} 內勤不是兩人：${names.join(",")}`);
            const sets = names.map(n => who[n].sort().join("+")).sort();
            assert.deepEqual(sets, ["1F+4F", "2F+3F"], `${date} ${sets.join(" / ")}`);
        }
        assert.ok(officeDays >= 5, `內勤只排了 ${officeDays} 天`);
    }
});

test("內勤六日與國定假日一律不排；平日才有", async () => {
    for (let k = 0; k < REPEAT; k++) {
        const { log, SC } = await run({ todayStr: "2026/10/29" });
        log.created.filter(r => OFFICE.includes(r[F.EMP])).forEach(r => {
            const date = r[F.DATE];
            assert.ok(![0, 6].includes(dow(date)), `內勤被排在週末 ${date} ${r[F.EMP]}`);
            assert.ok(!(date in SC.HOLIDAYS_2026), `內勤被排在國定假日 ${date}`);
        });
    }
});

test("內勤次數盡量平均（11 月：差距 ≤ 1，約 3、3、3、3、2）；搭檔有輪替", async () => {
    for (let k = 0; k < REPEAT; k++) {
        const { log } = await run({ todayStr: "2026/10/29" });
        const days = byDay(log.created);
        const cnt = Object.fromEntries(OFFICE.map(n => [n, 0]));
        const pairs = new Set();
        Object.values(days).forEach(who => {
            const names = Object.keys(who);
            if (names.every(n => kind(n) === "office")) { names.forEach(n => cnt[n]++); pairs.add(names.sort().join("|")); }
        });
        const v = Object.values(cnt);
        assert.ok(Math.max(...v) - Math.min(...v) <= 1, "內勤次數不平均：" + JSON.stringify(cnt));
        assert.ok(pairs.size >= 4, "搭檔幾乎沒輪替：" + [...pairs].join(","));
        // 同一人 1F+4F / 2F+3F 兩種分法也輪替：每人至少各一次（3 次的人）
        const split = Object.fromEntries(OFFICE.map(n => [n, { A: 0, B: 0 }]));
        Object.values(days).forEach(who => Object.entries(who).forEach(([n, fl]) => { if (kind(n) === "office") split[n][fl.includes("1F") ? "A" : "B"]++; }));
        OFFICE.forEach(n => assert.ok(Math.abs(split[n].A - split[n].B) <= 1, `${n} 兩層分法不輪替 ${JSON.stringify(split[n])}`));
    }
});

test("業務每人約 1 次整棟（13 人各 1 次）", async () => {
    for (let k = 0; k < REPEAT; k++) {
        const { log } = await run({ todayStr: "2026/10/29" });
        const days = byDay(log.created);
        const cnt = Object.fromEntries(BIZ.map(n => [n, 0]));
        Object.values(days).forEach(who => Object.keys(who).forEach(n => { if (cnt[n] !== undefined) cnt[n]++; }));
        BIZ.forEach(n => assert.equal(cnt[n], 1, `${n} 排了 ${cnt[n]} 次`));
    }
});

test("兼職每人剛好 1 次；11/7 以前不排；六日優先，六日不夠才排平日；每天只一位兼職", async () => {
    for (let k = 0; k < REPEAT; k++) {
        const { log } = await run({ todayStr: "2026/10/29" });
        const days = byDay(log.created);
        const cnt = Object.fromEntries(PART.map(n => [n, 0]));
        let weekdayPart = 0, weekendPart = 0;
        for (const [date, who] of Object.entries(days)) {
            const ps = Object.keys(who).filter(n => PART.includes(n));
            if (!ps.length) continue;
            assert.equal(ps.length, 1, `${date} 多位兼職`);
            cnt[ps[0]]++;
            assert.ok(date >= "2026/11/07", `${date} 在兼職起排日之前`);
            if ([0, 6].includes(dow(date))) weekendPart++; else weekdayPart++;
        }
        PART.forEach(n => assert.equal(cnt[n], 1, `${n} 排了 ${cnt[n]} 次`));
        // 11/7 起六日共 8 天（7、8、14、15、21、22、28、29）→ 8 位排六日、2 位排平日
        assert.equal(weekendPart, 8, "六日兼職數：" + weekendPart);
        assert.equal(weekdayPart, 2, "平日兼職數：" + weekdayPart);
    }
});

test("11/1（日）：沒有兼職，改排業務一人整棟；內勤也不排", async () => {
    for (let k = 0; k < REPEAT; k++) {
        const { log } = await run({ todayStr: "2026/10/29" });
        const who = byDay(log.created)[ds(2026, 11, 1)];
        const names = Object.keys(who);
        assert.equal(names.length, 1);
        assert.ok(BIZ.includes(names[0]), "11/1 不是業務：" + names[0]);
        assert.deepEqual(who[names[0]].sort(), ["1F", "2F", "3F", "4F"]);
    }
});

test("兼職起排日是參數：改成 11/1 就能排 11/1；改成 11/14 則 11/7、11/8 沒有兼職", async () => {
    let { log } = await run({ todayStr: "2026/10/29", tweak: (SC) => { SC.PARTTIME_DUTY_FIRST_DATE = "2026/11/01"; } });
    let days = byDay(log.created);
    const early = [1, 7, 8].filter(d => Object.keys(days[ds(2026, 11, d)]).some(n => PART.includes(n)));
    assert.ok(early.includes(1) || early.length >= 2, "起排日改 11/1 後早期週末仍沒兼職：" + early);
    ({ log } = await run({ todayStr: "2026/10/29", tweak: (SC) => { SC.PARTTIME_DUTY_FIRST_DATE = "2026/11/14"; } }));
    days = byDay(log.created);
    for (let d = 1; d <= 13; d++) assert.ok(!Object.keys(days[ds(2026, 11, d)]).some(n => PART.includes(n)), `11/${d} 不該有兼職`);
});

test("高晶晶、謝佳芬（排除名單）一次都不排", async () => {
    for (let k = 0; k < REPEAT; k++) {
        const { log } = await run({ todayStr: "2026/10/29" });
        assert.equal(log.created.filter(r => EXCLUDED.includes(r[F.EMP])).length, 0);
    }
});

test("不產生獨立清運紀錄（備註不含清運/垃圾/全棟關鍵字）；也不再回填清運", async () => {
    const { log } = await run({ todayStr: "2026/10/29" });
    assert.equal(log.created.filter(r => trashNote(r[F.NOTE])).length, 0);
    assert.ok(log.created.every(r => /^(1F|2F|3F|4F)$/.test(r[F.NOTE])));
    assert.ok(log.created.every(r => r[F.TYPE] === "值日" && r[F.DEPT] === "系統預排"));
});

test("值班與打掃脫鉤：值班的人不會因為值班被固定排進打掃（也不用前一天空出來）", async () => {
    const z = {};
    for (let d = 1; d <= 30; d++) z["z" + d] = { [F.EMP]: BIZ[d % 13], [F.DATE]: ds(2026, 11, d), [F.TYPE]: "值班", [F.NOTE]: "", [F.IS_AUTO]: "Yes", [F.DEPT]: "系統預排值班" };
    for (let k = 0; k < REPEAT; k++) {
        const { log } = await run({ todayStr: "2026/10/29", records: z });
        const days = byDay(log.created);
        // 還是每人一次、每天四層；值班與否不影響張數
        for (let d = 1; d <= 30; d++) assert.deepEqual(Object.values(days[ds(2026, 11, d)]).flat().sort(), ["1F", "2F", "3F", "4F"]);
        // 同一人不連續兩天
        for (let d = 2; d <= 30; d++) {
            const a = Object.keys(days[ds(2026, 11, d - 1)]), b = Object.keys(days[ds(2026, 11, d)]);
            assert.equal(a.filter(n => b.includes(n)).length, 0, `連兩天 11/${d - 1}→11/${d}`);
        }
    }
});

test("當天排休/請假的人跳過", async () => {
    // 把 11 月每個平日都讓 5 個內勤輪流請假，只剩 2 人可排的日子也要排得出來；並檢查不會排到請假者
    const leaves = {};
    for (let d = 1; d <= 30; d++) {
        const date = ds(2026, 11, d);
        [BIZ[d % 13], OFFICE[d % 5], PART[d % 10]].forEach(n => { (leaves[`${n}|${date}`] ||= []).push({ ragicId: "x", type: "排休", isAuto: "" }); });
    }
    for (let k = 0; k < REPEAT; k++) {
        const { log } = await run({ todayStr: "2026/10/29", leaves });
        log.created.forEach(r => assert.ok(!(leaves[`${r[F.EMP]}|${r[F.DATE]}`]), `${r[F.EMP]} ${r[F.DATE]} 排休卻被排掃`));
    }
});

test("今天以前（含今天）鎖定：不刪不寫；已存在的紀錄計入，明天起才排", async () => {
    const records = {};
    let id = 1;
    for (let d = 1; d <= 10; d++) ["1F", "2F", "3F", "4F"].forEach(f => { records[String(id++)] = { [F.EMP]: BIZ[d - 1], [F.DATE]: ds(2026, 11, d), [F.TYPE]: "值日", [F.NOTE]: f, [F.IS_AUTO]: "Yes", [F.DEPT]: "系統預排" }; });
    records["u1"] = { [F.EMP]: PART[0], [F.DATE]: ds(2026, 11, 7), [F.TYPE]: "值日", [F.NOTE]: "1F", [F.IS_AUTO]: "未掃", [F.DEPT]: "系統預排" };
    const { log } = await run({ todayStr: "2026/11/10", records });
    assert.equal(log.created.filter(r => r[F.DATE] <= "2026/11/10").length, 0, "寫了今天以前");
    const delDates = log.deleted.map(i => records[i][F.DATE]);
    assert.equal(delDates.filter(d => d <= "2026/11/10").length, 0, "刪了今天以前");
    const days = byDay(log.created);
    for (let d = 11; d <= 30; d++) assert.deepEqual(Object.values(days[ds(2026, 11, d)]).flat().sort(), ["1F", "2F", "3F", "4F"], `11/${d}`);
    // 鎖定日掃過的業務前 10 位不會再被排（各自本月已掃 1 次）
    const later = new Set(Object.values(days).flatMap(w => Object.keys(w)));
    BIZ.slice(0, 10).forEach(n => assert.ok(!later.has(n), `${n} 本月已掃過又被排`));
});

test("手動紀錄不覆蓋：該日已被手動占了樓層，只補空的樓層（整包給一位業務）", async () => {
    const records = { m1: { [F.EMP]: "詹張傳", [F.DATE]: ds(2026, 11, 12), [F.TYPE]: "值日", [F.NOTE]: "2F", [F.IS_AUTO]: "No", [F.DEPT]: "手動變更" } };
    const { log } = await run({ todayStr: "2026/10/29", records });
    assert.ok(!log.deleted.includes("m1"));
    const who = byDay(log.created)[ds(2026, 11, 12)];
    const floors = Object.values(who).flat().sort();
    assert.deepEqual(floors, ["1F", "3F", "4F"], "手動 2F 之外應補 1F/3F/4F：" + floors);
    assert.ok(!who["詹張傳"], "手動那位不應被重複排");
});

test("系統先前排的獨立清運（未到的日子）在新制重排時一併清掉；手動排的清運與已標未掃的保留", async () => {
    const records = {
        t1: { [F.EMP]: BIZ[0], [F.DATE]: ds(2026, 11, 20), [F.TYPE]: "值日", [F.NOTE]: "全棟垃圾清運", [F.IS_AUTO]: "Yes", [F.DEPT]: "系統預排" },
        t2: { [F.EMP]: BIZ[1], [F.DATE]: ds(2026, 11, 21), [F.TYPE]: "值日", [F.NOTE]: "全棟垃圾清運", [F.IS_AUTO]: "No", [F.DEPT]: "手動變更" },
        t3: { [F.EMP]: BIZ[2], [F.DATE]: ds(2026, 11, 22), [F.TYPE]: "值日", [F.NOTE]: "全棟垃圾清運", [F.IS_AUTO]: "未掃", [F.DEPT]: "系統預排" },
    };
    const { log } = await run({ todayStr: "2026/10/29", records });
    assert.ok(log.deleted.includes("t1"));
    assert.ok(!log.deleted.includes("t2") && !log.deleted.includes("t3"));
});

test("禁休日（全員打掃）不排；其他天照排", async () => {
    const { log } = await run({ todayStr: "2026/10/29", noRest: { "2026/11/11": { ragicId: "n", reason: "活動" } } });
    assert.equal(log.created.filter(r => r[F.DATE] === "2026/11/11").length, 0);
    assert.ok(log.created.some(r => r[F.DATE] === "2026/11/12"));
});

test("10 月（舊制）行為不變：4F 只週五、有獨立清運、沒有新制整棟紀錄", async () => {
    const { log } = await run({ year: 2026, month: 10, todayStr: "2026/09/20" });
    const floors = log.created.filter(r => !trashNote(r[F.NOTE]));
    floors.forEach(r => { if (r[F.NOTE] === "4F") assert.equal(dow(r[F.DATE]), 5, `非週五 4F ${r[F.DATE]}`); });
    for (const d of [1, 5, 6, 7]) assert.equal(floors.filter(r => r[F.DATE] === ds(2026, 10, d)).length, 3, `10/${d} 應 3 層`);
    assert.equal(floors.filter(r => r[F.DATE] === ds(2026, 10, 2)).length, 4); // 10/2 週五加 4F
    assert.ok(log.created.some(r => trashNote(r[F.NOTE])), "舊制應仍排清運");
    assert.ok(!log.created.some(r => PART.includes(r[F.EMP])), "舊制月份不應排兼職");
});

test("費用試算：新制每層 200（整棟未掃 800、內勤兩層 400）、未倒垃圾 300 罰值班的人（週三/週日不罰）", async () => {
    const { SC } = await run({ todayStr: "2026/10/29" });
    const rec = (emp, date, type, note, isAuto) => ({ [F.EMP]: emp, [F.DATE]: date, [F.TYPE]: type, [F.NOTE]: note, [F.IS_AUTO]: isAuto });
    const records = {};
    let i = 0;
    ["1F", "2F", "3F", "4F"].forEach(f => { records["a" + i++] = rec("詹張傳", "2026/11/03", "值日", f, "未掃"); });
    ["1F", "4F"].forEach(f => { records["b" + i++] = rec("張瓊安", "2026/11/04", "值日", f, "未掃"); });
    records["c1"] = rec("張忠豪", "2026/11/05", "值班", "", "未值班"); // 週四 → 罰
    records["c2"] = rec("蕭頤臻", "2026/11/04", "值班", "", "未值班"); // 週三 → 不罰
    records["c3"] = rec("林宣佑", "2026/11/08", "值班", "", "未值班"); // 週日 → 不罰
    records["c4"] = rec("劉子碩", "2026/10/05", "值班", "", "未值班"); // 舊制月份 → 不罰（維持原樣）
    const fee = SC.computeCleaningFeePreview(records, "2026/11/20");
    assert.equal(fee["詹張傳"].feeTotal, 800);
    assert.equal(fee["張瓊安"].feeTotal, 400);
    assert.equal(fee["張忠豪"].feeTotal, 300);
    assert.ok(!fee["蕭頤臻"] && !fee["林宣佑"] && !fee["劉子碩"], JSON.stringify(fee));
});

test("負擔分數：每掃一層 1、新制值班倒垃圾算 1 層（週三/週日不算、未值班不算、舊制值班不算）", async () => {
    const { SC } = await run({ todayStr: "2026/10/29" });
    const rec = (emp, date, type, isAuto = "") => ({ [F.EMP]: emp, [F.DATE]: date, [F.TYPE]: type, [F.IS_AUTO]: isAuto });
    const r = {
        a: rec("甲", "2026/11/02", "值日"), b: rec("甲", "2026/11/02", "值日"), c: rec("甲", "2026/11/02", "值日"), d: rec("甲", "2026/11/02", "值日"),
        e: rec("甲", "2026/11/03", "值班"),            // 週二：倒垃圾 +1
        f: rec("甲", "2026/11/04", "值班"),            // 週三：不收，不算
        g: rec("乙", "2026/11/05", "值日"), h: rec("乙", "2026/11/05", "值日"),
        i: rec("乙", "2026/11/06", "值日", "未掃"),    // 未掃不算
        j: rec("丙", "2026/11/06", "值班", "未值班"),  // 未值班不算
        k: rec("丙", "2026/11/08", "值班"),            // 週日：不收
    };
    const nov = SC.dutyV2PrevPoints(r, 2026, 11);
    assert.equal(nov["甲"], 5);
    assert.equal(nov["乙"], 2);
    assert.equal(nov["丙"] || 0, 0);
    const oct = SC.dutyV2PrevPoints({ x: rec("丁", "2026/10/06", "值班"), y: rec("丁", "2026/10/07", "值日") }, 2026, 10);
    assert.equal(oct["丁"], 1); // 舊制值班不倒垃圾，只算那一筆值日
    assert.equal(SC.DUTY_V2_TRASH_FLOORS, 1);
});

test("值班排序：新制月份同次數時平均倒垃圾（模擬 11 月 13 人逐日排，倒垃圾次數差距 ≤ 1）；舊制只比次數", async () => {
    const { SC } = await run({ todayStr: "2026/10/29" });
    const ppl = BIZ.map(name => ({ name }));
    const z = {}, t = {};
    let last = "";
    for (let d = 1; d <= 30; d++) {
        const td = SC.isTrashCollectionDay(2026, 11, d);
        const c = ppl.filter(p => p.name !== last).sort(SC.zhibanCompare(z, t, td, true))[0].name;
        z[c] = (z[c] || 0) + 1; if (td) t[c] = (t[c] || 0) + 1; last = c;
    }
    const zs = BIZ.map(n => z[n] || 0), ts = BIZ.map(n => t[n] || 0);
    assert.ok(Math.max(...zs) - Math.min(...zs) <= 1, "值班次數差距 " + zs.join(","));
    assert.ok(Math.max(...ts) - Math.min(...ts) <= 1, "倒垃圾次數差距 " + ts.join(","));
    assert.equal(ts.reduce((a, b) => a + b, 0), 21); // 11 月扣掉週三、週日共 21 天有垃圾車
    // 舊制：只比值班次數，倒垃圾不影響
    assert.equal(SC.zhibanCompare({ a: 1, b: 1 }, { a: 0, b: 5 }, true, false)({ name: "a" }, { name: "b" }), 0);
});

test("共用判斷：新制月份 expectedDutyFloors 每天 1F–4F；舊制月份 4F 仍只週五", async () => {
    const { SC } = await run({ todayStr: "2026/10/29" });
    for (let d = 1; d <= 30; d++) assert.equal(SC.expectedDutyFloors(2026, 11, d).length, 4);
    assert.equal(SC.expectedDutyFloors(2026, 10, 6).length, 3); // 10/6 週二
    assert.equal(SC.expectedDutyFloors(2026, 10, 9).length, 4); // 10/9 週五
    assert.equal(SC.isDutyV2Month(2026, 10), false);
    assert.equal(SC.isDutyV2Month(2026, 11), true);
    assert.equal(SC.isDutyV2Month(2027, 1), true);
});

let fail = 0;
for (const t of tests) {
    try { await t.fn(); console.log("✅", t.name); }
    catch (e) { fail++; console.log("❌", t.name, "\n   ", e.message); }
}
console.log(fail ? `\n${fail} 項失敗` : "\n全部通過");
process.exit(fail ? 1 : 0);
