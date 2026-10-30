// 新版排班頁（schedule-next.html／schedule-next-core.js）驗收測試
// 1. 權限、標記、統計、公平帳、檢查清單的單元測試
// 2. 預排「等價」測試：把舊頁 schedule.html 裡真正的 load()、handleAutoSchedule、handleAutoZhiban 原始碼抽出來跑，
//    和 SC.nextPlanDuty／SC.nextPlanZhiban／SC.nextBuildEmployees 用同一份假資料、同一個亂數種子，逐筆比對輸出。
// 執行：node tests/schedule-next.test.mjs（不連 Ragic、不連網路）
import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8").replace(/\r\n/g, "\n");
const commonSrc = read("schedule-common.js");
const v2Src = read("schedule-duty-v2.js");
const nextSrc = read("schedule-next-core.js");
const html = read("schedule-legacy.html");

const cut = (startMark) => {
    const start = html.indexOf(startMark);
    assert.ok(start >= 0, "找不到 " + startMark);
    return html.slice(start, html.indexOf("\n    };\n", start) + "\n    };".length);
};
const autoSrc = cut("    const handleAutoSchedule = async () => {");
const zhibanSrc = cut("    const handleAutoZhiban = async () => {");
const loadSrc = cut("    const load = async () => {");

const F = { EMP: "1000961", DATE: "1000963", YEAR: "1000964", MONTH: "1000965", TYPE: "1002025", DEPT: "1002026", NOTE: "1000967", IS_AUTO: "1000966" };
const E = { NAME: "3000933", DEPT: "3000937", STATUS: "3000945", HIRE: "3000955", HIRE_DATE: "3000943", BIRTHDAY: "3000954" };
const pad = (n) => String(n).padStart(2, "0");
const ds = (y, m, d) => `${y}/${pad(m)}/${pad(d)}`;

// 可重現的亂數（mulberry32）
const seededMath = (seed) => {
    let a = seed >>> 0;
    const m = Object.create(Math);
    m.random = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    return m;
};
const mkCtx = (seed, todayStr) => {
    const ctx = { console: { log() {}, error() {} }, Math: seededMath(seed), Date, Object, Set, Array, String, JSON, parseInt, Promise, setTimeout, Error, Number, Map, RegExp };
    vm.createContext(ctx);
    vm.runInContext(commonSrc + "\n;globalThis.SC = SC;", ctx);
    vm.runInContext(v2Src, ctx);
    vm.runInContext(nextSrc, ctx);
    if (todayStr) ctx.SC.todayStr = () => todayStr;
    return ctx;
};
const plainSC = () => mkCtx(1).SC;

// ── 假資料：員工（listEmployees 格式）──
const OFFICE = ["張瓊安", "韓珊珊", "沈郁雯", "呂鴻墀", "王芳瑜", "曾琬容"];
const BIZ = ["詹張傳", "張忠豪", "蕭頤臻", "劉子碩", "吳惠慈", "林宣佑", "吳炫儒", "方鼎文", "關宗宇", "李卓威", "葉恩廷", "白欣宜", "黃帟潔"];
const PART = ["林佳燕", "李維", "張玉慧", "陳勁豪", "張嗣祥", "劉兆傑", "楊書銘"];
const EXCLUDED = ["高晶晶", "謝佳芬", "曾正煌"];
const emp = (name, dept, hire, hireDate, status = "在職", birthday = "") => ({ [E.NAME]: name, [E.DEPT]: dept, [E.STATUS]: status, [E.HIRE]: hire, [E.HIRE_DATE]: hireDate, [E.BIRTHDAY]: birthday });
const mkEmpJson = () => {
    const list = [
        emp("張瓊安", "管理部", "正職", "2025/10/07"), emp("韓珊珊", "管理部", "正職", "2024/03/01"),
        emp("沈郁雯", "設計部", "正職", "2023/03/01"), emp("呂鴻墀", "設計部", "承攬", "2023/01/30"),
        emp("王芳瑜", "行銷部", "正職", "2026/08/17"), emp("曾琬容", "行銷部", "正職", "2026/11/03"),
        ...BIZ.map((n, i) => emp(n, n === "黃帟潔" ? "買賣部" : "租賃部", "承攬", `2025/0${1 + (i % 8)}/1${i % 9}`, "在職", i === 3 ? "0000/11/15" : "")),
        emp("鐘晟鈺", "租賃部", "正職", "2025/08/11"),
        ...PART.map((n) => emp(n, n === "張玉慧" ? "社宅部" : "租賃部", "兼職", "2026/04/01")),
        ...EXCLUDED.map((n) => emp(n, "租賃部", "兼職", "2026/04/01")),
        emp("吳彥廷", "經營階層", "正職", "2020/10/26"),
        emp("離職者", "租賃部", "承攬", "2025/01/01", "離職"),
    ];
    const o = {};
    list.forEach((f, i) => { o[String(100 + i)] = f; });
    return o;
};

// ── 假資料：排休表（listLeaves 格式）──
const mkRaw = (todayKind, withNewMark = false) => {
    const recs = {};
    let id = 1;
    const add = (date, name, type, note = "", isAuto = "", dept = "") => { recs[String(id++)] = { [F.EMP]: name, [F.DATE]: date, [F.TYPE]: type, [F.NOTE]: note, [F.IS_AUTO]: isAuto, [F.DEPT]: dept }; };
    // 10 月：每天一人整棟（系統預排）、一人值班
    for (let d = 1; d <= 31; d++) {
        const n = BIZ[d % BIZ.length];
        ["1F", "2F", "3F", "4F"].forEach((fl) => add(ds(2026, 10, d), n, "值日", fl, "Yes", "系統預排"));
        add(ds(2026, 10, d), BIZ[(d + 3) % BIZ.length], "值班", "", d === 20 ? "未值班" : d === 21 && withNewMark ? "未倒垃圾" : "", "系統預排值班");
    }
    // 11 月：排休、禁休、手動值日、已排好的系統預排（部分日子）、已排好的值班
    [3, 4, 10, 17, 18, 24].forEach((d, i) => add(ds(2026, 11, d), BIZ[i], "排休", "", "", "租賃部"));
    add(ds(2026, 11, 20), "韓珊珊", "禁休", "活動", "", "禁休設定");
    ["1F", "2F", "3F", "4F"].forEach((fl) => add(ds(2026, 11, 8), "方鼎文", "值日", fl, "No", "手動變更"));
    add(ds(2026, 11, 14), "劉子碩", "值日", "2F", "No", "手動變更");
    add(ds(2026, 11, 15), "張瓊安", "見紅休", "", SCcancel, "管理部/特助");
    add(ds(2026, 11, 22), "張瓊安", "見紅休", "", "", "管理部/特助");
    for (let d = 1; d <= 30; d++) {
        if (d === 8 || d === 14) continue;
        const n = BIZ[(d * 5) % BIZ.length];
        ["1F", "2F", "3F", "4F"].forEach((fl) => add(ds(2026, 11, d), n, "值日", fl, d === 9 ? "未掃" : "Yes", "系統預排"));
    }
    for (let d = 1; d <= 30; d++) add(ds(2026, 11, d), BIZ[(d * 7) % 12], "值班", "", d === 12 ? (withNewMark ? "未倒垃圾" : "未值班") : d === 13 ? "未值班" : "", "系統預排值班");
    if (todayKind === "legacy") add(ds(2026, 11, 5), "李卓威", "值日", "全棟垃圾清運", "Yes", "系統預排");
    return recs;
};
const SCcancel = "見紅休已取消";

// 把原始物件裁成「某月到某月」（模擬 listLeaves 的日期範圍查詢）
const rangeOf = (raw, from, to) => {
    const o = {};
    Object.entries(raw).forEach(([k, v]) => { if (v[F.DATE] >= from && v[F.DATE] <= to) o[k] = v; });
    return o;
};

const P = (x) => JSON.parse(JSON.stringify(x)); // 跨 vm 比對前先轉成一般物件
const eq = (a, b, msg) => assert.deepEqual(P(a), P(b), msg);
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ═════════ 單元：權限 ═════════
test("權限：珊珊、瓊安可排班與確認；一般同仁只能看；沒有身分什麼都不行", () => {
    const SC = plainSC();
    eq(SC.nextPerms({ name: "韓珊珊", role: "admin" }), { view: true, schedule: true, confirm: true });
    eq(SC.nextPerms({ name: "張瓊安", role: "admin" }), { view: true, schedule: true, confirm: true });
    eq(SC.nextPerms({ name: "白欣宜", role: "staff" }), { view: true, schedule: false, confirm: false });
    eq(SC.nextPerms(null), { view: false, schedule: false, confirm: false });
    eq(SC.nextPerms({}), { view: false, schedule: false, confirm: false });
    eq([...SC.NEXT_ADMIN_NAMES], ["韓珊珊", "張瓊安"]);
});

test("權限：自己排休照舊版規則（20 號後開放、見紅休那天不能點、只能改自己）；珊珊不受限", () => {
    const SC = plainSC();
    const staff = { name: "白欣宜", role: "staff" };
    const admin = { name: "韓珊珊", role: "admin" };
    const base = { viewer: staff, target: "白欣宜", ds: "2026/11/14", todayStr: "2026/10/30", hasRedRecord: false };
    assert.equal(SC.nextCanEditRest(base).ok, true);
    assert.equal(SC.nextCanEditRest({ ...base, todayStr: "2026/10/19" }).ok, false, "19 號還沒開放");
    assert.equal(SC.nextCanEditRest({ ...base, todayStr: "2026/10/20" }).ok, true, "20 號開放");
    assert.equal(SC.nextCanEditRest({ ...base, target: "詹張傳" }).ok, false, "不能改別人");
    assert.equal(SC.nextCanEditRest({ ...base, hasRedRecord: true }).ok, false, "見紅休紀錄那天要請珊珊");
    assert.equal(SC.nextCanEditRest({ ...base, ds: "2026/10/30" }).ok, false, "今天以前不能改");
    assert.equal(SC.nextCanEditRest({ ...base, viewer: null }).ok, false);
    assert.equal(SC.nextCanEditRest({ ...base, viewer: admin, target: "詹張傳", todayStr: "2026/11/05", ds: "2026/11/02", hasRedRecord: true }).ok, true);
});

// ═════════ 單元：標記、統計、公平帳、檢查 ═════════
test("標記：未倒垃圾是值班紀錄 IS_AUTO 的新值，預設（空白、Yes、No）都算完成", () => {
    const SC = plainSC();
    assert.equal(SC.NEXT_MARK.NO_TRASH, "未倒垃圾");
    ["", "Yes", "No", "系統預排"].forEach((v) => assert.equal(SC.nextDutyState(v), "ok", v));
    assert.equal(SC.nextDutyState("未值班"), "noshow");
    assert.equal(SC.nextDutyState("未倒垃圾"), "notrash");
});

test("月統計：排定與實際分開；週三、週日沒垃圾車不計倒垃圾；預設算完成、只有被標的才扣", () => {
    const SC = plainSC();
    const raw = {};
    let i = 1;
    const add = (date, name, type, note, isAuto = "") => { raw[i++] = { [F.EMP]: name, [F.DATE]: date, [F.TYPE]: type, [F.NOTE]: note, [F.IS_AUTO]: isAuto, [F.DEPT]: "x" }; };
    // 2026/11/2 週一、11/4 週三、11/5 週四、11/8 週日、11/10 週二
    add("2026/11/02", "甲", "值班", "");                 // 週一有車、已過 → 倒了
    add("2026/11/04", "甲", "值班", "");                 // 週三沒車 → 不計
    add("2026/11/05", "乙", "值班", "", "未倒垃圾");     // 有車、有到班沒倒 → 排定 1、實際 0
    add("2026/11/08", "乙", "值班", "", "未值班");       // 週日沒車、沒到班 → 不計倒垃圾，記一次沒到班
    add("2026/11/10", "甲", "值班", "");                 // 未來，只算排定
    ["1F", "2F", "3F", "4F"].forEach((f) => add("2026/11/02", "丙", "值日", f));
    ["1F", "2F", "3F", "4F"].forEach((f, k) => add("2026/11/03", "丙", "值日", f, k === 0 ? "未掃" : ""));
    ["1F", "2F", "3F", "4F"].forEach((f) => add("2026/11/10", "丙", "值日", f));
    const M = SC.nextBuildMonth(SC.nextParse(raw), 2026, 11);
    const t = SC.nextTally(M, "2026/11/05");
    assert.equal(t["甲"].trashSched, 2, "甲：11/2、11/10 有車；11/4 週三不計");
    assert.equal(t["甲"].trashDone, 1, "甲：到 11/5 只倒過 11/2");
    assert.equal(t["甲"].dutyDays, 3);
    assert.equal(t["乙"].trashSched, 1);
    assert.equal(t["乙"].trashDone, 0);
    assert.equal(t["乙"].trashMissed, 1);
    assert.equal(t["乙"].noShow, 1);
    assert.equal(t["丙"].floorsSched, 12);
    assert.equal(t["丙"].floorsMissed, 1);
    assert.equal(t["丙"].floorsDone, 7, "11/2 四層＋11/3 三層（一層未掃），11/10 還沒到");
    assert.equal(t["丙"].schedLayers, 12);
    assert.equal(t["丙"].doneLayers, 7);
    assert.equal(t["甲"].schedLayers, 2);
    assert.equal(t["甲"].doneLayers, 1);
});

test("上月負擔分數：標了未倒垃圾的值班，倒垃圾那 1 層不算（和既有未值班同一算法）；沒有新標記時輸出與舊函式完全相同", () => {
    const SC = plainSC();
    const mk = (isAuto) => ({ 1: { [F.EMP]: "甲", [F.DATE]: "2026/11/02", [F.TYPE]: "值班", [F.IS_AUTO]: isAuto } });
    eq(SC.dutyV2PrevPoints(SC.nextPrevPointsInput(mk("")), 2026, 11), { 甲: 1 });
    eq(SC.dutyV2PrevPoints(SC.nextPrevPointsInput(mk("未倒垃圾")), 2026, 11), {});
    eq(SC.dutyV2PrevPoints(SC.nextPrevPointsInput(mk("未值班")), 2026, 11), {});
    const raw = mkRaw();
    delete raw[Object.keys(raw).find((k) => raw[k][F.IS_AUTO] === "未倒垃圾")]; // 拿掉新標記
    Object.keys(raw).forEach((k) => { if (raw[k][F.IS_AUTO] === "未倒垃圾") delete raw[k]; });
    eq(SC.dutyV2PrevPoints(SC.nextPrevPointsInput(raw), 2026, 10), SC.dutyV2PrevPoints(raw, 2026, 10));
});

test("休假統計：見紅休名單的應休天數是六日與國定假日；兼職不算；少休多休判斷", () => {
    const SC = plainSC();
    const days = {};
    for (let d = 1; d <= 30; d++) days[d] = { rest: [], noRest: null };
    days[1].rest.push({ name: "張瓊安", kind: "見紅休" }, { name: "張忠豪", kind: "排休" });
    days[2].rest.push({ name: "張忠豪", kind: "特休" });
    days[3].rest.push({ name: "張忠豪", kind: "請假" });
    const M = { year: 2026, month: 11, dim: 30, days };
    const t = SC.nextRestTally(M);
    assert.equal(t["張忠豪"].total, 3);
    assert.equal(t["張瓊安"].gov, 1);
    assert.equal(SC.nextRestTarget(M, { name: "張忠豪", hire: "承攬" }), 8);
    assert.equal(SC.nextRestTarget(M, { name: "張玉慧", hire: "兼職" }), null);
    const red = Array.from({ length: 30 }, (_, i) => i + 1).filter((d) => SC.isGovRestDay(2026, 11, d)).length;
    assert.equal(SC.nextRestTarget(M, { name: "張瓊安", hire: "正職" }), red);
    days[1].noRest = { reason: "測試" };
    assert.equal(SC.nextRestTarget(M, { name: "張瓊安", hire: "正職" }), red - 1);
    assert.deepEqual({ ...SC.nextRestStatus(6, 8) }, { side: "short", diff: 2 });
    assert.deepEqual({ ...SC.nextRestStatus(9, 8) }, { side: "over", diff: 1 });
    assert.deepEqual({ ...SC.nextRestStatus(8, 8) }, { side: "ok", diff: 0 });
    assert.equal(SC.nextRestStatus(3, null).side, "none");
});

test("公平帳：每組自己的平均、標比平均多／少、只有 over／under／same，沒有欠帳或罰款欄", () => {
    const SC = plainSC();
    const people = [{ name: "甲", kind: "biz" }, { name: "乙", kind: "biz" }, { name: "丙", kind: "biz" }, { name: "丁", kind: "office" }, { name: "戊", kind: "office" }];
    const tally = { 甲: { schedLayers: 6, doneLayers: 3, floorsSched: 4, trashSched: 2 }, 乙: { schedLayers: 4, doneLayers: 4, floorsSched: 4, trashSched: 0 }, 丙: { schedLayers: 5, doneLayers: 0, floorsSched: 4, trashSched: 1 }, 丁: { schedLayers: 6, doneLayers: 0, floorsSched: 6, trashSched: 0 }, 戊: { schedLayers: 6, doneLayers: 0, floorsSched: 6, trashSched: 0 } };
    const g = SC.nextFairness(people, tally);
    eq(g.map((x) => x.label), ["業務", "內勤"]);
    const biz = g[0];
    assert.equal(biz.avg, 5);
    eq(biz.rows.map((r) => [r.name, r.gap, r.side]), [["甲", 1, "over"], ["乙", -1, "under"], ["丙", 0, "same"]]);
    assert.ok(g[1].rows.every((r) => r.side === "same"));
    const keys = Object.keys(biz.rows[0]).join(",");
    assert.ok(!/debt|fine|fee|owe|罰|欠/.test(keys), "欄位不該有欠帳／罰款：" + keys);
    assert.equal(biz.rows[0].done, 3, "實際次數另外帶出");
});

test("檢查清單：缺樓層、沒值班、連兩天、多人值班；補上只給今天以後的日子", () => {
    const SC = plainSC();
    const raw = {};
    let i = 1;
    const add = (date, name, type, note, isAuto = "") => { raw[i++] = { [F.EMP]: name, [F.DATE]: date, [F.TYPE]: type, [F.NOTE]: note, [F.IS_AUTO]: isAuto, [F.DEPT]: "x" }; };
    for (let d = 1; d <= 30; d++) {
        const n = "人" + (d % 7);
        ["1F", "2F", "3F", "4F"].forEach((f) => add(ds(2026, 11, d), n, "值日", f));
        add(ds(2026, 11, d), "業" + (d % 5), "值班", "");
    }
    // 製造問題
    Object.keys(raw).forEach((k) => { if (raw[k][F.DATE] === "2026/11/12" && raw[k][F.TYPE] === "值日" && raw[k][F.NOTE] === "3F") delete raw[k]; });
    Object.keys(raw).forEach((k) => { if (raw[k][F.DATE] === "2026/11/13" && raw[k][F.TYPE] === "值日") delete raw[k]; });
    Object.keys(raw).forEach((k) => { if (raw[k][F.DATE] === "2026/11/15" && raw[k][F.TYPE] === "值班") delete raw[k]; });
    add("2026/11/16", "業9", "值班", "");
    Object.keys(raw).forEach((k) => { if (raw[k][F.DATE] === "2026/11/02" && raw[k][F.TYPE] === "值班") delete raw[k]; });
    const M = SC.nextBuildMonth(SC.nextParse(raw), 2026, 11);
    const c = SC.nextChecks(M, "2026/11/05");
    const txt = c.map((x) => x.text).join("\n");
    assert.match(txt, /11\/12（四）只排了 1F、2F、4F，還缺 3F/);
    assert.match(txt, /11\/13（五）還沒排打掃/);
    assert.match(txt, /11\/15（日）沒有值班的人/);
    assert.match(txt, /11\/16（一）有 2 人值班/);
    assert.match(txt, /11\/02（一）沒有值班的人|11\/2（一）沒有值班的人/);
    assert.equal(c.find((x) => x.d === 2 && x.kind === "duty").fix, null, "11/2 已過，不補");
    assert.equal(c.find((x) => x.d === 13).fix, "clean");
    assert.equal(c.find((x) => x.d === 15).fix, "duty");
    assert.equal(c.find((x) => x.d === 16).fix, null);
    assert.ok(c.every((x) => !/罰|欠|收費|追/.test(x.text)));
    // 禁休日不檢查打掃
    raw[i++] = { [F.EMP]: "韓珊珊", [F.DATE]: "2026/11/13", [F.TYPE]: "禁休", [F.NOTE]: "活動", [F.IS_AUTO]: "", [F.DEPT]: "禁休設定" };
    const c2 = SC.nextChecks(SC.nextBuildMonth(SC.nextParse(raw), 2026, 11), "2026/11/05");
    assert.ok(!c2.some((x) => x.d === 13 && x.kind === "clean"));
});

test("顯示名稱：曾琬容只在畫面顯示成花那，其他人不變", () => {
    const SC = plainSC();
    assert.equal(SC.nextName("曾琬容"), "花那");
    assert.equal(SC.nextName("張瓊安"), "張瓊安");
});

test("欄組：租賃部、租賃部（兼職）、社宅部（兼職）（張玉慧）、買賣部；全部用 Ragic 部門值，內部部門值不變", () => {
    const SC = plainSC();
    const { employees } = SC.nextBuildEmployees(mkEmpJson(), 2026, 11);
    const g = SC.nextGroups(employees);
    eq(g.map((x) => x.label), ["管理部", "設計部", "行銷部", "租賃部", "租賃部（兼職）", "社宅部（兼職）", "買賣部"]);
    eq(g.find((x) => x.label === "社宅部（兼職）").people.map((p) => p.name), ["張玉慧"]);
    assert.ok(g.find((x) => x.label === "租賃部（兼職）").people.every((p) => p.dept === "兼職"));
    assert.ok(g.find((x) => x.label === "租賃部").people.some((p) => p.name === "鐘晟鈺"));
    assert.ok(!employees.some((p) => ["高晶晶", "謝佳芬", "曾正煌", "吳彥廷", "離職者"].includes(p.name)));
});

// ═════════ 等價：員工名單 ═════════
test("等價：員工名單（人員池、順序、部門顯示）與舊頁 load() 完全相同", async () => {
    const ctx = mkCtx(1, "2026/10/30");
    const SC = ctx.SC;
    const empJson = mkEmpJson();
    const got = {};
    const deps = {
        SC, CONFIG: { F_EMP: SC.F_EMP, F_LEAVE: SC.F_LEAVE }, year: 2026, month: 11,
        setLoading() {}, setAllEmployees: (v) => { got.all = v; }, setEmployees: (v) => { got.emps = v; }, setLeaves() {}, setDuties() {}, setNoRest() {}, setPrevStats() {},
        showToast() {},
    };
    SC.proxyFetch = async (a) => (a === "listEmployees" ? JSON.parse(JSON.stringify(empJson)) : {});
    const names = Object.keys(deps);
    const factory = vm.runInContext(`(function(${names.join(",")}) { ${loadSrc}\n return load; })`, ctx);
    await factory(...names.map((n) => deps[n]))();
    const mine = SC.nextBuildEmployees(empJson, 2026, 11);
    const strip = (arr) => arr.map((e) => ({ name: e.name, dept: e.dept, hire: e.hire, hireDate: e.hireDate, birthday: e.birthday, status: e.status }));
    eq(strip(mine.allEmployees), strip(got.all));
    eq(strip(mine.employees), strip(got.emps));
    assert.ok(got.emps.length > 20);
});

// ═════════ 等價：預排值日 ═════════
const runOldDuty = async ({ seed, todayStr, raw, noRestFrom }) => {
    const ctx = mkCtx(seed, todayStr);
    const SC = ctx.SC;
    const year = 2026, month = 11;
    const { allEmployees, employees } = SC.nextBuildEmployees(mkEmpJson(), year, month);
    // 舊頁的 leaves／noRest 狀態：照 load() 的做法由原始紀錄整理
    const leaves = {}, noRest = {};
    Object.entries(raw).forEach(([id, f]) => {
        const e = f[F.EMP], date = f[F.DATE], type = f[F.TYPE] || "排休";
        const p = date.split("/").map(Number);
        if (p[0] !== year || p[1] !== month) return;
        if (type === "禁休") noRest[date] = { ragicId: id, reason: f[F.NOTE] };
        else if (type !== "值日") (leaves[`${e}|${date}`] ||= []).push({ ragicId: id, type, isAuto: f[F.IS_AUTO] || "" });
    });
    const log = { deleted: [], created: [], alerts: [] };
    SC.proxyFetch = async (action) => {
        if (action.startsWith("listLeaves")) return JSON.parse(JSON.stringify(raw));
        if (action.startsWith("deleteLeave/")) { log.deleted.push(action.split("/")[1]); return { ok: true }; }
        throw new Error("unexpected " + action);
    };
    const deps = {
        SC, CONFIG: { F_EMP: SC.F_EMP, F_LEAVE: SC.F_LEAVE },
        employees, allEmployees: allEmployees.map((e) => ({ ...e, fc: { "1F": 0, "2F": 0, "3F": 0, "4F": 0 } })), leaves, duties: {}, noRest,
        year, month, GOV_REST_EMPLOYEES: new Set(SC.GOV_REST_NAMES), GOV_REST_CANCELLED: SC.GOV_REST_CANCELLED,
        openConfirm: async () => true, openAlert: async (m) => { log.alerts.push(m); }, showToast() {},
        setProgress() {}, setAutoScheduling() {}, setDuties() {}, setAllEmployees() {},
        sleep: async () => {}, exportScheduleSnapshot() {},
        apiBatchCreate: async (recs) => { log.created.push(...recs); return recs.map((_, i) => ({ ragicId: "n" + i })); },
    };
    const names = Object.keys(deps);
    const factory = vm.runInContext(`(function(${names.join(",")}) { ${autoSrc}\n return handleAutoSchedule; })`, ctx);
    await factory(...names.map((n) => deps[n]))();
    return log;
};
const runNewDuty = (seed, todayStr, raw) => {
    const ctx = mkCtx(seed, todayStr);
    const SC = ctx.SC;
    const { allEmployees } = SC.nextBuildEmployees(mkEmpJson(), 2026, 11);
    const noRest = {};
    SC.nextParse(raw).forEach((r) => { if (r.type === "禁休" && SC.nextInMonth(r, 2026, 11)) noRest[r.date] = { ragicId: r.id }; });
    const r = SC.nextPlanDuty({ year: 2026, month: 11, todayStr, allEmployees, raw: JSON.parse(JSON.stringify(raw)), noRest });
    return { deleted: r.toDelete.map((x) => x.id), created: r.creates, warnings: r.warnings };
};

for (const [label, todayStr, kind] of [["整月未來（10/29）", "2026/10/29", ""], ["月中（11/12）", "2026/11/12", ""], ["月初當天（11/1）", "2026/11/01", ""], ["含舊制清運紀錄", "2026/10/29", "legacy"]]) {
    test(`等價：預排值日 — ${label}：刪除哪些、新增哪些，與舊頁 handleAutoSchedule 逐筆相同（5 種亂數種子）`, async () => {
        for (const seed of [1, 2, 3, 42, 2026]) {
            const raw = mkRaw(kind);
            const o = await runOldDuty({ seed, todayStr, raw });
            const n = runNewDuty(seed, todayStr, raw);
            eq(n.deleted, o.deleted, `seed ${seed} 刪除清單不同`);
            eq(n.created, o.created, `seed ${seed} 新增清單不同`);
            assert.ok(o.created.length > 0 || todayStr === "2026/11/01");
        }
    });
}

test("預排值日：鎖定今天以前、手動紀錄保護、到職日、見紅休、禁休——產出符合規則（對新函式直接驗）", () => {
    const todayStr = "2026/11/12";
    const raw = mkRaw();
    const r = runNewDuty(7, todayStr, raw);
    const by = {};
    r.created.forEach((c) => { ((by[c[F.DATE]] ||= {})[c[F.EMP]] ||= []).push(c[F.NOTE]); });
    Object.keys(by).forEach((d) => assert.ok(d > todayStr, `${d} 在今天以前，應鎖定不動`));
    assert.ok(!by["2026/11/20"], "禁休日不排");
    assert.ok(!by["2026/11/08"], "11/8 手動已排滿整棟，不再排");
    const d14 = by["2026/11/14"];
    if (d14) { const fl = Object.values(d14).flat().sort(); assert.ok(!fl.includes("2F"), "11/14 的 2F 是手動排的，不可重複"); }
    assert.ok(!Object.keys(by["2026/11/13"] || {}).includes("曾琬容"));
    // 刪除只含未鎖定、非手動的系統預排
    const rawById = (id) => raw[id];
    r.deleted.forEach((id) => {
        const f = rawById(id);
        assert.ok(f[F.DATE] > todayStr, "鎖定的不能刪");
        assert.equal(f[F.DEPT], "系統預排");
        assert.notEqual(f[F.IS_AUTO], "No");
    });
});

// ═════════ 等價：預排值班 ═════════
const runOldZhiban = async ({ todayStr, raw }) => {
    const ctx = mkCtx(1, todayStr);
    const SC = ctx.SC;
    const year = 2026, month = 11;
    const { employees } = SC.nextBuildEmployees(mkEmpJson(), year, month);
    const leaves = {}, noRest = {};
    Object.entries(raw).forEach(([id, f]) => {
        const e = f[F.EMP], date = f[F.DATE], type = f[F.TYPE] || "排休";
        const p = date.split("/").map(Number);
        if (p[0] !== year || p[1] !== month) return;
        if (type === "禁休") noRest[date] = { ragicId: id };
        else if (type !== "值日") (leaves[`${e}|${date}`] ||= []).push({ ragicId: id, type, isAuto: f[F.IS_AUTO] || "" });
    });
    const log = { deleted: [], created: [] };
    SC.proxyFetch = async (action) => {
        if (action.startsWith("listLeaves")) return JSON.parse(JSON.stringify(rangeOf(raw, "2026/11/01", "2026/11/30")));
        if (action.startsWith("deleteLeave/")) { log.deleted.push(action.split("/")[1]); return { ok: true }; }
        throw new Error("unexpected " + action);
    };
    const deps = {
        SC, CONFIG: { F_EMP: SC.F_EMP, F_LEAVE: SC.F_LEAVE },
        employees, leaves, noRest, year, month, GOV_REST_EMPLOYEES: new Set(SC.GOV_REST_NAMES),
        openConfirm: async () => true, openAlert: async () => {}, showToast() {},
        setProgress() {}, setAutoZhiban() {}, setLeaves() {}, sleep: async () => {}, exportScheduleSnapshot() {},
        apiBatchCreate: async (recs) => { log.created.push(...recs); return recs.map((_, i) => ({ ragicId: "n" + i })); },
    };
    const names = Object.keys(deps);
    const factory = vm.runInContext(`(function(${names.join(",")}) { ${zhibanSrc}\n return handleAutoZhiban; })`, ctx);
    await factory(...names.map((n) => deps[n]))();
    return log;
};
for (const [label, todayStr] of [["整月未來（10/29）", "2026/10/29"], ["月中（11/12）", "2026/11/12"]]) {
    test(`等價：預排值班 — ${label}：刪除與新增與舊頁 handleAutoZhiban 逐筆相同`, async () => {
        const raw = mkRaw();
        const o = await runOldZhiban({ todayStr, raw });
        const ctx = mkCtx(1, todayStr);
        const SC = ctx.SC;
        const { employees } = SC.nextBuildEmployees(mkEmpJson(), 2026, 11);
        const noRest = {};
        SC.nextParse(raw).forEach((r) => { if (r.type === "禁休" && SC.nextInMonth(r, 2026, 11)) noRest[r.date] = { ragicId: r.id }; });
        const n = SC.nextPlanZhiban({ year: 2026, month: 11, todayStr, employees, raw: rangeOf(raw, "2026/11/01", "2026/11/30"), noRest });
        eq(n.toDelete.map((x) => x.id), o.deleted);
        eq(n.creates, o.created);
        assert.ok(o.created.length > 0);
    });
}

test("預排值班：沿用 zhibanCompare（次數平均、倒垃圾平均），每天一人、不連兩天、不在休假日、見紅休不值班", () => {
    const todayStr = "2026/10/29";
    const SC = mkCtx(1, todayStr).SC;
    const { employees } = SC.nextBuildEmployees(mkEmpJson(), 2026, 11);
    const raw = {}; // 空月：全部重排
    const r = SC.nextPlanZhiban({ year: 2026, month: 11, todayStr, employees, raw, noRest: {} });
    assert.equal(Object.keys(r.newZhiban).length, 30);
    const cnt = {}, trash = {};
    let last = "";
    for (let d = 1; d <= 30; d++) {
        const n = r.newZhiban[ds(2026, 11, d)];
        assert.notEqual(n, last, `${d} 號連兩天同一人`);
        last = n;
        cnt[n] = (cnt[n] || 0) + 1;
        if (SC.isTrashCollectionDay(2026, 11, d)) trash[n] = (trash[n] || 0) + 1;
    }
    const vals = Object.values(cnt);
    assert.ok(Math.max(...vals) - Math.min(...vals) <= 1, "值班次數差距 " + vals.join(","));
    assert.ok(!Object.keys(cnt).some((n) => ["張瓊安", "沈郁雯", "呂鴻墀", "王芳瑜", "曾琬容", "鐘晟鈺", ...PART].includes(n)), "只排承攬業務");
});

test("預排值班：已鎖定的日子標了「未倒垃圾」，那次倒垃圾不算進本月倒垃圾次數（與既有「未值班」同算法），所以之後把有垃圾車的日子先排給他", () => {
    const todayStr = "2026/11/12";
    const SC = mkCtx(1, todayStr).SC;
    const { employees } = SC.nextBuildEmployees(mkEmpJson(), 2026, 11);
    const base = mkRaw(); // 11/12 為未值班
    const marked = mkRaw("", true); // 11/12 為未倒垃圾
    const run = (raw) => SC.nextPlanZhiban({ year: 2026, month: 11, todayStr, employees, raw: rangeOf(raw, "2026/11/01", "2026/11/30"), noRest: {} });
    eq(run(base).creates, run(marked).creates, "未倒垃圾與未值班對後續排序影響相同（都不算倒垃圾）");
});

test("補上：只補指定那一天；值班補上不刪任何紀錄、其餘日子當作已定", () => {
    const todayStr = "2026/11/05";
    const SC = mkCtx(3, todayStr).SC;
    const raw = mkRaw();
    // 拿掉 11/15 的值班與 11/16 的值日
    Object.keys(raw).forEach((k) => {
        if (raw[k][F.DATE] === "2026/11/15" && raw[k][F.TYPE] === "值班") delete raw[k];
        else if (raw[k][F.DATE] === "2026/11/16" && raw[k][F.TYPE] === "值日") delete raw[k];
    });
    const { employees, allEmployees } = SC.nextBuildEmployees(mkEmpJson(), 2026, 11);
    const z = SC.nextPlanZhiban({ year: 2026, month: 11, todayStr, employees, raw, noRest: {}, only: "2026/11/15" });
    assert.equal(z.toDelete.length, 0);
    eq(Object.keys(z.newZhiban), ["2026/11/15"]);
    assert.equal(z.creates.length, 1);
    assert.notEqual(z.newZhiban["2026/11/15"], raw && Object.values(raw).find((f) => f[F.DATE] === "2026/11/14" && f[F.TYPE] === "值班")[F.EMP], "不和前一天同一人");
    const lockedTry = SC.nextPlanZhiban({ year: 2026, month: 11, todayStr, employees, raw, noRest: {}, only: "2026/11/05" });
    assert.ok(lockedTry.error, "今天（含）以前鎖定不補");
    const c = SC.nextPlanFillCleanDay({ year: 2026, month: 11, todayStr, allEmployees, raw, noRest: {} }, "2026/11/16");
    assert.equal(c.toDelete.length, 0);
    assert.ok(c.creates.length > 0 && c.creates.every((x) => x[F.DATE] === "2026/11/16"));
    eq(c.creates.map((x) => x[F.NOTE]).sort(), ["1F", "2F", "3F", "4F"]);
});

test("快照：刪除前的紀錄格式與舊頁相容（含 ragicId、全部欄位）", () => {
    const SC = plainSC();
    const rec = SC.nextParse({ 77: { [F.EMP]: "甲", [F.DATE]: "2026/11/20", [F.TYPE]: "值日", [F.NOTE]: "1F", [F.IS_AUTO]: "Yes", [F.DEPT]: "系統預排" } })[0];
    const s = SC.nextSnapshot("值日", 2026, 11, [{ id: "77", rec }], "2026-10-30T00:00:00.000Z");
    assert.equal(s._meta.recordCount, 1);
    eq(s.records[0], { ragicId: "77", [F.EMP]: "甲", [F.DATE]: "2026/11/20", [F.YEAR]: "2026", [F.MONTH]: "11", [F.TYPE]: "值日", [F.DEPT]: "系統預排", [F.NOTE]: "1F", [F.IS_AUTO]: "Yes" });
});

test("舊頁沒被動到：舊檔不引用新檔的任何東西（新檔只新增）", () => {
    ["schedule-legacy.html", "schedule-view.html", "schedule-common.js", "schedule-duty-v2.js"].forEach((f) => assert.ok(!/NEXT_MARK|nextPlan|nextBuild|schedule-next/.test(read(f)), f));
});

let fail = 0;
for (const t of tests) {
    try { await t.fn(); console.log("✅", t.name); }
    catch (e) { fail++; console.log("❌", t.name, "\n   ", e.message); }
}
console.log(fail ? `\n${fail} 項失敗` : "\n全部通過");
process.exit(fail ? 1 : 0);
