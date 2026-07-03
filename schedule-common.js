/**
 * 窩的家排班表 — 共用常數與資料
 * schedule.html + schedule-view.html 共用此檔
 * 改這裡 = 兩邊同步更新
 */

// ── API 設定 ──
const SC = {
    PROXY_BASE: "https://wuohome-ragic-proxy.wuohome.workers.dev",

    // ── 員工表欄位 ID ──
    F_EMP: {
        NAME: "3000933",
        DISPLAY: "1000848",
        DEPT: "3000937",
        STATUS: "3000945",
        HIRE: "3000955",
        HIRE_DATE: "3000943",
        BIRTHDAY: "3000954",
        FL1: "1002028",
        FL2: "1002029",
        FL3: "1002030",
    },

    // ── 排休/值班表欄位 ID ──
    F_LEAVE: {
        EMP: "1000961",
        DATE: "1000963",
        YEAR: "1000964",
        MONTH: "1000965",
        TYPE: "1002025",
        DEPT: "1002026",
        NOTE: "1000967",
        IS_AUTO: "1000966",
    },

    // ── 見紅休人員（設計部 + 瓊安）──
    GOV_REST_NAMES: ["張瓊安", "沈郁雯", "呂鴻墀"],

    // ── 2026 台灣國定假日 ──
    HOLIDAYS_2026: {
        "2026/01/01": "元旦",
        "2026/02/16": "除夕",
        "2026/02/17": "春節",
        "2026/02/18": "春節",
        "2026/02/19": "春節",
        "2026/02/20": "春節",
        "2026/02/27": "228",
        "2026/04/03": "兒童節",
        "2026/04/06": "清明",
        "2026/05/01": "勞動節",
        "2026/06/19": "端午",
        "2026/09/25": "中秋",
        "2026/09/28": "教師節",
        "2026/10/09": "國慶",
        "2026/10/26": "光復節",
        "2026/12/25": "行憲",
    },

    // ── 部門顏色 ──
    DEPT_COLORS: {
        "管理部/秘書": "#8b5cf6",
        "管理部/特助": "#8b5cf6",
        "設計部": "#10b981",
        "租賃部": "#f97316",
        "社宅部": "#0ea5e9",
    },

    // ── 部門排序 ──
    DEPT_ORDER: {
        "管理部/秘書": 0,
        "管理部/特助": 1,
        "設計部": 2,
        "租賃部": 3,
        "社宅部": 4,
    },

    // ── 樓層設定 ──
    FLOORS: ["1F", "2F", "3F", "4F"],
    FLOOR_COLORS: { "1F": "#3b82f6", "2F": "#8b5cf6", "3F": "#0891b2", "4F": "#ea580c" },

    // ── 清運值日關鍵字（備註含任一即為清運值日，不佔樓層格）──
    // 與 n8n 點名判斷關鍵字保持一致，異動需同步兩邊
    TRASH_DUTY_KEYWORDS: ["清運", "垃圾", "全棟", "全樓", "倒垃圾"],

    // ── 夫妻同排 ──
    COUPLES: [["張忠豪", "蕭頤臻"]],

    // ── 不值班名單（滿 3 個月但 Joan 判斷尚不適合值班的人）──
    // 加人：直接在陣列加姓名字串。移除：刪掉該字串即可。
    ZHIBAN_BLACKLIST: ["謝佳芬"],

    // ── 長假免追債（整月請假者，該月比照新人給平均次數，回歸後不欠不還）──
    // 格式 { "姓名": ["YYYY/MM", ...] }。列在某月的人，隔月自動排值日時起始次數 = 老員工平均，
    // 不會因該月請假次數掛 0 而被追債排爆。假結束把該月移除即可（不移除也只影響那一個月）。
    LONG_LEAVE_CREDIT: { "謝佳芬": ["2026/07"] },

    // ── 星期 ──
    DAYS_TW: ["日", "一", "二", "三", "四", "五", "六"],
};

// ── 工具函式 ──
SC.fmtDate = (y, m, d) => `${y}/${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}`;
SC.getHolidayName = (y, m, d) => SC.HOLIDAYS_2026[SC.fmtDate(y, m, d)] || "";
SC.isGovHoliday = (dateStr, isWeekend) => isWeekend || dateStr in SC.HOLIDAYS_2026;
SC.isOpenPeriod = () => new Date().getDate() >= 20;

// ── 月休上限：當月有三節（春節/端午/中秋）→ 9 天，否則 8 天 ──
SC.MAJOR_FESTIVAL_NAMES = ["春節", "除夕", "端午", "中秋"];
SC.monthLeaveLimit = (year, month) => {
    const prefix = `${year}/${String(month).padStart(2, "0")}/`;
    const hasFest = Object.entries(SC.HOLIDAYS_2026).some(([date, name]) =>
        date.startsWith(prefix) && SC.MAJOR_FESTIVAL_NAMES.some(f => name.includes(f))
    );
    return hasFest ? 9 : 8;
};

// ── 日期範圍 query params（listLeaves 用）──
SC.leaveQuery = (fromY, fromM, toY, toM) => {
    const from = `${fromY}/${String(fromM).padStart(2, "0")}/01`;
    const lastDay = new Date(toY, toM, 0).getDate();
    const to = `${toY}/${String(toM).padStart(2, "0")}/${String(lastDay).padStart(2, "0")}`;
    return `?dateFrom=${encodeURIComponent(from)}&dateTo=${encodeURIComponent(to)}`;
};

// ── Worker proxy 呼叫（GET/POST/DELETE 統一入口）──
// Worker 回傳 envelope：成功 {ok:true, ...data} 或 {ok:true, ragicId:...} 或 data object
// 失敗 4xx {error:"..."} — worker 已內建 detectUpstreamFailure，前端直接信任 HTTP status
SC.proxyFetch = async (action, opts = {}, retries = 3) => {
    const url = `${SC.PROXY_BASE}/${action}`;
    for (let i = 0; i < retries; i++) {
        const res = await fetch(url, opts);
        if (res.status === 403 && i < retries - 1) {
            await new Promise(r => setTimeout(r, 1000 * (i + 1)));
            continue;
        }
        if (!res.ok) {
            let msg = `Proxy ${res.status}`;
            try { const j = await res.json(); if (j.error) msg = j.error; } catch {}
            throw new Error(msg);
        }
        return res.json();
    }
};

// ── 生日判斷 ──
SC.isBirthday = (emp, month, day) => {
    if (!emp.birthday) return false;
    const bp = emp.birthday.split("/");
    return parseInt(bp[1]) === month && parseInt(bp[2]) === day;
};

// ── 清運值日判斷（值日紀錄的備註含清運關鍵字 → 視為清運值日）──
SC.isTrashDuty = (note) => SC.TRASH_DUTY_KEYWORDS.some(kw => (note || "").includes(kw));

// ── 每日應排樓層：1F/2F/3F 每天；4F 只在週五 ──
SC.expectedDutyFloors = (year, month, day) => {
    const isFriday = new Date(year, month - 1, day).getDay() === 5;
    return isFriday ? ["1F", "3F", "2F", "4F"] : ["1F", "3F", "2F"];
};

// ══════════════════════════════════════════════════════════════
// 公平帳 / 追債制度 v2（2026-07-03 實作）
// 設計依據：排班表_規格書.md §「公平帳 / 追債制度（v2 設計原則）」
// 三本帳：樓層打掃帳／清運帳／值班帳，各自算 expected / actual / debt
// 全部 runtime 從 ragicforms4/2 即時計算，不寫回 Ragic（沿用 fcHist 既有風格）
// ══════════════════════════════════════════════════════════════

// ── 新人保護分級門檻（天數，未跟 Joan 最終確認，先用規格書預設值）──
// ponytail-debt: 這三個數字是規格書「例如」用語給的預設值，非 Joan 拍板值；
// 之後 Joan 確認正式門檐 → 只改這三個常數，其他程式碼不用動
SC.NEWBIE_PROTECTION = {
    NO_SCHEDULE_DAYS: 14,   // 到職 < 14 天：不排、不累積 expected
    HALF_WEIGHT_DAYS: 30,   // 到職 15-30 天：expected 半權重
    // 到職 31 天(HALF_WEIGHT_DAYS+1) 起：正常權重 1
};

// ── 制度分水嶺：2026/07/01 環境維護新制生效日 ──
SC.FAIRNESS_CUTOVER_DATE = "2026/07/01";
// 樓層公平帳歷史起算日（與既有 fcHist 起算點一致，見 schedule.html load()）
SC.FAIRNESS_HIST_START = "2026/03/30";

// ── 環境清潔費金額（7/1 後新制，僅顯示計算用，不接真實扣款）──
SC.CLEANING_FEE = { FLOOR_DUTY: 200, TRASH_DUTY: 300 };

// 兩日期字串（YYYY/MM/DD）比較，a < b 回傳負值
SC._cmpDateStr = (a, b) => a.replace(/\//g, "") .localeCompare(b.replace(/\//g, ""));

// 到職天數（依「當天」計算，dateStr / hireDateStr 皆為 YYYY/MM/DD）
SC._daysSinceHire = (dateStr, hireDateStr) => {
    if (!hireDateStr || hireDateStr === "9999/12/31") return 9999; // 無到職日視為老員工
    const d = new Date(dateStr.replace(/\//g, "-"));
    const h = new Date(hireDateStr.replace(/\//g, "-"));
    return Math.floor((d - h) / 86400000);
};

// 新人保護權重：< NO_SCHEDULE_DAYS 回 0（不累積）；15-30 回 0.5；31+ 回 1
SC.newbieWeight = (dateStr, hireDateStr) => {
    const days = SC._daysSinceHire(dateStr, hireDateStr);
    if (days < SC.NEWBIE_PROTECTION.NO_SCHEDULE_DAYS) return 0;
    if (days <= SC.NEWBIE_PROTECTION.HALF_WEIGHT_DAYS) return 0.5;
    return 1;
};

// 產生日期字串陣列 [fromDateStr, toDateStr]（含頭尾，YYYY/MM/DD）
SC.dateRangeArray = (fromDateStr, toDateStr) => {
    const out = [];
    const from = new Date(fromDateStr.replace(/\//g, "-"));
    const to = new Date(toDateStr.replace(/\//g, "-"));
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
        out.push(SC.fmtDate(d.getFullYear(), d.getMonth() + 1, d.getDate()));
    }
    return out;
};

/**
 * 計算三本公平帳（樓層 / 清運 / 值班），依 7/1 分水嶺拆兩段累計。
 *
 * @param {Array} employees - [{name, dept, hire, hireDate, status}], 在職名單
 * @param {Object} leaveRecords - ragicforms4/2 GET 回傳的 raw object（key=ragicId）
 * @param {string} todayStr - YYYY/MM/DD，計算截止日（含當天）
 * @returns {Object} { [empName]: { floor: {expected,actual,debt}, trash: {...}, zhiban: {...} } }
 *          每帳再拆 { pre701, post701 } 兩段
 */
SC.computeFairnessLedger = (employees, leaveRecords, todayStr) => {
    const empByName = {};
    employees.forEach(e => { empByName[e.name] = e; });

    const mkAcct = () => ({
        pre701: { expected: 0, actual: 0 },
        post701: { expected: 0, actual: 0 },
    });
    const ledger = {};
    employees.forEach(e => {
        ledger[e.name] = { floor: mkAcct(), trash: mkAcct(), zhiban: mkAcct() };
    });

    // ── 逐日建立「當天可排人員池」與 expected 分攤 ──
    const days = SC.dateRangeArray(SC.FAIRNESS_HIST_START, todayStr);

    // 先把 leave records 依日期分組，方便查當天誰請假/排休/見紅休
    const byDate = {}; // byDate[dateStr] = [{empName, type, isAuto, note}]
    Object.entries(leaveRecords)
        .filter(([k, v]) => typeof v === "object" && !k.startsWith("_"))
        .forEach(([id, f]) => {
            const date = f[SC.F_LEAVE.DATE] || "";
            if (!date) return;
            if (!byDate[date]) byDate[date] = [];
            byDate[date].push({
                ragicId: id,
                empName: f[SC.F_LEAVE.EMP] || "",
                type: f[SC.F_LEAVE.TYPE] || "",
                isAuto: f[SC.F_LEAVE.IS_AUTO] || "",
                note: f[SC.F_LEAVE.NOTE] || "",
            });
        });

    const OFF_TYPES = new Set(["排休", "特休", "請假", "禁休"]);

    days.forEach(dateStr => {
        const parts = dateStr.split("/").map(Number);
        const [y, m, d] = parts;
        const dow = new Date(y, m - 1, d).getDay();
        const isWeekend = dow === 0 || dow === 6;
        const isHoliday = SC.isGovHoliday(dateStr, isWeekend);
        const period = SC._cmpDateStr(dateStr, SC.FAIRNESS_CUTOVER_DATE) < 0 ? "pre701" : "post701";
        const dayRecs = byDate[dateStr] || [];
        const noRestToday = dayRecs.some(r => r.type === "禁休");

        // 當天不可排原因：請假/排休/特休（不含值班/值日 type，那些不算「不可排」）
        const offToday = new Set(
            dayRecs.filter(r => OFF_TYPES.has(r.type) && r.type !== "禁休").map(r => r.empName)
        );

        // ── 樓層帳 ──
        const floorsToday = SC.expectedDutyFloors(y, m, d);
        // 可排池：在職員工（樓層打掃全員池，含社宅部）扣除請假/排休/特休，且新人保護未到「不排」門檻
        const floorPool = employees.filter(e => {
            if (offToday.has(e.name)) return false;
            if (!noRestToday && SC.GOV_REST_NAMES.includes(e.name) && isHoliday) return false;
            const w = SC.newbieWeight(dateStr, e.hireDate);
            return w > 0;
        });
        if (floorPool.length > 0) {
            const perSlotExpected = floorsToday.length / floorPool.length;
            floorPool.forEach(e => {
                const w = SC.newbieWeight(dateStr, e.hireDate);
                ledger[e.name].floor[period].expected += perSlotExpected * w;
            });
        }
        // actual：當天實際完成的樓層值日（非未掃、非清運）
        dayRecs.forEach(r => {
            if (r.type !== "值日") return;
            if (SC.isTrashDuty(r.note)) return; // 清運另計
            if (!/^(1F|2F|3F|4F)$/.test(r.note)) return;
            if (r.isAuto === "未掃") return;
            if (!ledger[r.empName]) return;
            ledger[r.empName].floor[period].actual += 1;
        });

        // ── 清運帳（避開週三/週日）──
        const dowForTrash = dow; // 0=日, 3=三
        if (dowForTrash !== 0 && dowForTrash !== 3) {
            const trashPool = employees.filter(e => {
                if (offToday.has(e.name)) return false;
                if (!noRestToday && SC.GOV_REST_NAMES.includes(e.name) && isHoliday) return false;
                const w = SC.newbieWeight(dateStr, e.hireDate);
                return w > 0;
            });
            if (trashPool.length > 0) {
                const perSlotExpected = 1 / trashPool.length;
                trashPool.forEach(e => {
                    const w = SC.newbieWeight(dateStr, e.hireDate);
                    ledger[e.name].trash[period].expected += perSlotExpected * w;
                });
            }
        }
        dayRecs.forEach(r => {
            if (r.type !== "值日") return;
            if (!SC.isTrashDuty(r.note)) return;
            if (r.isAuto === "未掃") return;
            if (!ledger[r.empName]) return;
            ledger[r.empName].trash[period].actual += 1;
        });

        // ── 值班帳（只有承攬，排除黑名單/社宅部/設計部）──
        const zhibanPool = employees.filter(e => {
            if (e.hire !== "承攬") return false;
            if (e.dept === "社宅部" || e.dept === "設計部") return false;
            if (SC.ZHIBAN_BLACKLIST && SC.ZHIBAN_BLACKLIST.includes(e.name)) return false;
            if (offToday.has(e.name)) return false;
            const w = SC.newbieWeight(dateStr, e.hireDate);
            return w > 0;
        });
        if (zhibanPool.length > 0) {
            const perSlotExpected = 1 / zhibanPool.length;
            zhibanPool.forEach(e => {
                const w = SC.newbieWeight(dateStr, e.hireDate);
                ledger[e.name].zhiban[period].expected += perSlotExpected * w;
            });
        }
        dayRecs.forEach(r => {
            if (r.type !== "值班") return;
            if (r.isAuto === "未值班") return;
            if (!ledger[r.empName]) return;
            ledger[r.empName].zhiban[period].actual += 1;
        });
    });

    // ── debt = expected - actual（四捨五入到小數 1 位，避免浮點數雜訊）──
    const round1 = n => Math.round(n * 10) / 10;
    Object.values(ledger).forEach(acct => {
        ["floor", "trash", "zhiban"].forEach(book => {
            ["pre701", "post701"].forEach(period => {
                const a = acct[book][period];
                a.expected = round1(a.expected);
                a.actual = round1(a.actual);
                a.debt = round1(a.expected - a.actual);
            });
        });
    });

    return ledger;
};

// ── 未完成筆數（7/1 後）：樓層未掃 + 清運未掃，供環境清潔費「顯示」計算用 ──
// 只回傳筆數與試算金額，不做任何扣款/通知動作（規格書明確要求先不接金流）
SC.computeCleaningFeePreview = (leaveRecords, todayStr) => {
    const out = {}; // out[empName] = { floorMissed, trashMissed, feeTotal }
    Object.entries(leaveRecords)
        .filter(([k, v]) => typeof v === "object" && !k.startsWith("_"))
        .forEach(([id, f]) => {
            const date = f[SC.F_LEAVE.DATE] || "";
            const type = f[SC.F_LEAVE.TYPE] || "";
            const isAuto = f[SC.F_LEAVE.IS_AUTO] || "";
            const note = f[SC.F_LEAVE.NOTE] || "";
            const emp = f[SC.F_LEAVE.EMP] || "";
            if (!date || !emp) return;
            if (type !== "值日") return;
            if (SC._cmpDateStr(date, SC.FAIRNESS_CUTOVER_DATE) < 0) return; // 7/1 前不追溯收費
            if (SC._cmpDateStr(date, todayStr) > 0) return; // 未來日期不計
            if (!out[emp]) out[emp] = { floorMissed: 0, trashMissed: 0, feeTotal: 0 };
            const isTrash = SC.isTrashDuty(note);
            if (isAuto !== "未掃") return;
            if (isTrash) {
                out[emp].trashMissed += 1;
                out[emp].feeTotal += SC.CLEANING_FEE.TRASH_DUTY;
            } else if (/^(1F|2F|3F|4F)$/.test(note)) {
                out[emp].floorMissed += 1;
                out[emp].feeTotal += SC.CLEANING_FEE.FLOOR_DUTY;
            }
        });
    return out;
};
