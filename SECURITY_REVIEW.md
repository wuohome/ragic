# Git 安全檢查報告（依照「資安從一行 git 開始」）

檢查時間：2026-02-25 15:40:00 UTC

## 檢查範圍
- 目前 repository 所有追蹤檔案（HTML / 圖片 / 設定檔）
- Git commit 歷史
- pre-commit 防線
- CI/CD secret 掃描

## 檢查結果摘要
1. **目前追蹤檔案明文金鑰：已移除（本次修正）**。
2. **`.gitignore`：已配置**（避免常見憑證/敏感檔案誤提交）。
3. **pre-commit：已配置**（`detect-private-key` + `gitleaks`）。
4. **CI/CD：已配置**（GitHub Actions gitleaks 掃描）。
5. **歷史紀錄風險：仍存在**（舊 commit 可還原已曝光 key）。

## 本次修正內容
- 將 `map.html`、`from.html`、`earnest.html`、`schedule.html` 的硬編碼 API key 改為「執行期注入」。
- 支援來源：
  - URL query（例如 `?ragic_api_key=...`、`?maps_key=...`）
  - `localStorage`（如 `localStorage.RAGIC_API_KEY`）
  - `window.__APP_CONFIG__`（部署時注入）
- 若未提供金鑰，前端會明確提示錯誤並中止對外 API 呼叫，避免空請求與誤判。

## 風險說明（仍需處理）
- **歷史外洩仍有效**：先前提交過的 key 仍可從 git history 取回。
- 建議：
  1. 立即輪替所有曾曝光的 key。
  2. 依服務設定 referrer/IP/權限最小化。
  3. 若要根治歷史風險，使用 `git filter-repo`/BFG 清理歷史並通知重拉。

## 新增/維護防護檔案
- `.gitignore`
- `.pre-commit-config.yaml`
- `.github/workflows/secret-scan.yml`

## 相容性（避免網頁失效）
- 本次已加入 **多別名相容讀取**，以下任一方式都可提供金鑰：
  - Query：`ragic_api_key`、`ragic_key`、`APIKey`、`maps_key`
  - localStorage：`RAGIC_API_KEY`、`RAGIC_KEY`、`MAPS_KEY`
  - `window.__APP_CONFIG__`：同名欄位
- 目標是降低改版造成「API 連不上」的機率；若未提供金鑰，頁面會顯示明確提示。
