# ⚠️ 這裡是唯讀鏡像，不是部署來源

`index.js` 是 Cloudflare Worker `wuohome-ragic-proxy` 的**副本**，放在這裡只為了讓程式碼進版控、有異地備份、方便在 Windows 上 review。

**改這個檔案不會有任何效果。** 部署來源是另一台機器：

| | 位置 |
|---|---|
| **真正的部署來源** | Mac Mini `9m@100.79.78.99` → `~/Projects/wuohome-ragic-proxy/src/index.js` |
| 部署設定 | 同目錄 `wrangler.toml`（`main = "src/index.js"`） |
| 部署指令 | `cd ~/Projects/wuohome-ragic-proxy && wrangler deploy` |
| 這份鏡像 | 你正在看的 `worker-proxy-src/index.js` — 唯讀 |

## 為什麼會有這個警告

2026-06 做 591 拋轉時，有人把當時的 Worker 原始碼複製一份進這個 repo，之後就沒再同步。到 2026-07-26 已經落後 2774 行。

那天要修「見紅休三度誤排」，developer 把伺服器端驗證寫在**這份副本**上，寫完、commit、通過測試 —— 但那是死碼，部署上去的 Worker 根本沒有這段。差點就當成修好了。

同類事故在規格書裡至少記過三次（2026-05-13 `invalid_rid`、2026-07-22 v39 死碼兩天），根因都是「不確定該改哪一份」。

## 要改 Worker 的正確流程

1. SSH 進 Mac Mini，改 `~/Projects/wuohome-ragic-proxy/src/index.js`
2. 改前先備份：`cp src/index.js src/index.js.bak-before-<主題>-<日期>`
3. **`wrangler deploy` 是第一動，不是 `git commit`**（Worker 整包部署，禁止累積多支 fix 才 deploy）
4. 打真實 API 驗證，並抽驗 3 個既有 action 確認沒弄壞別的
5. Mac Mini 本地 commit（該 repo 無 remote）
6. 回到這個 repo 執行下面的同步指令，讓鏡像跟上

```bash
scp 9m@100.79.78.99:'~/Projects/wuohome-ragic-proxy/src/index.js' worker-proxy-src/index.js
```

## 已知風險（尚未處理）

Mac Mini 那個 repo **沒有 git remote**，是純本機 repo。那台硬碟掛掉，全公司斡旋、定金、地圖、591、點名、工作日誌的後端原始碼就沒有了 —— 這份鏡像是目前唯一的異地備份，所以請保持同步。

規格書：[`窩的家/系統部/規格書/Ragic_Worker_Proxy_規格書.md`](../../../../Second%20Brain/Obsidian/) （Obsidian vault）
