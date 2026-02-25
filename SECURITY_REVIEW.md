# Git 安全檢查報告（依照「資安從一行 git 開始」）

檢查時間：2026-02-25 15:26:42 UTC

## 檢查範圍
- 目前 repository 所有追蹤檔案（HTML / 圖片 / 設定檔）
- Git commit 歷史
- 是否具備 pre-commit 檢查
- 是否具備 CI/CD secrets 掃描

## 檢查結果摘要
1. **敏感資訊外洩風險：有**
   - 在前端檔案中發現 Google Maps Key 與 Ragic API Key（硬編碼）。
2. **.gitignore：原本缺少**
   - 已補上常見敏感檔案忽略規則。
3. **pre-commit：原本未配置**
   - 已新增 `detect-private-key` 與 `gitleaks` pre-commit 規則。
4. **CI/CD 最後防線：原本未配置**
   - 已新增 GitHub Actions 的 gitleaks 掃描工作流程。
5. **歷史紀錄風險：有**
   - 偵測到同一把 API key 曾在多個歷史 commit 出現。

## 發現明細
### 1) 目前檔案中的疑似敏感資訊
- `map.html` 內含 `MAPS_KEY` 與 `RAGIC_KEY`。
- `from.html` 內含 `APIKey=...`（form action 與 JS 常數）。
- `schedule.html` 內含 `RAGIC_CONFIG.API_KEY`。

### 2) 歷史紀錄
- 經 `git rev-list --all` + `git grep` 掃描，發現 Maps key 在多個歷史 commit 皆可被還原。
- 代表即使後續移除目前檔案中的 key，若不清理 Git 歷史，外洩風險仍在。

## 建議後續處置（高優先）
1. **立即輪替（rotate）所有已曝光 API keys**。
2. **限制 API key 使用範圍**（HTTP referrer / IP / endpoint / quota）。
3. **避免前端硬編碼**：改由後端代理或部署平台注入（例如環境變數、server-side token exchange）。
4. **若需徹底補救歷史外洩**：使用 `git filter-repo` 或 BFG 清理歷史，並強制通知協作者重新 clone。

## 新增的防護檔案
- `.gitignore`
- `.pre-commit-config.yaml`
- `.github/workflows/secret-scan.yml`

