/**
 * 窩的家排班表（新版 schedule-next.html）— 純邏輯，不碰 DOM、不連網路，方便測試。
 * 依賴 schedule-common.js、schedule-duty-v2.js（須先載入）。
 *
 * 這支檔只「新增」，不改舊檔、不重寫規則：
 *  - 預排值日呼叫 SC.planDutyV2，預排值班用 SC.zhibanCompare，鎖定用 SC.isDutyLocked，
 *    資料前處理（分類刪除／保留、新人比照平均、到職日、禁休）逐段對照 schedule.html 的 handleAutoSchedule／handleAutoZhiban，
 *    tests/schedule-next.test.mjs 會把舊頁真正的函式跑一遍，與本檔輸出逐筆比對。
 *  - 「未倒垃圾」是新標記，寫在值班紀錄的 IS_AUTO（1000966），與既有「未值班」「未掃」同一個模式：預設算完成，珊珊標例外。
 */

// ── 標記 ──
SC.NEXT_MARK = Object.freeze({
    MISSED_CLEAN: "未掃",       // 值日（既有）
    NO_SHOW: "未值班",          // 值班（既有）：沒到班
    NO_TRASH: "未倒垃圾",       // 值班（新）：有到班但沒倒垃圾
});

// 只改顯示：員工表姓名「曾琬容」在畫面上寫「花那」；寫入與比對仍用本名
SC.NEXT_DISPLAY_NAME = Object.freeze({ "曾琬容": "花那" });
SC.nextName = (n) => SC.NEXT_DISPLAY_NAME[n] || n;

// 排班權限（珊珊、瓊安）。伺服器 scheduleWhoami 以員工表 email 對到人後回傳 role；這份名單 Worker 端也有一份，兩邊要一起改。
SC.NEXT_ADMIN_NAMES = Object.freeze(["韓珊珊", "張瓊安"]);

// ── 權限判斷 ──
// viewer = { name, role: 'admin'|'staff' }（scheduleWhoami 回傳）；沒有 viewer 就是非員工或未登入
SC.nextPerms = (viewer) => {
    const ok = !!(viewer && viewer.name);
    const admin = ok && viewer.role === "admin";
    return { view: ok, schedule: admin, confirm: admin };
};

/**
 * 能不能改某人某天的排休。
 * 珊珊／瓊安：任何人任何天。
 * 其他同仁：只能改自己，照舊版「我的排班」規則——每月 20 號後開放、見紅休紀錄那天不能點；另外今天以前的日子不給改。
 * @returns {{ok:boolean, why?:string}}
 */
SC.nextCanEditRest = ({ viewer, target, ds, todayStr, hasRedRecord }) => {
    if (!viewer || !viewer.name) return { ok: false, why: "請先登入" };
    if (viewer.role === "admin") return { ok: true };
    if (viewer.name !== target) return { ok: false, why: "只能改自己的排休" };
    if (Number(String(todayStr).slice(8, 10)) < 20) return { ok: false, why: "每月 20 號後開放自己排休" };
    if (SC._cmpDateStr(ds, todayStr) <= 0) return { ok: false, why: "今天以前的日子不能改" };
    if (hasRedRecord) return { ok: false, why: "正職休假的日子請珊珊調整" };
    return { ok: true };
};

// ── 解析 Ragic 原始紀錄 ──
// raw = listLeaves 回傳的物件（naming=EID）。type 空白視為排休（同 schedule.html load()）。
SC.nextParse = (raw) => {
    const F = SC.F_LEAVE;
    return Object.entries(raw || {})
        .filter(([k, v]) => v && typeof v === "object" && !k.startsWith("_"))
        .map(([id, f]) => ({
            id: String(id),
            emp: f[F.EMP] || "",
            date: f[F.DATE] || "",
            type: f[F.TYPE] || "排休",
            dept: f[F.DEPT] || "",
            note: f[F.NOTE] || "",
            isAuto: f[F.IS_AUTO] || "",
        }))
        .filter((r) => r.emp && r.date);
};

const _nextYMD = (ds) => String(ds).replace(/\//g, "-").split("-").map(Number);
SC.nextInMonth = (r, year, month) => { const p = _nextYMD(r.date); return p[0] === year && p[1] === month; };

// ── 值班狀態 ──
SC.nextDutyState = (isAuto) =>
    isAuto === SC.NEXT_MARK.NO_SHOW ? "noshow" : isAuto === SC.NEXT_MARK.NO_TRASH ? "notrash" : "ok";

// ── 把一個月的紀錄整理成每天一格的資料 ──
// 回傳 M = { year, month, dim, days: { 1..dim: {d, ds, dow, truck, cleanRecs, clean, duty, rest, redCancelled, noRest, other} } }
SC.nextBuildMonth = (records, year, month) => {
    const dim = new Date(year, month, 0).getDate();
    const days = {};
    for (let d = 1; d <= dim; d++) {
        days[d] = {
            d, ds: SC.fmtDate(year, month, d), dow: new Date(year, month - 1, d).getDay(),
            truck: SC.isTrashCollectionDay(year, month, d),
            cleanRecs: [], clean: [], duty: [], rest: [], redCancelled: [], noRest: null, other: [], legacyTrash: [],
        };
    }
    records.forEach((r) => {
        if (!SC.nextInMonth(r, year, month)) return;
        const day = days[_nextYMD(r.date)[2]];
        if (!day) return;
        if (r.type === "禁休") { day.noRest = { id: r.id, reason: r.note }; return; }
        if (r.type === "值日") {
            if (SC.isTrashDuty(r.note)) { day.legacyTrash.push(r); return; }
            const m = /^([1-4])F$/.exec(r.note);
            if (!m) { day.other.push(r); return; }
            day.cleanRecs.push({
                id: r.id, name: r.emp, floor: Number(m[1]), missed: r.isAuto === SC.NEXT_MARK.MISSED_CLEAN,
                manual: r.isAuto === "No" || r.dept !== "系統預排", isAuto: r.isAuto,
            });
            return;
        }
        if (r.type === "值班") { day.duty.push({ id: r.id, name: r.emp, state: SC.nextDutyState(r.isAuto), isAuto: r.isAuto, dept: r.dept }); return; }
        if (r.type === "見紅休") {
            if (r.isAuto === SC.GOV_REST_CANCELLED) day.redCancelled.push({ id: r.id, name: r.emp });
            else day.rest.push({ id: r.id, name: r.emp, kind: "見紅休" });
            return;
        }
        if (r.type === "排休" || r.type === "特休" || r.type === "請假") day.rest.push({ id: r.id, name: r.emp, kind: r.type });
    });
    for (let d = 1; d <= dim; d++) {
        const day = days[d];
        const by = {};
        day.cleanRecs.forEach((c) => { (by[c.name] ||= []).push(c); });
        day.clean = Object.entries(by).map(([name, recs]) => ({
            name, recs,
            floors: recs.map((x) => x.floor).sort(),
            missedFloors: recs.filter((x) => x.missed).map((x) => x.floor).sort(),
        })).sort((a, b) => a.floors[0] - b.floors[0]);
    }
    return { year, month, dim, days };
};

// 某人某天的格子內容
SC.nextCell = (M, name, d) => {
    const day = M.days[d];
    if (!day) return { clean: null, duty: null, rest: null, redCancelled: false };
    return {
        clean: day.clean.find((c) => c.name === name) || null,
        duty: day.duty.find((x) => x.name === name) || null,
        rest: day.rest.find((x) => x.name === name) || null,
        redCancelled: day.redCancelled.some((x) => x.name === name),
    };
};

// ── 月統計：排定與實際分開 ──
// 層數：掃一層 1 層、倒垃圾一次 1 層（SC.DUTY_V2_TRASH_FLOORS）。週三、週日沒垃圾車不計次。
// 實際 = 到今天（含）為止、沒被標例外的量。預設算完成，只有珊珊標了的才扣。
SC.nextTally = (M, todayStr) => {
    const out = {};
    const get = (n) => (out[n] ||= {
        floorsSched: 0, trashSched: 0, floorsDone: 0, trashDone: 0,
        floorsMissed: 0, trashMissed: 0, noShow: 0, dutyDays: 0, cleanDays: 0,
    });
    for (let d = 1; d <= M.dim; d++) {
        const day = M.days[d];
        const past = SC._cmpDateStr(day.ds, todayStr) <= 0;
        day.clean.forEach((g) => {
            const t = get(g.name);
            t.cleanDays++;
            g.recs.forEach((c) => {
                t.floorsSched++;
                if (c.missed) t.floorsMissed++;
                else if (past) t.floorsDone++;
            });
        });
        day.duty.forEach((x) => {
            const t = get(x.name);
            t.dutyDays++;
            if (x.state === "noshow") t.noShow++;
            if (!day.truck) return;
            t.trashSched++;
            if (x.state !== "ok") t.trashMissed++;
            else if (past) t.trashDone++;
        });
    }
    const w = SC.DUTY_V2_TRASH_FLOORS;
    Object.values(out).forEach((t) => {
        t.schedLayers = t.floorsSched + t.trashSched * w;
        t.doneLayers = t.floorsDone + t.trashDone * w;
    });
    return out;
};

// ── 休假統計：對照舊版合計列，排休＋特休＋請假＋見紅休（已取消的不算）──
SC.nextRestTally = (M) => {
    const out = {};
    for (let d = 1; d <= M.dim; d++) {
        M.days[d].rest.forEach((x) => {
            const t = (out[x.name] ||= { paixiu: 0, texiu: 0, qingjia: 0, gov: 0, total: 0 });
            if (x.kind === "排休") t.paixiu++;
            else if (x.kind === "特休") t.texiu++;
            else if (x.kind === "請假") t.qingjia++;
            else if (x.kind === "見紅休") t.gov++;
            t.total++;
        });
    }
    return out;
};
// 應休天數：見紅休名單＝當月六日與國定假日（扣禁休日）；兼職不算（回 null）；其他人＝月休上限
SC.nextRestTarget = (M, emp) => {
    if (!emp || emp.hire === "兼職") return null;
    if (!SC.GOV_REST_NAMES.includes(emp.name)) return SC.monthLeaveLimit(M.year, M.month);
    let n = 0;
    for (let d = 1; d <= M.dim; d++) if (SC.isGovRestDay(M.year, M.month, d) && !M.days[d].noRest) n++;
    return n;
};
// 少休看總天數（特休、請假也算休到）；多休只看排休＋見紅休，特休和請假不算多休。t = SC.nextRestTally 的一筆
SC.nextRestStatus = (t, target) => {
    if (target === null) return { side: "none", diff: 0 };
    if (t.total < target) return { side: "short", diff: target - t.total };
    const planned = t.paixiu + t.gov;
    if (planned > target) return { side: "over", diff: planned - target };
    return { side: "ok", diff: 0 };
};

// ── 公平帳：每組（業務／內勤／兼職）各自的平均，標比平均多／少，沒有欠帳、追債、罰款字眼 ──
// people = [{name, kind}]（kind 來自 SC.dutyV2Kind：biz／office／parttime）
SC.NEXT_KIND_LABEL = { biz: "業務", office: "內勤", parttime: "兼職" };
SC.nextFairness = (people, tally) => {
    const groups = [];
    ["biz", "office", "parttime"].forEach((kind) => {
        const list = people.filter((p) => p.kind === kind);
        if (!list.length) return;
        const rows = list.map((p, i) => {
            const t = tally[p.name] || { schedLayers: 0, doneLayers: 0, floorsSched: 0, trashSched: 0, floorsMissed: 0, trashMissed: 0, noShow: 0 };
            return { name: p.name, order: i, sched: t.schedLayers, done: t.doneLayers, floors: t.floorsSched, trash: t.trashSched, floorsMissed: t.floorsMissed, trashMissed: t.trashMissed, noShow: t.noShow };
        });
        const avg = Math.round((rows.reduce((s, r) => s + r.sched, 0) / rows.length) * 10) / 10;
        rows.forEach((r) => {
            r.gap = Math.round((r.sched - avg) * 10) / 10;
            r.side = r.gap > 0 ? "over" : r.gap < 0 ? "under" : "same";
        });
        rows.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap) || b.gap - a.gap || a.order - b.order);
        groups.push({ kind, label: SC.NEXT_KIND_LABEL[kind], avg, rows });
    });
    return groups;
};

// ── 檢查清單 ──
// 缺樓層、缺值班、同一人連兩天打掃、同一天多人值班。fix 只給「今天以後」的日子（鎖定的日子不補）。
SC.nextChecks = (M, todayStr) => {
    const out = [];
    const W = SC.DAYS_TW;
    const lab = (d) => `${M.month}/${d}（${W[M.days[d].dow]}）`;
    const floorsText = (arr) => arr.map((x) => `${x}F`).join("、");
    const span = (arr) => (arr.length > 1 && arr[arr.length - 1] - arr[0] === arr.length - 1 ? `${arr[0]}F 到 ${arr[arr.length - 1]}F` : floorsText(arr));
    for (let d = 1; d <= M.dim; d++) {
        const day = M.days[d];
        const fixable = SC._cmpDateStr(day.ds, todayStr) > 0;
        if (!day.noRest) {
            const got = [...new Set(day.cleanRecs.map((c) => c.floor))].sort();
            const miss = [1, 2, 3, 4].filter((f) => !got.includes(f));
            if (!got.length) out.push({ d, kind: "clean", fix: fixable ? "clean" : null, text: `${lab(d)}還沒排打掃` });
            else if (miss.length) out.push({ d, kind: "clean", fix: fixable ? "clean" : null, text: `${lab(d)}只排了 ${floorsText(got)}，還缺 ${span(miss)}` });
        }
        if (!day.duty.length) out.push({ d, kind: "duty", fix: fixable ? "duty" : null, text: `${lab(d)}沒有值班的人` });
        else if (day.duty.length > 1) out.push({ d, kind: "duty", fix: null, text: `${lab(d)}有 ${day.duty.length} 人值班：${day.duty.map((x) => SC.nextName(x.name)).join("、")}` });
    }
    const names = [...new Set(Object.values(M.days).flatMap((day) => day.clean.map((g) => g.name)))];
    names.forEach((n) => {
        for (let d = 1; d < M.dim; d++) {
            if (M.days[d].clean.some((g) => g.name === n) && M.days[d + 1].clean.some((g) => g.name === n)) {
                out.push({ d, kind: "twice", fix: null, text: `${SC.nextName(n)}連兩天打掃：${lab(d)}、${lab(d + 1)}` });
            }
        }
    });
    for (let d = 1; d <= M.dim; d++) {
        const day = M.days[d];
        const fixable = SC._cmpDateStr(day.ds, todayStr) > 0;
        day.rest.forEach((x) => {
            const jobs = [];
            if (day.clean.some((g) => g.name === x.name)) jobs.push("打掃");
            if (day.duty.some((y) => y.name === x.name)) jobs.push("值班");
            if (jobs.length && fixable) out.push({ d, kind: "twice", fix: null, text: `${SC.nextName(x.name)} ${lab(d)}休假，但同一天排了${jobs.join("和")}` });
        });
    }
    SC.DUTY_NOT_ADJACENT_PAIRS.forEach(([a, b]) => {
        const has = (n, d) => M.days[d].clean.some((g) => g.name === n);
        for (let d = 1; d < M.dim; d++) {
            if ((has(a, d) && has(b, d + 1)) || (has(b, d) && has(a, d + 1))) {
                out.push({ d, kind: "twice", fix: null, text: `${SC.nextName(a)}、${SC.nextName(b)}排在相鄰兩天打掃：${lab(d)}、${lab(d + 1)}` });
            }
        }
    });
    return out.sort((a, b) => a.d - b.d);
};

// ── 員工名單：逐段對照 schedule.html load()（排序、兼職入池、部門顯示）──
// empJson = listEmployees 回傳（naming=EID）。回傳 { allEmployees, employees }：
//   allEmployees：值日預排的人員池；employees：排班表上有欄位的人（也是值班預排的候選）。
SC.nextBuildEmployees = (empJson, year, month) => {
    const E = SC.F_EMP;
    const allEmps = Object.entries(empJson || {})
        .filter(([k, v]) => v && typeof v === "object" && !k.startsWith("_"))
        .map(([id, f]) => {
            const name = f[E.NAME] || "";
            return {
                ragicId: id, name, display: name, dept: f[E.DEPT] || "", status: f[E.STATUS] || "",
                hire: f[E.HIRE] || "", hireDate: f[E.HIRE_DATE] || "9999/12/31", birthday: f[E.BIRTHDAY] || "",
            };
        })
        .filter((e) => e.status === "在職" && e.dept !== "經營階層");
    const dutyV2Month = SC.isDutyV2Month(year, month);
    const isDutyPartTime = (e) => dutyV2Month && e.hire === "兼職" && !SC.PARTTIME_DUTY_EXCLUDE.includes(e.name);
    const allEmployees = allEmps
        .filter((e) => e.hire !== "兼職" || isDutyPartTime(e))
        .sort((a, b) => a.dept.localeCompare(b.dept) || a.hireDate.localeCompare(b.hireDate));
    const getDeptOrder = (dept) => {
        if (dept.startsWith("管理部")) return 0;
        if (dept === "設計部") return 1;
        if (dept === "行銷部") return 2;
        if (dept === "租賃部") return 3;
        if (dept === "兼職") return 3.5;
        if (dept === "社宅部") return 4;
        return 5;
    };
    const employees = allEmps
        .filter((e) => e.hire === "承攬" || e.hire === "正職" || e.name === "韓珊珊" || e.dept === "設計部" || e.dept === "行銷部" || e.name === "張瓊安" || e.dept === "社宅部" || isDutyPartTime(e))
        .map((e) => (isDutyPartTime(e) ? { ...e, dept: "兼職", rawDept: e.dept } : e.name === "韓珊珊" ? { ...e, dept: "管理部/秘書", rawDept: e.dept } : e.name === "張瓊安" ? { ...e, dept: "管理部/特助", rawDept: e.dept } : { ...e, rawDept: e.dept }))
        .sort((a, b) => getDeptOrder(a.dept) - getDeptOrder(b.dept) || a.hireDate.localeCompare(b.hireDate));
    return { allEmployees, employees };
};

// 排班表欄組名稱（只改顯示，內部部門值不變）
SC.NEXT_GROUP_ORDER = ["管理部", "設計部", "行銷部", "租賃部", "租賃部（兼職）", "社宅部（兼職）", "社宅部", "買賣部"];
SC.nextGroupOf = (e) => {
    if (e.dept === "兼職") return e.rawDept === "社宅部" ? "社宅部（兼職）" : "租賃部（兼職）";
    if (e.dept.startsWith("管理部")) return "管理部";
    return e.dept;
};
SC.nextGroups = (employees) => {
    const by = {};
    employees.forEach((e) => { (by[SC.nextGroupOf(e)] ||= []).push(e); });
    const known = SC.NEXT_GROUP_ORDER.filter((g) => by[g]);
    const rest = Object.keys(by).filter((g) => !SC.NEXT_GROUP_ORDER.includes(g));
    return [...known, ...rest].map((g) => ({ label: g, people: by[g] }));
};

// 上月負擔分數要用「實際」：標了「未倒垃圾」的值班，倒垃圾那 1 層不算（等同既有「未值班」的算法）。
// 不改共用的 SC.dutyV2PrevPoints，而是在餵給它之前把新標記換成它認得的舊標記；沒有新標記時輸出完全相同。
SC.nextPrevPointsInput = (raw) => {
    const out = {};
    Object.entries(raw || {}).forEach(([k, v]) => {
        if (v && typeof v === "object" && !k.startsWith("_") && v[SC.F_LEAVE.IS_AUTO] === SC.NEXT_MARK.NO_TRASH) {
            out[k] = { ...v, [SC.F_LEAVE.IS_AUTO]: SC.NEXT_MARK.NO_SHOW };
        } else out[k] = v;
    });
    return out;
};

// ── 預排值日（2026/11 起新制）：對照 schedule.html handleAutoSchedule 的新制分支 ──
// o: { year, month, todayStr, allEmployees, raw（listLeaves 上月＋當月的原始物件）, noRest（{ds:…}）, rand? }
// 回傳 { toDelete:[{id, rec}], creates:[{…Ragic 欄位}], warnings, lockedKept, manualKept, plan }
SC.nextPlanDuty = (o) => {
    const F = SC.F_LEAVE;
    const { year, month, todayStr, allEmployees } = o;
    const noRest = o.noRest || {};
    const recs = SC.nextParse(o.raw);
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;

    // 新人入池／長假免追債：比照同組平均
    const prevStart = new Date(prevYear, prevMonth - 1, 1);
    const veteranNames = [];
    const newNames = [];
    allEmployees.forEach((e) => {
        const p = e.hireDate.split("/");
        const hired = new Date(+p[0], +p[1] - 1, +p[2]);
        if (hired < prevStart) veteranNames.push(e.name); else newNames.push(e.name);
    });
    const prevKey = `${prevYear}/${String(prevMonth).padStart(2, "0")}`;
    const creditNames = allEmployees
        .filter((e) => (SC.LONG_LEAVE_CREDIT?.[e.name] || []).includes(prevKey))
        .map((e) => e.name);
    const avgTargets = [...new Set([...newNames, ...creditNames])];

    // 當月值日分類：手動／鎖定保留；其餘（未鎖定的系統預排）列入刪除
    const manualByDate = {};
    const toDelete = [];
    let lockedKept = 0;
    let manualKept = 0;
    recs.forEach((r) => {
        if (r.type !== "值日") return;
        const p = r.date.replace(/\//g, "-").split("-");
        if (parseInt(p[0]) !== year || parseInt(p[1]) !== month) return;
        const locked = SC.isDutyLocked(r.date, todayStr);
        if (SC.isTrashDuty(r.note) && r.dept === "系統預排" && r.isAuto !== "No" && r.isAuto !== "未掃" && !locked) {
            toDelete.push({ id: r.id, rec: r });
            return;
        }
        if (SC.isTrashDuty(r.note)) return;
        if (r.isAuto === "No" || r.dept !== "系統預排") {
            const floor = /^(1F|2F|3F|4F)$/.test(r.note) ? r.note : "";
            (manualByDate[r.date] ||= []).push({ empName: r.emp, floor });
            manualKept++;
        } else if (locked) {
            const floor = /^(1F|2F|3F|4F)$/.test(r.note) ? r.note : "";
            (manualByDate[r.date] ||= []).push({ empName: r.emp, floor });
            lockedKept++;
        } else {
            toDelete.push({ id: r.id, rec: r });
        }
    });

    // 值班（只用來盡量避免同人同天又值班又打掃）
    const zhibanByDate = {};
    recs.forEach((r) => { if (r.type === "值班" && SC.nextInMonth(r, year, month)) zhibanByDate[r.date] = r.emp; });

    // 當天不可排：排休／特休／請假／見紅休（已取消的不算）、生日、到職日以前
    const offByDate = {};
    recs.forEach((r) => {
        if (r.type === "值日" || r.type === "禁休" || r.type === "值班") return;
        if (!SC.nextInMonth(r, year, month)) return;
        if (r.type === "見紅休" && r.isAuto === SC.GOV_REST_CANCELLED) return;
        (offByDate[r.date] ||= new Set()).add(r.emp);
    });
    const dim = new Date(year, month, 0).getDate();
    for (let day = 1; day <= dim; day++) {
        const ds = SC.fmtDate(year, month, day);
        allEmployees.forEach((e) => { if (SC.isBirthday(e, month, day)) (offByDate[ds] ||= new Set()).add(e.name); });
        allEmployees.forEach((e) => {
            const h = (e.hireDate || "").split("/").map(Number);
            if (h.length === 3 && h[0] < 9999 && SC._cmpDateStr(ds, SC.fmtDate(h[0], h[1], h[2])) < 0) (offByDate[ds] ||= new Set()).add(e.name);
        });
    }

    const plan = SC.planDutyV2({
        year, month, todayStr,
        people: allEmployees.map((e) => ({ name: e.name, hire: e.hire, useAvg: avgTargets.includes(e.name) })),
        offByDate, zhibanByDate, noRest, fixedByDate: manualByDate,
        prevDayCounts: SC.dutyV2PrevPoints(SC.nextPrevPointsInput(o.raw), prevYear, prevMonth),
        rand: o.rand,
    });

    const creates = [];
    Object.entries(plan.duties).forEach(([dateStr, assignments]) => {
        assignments.forEach(({ empName, floor }) => {
            creates.push({
                [F.EMP]: empName, [F.DATE]: dateStr, [F.YEAR]: String(year), [F.MONTH]: String(month),
                [F.TYPE]: "值日", [F.NOTE]: floor, [F.IS_AUTO]: "Yes", [F.DEPT]: "系統預排",
            });
        });
    });
    return { toDelete, creates, warnings: plan.warnings, lockedKept, manualKept, plan };
};

// 值班預排的候選人：承攬、非社宅部／設計部、不在不值班名單、到職滿 90 天（對照 handleAutoZhiban）
SC.nextZhibanEligible = (employees, year, month) => {
    const schedStart = new Date(year, month - 1, 1);
    return employees.filter((e) => {
        if (e.hire !== "承攬") return false;
        if (e.dept === "社宅部") return false;
        if (e.dept === "設計部") return false;
        if (SC.ZHIBAN_BLACKLIST && SC.ZHIBAN_BLACKLIST.includes(e.name)) return false;
        if (!e.hireDate || e.hireDate === "9999/12/31") return false;
        const p = e.hireDate.split("/");
        const hired = new Date(+p[0], +p[1] - 1, +p[2]);
        return (schedStart - hired) / (1000 * 60 * 60 * 24) >= 90;
    });
};

// ── 預排值班：對照 schedule.html handleAutoZhiban ──
// o: { year, month, todayStr, employees, raw（listLeaves 當月以上原始物件）, noRest, only? }
//   only = 'YYYY/MM/DD'：只補這一天（檢查清單「補上」用），不刪任何紀錄，其餘日子當作已定
// 回傳 { error?, toDelete:[{id, rec}], creates, newZhiban }
SC.nextPlanZhiban = (o) => {
    const F = SC.F_LEAVE;
    const { year, month, todayStr, employees } = o;
    const noRest = o.noRest || {};
    const only = o.only || "";
    const recs = SC.nextParse(o.raw).filter((r) => SC.nextInMonth(r, year, month));
    const eligible = SC.nextZhibanEligible(employees, year, month);
    if (eligible.length === 0) return { error: "沒有符合條件的值班人員", toDelete: [], creates: [], newZhiban: {} };
    if (only && SC.isDutyLocked(only, todayStr)) return { error: "今天以前的日子已鎖定，不補", toDelete: [], creates: [], newZhiban: {} };

    const zCount = {};
    eligible.forEach((e) => { zCount[e.name] = 0; });
    const fixedDay = (ds) => SC.isDutyLocked(ds, todayStr) || (only && ds !== only);

    const toDelete = only ? [] : recs
        .filter((r) => r.type === "值班" && !SC.isDutyLocked(SC.fmtDate(..._nextYMD(r.date)), todayStr))
        .map((r) => ({ id: r.id, rec: r }));

    const zLocked = {};
    recs.forEach((r) => {
        if (r.type !== "值班") return;
        const ds = SC.fmtDate(..._nextYMD(r.date));
        if (!fixedDay(ds)) return;
        zLocked[ds] = { name: r.emp, missed: SC.nextDutyState(r.isAuto) !== "ok" };
    });

    // 當月所有不是值班／值日／禁休的紀錄＝當天不能值班的人（對照舊頁的 leaves 狀態）
    const onLeaveByDate = {};
    recs.forEach((r) => {
        if (r.type === "值日" || r.type === "禁休" || r.type === "值班") return;
        (onLeaveByDate[r.date] ||= new Set()).add(r.emp);
    });

    const dim = new Date(year, month, 0).getDate();
    const newZhiban = {};
    const zTrash = {};
    const zIsV2 = SC.isDutyV2Month(year, month);
    let lastPick = "";
    for (let day = 1; day <= dim; day++) {
        const dateStr = SC.fmtDate(year, month, day);
        if (fixedDay(dateStr)) {
            const lk = zLocked[dateStr];
            if (lk && lk.name) {
                zCount[lk.name] = (zCount[lk.name] || 0) + 1;
                if (zIsV2 && !lk.missed && SC.isTrashCollectionDay(year, month, day)) zTrash[lk.name] = (zTrash[lk.name] || 0) + 1;
            }
            lastPick = lk ? lk.name : "";
            continue;
        }
        const onLeave = new Set(onLeaveByDate[dateStr] || []);
        if (!noRest[dateStr] && SC.isGovRestDay(year, month, day)) SC.GOV_REST_NAMES.forEach((n) => onLeave.add(n));
        const isTrashDayZ = SC.isTrashCollectionDay(year, month, day);
        const sortFn = SC.zhibanCompare(zCount, zTrash, isTrashDayZ, zIsV2);
        const isBirthdayToday = (emp) => SC.isBirthday(emp, month, day);
        const cands = eligible.filter((e) => e.name !== lastPick && !onLeave.has(e.name) && !isBirthdayToday(e)).sort(sortFn);
        const pool = cands.length > 0 ? cands : eligible.filter((e) => !onLeave.has(e.name) && !isBirthdayToday(e)).sort(sortFn);
        const final = pool.length > 0 ? pool : eligible.map((e) => ({ name: e.name })).sort(sortFn);
        const chosen = final[0].name;
        zCount[chosen] = (zCount[chosen] || 0) + 1;
        if (zIsV2 && isTrashDayZ) zTrash[chosen] = (zTrash[chosen] || 0) + 1;
        lastPick = chosen;
        newZhiban[dateStr] = chosen;
    }

    const creates = Object.entries(newZhiban).map(([dateStr, empName]) => ({
        [F.EMP]: empName, [F.DATE]: dateStr, [F.YEAR]: String(year), [F.MONTH]: String(month),
        [F.TYPE]: "值班", [F.DEPT]: "系統預排值班",
    }));
    return { toDelete, creates, newZhiban };
};

// 檢查清單「補上」打掃：呼叫同一個值日演算法，只取指定那一天的結果（其餘缺的日子不動）
SC.nextPlanFillCleanDay = (o, ds) => {
    const r = SC.nextPlanDuty(o);
    return { ...r, toDelete: [], creates: r.creates.filter((c) => c[SC.F_LEAVE.DATE] === ds) };
};

// ── 刪除前快照（同 schedule.html exportScheduleSnapshot 的內容格式，方便用同一套步驟還原）──
SC.nextSnapshot = (type, year, month, entries, nowIso) => {
    const F = SC.F_LEAVE;
    return {
        _meta: {
            purpose: "schedule-next.html 一鍵預排：刪除前自動快照",
            type, year, month, exportedAt: nowIso, recordCount: entries.length,
            restoreHint: "逐筆移除 ragicId 欄位後，用 SC.proxyFetch('createLeave', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(record)}) 重建；或優先嘗試 Ragic 網頁版回收桶還原。",
        },
        records: entries.map(({ id, rec }) => ({
            ragicId: id,
            [F.EMP]: rec.emp, [F.DATE]: rec.date, [F.YEAR]: String(year), [F.MONTH]: String(month),
            [F.TYPE]: rec.type, [F.DEPT]: rec.dept, [F.NOTE]: rec.note, [F.IS_AUTO]: rec.isAuto,
        })),
    };
};
