// 一鍵預排值日生「過去日子鎖定」驗收測試（2026-10-06）
// 用假資料直接跑 schedule.html 裡真正的 handleAutoSchedule 原始碼，不連 Ragic。
// 執行：node tests/duty-lock.test.mjs
import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const commonSrc = fs.readFileSync(path.join(root, "schedule-common.js"), "utf8");
const html = fs.readFileSync(path.join(root, "schedule.html"), "utf8");

// 從 schedule.html 抽出 handleAutoSchedule 整段（到下一個同層的 "    };"）
const start = html.indexOf("    const handleAutoSchedule = async () => {");
assert.ok(start >= 0, "找不到 handleAutoSchedule");
const end = html.indexOf("\n    };\n", start);
const handlerSrc = html.slice(start, end + "\n    };".length);

const F = { EMP: "1000961", DATE: "1000963", TYPE: "1002025", DEPT: "1002026", NOTE: "1000967", IS_AUTO: "1000966" };
const pad = (n) => String(n).padStart(2, "0");
const ds = (y, m, d) => `${y}/${pad(m)}/${pad(d)}`;

// 末兩位用正式設定裡的夫妻（SC.COUPLES），排班程式預設他們一定在名單內
const NAMES = [...Array.from({ length: 10 }, (_, i) => `員工${pad(i + 1)}`), "張忠豪", "蕭頤臻"];
const mkEmployees = () => NAMES.map((name, i) => ({
    name, ragicId: String(100 + i), hire: "承攬", hireDate: "2025/01/01", birthday: "",
    fc: { "1F": 5, "2F": 5, "3F": 5, "4F": 1 },
}));

// 假資料：2026/10 整月已有一份系統預排；員工01 在 10/1~10/10 每天都有排（已經掃很多次）
const buildRecords = () => {
    const recs = {};
    let id = 1;
    const add = (date, emp, note, isAuto = "Yes", dept = "系統預排") => {
        recs[String(id++)] = { [F.EMP]: emp, [F.DATE]: date, [F.TYPE]: "值日", [F.NOTE]: note, [F.IS_AUTO]: isAuto, [F.DEPT]: dept };
    };
    // 上月（9 月）大家平均各 6 次
    for (let d = 1; d <= 24; d++) NAMES.slice(0, 3).forEach((_, k) => add(ds(2026, 9, d), NAMES[(d * 3 + k) % 12], ["1F", "2F", "3F"][k]));
    let rr = 1;
    for (let d = 1; d <= 31; d++) {
        const floors = new Date(2026, 9, d).getDay() === 5 ? ["1F", "2F", "3F", "4F"] : ["1F", "2F", "3F"];
        floors.forEach((fl, k) => {
            let emp;
            if (k === 0 && d <= 10) emp = NAMES[0];
            else { emp = NAMES[rr]; rr = rr % 11 + 1; }
            add(ds(2026, 10, d), emp, fl);
        });
    }
    // 10/5 系統預排但被標未掃（罰款紀錄，必須留著）
    add(ds(2026, 10, 5), NAMES[5], "1F", "未掃");
    // 手動紀錄（未來日）照舊保留
    add(ds(2026, 10, 20), NAMES[6], "2F", "No", "手動變更");
    // 清運：10/1 有、10/2 漏排（過去，不可回填）、10/16 漏排（未來，可補）
    add(ds(2026, 10, 1), NAMES[7], "全棟垃圾清運");
    return recs;
};

const run = async ({ todayStr, year = 2026, month = 10 }) => {
    const records = buildRecords();
    const log = { deleted: [], created: [], confirms: [], alerts: [], toasts: [] };
    const ctx = { console: { log() {}, error: (e) => { if (process.env.DBG) console.error(e); } }, Math, Date, Object, Set, Array, String, JSON, parseInt, Promise, setTimeout, Error };
    vm.createContext(ctx);
    vm.runInContext(commonSrc + "\n;globalThis.SC = SC;", ctx);
    const SC = ctx.SC;
    SC.todayStr = () => todayStr;
    SC.proxyFetch = async (action) => {
        if (action.startsWith("listLeaves")) return JSON.parse(JSON.stringify(records));
        if (action.startsWith("deleteLeave/")) { log.deleted.push(action.split("/")[1]); return { ok: true }; }
        throw new Error("unexpected " + action);
    };
    const deps = {
        SC, CONFIG: { F_EMP: SC.F_EMP, F_LEAVE: SC.F_LEAVE },
        employees: mkEmployees(), allEmployees: mkEmployees(), leaves: {}, duties: {}, noRest: {},
        year, month, GOV_REST_EMPLOYEES: new Set(SC.GOV_REST_NAMES),
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
    return { records, log };
};

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test("月中按：今天以前（含今天）的紀錄一筆都不刪，明天起的系統預排全刪重排", async () => {
    const { records, log } = await run({ todayStr: "2026/10/15" });
    const deletedDates = log.deleted.map(id => records[id][F.DATE]);
    assert.equal(deletedDates.filter(d => d <= "2026/10/15").length, 0, "過去日期進了刪除清單：" + deletedDates.filter(d => d <= "2026/10/15").join(","));
    const futureAuto = Object.entries(records).filter(([, f]) => f[F.DATE] > "2026/10/15" && f[F.DATE].startsWith("2026/10") && f[F.DEPT] === "系統預排" && f[F.IS_AUTO] === "Yes" && !SCtrash(f[F.NOTE]));
    assert.deepEqual(new Set(log.deleted), new Set(futureAuto.map(([id]) => id)));
});

test("月中按：新紀錄只寫明天起，過去漏排的清運不回填、未來漏排的會補", async () => {
    const { log } = await run({ todayStr: "2026/10/15" });
    const past = log.created.filter(r => r[F.DATE] <= "2026/10/15");
    assert.equal(past.length, 0, "寫入了過去日期：" + past.map(r => r[F.DATE] + r[F.NOTE]).join(","));
    const trashDates = log.created.filter(r => SCtrash(r[F.NOTE])).map(r => r[F.DATE]);
    assert.ok(!trashDates.includes("2026/10/02"), "回填了 10/2 清運");
    assert.ok(trashDates.includes("2026/10/16"), "10/16 清運沒補");
    for (let d = 16; d <= 31; d++) {
        const day = log.created.filter(r => r[F.DATE] === ds(2026, 10, d) && !SCtrash(r[F.NOTE]));
        const manual = d === 20 ? 1 : 0;
        const expect = (new Date(2026, 9, d).getDay() === 5 ? 4 : 3) - manual;
        assert.equal(day.length, expect, `10/${d} 樓層筆數 ${day.length} ≠ ${expect}`);
    }
});

test("已掃過很多次的人，明天起要少排（過去次數有算進去）", async () => {
    const { log } = await run({ todayStr: "2026/10/15" });
    const cnt = {};
    log.created.filter(r => !SCtrash(r[F.NOTE])).forEach(r => { cnt[r[F.EMP]] = (cnt[r[F.EMP]] || 0) + 1; });
    const others = NAMES.slice(1).map(n => cnt[n] || 0);
    const minOthers = Math.min(...others);
    assert.ok((cnt[NAMES[0]] || 0) < minOthers, `員工01 已掃 10 次，之後仍排 ${cnt[NAMES[0]] || 0} 次（其他人最少 ${minOthers}）`);
});

test("確認框講白話：今天以前不會動、只重排明天起", async () => {
    const { log } = await run({ todayStr: "2026/10/15" });
    assert.ok(log.confirms[0].includes("今天以前") && log.confirms[0].includes("明天"), "第一個確認框：" + log.confirms[0]);
});

test("整個月都過去：不刪不寫，直接告知已鎖定", async () => {
    const { log } = await run({ todayStr: "2026/11/02" });
    assert.equal(log.deleted.length, 0);
    assert.equal(log.created.length, 0);
    const msgs = [...log.alerts, ...log.toasts, ...log.confirms].join("\n");
    assert.ok(msgs.includes("已經鎖定"), "沒有告知已鎖定：" + msgs);
    assert.equal(log.confirms.length, 0, "整月鎖定還跳確認框");
});

test("今天是月底最後一天：也算整月鎖定", async () => {
    const { log } = await run({ todayStr: "2026/10/31" });
    assert.equal(log.deleted.length + log.created.length, 0);
});

test("下個月（全部是未來）：照舊整月重排", async () => {
    const { records, log } = await run({ todayStr: "2026/09/20" });
    const octAuto = Object.values(records).filter(f => f[F.DATE].startsWith("2026/10") && f[F.DEPT] === "系統預排" && f[F.IS_AUTO] === "Yes" && !SCtrash(f[F.NOTE]));
    assert.equal(log.deleted.length, octAuto.length + 0 /* 未掃那筆也是系統預排，未來日可重排 */ + 1);
    assert.ok(log.created.some(r => r[F.DATE] === "2026/10/01"));
});

const SCtrash = (note) => ["清運", "垃圾", "全棟", "全樓", "倒垃圾"].some(k => (note || "").includes(k));

let fail = 0;
for (const t of tests) {
    try { await t.fn(); console.log("✅", t.name); }
    catch (e) { fail++; console.log("❌", t.name, "\n   ", e.message); }
}
console.log(fail ? `\n${fail} 項失敗` : "\n全部通過");
process.exit(fail ? 1 : 0);
