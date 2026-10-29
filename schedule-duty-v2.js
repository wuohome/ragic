/**
 * 窩的家排班表 — 2026/11 起新制「一鍵預排值日生」排班演算法（純函式，不碰 Ragic / DOM，方便測試與離線試排）
 * 依賴 schedule-common.js（須先載入）。規則見 排班表_規格書.md § 2026-11 新制打掃。
 *
 *  1. 每天打掃整棟 1F–4F。業務、兼職：一個人一天掃整棟（寫 4 筆同人不同樓層的紀錄）。
 *  2. 內勤五人兩人一組：一人 1F+4F、另一人 2F+3F，搭檔與兩層分配每次輪替。內勤六日/國定假日不排。
 *  3. 兼職每月一次，優先排六日（SC.PARTTIME_DUTY_FIRST_DATE 以前不排）；六日不夠的排平日。排除名單 SC.PARTTIME_DUTY_EXCLUDE。
 *  4. 值班與打掃脫鉤；倒垃圾歸值班的人，所以這裡完全不產生清運紀錄。
 *  5. 次數平均：業務每人約 1 次；剩下的平日給內勤組，五人次數盡量平均。同一人不連續兩天。
 *  6. 今天以前（含今天）鎖定、手動紀錄不覆蓋（由呼叫端傳進 fixedByDate，這裡只補空缺）。
 */

SC.dutyV2Kind = (emp) =>
    emp.hire === "兼職" ? "parttime" : (SC.OFFICE_DUTY_NAMES.includes(emp.name) ? "office" : "biz");

/**
 * 上月每人「打掃天數」（同人同日多筆算一天；未掃不計；舊制的清運算一次）。
 * 新制一人一天 4 筆，不能直接數筆數。
 */
SC.dutyV2PrevDayCounts = (records, prevYear, prevMonth) => {
    const seen = new Set();
    const out = {};
    Object.entries(records)
        .filter(([k, v]) => v && typeof v === "object" && !k.startsWith("_"))
        .forEach(([, f]) => {
            if ((f[SC.F_LEAVE.TYPE] || "") !== "值日") return;
            if ((f[SC.F_LEAVE.IS_AUTO] || "") === "未掃") return;
            const date = f[SC.F_LEAVE.DATE] || "";
            const emp = f[SC.F_LEAVE.EMP] || "";
            const p = date.split("/").map(Number);
            if (!date || !emp || p[0] !== prevYear || p[1] !== prevMonth) return;
            const key = emp + "|" + date;
            if (seen.has(key)) return;
            seen.add(key);
            out[emp] = (out[emp] || 0) + 1;
        });
    return out;
};

/**
 * @param {Object} o
 * @param {number} o.year, o.month
 * @param {string} o.todayStr          今天 YYYY/MM/DD（<= 今天的日子鎖定不排）
 * @param {Array}  o.people            [{name, hire, useAvg}]  值日人員池（含兼職；useAvg=新人/長假者，上月次數比照平均）
 * @param {Object} o.offByDate         {dateStr: Set(name)} 當天不可排（排休/特休/請假/見紅休/生日…）
 * @param {Object} o.zhibanByDate      {dateStr: name} 值班（只用來「盡量不要同一人當天值班又打掃」）
 * @param {Object} o.noRest            {dateStr: ...} 禁休日（全員打掃，不排）
 * @param {Object} o.fixedByDate       {dateStr: [{empName, floor}]} 已存在、不能動的值日（今天以前鎖定 + 手動）
 * @param {Object} o.prevDayCounts     上月每人打掃天數（SC.dutyV2PrevDayCounts）
 * @param {Function} [o.rand]          亂數（測試可傳固定種子）
 * @returns {{duties:Object, dayKinds:Object, counts:Object, warnings:string[]}}
 */
SC.planDutyV2 = (o) => {
    const { year, month, todayStr } = o;
    // 排除名單的兼職一律不排（即使呼叫端沒先濾掉；辦完離職後從 SC.PARTTIME_DUTY_EXCLUDE 移除即可）
    const people = o.people.filter(p => !(p.hire === "兼職" && SC.PARTTIME_DUTY_EXCLUDE.includes(p.name)));
    const offByDate = o.offByDate || {};
    const zhibanByDate = o.zhibanByDate || {};
    const noRest = o.noRest || {};
    const fixedByDate = o.fixedByDate || {};
    const prevDayCounts = o.prevDayCounts || {};
    const rand = o.rand || Math.random;
    const ALL = SC.FLOORS.slice();
    const warnings = [];

    const dim = new Date(year, month, 0).getDate();
    const dsOf = (d) => SC.fmtDate(year, month, d);
    const dowOf = (d) => new Date(year, month - 1, d).getDay();
    const shuffle = (arr) => arr.map(x => [rand(), x]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
    const isOff = (name, ds) => !!(offByDate[ds] && offByDate[ds].has(name));

    const kindOf = {};
    people.forEach(p => { kindOf[p.name] = SC.dutyV2Kind(p); });
    const ofKind = (k) => people.filter(p => kindOf[p.name] === k);

    // ── 已存在（鎖定/手動）的值日：這個月每人已掃幾天、每天誰佔了哪層 ──
    const assignedOn = {}; // ds -> Set(name)（含已存在 + 這次新排，用來擋「連續兩天」）
    const doneDays = {};   // name -> 本月已掃天數
    Object.entries(fixedByDate).forEach(([ds, arr]) => {
        (arr || []).forEach(({ empName }) => {
            if (!empName) return;
            (assignedOn[ds] ||= new Set()).add(empName);
        });
    });
    Object.values(assignedOn).forEach(set => set.forEach(n => { doneDays[n] = (doneDays[n] || 0) + 1; }));
    const done = (n) => doneDays[n] || 0;
    const adjacent = (name, d) => [d - 1, d + 1].some(x => x >= 1 && x <= dim && assignedOn[dsOf(x)] && assignedOn[dsOf(x)].has(name));
    const place = (ds, name) => { (assignedOn[ds] ||= new Set()).add(name); };

    // ── 要排的日子：未鎖定、非禁休、還有空樓層 ──
    const planDays = [];
    for (let d = 1; d <= dim; d++) {
        const ds = dsOf(d);
        if (noRest[ds]) continue;
        if (SC.isDutyLocked(ds, todayStr)) continue;
        const fixed = fixedByDate[ds] || [];
        const taken = new Set(fixed.map(x => x.floor).filter(Boolean));
        const remaining = ALL.filter(f => !taken.has(f));
        if (remaining.length === 0) continue;
        const dow = dowOf(d);
        planDays.push({
            d, ds, dow, remaining,
            partial: fixed.length > 0,                              // 當天已有手動排的人：只補空樓層，整包給一位業務
            weekend: dow === 0 || dow === 6,
            officeOk: dow >= 1 && dow <= 5 && !SC.isGovHoliday(ds, false), // 內勤只排平日，國定假日不排
        });
    }

    const result = {};   // ds -> [{empName, floor}]
    const dayKinds = {}; // ds -> "parttime" | "office" | "biz"
    const used = new Set(); // 已被分配的 ds
    const give = (x, name, kind, floors) => {
        (result[x.ds] ||= []).push(...floors.map(f => ({ empName: name, floor: f })));
        dayKinds[x.ds] = kind;
        used.add(x.ds);
        place(x.ds, name);
    };

    // ── 上月基準：新人/長假者比照同組平均；補差最多帶 ±SC.DUTY_CARRY_CAP ──
    const carry = {};
    ["biz", "office", "parttime"].forEach(k => {
        const grp = ofKind(k);
        const base = grp.filter(p => !p.useAvg);
        const avg = base.length ? base.reduce((s, p) => s + (prevDayCounts[p.name] || 0), 0) / base.length : 0;
        grp.forEach(p => {
            const prev = p.useAvg ? avg : (prevDayCounts[p.name] || 0);
            carry[p.name] = Math.max(-SC.DUTY_CARRY_CAP, Math.min(SC.DUTY_CARRY_CAP, prev - avg));
        });
    });
    const CARRY_W = 0.4; // 上月多掃的人這個月略後排；權重 < 1，只在本月次數打平時才決勝負

    // ── Kuhn 配對（人 → 日子，每人最多一天、每天最多一人），盡量讓每個人都有日子 ──
    const matchOnce = (persons, days, feasible) => {
        const owner = {};  // ds -> name
        const tryPerson = (p, seen) => {
            for (const x of days) {
                if (seen.has(x.ds) || !feasible(p, x)) continue;
                seen.add(x.ds);
                if (!owner[x.ds] || tryPerson(persons.find(q => q.name === owner[x.ds]), seen)) {
                    owner[x.ds] = p.name;
                    return true;
                }
            }
            return false;
        };
        persons.forEach(p => tryPerson(p, new Set()));
        return owner;
    };

    // ══ 1. 兼職：每人一次，優先六日 ══
    const firstOk = (x) => SC._cmpDateStr(x.ds, SC.PARTTIME_DUTY_FIRST_DATE) >= 0;
    const parttimers = shuffle(ofKind("parttime").filter(p => done(p.name) === 0));
    if (parttimers.length) {
        const ptFeasible = (p, x) => !x.partial && firstOk(x) && !isOff(p.name, x.ds);
        const wkDays = shuffle(planDays.filter(x => x.weekend));
        const owner = matchOnce(parttimers, wkDays, ptFeasible);
        const placed = new Set();
        wkDays.forEach(x => { if (owner[x.ds]) { give(x, owner[x.ds], "parttime", ALL); placed.add(owner[x.ds]); } });
        // 六日不夠 → 剩下的兼職排平日（盡量平均散開，同天只一人）
        const rest = parttimers.filter(p => !placed.has(p.name));
        const wdDays = planDays.filter(x => !x.weekend && !used.has(x.ds));
        rest.forEach(p => {
            const cand = wdDays.filter(x => !used.has(x.ds) && ptFeasible(p, x));
            if (!cand.length) { warnings.push(`兼職 ${p.name} 找不到可排的日子`); return; }
            // 離已排的兼職日越遠越好（散開）
            const usedD = planDays.filter(x => used.has(x.ds)).map(x => x.d);
            const dist = (x) => usedD.length ? Math.min(...usedD.map(u => Math.abs(u - x.d))) : 99;
            const best = Math.max(...cand.map(dist));
            const pick = shuffle(cand.filter(x => dist(x) === best))[0];
            give(pick, p.name, "parttime", ALL);
        });
    }

    // ══ 2. 決定哪幾天是內勤組、哪幾天是業務 ══
    const bizPeople = ofKind("biz");
    const officePeople = ofKind("office");
    const open = planDays.filter(x => !used.has(x.ds));
    const partialDays = open.filter(x => x.partial);
    const fullOpen = open.filter(x => !x.partial);
    const officeEligible = fullOpen.filter(x => x.officeOk);
    const bizNeed = bizPeople.reduce((s, p) => s + Math.max(0, 1 - done(p.name)), 0);
    let K = Math.max(0, Math.min(fullOpen.length - bizNeed, officeEligible.length));
    if (officePeople.length < 2) K = 0;
    const officeDays = [];
    for (let i = 0; i < K; i++) officeDays.push(officeEligible[Math.floor((i + 0.5) * officeEligible.length / K)]);

    // ══ 3. 內勤組：逐日挑兩人，次數平均、搭檔輪替 ══
    const cnt = {}; officePeople.forEach(p => { cnt[p.name] = done(p.name); });
    const typeCnt = {}; officePeople.forEach(p => { typeCnt[p.name] = { A: 0, B: 0 }; });
    Object.entries(fixedByDate).forEach(([, arr]) => (arr || []).forEach(({ empName, floor }) => {
        if (!typeCnt[empName] || !floor) return;
        if (SC.OFFICE_DUTY_SPLIT.A.includes(floor)) typeCnt[empName].A += 0.5;
        if (SC.OFFICE_DUTY_SPLIT.B.includes(floor)) typeCnt[empName].B += 0.5;
    }));
    const pairCnt = {};
    const pk = (a, b) => [a, b].sort().join("|");
    const fallbackBiz = [];
    const officeLog = []; // 先記下每天的兩人，全部排完後再微調 A/B 分法並寫入
    officeDays.forEach(x => {
        const feas = (relax) => officePeople.filter(p => !isOff(p.name, x.ds) && (relax || !adjacent(p.name, x.d)));
        let pool = feas(false);
        if (pool.length < 2) pool = feas(true);
        if (pool.length < 2) { fallbackBiz.push(x); return; }
        const sc = (n) => cnt[n] + CARRY_W * carry[n];
        let best = null;
        for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) {
            const a = pool[i].name, b = pool[j].name;
            const s = sc(a) + sc(b) + 0.3 * (pairCnt[pk(a, b)] || 0) + rand() * 0.01;
            if (!best || s < best.s) best = { a, b, s };
        }
        const { a, b } = best;
        place(x.ds, a); place(x.ds, b); used.add(x.ds); dayKinds[x.ds] = "office";
        [a, b].forEach(n => { cnt[n]++; });
        pairCnt[pk(a, b)] = (pairCnt[pk(a, b)] || 0) + 1;
        officeLog.push({ x, fa: a, fb: b }); // fa 先暫定掃 1F+4F，下面再微調
    });
    // 兩層分法輪替：反覆嘗試把某天的 A/B 對調，只要「每人 A 組與 B 組次數的落差總和」變小就換
    const imbalance = () => officePeople.reduce((s, p) => s + Math.abs(typeCnt[p.name].A - typeCnt[p.name].B), 0);
    officeLog.forEach(({ fa, fb }) => { typeCnt[fa].A++; typeCnt[fb].B++; });
    for (let pass = 0; pass < 10; pass++) {
        let improved = false;
        for (const e of shuffle(officeLog)) {
            const before = imbalance();
            typeCnt[e.fa].A--; typeCnt[e.fb].B--; typeCnt[e.fb].A++; typeCnt[e.fa].B++;
            if (imbalance() < before) { [e.fa, e.fb] = [e.fb, e.fa]; improved = true; }
            else { typeCnt[e.fb].A--; typeCnt[e.fa].B--; typeCnt[e.fa].A++; typeCnt[e.fb].B++; }
        }
        if (!improved) break;
    }
    officeLog.forEach(({ x, fa, fb }) => {
        (result[x.ds] ||= []).push(...SC.OFFICE_DUTY_SPLIT.A.map(f => ({ empName: fa, floor: f })),
            ...SC.OFFICE_DUTY_SPLIT.B.map(f => ({ empName: fb, floor: f })));
    });

    // ══ 4. 業務：每人整棟一次，其餘（含手動補空樓層的日子）依次數少者補 ══
    const bizDays = [...fullOpen.filter(x => !used.has(x.ds)), ...partialDays];
    const zhibanOf = (ds) => zhibanByDate[ds] || "";
    const bizFeasible = (p, x) => !isOff(p.name, x.ds) && !adjacent(p.name, x.d);
    const needers = bizPeople.filter(p => done(p.name) === 0)
        .sort((a, b) => (carry[a.name] - carry[b.name]) || (rand() - 0.5));
    // 值班的人當天已留晚，盡量不再叫他掃整棟（配對時擋掉，配不到才放寬）
    const orderedDays = shuffle(bizDays.filter(x => !x.partial));
    const ownerBiz = matchOnce(needers, orderedDays, (p, x) => bizFeasible(p, x) && zhibanOf(x.ds) !== p.name);
    // 值班撞日而配不到的人，放寬值班限制再配一輪（剩下的日子）
    const matchedNames = new Set(Object.values(ownerBiz));
    const left = needers.filter(p => !matchedNames.has(p.name));
    if (left.length) {
        const free = orderedDays.filter(x => !ownerBiz[x.ds]);
        const o2 = matchOnce(left, free, bizFeasible);
        Object.assign(ownerBiz, o2);
    }
    orderedDays.forEach(x => { if (ownerBiz[x.ds]) give(x, ownerBiz[x.ds], "biz", x.remaining); });

    // 還沒人的日子（業務比日子少、或有人配不到）→ 逐日挑本月次數少者
    const bizCnt = {}; bizPeople.forEach(p => { bizCnt[p.name] = done(p.name) + (Object.values(ownerBiz).includes(p.name) ? 1 : 0); });
    [...bizDays, ...fallbackBiz].filter(x => !used.has(x.ds)).sort((a, b) => a.d - b.d).forEach(x => {
        const pick = (relax) => bizPeople
            .filter(p => !isOff(p.name, x.ds) && !(assignedOn[x.ds] && assignedOn[x.ds].has(p.name)) && (relax || !adjacent(p.name, x.d))) // 當天手動排過的人不再重複排
            .map(p => ({ n: p.name, s: bizCnt[p.name] + CARRY_W * carry[p.name] + (zhibanOf(x.ds) === p.name ? 0.2 : 0) + rand() * 0.01 }))
            .sort((a, b) => a.s - b.s)[0];
        const c = pick(false) || pick(true);
        if (!c) { warnings.push(`${x.ds} 沒有人可以排整棟打掃`); return; }
        bizCnt[c.n]++;
        give(x, c.n, "biz", x.remaining);
    });
    const unmet = needers.filter(p => !Object.values(result).some(arr => arr.some(a => a.empName === p.name)));
    unmet.forEach(p => warnings.push(`業務 ${p.name} 這個月沒有排到（可排的日子都被占走或請假）`));

    // ── 統計：每人本月（新排）天數 ──
    const counts = {};
    Object.entries(result).forEach(([ds, arr]) => {
        new Set(arr.map(a => a.empName)).forEach(n => {
            const k = kindOf[n];
            (counts[n] ||= { kind: k, days: 0, floors: 0 }).days++;
        });
        arr.forEach(a => { counts[a.empName].floors++; });
    });
    return { duties: result, dayKinds, counts, warnings };
};
