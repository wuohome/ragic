/**
 * 窩的家排班表「公基金」— 純邏輯，不碰 DOM、不連網路，方便測試。依賴 schedule-common.js、schedule-next-core.js。
 *
 * 清潔費（沒掃、沒倒垃圾）2026/11 起放進同仁公基金，不進公司帳戶（瓊安與小吳哥 2026-10-30／11-06）。
 * 公基金要能記帳：收清潔費、其他收入、花錢請客（雞排、飲料），隨時算得出餘額。
 *
 * 對帳的三方：
 *  ① 應收：從排班紀錄自動算（每筆「未掃」樓層 200、有垃圾車那天的值班沒倒垃圾或沒到班 300），沒有人手打金額。
 *  ② 已收：珊珊收到錢時勾「這幾筆清潔費」記一筆收款；同一筆清潔費不能收兩次。
 *  ③ 實際：珊珊定期點一次手上公基金的錢，跟帳上應有的金額比，差多少一眼看出。
 * 另外兩個破口：
 *  - 從報酬代扣（只限承攬、要本人同意）：錢其實還在公司，要等公司撥進公基金才算真的收到 → 列「代扣待撥入」。
 *  - 收過錢之後排班標記被改掉（例如誤標未掃）→ 列「收了但已不算欠款」，要退錢或轉成樂捐。
 *
 * 帳本只能新增、不能改刪：記錯就記一筆「作廢」指向原紀錄，原紀錄保留（Worker 端也是這樣存）。
 * 帳本紀錄格式（Worker 回傳）：
 *   { id, t, d, a, p, c, m, n, v, book, ph, by, at }
 *   t：pay 收清潔費｜payin 公司撥入代扣款｜income 其他收入｜spend 支出｜count 點錢對帳｜void 作廢
 *   d：日期 YYYY/MM/DD；a：金額（整數，count 是點到的實際金額）；p：誰（pay 是繳款人，spend 是經手人）
 *   c：pay 的清潔費編號陣列、payin 的代扣收款紀錄 id 陣列；m：pay 的方式 cash｜transfer｜payroll
 *   n：說明；v：void 指向的紀錄 id；book：count 當下的帳上金額；ph：有收據照片；by／at：誰在什麼時候記的（Worker 填）
 * 同仁（非珊珊、瓊安）拿到的帳本，別人的收款會被 Worker 拿掉姓名與清潔費編號（p:"", c:[]），金額照算，餘額一樣。
 */

SC.FUND_START = "2026/11/01";   // 這天以前的清潔費不進公基金（8～10 月已收的不退、也不轉，瓊安 2026-10-30）
SC.FUND_METHOD_LABEL = Object.freeze({ cash: "現金", transfer: "轉帳", payroll: "從報酬代扣" });
SC.FUND_TYPE_LABEL = Object.freeze({ pay: "收清潔費", payin: "公司撥入代扣款", income: "其他收入", spend: "支出", count: "點錢對帳", void: "作廢" });

// 從報酬代扣只限承攬：內勤、兼職是勞工，從工資扣有勞基法第 22、26 條風險，只能本人自己繳（打掃二選一新制草案）
SC.fundCanPayroll = (emp) => !!(emp && emp.hire === "承攬");

/**
 * 從排班紀錄算出應收的清潔費。
 * @param records SC.nextParse 的結果（可跨多個月）
 * @param todayStr YYYY/MM/DD，未來的日子不算
 * @returns [{ id, rec, emp, date, kind:'clean'|'trash', label, amount }]，依日期排序
 */
SC.fundCharges = (records, todayStr) => {
    const out = [];
    const MK = SC.NEXT_MARK;
    (records || []).forEach((r) => {
        if (!r || !r.emp || !r.date) return;
        if (SC._cmpDateStr(r.date, SC.FUND_START) < 0 || SC._cmpDateStr(r.date, todayStr) > 0) return;
        const [y, m, d] = r.date.split("/").map(Number);
        if (r.type === "值日" && r.isAuto === MK.MISSED_CLEAN) {
            if (SC.isTrashDuty(r.note)) {
                out.push({ id: "r" + r.id, rec: r.id, emp: r.emp, date: r.date, kind: "trash", label: "沒倒垃圾", amount: SC.CLEANING_FEE.TRASH_DUTY });
            } else if (/^[1-4]F$/.test(r.note)) {
                out.push({ id: "r" + r.id, rec: r.id, emp: r.emp, date: r.date, kind: "clean", label: r.note + " 沒掃", amount: SC.CLEANING_FEE.FLOOR_DUTY });
            }
            return;
        }
        if (r.type === "值班" && (r.isAuto === MK.NO_TRASH || r.isAuto === MK.NO_SHOW) && SC.isTrashCollectionDay(y, m, d)) {
            out.push({ id: "r" + r.id, rec: r.id, emp: r.emp, date: r.date, kind: "trash", label: r.isAuto === MK.NO_SHOW ? "沒到班，沒倒垃圾" : "沒倒垃圾", amount: SC.CLEANING_FEE.TRASH_DUTY });
        }
    });
    out.sort((a, b) => SC._cmpDateStr(a.date, b.date) || (a.rec < b.rec ? -1 : 1));
    return out;
};

/**
 * 整理帳本。
 * @param entries Worker 回傳的帳本紀錄
 * @param charges SC.fundCharges 的結果
 * @returns {
 *   live: 沒被作廢的紀錄（不含 void），新到舊
 *   voided: { 被作廢的 id: 作廢那筆 }
 *   balance: 帳上應有的錢（現金＋轉帳收款＋撥入＋其他收入－支出；代扣在撥入前不算）
 *   totals: { fee, payin, income, spend, payrollPending }
 *   people: { 姓名: { owed, paid, unpaid:[charge], paidItems:[{charge, pay}] } }
 *   unpaidTotal, unpaidPeople
 *   payrollPending: [pay]   代扣但公司還沒撥入
 *   doublePaid: [chargeId]  同一筆清潔費出現在兩筆收款
 *   notOwed: [{ pay, ids }] 收了錢但那筆清潔費已不在應收（標記被改掉或紀錄被刪）
 *   lastCount: { entry, diff, since }  最近一次點錢；diff＝實際－當時帳上；since＝之後又記了幾筆
 *   noReceipt: [spend]      沒附收據的支出
 * }
 */
SC.fundState = (entries, charges) => {
    const all = (entries || []).slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const voided = {};
    all.forEach((e) => { if (e.t === "void" && e.v) voided[e.v] = e; });
    const live = all.filter((e) => e.t !== "void" && !voided[e.id]);

    const chargeById = {};
    (charges || []).forEach((c) => { chargeById[c.id] = c; });

    const totals = { fee: 0, payin: 0, income: 0, spend: 0, payrollPending: 0 };
    const paidBy = {};
    const doublePaid = [];
    const notOwed = [];
    const coveredPay = {};
    live.forEach((e) => { if (e.t === "payin") (e.c || []).forEach((id) => { coveredPay[id] = e; }); });
    const payrollPending = [];
    let balance = 0;
    let lastCount = null;
    const noReceipt = [];

    live.forEach((e) => {
        const a = Number(e.a) || 0;
        if (e.t === "pay") {
            if (e.m === "payroll") {
                if (!coveredPay[e.id]) { payrollPending.push(e); totals.payrollPending += a; }
            } else { balance += a; }
            totals.fee += a;
            const gone = [];
            (e.c || []).forEach((id) => {
                if (paidBy[id]) doublePaid.push(id); else paidBy[id] = e;
                if (!chargeById[id]) gone.push(id);
            });
            if (gone.length) notOwed.push({ pay: e, ids: gone });
        } else if (e.t === "payin") { balance += a; totals.payin += a; }
        else if (e.t === "income") { balance += a; totals.income += a; }
        else if (e.t === "spend") { balance -= a; totals.spend += a; if (!e.ph) noReceipt.push(e); }
        else if (e.t === "count") { lastCount = e; }
    });

    const people = {};
    const P = (n) => people[n] || (people[n] = { owed: 0, paid: 0, unpaid: [], paidItems: [] });
    (charges || []).forEach((c) => {
        const p = P(c.emp);
        p.owed += c.amount;
        if (paidBy[c.id]) { p.paid += c.amount; p.paidItems.push({ charge: c, pay: paidBy[c.id] }); }
        else p.unpaid.push(c);
    });
    let unpaidTotal = 0, unpaidPeople = 0;
    Object.keys(people).forEach((n) => {
        const u = people[n].unpaid.reduce((s, c) => s + c.amount, 0);
        if (u) { unpaidTotal += u; unpaidPeople++; }
    });

    let countInfo = null;
    if (lastCount) {
        const since = all.filter((e) => e.id > lastCount.id && e.t !== "count").length; // 作廢也會改餘額，要算進去
        countInfo = { entry: lastCount, diff: (Number(lastCount.a) || 0) - (Number(lastCount.book) || 0), since };
    }

    return {
        live: live.slice().reverse(), voided, balance, totals, people, unpaidTotal, unpaidPeople,
        payrollPending, doublePaid, notOwed, lastCount: countInfo, noReceipt,
    };
};

/** 某人還沒繳的清潔費總額 */
SC.fundUnpaidOf = (state, name) => ((state.people[name] || { unpaid: [] }).unpaid).reduce((s, c) => s + c.amount, 0);

/** 帳本轉 CSV（給會計或備份）。nameOf(id) 可把作廢指向的紀錄轉成可讀文字 */
SC.fundCSV = (entries) => {
    const q = (v) => { const s = String(v == null ? "" : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const head = ["紀錄編號", "日期", "類型", "金額", "人", "方式", "清潔費編號／對應紀錄", "說明", "點錢時帳上金額", "收據", "作廢哪一筆", "記錄人", "記錄時間"];
    const rows = (entries || []).slice().sort((a, b) => (a.id < b.id ? -1 : 1)).map((e) => [
        e.id, e.d, SC.FUND_TYPE_LABEL[e.t] || e.t, e.a, e.p, SC.FUND_METHOD_LABEL[e.m] || "", (e.c || []).join(" "), e.n,
        e.t === "count" ? e.book : "", e.ph ? "有" : "", e.v || "", e.by, e.at,
    ].map(q).join(","));
    return "﻿" + head.join(",") + "\n" + rows.join("\n") + "\n";
};

