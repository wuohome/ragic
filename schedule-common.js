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
