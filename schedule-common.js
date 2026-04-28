/**
 * 窩的家排班表 — 共用常數與資料
 * schedule.html + schedule-view.html 共用此檔
 * 改這裡 = 兩邊同步更新
 */

// ── API 設定 ──
const SC = {
    API_KEY: "VEZsOEwzYzVJdWdoWXRDM3ptS2YwRytLV21BaWhPTDRLWXhPb2FLZ3VBUm1BZE90VzJtZzlTNjVlbCszRnZkRw==",
    BASE_URL: "https://ap15.ragic.com",
    EMP_PATH: "/wuohome/ragicforms4/20004",
    LEAVE_PATH: "/wuohome/ragicforms4/2",

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
    FLOORS: ["1F", "2F", "3F"],
    FLOOR_COLORS: { "1F": "#3b82f6", "2F": "#8b5cf6", "3F": "#0891b2" },

    // ── 夫妻同排 ──
    COUPLES: [["張忠豪", "蕭眞儀"]],

    // ── 星期 ──
    DAYS_TW: ["日", "一", "二", "三", "四", "五", "六"],
};

// ── 工具函式 ──
SC.fmtDate = (y, m, d) => `${y}/${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}`;
SC.getHolidayName = (y, m, d) => SC.HOLIDAYS_2026[SC.fmtDate(y, m, d)] || "";
SC.isGovHoliday = (dateStr, isWeekend) => isWeekend || dateStr in SC.HOLIDAYS_2026;
SC.isOpenPeriod = () => new Date().getDate() >= 20;

// ── 日期範圍 where 條件（只拉需要的月份）──
SC.leaveWhere = (fromY, fromM, toY, toM) => {
    const from = `${fromY}/${String(fromM).padStart(2, "0")}/01`;
    const lastDay = new Date(toY, toM, 0).getDate();
    const to = `${toY}/${String(toM).padStart(2, "0")}/${String(lastDay).padStart(2, "0")}`;
    return `?where=${SC.F_LEAVE.DATE},gte,${from}&where=${SC.F_LEAVE.DATE},lte,${to}`;
};

// ── Ragic silent fail 偵測（DELETE / POST 共用） ──
// Ragic 會回 HTTP 200 + status:"SUCCESS" 但 msg 含 "Field id ... not found" 之類警告，
// 實際操作沒生效。三層檢查：status / msg 警告字眼 / error 欄位
SC._checkRagicResponse = (parsed, opLabel) => {
    if (!parsed || typeof parsed !== "object") return;
    // 1. status 不是 SUCCESS → 失敗
    if (parsed.status && String(parsed.status).toUpperCase() !== "SUCCESS") {
        throw new Error(`${opLabel} failed: ${JSON.stringify(parsed)}`);
    }
    // 2. SUCCESS 但 msg 含警告字眼 → silent fail
    if (parsed.msg && /not found|invalid|Field id|Form Index/i.test(parsed.msg)) {
        throw new Error(`${opLabel} silent fail: ${parsed.msg}`);
    }
    // 3. 有 error 欄位 → 失敗
    if (parsed.error) throw new Error(`${opLabel} error: ${parsed.error}`);
};

// ── API 呼叫（含重試）──
SC.apiFetch = async (path, opts = {}, retries = 3) => {
    const sep = path.includes("?") ? "&" : "?";
    const url = `${SC.BASE_URL}${path}${sep}api=true&v=3&naming=EID&APIKey=${encodeURIComponent(SC.API_KEY)}`;
    for (let i = 0; i < retries; i++) {
        const res = await fetch(url, opts);
        if (res.status === 403 && i < retries - 1) {
            await new Promise(r => setTimeout(r, 1000 * (i + 1)));
            continue;
        }
        if (!res.ok) throw new Error(`API ${res.status}`);
        if (opts.method === "DELETE") {
            // Ragic DELETE silent fail 防呆（200 + SUCCESS 但其實沒刪）
            const body = await res.text();
            if (!body) return {};
            let parsed;
            try { parsed = JSON.parse(body); } catch { return {}; }
            SC._checkRagicResponse(parsed, "DELETE");
            return parsed;
        }
        // GET/POST：解析 JSON 後也檢查 silent fail
        // POST 成功時 ragicId 會帶回；status 非 SUCCESS / msg 警告 / error 都要擋
        const parsed = await res.json();
        if (opts.method === "POST") {
            SC._checkRagicResponse(parsed, "POST");
        }
        return parsed;
    }
};

// ── 生日判斷 ──
SC.isBirthday = (emp, month, day) => {
    if (!emp.birthday) return false;
    const bp = emp.birthday.split("/");
    return parseInt(bp[1]) === month && parseInt(bp[2]) === day;
};
