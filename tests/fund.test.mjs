// 公基金帳本邏輯測試（2026-11-06）。執行：node tests/fund.test.mjs
import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = ["schedule-common.js", "schedule-duty-v2.js", "schedule-next-core.js", "schedule-fund-core.js"]
    .map((f) => fs.readFileSync(path.join(root, f), "utf8")).join("\n;\n");
const ctx = { console, Math, Date, Object, Set, Map, Array, String, Number, JSON, parseInt, Promise, setTimeout, Error, RegExp };
vm.createContext(ctx);
vm.runInContext(src + "\n;globalThis.SC = SC;", ctx);
const J = (x) => JSON.parse(JSON.stringify(x));
const SC0 = ctx.SC;
const SC = new Proxy(SC0, { get: (o, k) => (typeof o[k] === "function" ? (...a) => J(o[k](...a)) : o[k]) });

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok -", name); };
const rec = (id, emp, date, type, isAuto, note = "") => ({ id: String(id), emp, date, type, isAuto, note, dept: "" });

// 2026/11/10 二（有垃圾車）、11/11 三（沒垃圾車）、11/12 四
const records = [
    rec(1, "甲", "2026/11/10", "值日", "未掃", "1F"),
    rec(2, "甲", "2026/11/10", "值日", "未掃", "2F"),
    rec(3, "甲", "2026/11/10", "值日", "", "3F"),          // 有掃
    rec(4, "乙", "2026/11/10", "值班", "未倒垃圾"),
    rec(5, "乙", "2026/11/11", "值班", "未值班"),          // 週三沒垃圾車：不收
    rec(6, "丙", "2026/11/12", "值班", "未值班"),          // 有垃圾車又沒到：300
    rec(7, "丙", "2026/10/30", "值日", "未掃", "1F"),      // 11 月以前：不進公基金
    rec(8, "丁", "2026/11/20", "值日", "未掃", "1F"),      // 未來：不算
    rec(9, "丁", "2026/11/12", "值日", "未掃", "全棟垃圾清運"), // 舊式清運紀錄：300
];
const TODAY = "2026/11/15";

t("應收清潔費：只算 11 月起、到今天、樓層 200、有垃圾車那天沒倒 300", () => {
    const c = SC.fundCharges(records, TODAY);
    assert.deepEqual(c.map((x) => [x.id, x.amount]), [["r1", 200], ["r2", 200], ["r4", 300], ["r6", 300], ["r9", 300]]);
    assert.equal(c.find((x) => x.id === "r6").label, "沒到班，沒倒垃圾");
});

const charges = SC.fundCharges(records, TODAY);
const E = (id, o) => Object.assign({ id, d: "2026/11/15", a: 0, p: "", c: [], m: "", n: "", by: "韓珊珊", at: "" }, o);

t("沒有任何紀錄：餘額 0，未收 1300、4 人", () => {
    const s = SC.fundState([], charges);
    assert.equal(s.balance, 0);
    assert.equal(s.unpaidTotal, 1300);
    assert.equal(s.unpaidPeople, 4);
    assert.equal(SC.fundUnpaidOf(s, "甲"), 400);
});

t("現金收款進餘額；代扣在公司撥入前不進餘額，撥入後才進", () => {
    const es = [
        E("e1", { t: "pay", a: 400, p: "甲", c: ["r1", "r2"], m: "cash" }),
        E("e2", { t: "pay", a: 300, p: "乙", c: ["r4"], m: "payroll" }),
    ];
    let s = SC.fundState(es, charges);
    assert.equal(s.balance, 400);
    assert.equal(s.totals.payrollPending, 300);
    assert.equal(s.payrollPending.length, 1);
    assert.equal(SC.fundUnpaidOf(s, "甲"), 0);
    assert.equal(SC.fundUnpaidOf(s, "乙"), 0, "代扣也算繳了，只是錢還沒進公基金");
    s = SC.fundState(es.concat([E("e3", { t: "payin", a: 300, c: ["e2"] })]), charges);
    assert.equal(s.balance, 700);
    assert.equal(s.totals.payrollPending, 0);
});

t("支出扣餘額、沒收據要列出；其他收入加餘額", () => {
    const es = [
        E("e1", { t: "pay", a: 400, p: "甲", c: ["r1", "r2"], m: "cash" }),
        E("e2", { t: "income", a: 500, n: "期初" }),
        E("e3", { t: "spend", a: 350, p: "韓珊珊", n: "雞排", ph: true }),
        E("e4", { t: "spend", a: 100, p: "韓珊珊", n: "飲料" }),
    ];
    const s = SC.fundState(es, charges);
    assert.equal(s.balance, 450);
    assert.deepEqual(s.noReceipt.map((e) => e.id), ["e4"]);
});

t("作廢：被作廢的收款不算，那筆清潔費回到未收", () => {
    const es = [
        E("e1", { t: "pay", a: 400, p: "甲", c: ["r1", "r2"], m: "cash" }),
        E("e2", { t: "void", v: "e1", n: "記錯人" }),
    ];
    const s = SC.fundState(es, charges);
    assert.equal(s.balance, 0);
    assert.equal(SC.fundUnpaidOf(s, "甲"), 400);
    assert.ok(s.voided.e1);
    assert.equal(s.live.length, 0);
});

t("對帳：同一筆收兩次、收了但標記已改掉，都要列出", () => {
    const es = [
        E("e1", { t: "pay", a: 200, p: "甲", c: ["r1"], m: "cash" }),
        E("e2", { t: "pay", a: 200, p: "甲", c: ["r1"], m: "cash" }),
        E("e3", { t: "pay", a: 200, p: "丙", c: ["r7"], m: "cash" }), // r7 是 10 月的，不在應收
    ];
    const s = SC.fundState(es, charges);
    assert.deepEqual(s.doublePaid, ["r1"]);
    assert.equal(s.notOwed.length, 1);
    assert.deepEqual(s.notOwed[0].ids, ["r7"]);
});

t("點錢對帳：差額＝實際－當時帳上，並算之後又記了幾筆", () => {
    const es = [
        E("e1", { t: "pay", a: 400, p: "甲", c: ["r1", "r2"], m: "cash" }),
        E("e2", { t: "count", a: 350, book: 400 }),
        E("e3", { t: "spend", a: 100, n: "飲料", ph: true }),
    ];
    const s = SC.fundState(es, charges);
    assert.equal(s.lastCount.diff, -50);
    assert.equal(s.lastCount.since, 1);
    assert.equal(s.balance, 300, "點錢不改帳上金額");
});

t("點錢之後作廢一筆，也要算成「之後又記了」", () => {
    const es = [
        E("e1", { t: "pay", a: 400, p: "甲", c: ["r1", "r2"], m: "cash" }),
        E("e2", { t: "count", a: 400, book: 400 }),
        E("e3", { t: "void", v: "e1", n: "記錯" }),
    ];
    assert.equal(SC.fundState(es, charges).lastCount.since, 1);
});

t("同仁拿到的帳本（別人收款沒姓名）餘額跟完整帳本一樣", () => {
    const full = [
        E("e1", { t: "pay", a: 400, p: "甲", c: ["r1", "r2"], m: "cash" }),
        E("e2", { t: "pay", a: 300, p: "乙", c: ["r4"], m: "cash" }),
        E("e3", { t: "spend", a: 100, n: "飲料", ph: true }),
    ];
    const anon = full.map((e) => (e.t === "pay" && e.p !== "甲" ? Object.assign({}, e, { p: "", c: [] }) : e));
    assert.equal(SC.fundState(anon, charges).balance, SC.fundState(full, charges).balance);
    assert.equal(SC.fundState(anon, charges).notOwed.length, 0, "匿名的收款沒有清潔費編號，不可誤報成多收");
});

t("代扣只限承攬", () => {
    assert.equal(SC.fundCanPayroll({ hire: "承攬" }), true);
    assert.equal(SC.fundCanPayroll({ hire: "兼職" }), false);
    assert.equal(SC.fundCanPayroll({ hire: "正職" }), false);
    assert.equal(SC.fundCanPayroll(null), false);
});

t("CSV 有表頭、逗號會加引號", () => {
    const csv = SC.fundCSV([E("e1", { t: "spend", a: 100, n: "雞排, 飲料", ph: true })]);
    assert.ok(csv.startsWith("﻿紀錄編號,"));
    assert.ok(csv.includes('"雞排, 飲料"'));
});

console.log(`\n${n} 項全過`);
