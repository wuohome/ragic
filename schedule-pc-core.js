/**
 * 窩的家排班表 — 人事異動預約（純函式，不碰 Ragic / DOM）
 * 依賴 schedule-common.js、schedule-next-core.js（須先載入）。規則見 排班表_規格書.md § 人事異動預約。
 *
 * 珊珊、瓊安事先登記「誰、哪天起、變成什麼」，存在 Worker（schedule:pc:<id>）。
 * 生效日 07:30 由 Mac 的 schedule-guard 寫進 Ragic 人事資料（套用規則與 SC.pcApplyFields 相同，那邊另有一份）。
 * 預排時還沒套用的預約照生效日分段：生效日前用舊身分、生效日起用新身分。
 */

SC.PC_KINDS = ["轉正職", "轉兼職", "轉承攬", "留職停薪", "復職", "離職", "新報到"];
SC.PC_HIRE_OF = { 轉正職: "正職", 轉兼職: "兼職", 轉承攬: "承攬" };
// 新報到要另外選聘雇類別
SC.PC_NEW_HIRES = ["正職", "兼職", "承攬"];

SC._pcPrevDay = (dsStr) => {
    const [y, m, d] = dsStr.split("/").map(Number);
    const t = new Date(y, m - 1, d - 1);
    return SC.fmtDate(t.getFullYear(), t.getMonth() + 1, t.getDate());
};

// 一筆預約套到人事資料欄位上（naming=EID 的欄位物件），回傳新物件
SC.pcApplyFields = (f, c) => {
    const E = SC.F_EMP;
    const out = { ...f };
    if (SC.PC_HIRE_OF[c.kind]) out[E.HIRE] = SC.PC_HIRE_OF[c.kind];
    else if (c.kind === "留職停薪") out[E.STATUS] = "留職停薪";
    else if (c.kind === "復職") out[E.STATUS] = "在職";
    else if (c.kind === "離職") { out[E.STATUS] = "離職"; out[SC.PC_F_TERMINATION] = SC._pcPrevDay(c.effective); }
    else if (c.kind === "新報到") {
        out[E.STATUS] = "在職";
        if (c.hire) out[E.HIRE] = c.hire;
        if (!f[E.HIRE_DATE]) out[E.HIRE_DATE] = c.effective;
    }
    return out;
};
// 離職日期（listEmployees 白名單沒有這欄，只有套用時寫入用）
SC.PC_F_TERMINATION = "3000944";

SC.pcPending = (changes) => (changes || []).filter((c) => c && !c.appliedAt && c.rid && c.effective && SC.PC_KINDS.includes(c.kind));

// 生效日 <= uptoDs 的待套用預約都套上後的人事資料
SC.pcProjectEmpJson = (empJson, changes, uptoDs) => {
    const out = { ...(empJson || {}) };
    SC.pcPending(changes)
        .filter((c) => out[c.rid] && SC._cmpDateStr(c.effective, uptoDs) <= 0)
        .sort((a, b) => SC._cmpDateStr(a.effective, b.effective))
        .forEach((c) => { out[c.rid] = SC.pcApplyFields(out[c.rid], c); });
    return out;
};

const _pcUnion = (lists) => {
    // 同一個人以最後一段（最新身分）有出現的那份為準；順序照第一次出現
    const order = [];
    const pick = {};
    lists.forEach((list) => list.forEach((e) => { if (!(e.name in pick)) order.push(e.name); pick[e.name] = e; }));
    return order.map((n) => pick[n]);
};

/**
 * 預排用的人員與「這天不能排」：
 *   回傳 { allEmployees, dutyBlocked, zhibanEligible, zhibanBlocked, notes }
 *   allEmployees  值日人員池（各段聯集）；dutyBlocked {ds:Set(name)} 這天的身分不在值日池
 *   zhibanEligible 值班候選（各段聯集）；zhibanBlocked {ds:Set(name)} 這天的身分不能值班
 *   notes [{name, effective, kind, hire, text}] 這個月要列給珊珊看的預約（含生效日已過但還沒套用的）
 * 沒有預約時結果與 nextBuildEmployees／nextZhibanEligible 完全相同、blocked 為空。
 */
SC.pcMonthPlan = (empJson, changes, year, month, poolNames) => {
    const dim = new Date(year, month, 0).getDate();
    const first = SC.fmtDate(year, month, 1);
    const last = SC.fmtDate(year, month, dim);
    const pending = SC.pcPending(changes).filter((c) => empJson && empJson[c.rid]);
    const cuts = [...new Set(pending.map((c) => c.effective).filter((e) => SC._cmpDateStr(e, first) > 0 && SC._cmpDateStr(e, last) <= 0))]
        .sort(SC._cmpDateStr);
    // 第 0 段：月初那天的身分；之後每個生效日開一段
    const segs = [first, ...cuts].map((from) => {
        const b = SC.nextBuildEmployees(SC.pcProjectEmpJson(empJson, pending, from), year, month);
        return { from, all: b.allEmployees, zb: SC.nextZhibanEligible(b.employees, year, month, poolNames) };
    });
    const segOf = (dsStr) => { let s = segs[0]; segs.forEach((x) => { if (SC._cmpDateStr(x.from, dsStr) <= 0) s = x; }); return s; };
    const allEmployees = _pcUnion(segs.map((s) => s.all));
    const zhibanEligible = _pcUnion(segs.map((s) => s.zb));
    const dutyBlocked = {};
    const zhibanBlocked = {};
    if (segs.length > 1) {
        for (let d = 1; d <= dim; d++) {
            const dsStr = SC.fmtDate(year, month, d);
            const s = segOf(dsStr);
            const inAll = new Set(s.all.map((e) => e.name));
            const inZb = new Set(s.zb.map((e) => e.name));
            allEmployees.forEach((e) => { if (!inAll.has(e.name)) (dutyBlocked[dsStr] ||= new Set()).add(e.name); });
            zhibanEligible.forEach((e) => { if (!inZb.has(e.name)) (zhibanBlocked[dsStr] ||= new Set()).add(e.name); });
        }
    }
    const notes = pending
        .filter((c) => SC._cmpDateStr(c.effective, last) <= 0)
        .sort((a, b) => SC._cmpDateStr(a.effective, b.effective))
        .map((c) => {
            const name = c.name || (empJson[c.rid] || {})[SC.F_EMP.NAME] || "";
            const what = c.kind === "新報到" ? `新報到（${c.hire || "聘雇類別未填"}）` : c.kind;
            const late = SC._cmpDateStr(c.effective, first) <= 0 ? "（生效日已到、人事資料還沒改好）" : "";
            return { name, effective: c.effective, kind: c.kind, hire: c.hire || "", text: `${name}　${c.effective.slice(5)} 起${what}${late}` };
        });
    return { allEmployees, dutyBlocked, zhibanEligible, zhibanBlocked, notes };
};
