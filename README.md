# wuohome / ragic

窩的家內部 Ragic 工具集。

## weekly_intake.py — 進案量排行榜儀表板

從 Ragic 物件總表（含下架物件）抓近一年資料，產出可前端動態篩選日期區間的 HTML 儀表板，並依「開發業務」子表的「比例」欄位計算每位開發人員的進案間數。

### 功能

- 📅 **動態日期篩選** — 預設本週，可切換本週 / 上週 / 本月 / 上月 / 近 30 / 近 90 天，或自訂任意區間
- 🏆 **依比例計算開發量** — 例：張忠豪 100% + 蕭眞儀 0% → 張忠豪 +1 間、蕭眞儀 0 間
- 📋 **進案明細** — 已下架物件灰底＋刪除線標示
- 📦 **Markdown 歸檔** — 順手把當週快照存成 `reports/{ISO週}_週進案量.md`

### 安裝與設定

```bash
git clone https://github.com/wuohome/ragic.git
cd ragic
cp .env.example .env
# 編輯 .env 填入 RAGIC_API_KEY
```

### 執行

```bash
# Linux / macOS
export $(cat .env | xargs) && python weekly_intake.py

# Windows (PowerShell)
Get-Content .env | ForEach-Object { $k,$v = $_.Split('='); [Environment]::SetEnvironmentVariable($k,$v) }
python weekly_intake.py

# 或指定特定週
python weekly_intake.py 2026-03-30
```

輸出：
- `dist/intake-ranking.html` — 互動式儀表板（瀏覽器開啟）
- `reports/{ISO年}-W{週次}_週進案量.md` — Markdown 快照

### 資料來源

- 表單：[物件總表](https://ap15.ragic.com/wuohome/operation/4)（key `1000121`）
- 主要欄位：
  - `1000260` 委託時間(起)
  - `1000707` 狀態
  - `_subtable_1000254` 開發業務子表
    - `1000251` 開發人員
    - `1000253` 比例

### 計算邏輯

```
開發間數 = Σ (該案開發業務子表中該人員的「比例」)
```

範例：
| 案件 | 開發業務 | 張忠豪計 | 蕭眞儀計 |
|---|---|---|---|
| 案 A | 張忠豪 100% | 1.00 | 0 |
| 案 B | 張忠豪 50% / 蕭眞儀 50% | 0.50 | 0.50 |
| 合計 | | **1.50** | **0.50** |
