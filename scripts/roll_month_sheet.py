"""
業績表月度滾動 — 每月自動「複製上月表 → 改名新月 → 清空明細（保留標題/人名/公式）」

觸發時機：launchd com.joan.perf-month-roller 每日 07:00 Asia/Taipei
流程：Drive API 精確搜尋當月「{roc}年{月}月業績表」→ 命中就 skip（冪等）
      → 沒有就找上月表 → 複製 → 授權 SA writer → Sheets API 清空明細區 → sanity check
      → 成功發 OPS 通知；任一步失敗都發 OPS alert

# 憑證架構（2026-07-02 決定，詳見交付摘要「spec 外決定」）：
# - Drive 複製/改名/授權寫入 → OAuth（wuo.home，rclone remote gdrive-joan 的 refresh_token）
#   因為 SA 對母 folder 只有 Reader，無法 files.copy / files.update
# - Sheets batchUpdate 清空內容 → SA（perf-sa-key.json）
#   因為 rclone 預設 OAuth client（project 202264815644）沒開通 Sheets API，
#   而 SA 所屬 project（amazing-height-482211-t0）已開通（update_perf_md.py 一直在用）。
#   做法：OAuth 複製新檔後，用 Drive permissions.create 把 SA email 加為該檔 writer，
#   SA 再用 spreadsheets scope（非 readonly）呼叫 batchUpdate。verified 2026-07-02。
"""
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from google.oauth2 import service_account
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

SA_KEY = Path.home() / '.claude' / 'scripts' / 'perf-sa-key.json'
PARENT_FOLDER_ID = '1izWZC2w49BJGkMoWD5c_0UtIRrI9qkHx'  # 母 folder「薪資表」

# rclone 公開預設 OAuth client（rclone 自家 project，未開通 Sheets API，只拿來換 Drive token）
RCLONE_DEFAULT_CLIENT_ID = '202264815644.apps.googleusercontent.com'
RCLONE_DEFAULT_CLIENT_SECRET = 'X4Z3ca8xfWDb1Voo-F9a7ZxJ'

LOG_DIR = Path.home() / 'Library' / 'Logs' / 'perf-month-roller'

# 明細區關鍵字（見 EMPLOYEE_TAB 清空規則）
DETAIL_START_LABELS = ('成交案源名稱',)
RENEWAL_START_LABELS = ('本月續約業績', '本月續約/違約業績', '本月違約業績')
STOP_LABELS = ('總計', '合計')
# 不清空的固定資料區塊（常態設定值，非本月變動明細）
FIXED_SECTION_PREFIX = '（公司件）'


def log(msg: str):
    ts = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    line = f'{ts} {msg}'
    print(line)
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    log_file = LOG_DIR / f'{datetime.now():%Y-%m-%d}.log'
    with open(log_file, 'a', encoding='utf-8') as f:
        f.write(line + '\n')


def get_oauth_drive():
    """wuo.home OAuth（借 rclone remote gdrive-joan 的 refresh_token）— 給 Drive 寫入操作用"""
    dump = json.loads(
        subprocess.run(['/opt/homebrew/bin/rclone', 'config', 'dump'],
                        capture_output=True, text=True, check=True).stdout
    )
    g = dump['gdrive-joan']
    tok = json.loads(g['token'])
    client_id = g.get('client_id') or RCLONE_DEFAULT_CLIENT_ID
    client_secret = g.get('client_secret') or RCLONE_DEFAULT_CLIENT_SECRET
    creds = Credentials(
        token=None,
        refresh_token=tok['refresh_token'],
        token_uri='https://oauth2.googleapis.com/token',
        client_id=client_id,
        client_secret=client_secret,
    )
    return build('drive', 'v3', credentials=creds, cache_discovery=False)


def get_sa_clients():
    """SA（perf-sa-key.json）— 給 Sheets batchUpdate 清空操作用（該 project 已開通 Sheets API）"""
    creds = service_account.Credentials.from_service_account_file(
        str(SA_KEY), scopes=['https://www.googleapis.com/auth/spreadsheets']
    )
    sa_email = json.loads(SA_KEY.read_text())['client_email']
    return build('sheets', 'v4', credentials=creds, cache_discovery=False), sa_email


def execute_with_retry(request, max_retries: int = 4, base_delay: int = 5):
    """對 Drive/Sheets API request 的 .execute() 加 exponential backoff retry。

    2026-07-06 PERFFIX 根因：本腳本的 Drive 呼叫（get_oauth_drive）走 rclone 預設共用
    OAuth client（project 202264815644，未設自訂 client_id/secret，見 rclone config dump），
    該 client 的配額是全球 rclone 使用者共用池，偶發被別人瞬間打滿導致我們收到
    429 / 403 rateLimitExceeded（不是我方呼叫量過大——本腳本正常只打 1~2 次 Drive list）。
    永久解法是換成自己專用的 OAuth client_id（需 GCP console 建立 + 一次性瀏覽器授權，
    已標記給 Joan/main，見交付摘要），這裡先做重試作立即緩解。

    只重試「配額類」錯誤（429，或 403 且訊息含 rateLimitExceeded/userRateLimitExceeded）：
    這類錯誤代表請求在 Google 端閘道就被擋下、從未真正送到後端執行，重試不會造成重複寫入
    （即使是 files.copy / permissions.create 這種非冪等操作也安全）。
    其他錯誤（404/401/5xx 等非配額類）不重試、原樣往上拋，避免掩蓋真實故障。
    """
    from googleapiclient.errors import HttpError
    for attempt in range(max_retries + 1):
        try:
            return request.execute()
        except HttpError as e:
            status = getattr(e.resp, 'status', None)
            body = str(e)
            is_rate_limit = status == 429 or (
                status == 403 and ('rateLimitExceeded' in body or 'userRateLimitExceeded' in body)
            )
            if not is_rate_limit or attempt == max_retries:
                raise
            delay = base_delay * (2 ** attempt)
            log(f'[retry] Drive/Sheets API 遇配額限制（HTTP {status}），{delay}s 後重試'
                f'（第 {attempt + 1}/{max_retries} 次）: {body[:200]}')
            time.sleep(delay)


def send_ops_alert(msg: str):
    sys.path.insert(0, str(Path.home() / '.claude' / 'scripts'))
    try:
        from _secrets import OPS_BOT_TOKEN, OPS_CHAT_ID
    except Exception as e:
        log(f'[alert] cannot import OPS creds: {e}')
        return False
    url = f'https://api.telegram.org/bot{OPS_BOT_TOKEN}/sendMessage'
    data = urllib.parse.urlencode({'chat_id': OPS_CHAT_ID, 'text': msg}).encode()
    try:
        with urllib.request.urlopen(url, data=data, timeout=10) as r:
            r.read()
        log('[alert] sent to OPS bot')
        return True
    except Exception as e:
        log(f'[alert] send failed: {e}')
        return False


def _norm(s):
    return (s or '').replace(' ', '').replace('　', '').strip()


def _pick_exact_month_sheet(files: list, roc_year: int, month: int) -> Optional[dict]:
    """從 candidate 過濾「檔名去空格後精確 == {roc}年{month}月業績表」那張。
    複製自 update_perf_md.py 的 _pick_exact_month_sheet，不 import 以避免耦合。"""
    target = f'{roc_year}年{month}月業績表'
    exact = [f for f in files if _norm(f.get('name')) == target]
    if not exact:
        return None
    if len(exact) > 1:
        exact = sorted(exact, key=lambda x: x.get('modifiedTime', ''), reverse=True)
    return exact[0]


def find_exact_month_sheet(drive, roc_year: int, month: int) -> list:
    """回傳母 folder 內檔名精確符合「{roc}年{month}月業績表」的所有檔案（可能 0/1/多筆）"""
    name_q = f'{roc_year}年{month}月業績表'
    resp = execute_with_retry(drive.files().list(
        q=(
            f'"{PARENT_FOLDER_ID}" in parents'
            f' and mimeType="application/vnd.google-apps.spreadsheet"'
            f' and name contains "{name_q}"'
            f' and trashed=false'
        ),
        fields='files(id,name,modifiedTime,webViewLink)',
        orderBy='modifiedTime desc',
        supportsAllDrives=True,
        includeItemsFromAllDrives=True,
    ))
    files = resp.get('files', [])
    target = _norm(name_q)
    return [f for f in files if _norm(f.get('name')) == target]


def prev_month(roc_year: int, month: int):
    if month == 1:
        return roc_year - 1, 12
    return roc_year, month - 1


def clean_employee_tab_requests(sheet_id_num: int, rows: list, roc_year: int, month: int,
                                 prev_roc: int, prev_month_num: int) -> list:
    """組出單一 tab 的 batchUpdate requests：
    - 明細區（成交案源名稱 → 總計 之間）：清所有非公式 cell（含字串案名）
    - 續約/違約區（本月續約業績 等 → 總計 之間）：同上
    - （公司件）固定區塊 / 標題 / 獎金總計區：完全不清內容，只做月份字串替換
    rows: values().get 回來的 list[list[str]]（跟 update_perf_md.py 解析用同一種格式，
          用來定位關鍵字行號；實際清空動作用 userEnteredValue via updateCells）
    """
    requests = []
    n = len(rows)

    def col0(r):
        return (r[0] or '').replace('\t', '').strip() if r else ''

    def is_stop(label):
        return label.startswith(STOP_LABELS)

    i = 0
    clear_ranges = []  # list of (start_row_idx0, end_row_idx0_exclusive) 要整列清空(除公式外)
    while i < n:
        label = col0(rows[i])
        if label.startswith(DETAIL_START_LABELS) or label.startswith(RENEWAL_START_LABELS):
            start = i + 1  # 明細從 header/section 下一列開始
            j = start
            while j < n and not is_stop(col0(rows[j])):
                j += 1
            clear_ranges.append((start, j))
            i = j
            continue
        i += 1

    for (start0, end0) in clear_ranges:
        if end0 <= start0:
            continue
        requests.append({
            'updateCells': {
                'range': {
                    'sheetId': sheet_id_num,
                    'startRowIndex': start0,
                    'endRowIndex': end0,
                },
                'fields': 'userEnteredValue',
                # 不帶 rows = 清空整個 range 的 userEnteredValue（含公式與值）
            }
        })
        # 上面整片清空會連公式也砍掉；明細區的公式（獎金=D/2）本來就是隨案而生、
        # 案子清空後公式也該一併清掉（避免留下引用空白列的殘破公式），故整片清是對的。

    # 月份字串替換：對「不在 clear_ranges 內」的所有 stringValue cell 做文字替換
    clear_row_set = set()
    for (s, e) in clear_ranges:
        clear_row_set.update(range(s, e))

    replacements = [
        (f'{prev_roc}年{prev_month_num:02d}月', f'{roc_year}年{month:02d}月'),
        (f'{prev_roc}年{prev_month_num}月', f'{roc_year}年{month}月'),
        (f'{prev_month_num}月業績', f'{month}月業績'),
        (f'{prev_month_num}月薪資表', f'{month}月薪資表'),
    ]
    for ridx, r in enumerate(rows):
        if ridx in clear_row_set or not r:
            continue
        for cidx, cell in enumerate(r):
            if not cell or not isinstance(cell, str):
                continue
            new_val = cell
            changed = False
            for old, new in replacements:
                if old in new_val:
                    new_val = new_val.replace(old, new)
                    changed = True
            if changed:
                requests.append({
                    'updateCells': {
                        'range': {
                            'sheetId': sheet_id_num,
                            'startRowIndex': ridx,
                            'endRowIndex': ridx + 1,
                            'startColumnIndex': cidx,
                            'endColumnIndex': cidx + 1,
                        },
                        'rows': [{'values': [{'userEnteredValue': {'stringValue': new_val}}]}],
                        'fields': 'userEnteredValue',
                    }
                })
    return requests


def clean_shoudin_tab_requests(sheet_id_num: int, row_count: int) -> list:
    """收訂 tab：保留 row1（標題列），row2 以下整片清空 userEnteredValue"""
    if row_count <= 1:
        return []
    return [{
        'updateCells': {
            'range': {'sheetId': sheet_id_num, 'startRowIndex': 1, 'endRowIndex': row_count},
            'fields': 'userEnteredValue',
        }
    }]


def clean_summary_tab_requests(sheet_id_num: int, rows: list, roc_year: int, month: int,
                                prev_roc: int, prev_month_num: int) -> list:
    """業績表 tab：只做月份字串替換，不清任何 cell 值（幾乎全是引用人名 tab 的公式，
    來源清空後這裡的公式結果自然歸 0）"""
    requests = []
    replacements = [
        (f'{prev_month_num}月業績', f'{month}月業績'),
        (f'{prev_roc}年{prev_month_num:02d}月', f'{roc_year}年{month:02d}月'),
    ]
    for ridx, r in enumerate(rows):
        if not r:
            continue
        for cidx, cell in enumerate(r):
            if not cell or not isinstance(cell, str):
                continue
            new_val = cell
            changed = False
            for old, new in replacements:
                if old in new_val:
                    new_val = new_val.replace(old, new)
                    changed = True
            if changed:
                requests.append({
                    'updateCells': {
                        'range': {
                            'sheetId': sheet_id_num,
                            'startRowIndex': ridx,
                            'endRowIndex': ridx + 1,
                            'startColumnIndex': cidx,
                            'endColumnIndex': cidx + 1,
                        },
                        'rows': [{'values': [{'userEnteredValue': {'stringValue': new_val}}]}],
                        'fields': 'userEnteredValue',
                    }
                })
    return requests


def wipe_new_sheet(oauth_drive, sa_sheets, sheet_id: str, roc_year: int, month: int,
                    prev_roc: int, prev_month_num: int, sa_email: str):
    """把複製出來的新表清空明細（保留標題/人名/公式）。
    步驟：授權 SA writer → SA 讀 grid data（含 userEnteredValue）→ 組 requests → batchUpdate"""
    log(f'授權 SA ({sa_email}) 為新表 writer…')
    execute_with_retry(oauth_drive.permissions().create(
        fileId=sheet_id,
        body={'type': 'user', 'role': 'writer', 'emailAddress': sa_email},
        supportsAllDrives=True,
        sendNotificationEmail=False,
    ))

    meta = execute_with_retry(sa_sheets.spreadsheets().get(
        spreadsheetId=sheet_id,
        includeGridData=True,
        fields='sheets(properties(title,sheetId,gridProperties),data(rowData(values(userEnteredValue))))'
    ))

    all_requests = []
    for sh in meta['sheets']:
        title = sh['properties']['title']
        sid = sh['properties']['sheetId']
        row_count = sh['properties'].get('gridProperties', {}).get('rowCount', 0)
        row_data = sh.get('data', [{}])[0].get('rowData', [])
        # 轉成跟 update_perf_md.py values().get 相容的 rows（純字串/公式字串）
        rows = []
        for rd in row_data:
            vals = rd.get('values', [])
            row = []
            for v in vals:
                uev = v.get('userEnteredValue')
                if uev is None:
                    row.append('')
                elif 'formulaValue' in uev:
                    row.append(uev['formulaValue'])
                elif 'stringValue' in uev:
                    row.append(uev['stringValue'])
                elif 'numberValue' in uev:
                    row.append(str(uev['numberValue']))
                else:
                    row.append('')
            rows.append(row)

        if title == '測試':
            log(f'  tab「{title}」跳過（非正式員工 tab，不動）')
            continue
        if title == '收訂':
            reqs = clean_shoudin_tab_requests(sid, max(row_count, len(rows)))
            log(f'  tab「{title}」明細清空 requests: {len(reqs)}')
            all_requests.extend(reqs)
            continue
        if title == '業績表':
            reqs = clean_summary_tab_requests(sid, rows, roc_year, month, prev_roc, prev_month_num)
            log(f'  tab「{title}」月份替換 requests: {len(reqs)}')
            all_requests.extend(reqs)
            continue
        # 其餘視為人名 tab
        reqs = clean_employee_tab_requests(sid, rows, roc_year, month, prev_roc, prev_month_num)
        log(f'  tab「{title}」明細清空+月份替換 requests: {len(reqs)}')
        all_requests.extend(reqs)

    if not all_requests:
        log('沒有任何 batchUpdate request，異常（新表應該至少有明細要清）')
        return False

    # Sheets API batchUpdate 單次 request 數量沒有嚴格上限，但保守起見分批送出
    BATCH_SIZE = 300
    for k in range(0, len(all_requests), BATCH_SIZE):
        chunk = all_requests[k:k + BATCH_SIZE]
        execute_with_retry(sa_sheets.spreadsheets().batchUpdate(
            spreadsheetId=sheet_id, body={'requests': chunk}
        ))
        log(f'  batchUpdate 送出 {len(chunk)} requests（{k}~{k+len(chunk)}/{len(all_requests)}）')

    return True


def sanity_check(sa_sheets, sheet_id: str) -> tuple:
    """清完後重新 values.get 每個人名 tab，assert：
    (a) 「成交案源名稱」與「總計」之間全空
    (b) 兩個「總計」列的數字欄位值為 0 或空
    回傳 (ok: bool, detail: str)"""
    meta = execute_with_retry(sa_sheets.spreadsheets().get(
        spreadsheetId=sheet_id, includeGridData=False,
        fields='sheets(properties(title))'
    ))
    titles = [s['properties']['title'] for s in meta['sheets']]
    problems = []

    for title in titles:
        if title in ('測試', '收訂', '業績表'):
            continue
        try:
            data = execute_with_retry(sa_sheets.spreadsheets().values().get(
                spreadsheetId=sheet_id, range=f"'{title}'!A1:N200"
            ))
            rows = data.get('values', [])
        except Exception as e:
            problems.append(f'{title}: fetch fail {e}')
            continue

        def col0(r):
            return (r[0] or '').replace('\t', '').strip() if r else ''

        def to_int(s):
            s = (s or '').replace(',', '').replace('\t', '').strip()
            if not s or s in ('—', '-', '_'):
                return 0
            try:
                return int(float(s))
            except ValueError:
                return 0

        n = len(rows)
        i = 0
        while i < n:
            label = col0(rows[i])
            if label.startswith(DETAIL_START_LABELS) or label.startswith(RENEWAL_START_LABELS):
                j = i + 1
                while j < n and not col0(rows[j]).startswith(STOP_LABELS):
                    r = rows[j] if j < len(rows) else []
                    if any((c or '').strip() for c in r):
                        problems.append(f'{title}: row{j+1} 明細區未清空 -> {r}')
                    j += 1
                # 檢查 stop row（總計列）的數字欄位
                if j < n:
                    total_row = rows[j]
                    for cidx in (2, 3):
                        if len(total_row) > cidx:
                            v = to_int(total_row[cidx])
                            if v != 0:
                                problems.append(f'{title}: row{j+1} 總計列 col{cidx} 非 0 -> {v}')
                i = j
                continue
            i += 1

    return (len(problems) == 0, '; '.join(problems[:20]))


def ensure(roc: int, month: int):
    log(f'=== ensure {roc}年{month}月業績表 ===')
    oauth_drive = get_oauth_drive()
    sa_sheets, sa_email = get_sa_clients()

    hits = find_exact_month_sheet(oauth_drive, roc, month)
    if len(hits) > 1:
        names = [h['name'] for h in hits]
        msg = f'⚠️ 同名業績表有 {len(hits)} 張：{names}\nauto-detect 會取最近修改那張，請刪除重複檔案。'
        log(msg)
        send_ops_alert(msg)
        return
    if len(hits) == 1:
        log(f"已存在：{hits[0]['name']} (id={hits[0]['id']})，skip（冪等）")
        return

    # 0 張 → 找上月表
    prev_roc, prev_m = prev_month(roc, month)
    prev_hits = find_exact_month_sheet(oauth_drive, prev_roc, prev_m)
    if not prev_hits:
        msg = f'⚠️ 找不到 {roc}年{month}月業績表，且上月 {prev_roc}年{prev_m}月業績表也不存在，無法複製建表。請人工確認母 folder。'
        log(msg)
        send_ops_alert(msg)
        sys.exit(1)
        return
    if len(prev_hits) > 1:
        prev_hits = sorted(prev_hits, key=lambda x: x.get('modifiedTime', ''), reverse=True)
    src = prev_hits[0]
    log(f"上月表命中：{src['name']} (id={src['id']})，開始複製…")

    new_name = f'{roc}年{month}月業績表'
    copied = execute_with_retry(oauth_drive.files().copy(
        fileId=src['id'],
        body={'name': new_name, 'parents': [PARENT_FOLDER_ID]},
        supportsAllDrives=True,
    ))
    new_id = copied['id']
    log(f'已複製 -> {new_id}')

    ok = wipe_new_sheet(oauth_drive, sa_sheets, new_id, roc, month, prev_roc, prev_m, sa_email)
    if not ok:
        msg = f'❌ {new_name} 清空 batchUpdate 失敗（無 requests 產生），請人工檢查'
        log(msg)
        execute_with_retry(oauth_drive.files().update(
            fileId=new_id, body={'name': f'{new_name}_DRAFT_清空失敗'}, supportsAllDrives=True
        ))
        send_ops_alert(msg)
        sys.exit(1)
        return

    check_ok, detail = sanity_check(sa_sheets, new_id)
    if not check_ok:
        msg = f'❌ {new_name} sanity check 失敗，已改名避免業績 cron 誤讀：\n{detail}'
        log(msg)
        execute_with_retry(oauth_drive.files().update(
            fileId=new_id, body={'name': f'{new_name}_DRAFT_清空失敗'}, supportsAllDrives=True
        ))
        send_ops_alert(msg)
        sys.exit(1)
        return

    url = f'https://docs.google.com/spreadsheets/d/{new_id}/edit'
    log(f'sanity check 通過。新表 URL: {url}')
    msg = (
        f'✅ 已自動建立 {new_name}\n'
        f'{url}\n'
        f'已複製上月格式並清空明細（標題/人名/公式保留）。\n'
        f'請轉知珊珊直接使用這張表，勿另建同名新表。'
    )
    send_ops_alert(msg)
    log(f'完成：{new_name} (id={new_id})')


def main():
    taipei = timezone(timedelta(hours=8))
    now = datetime.now(taipei)
    roc = now.year - 1911
    month = now.month

    targets = [(roc, month)]

    # 若今天是本月最後一天，額外處理下月
    tomorrow = now + timedelta(days=1)
    if tomorrow.month != now.month:
        if month == 12:
            targets.append((roc + 1, 1))
        else:
            targets.append((roc, month + 1))

    for (r, m) in targets:
        try:
            ensure(r, m)
        except Exception as e:
            msg = f'❌ roll_month_sheet.py 對 {r}年{m}月 執行時 exception：{e}'
            log(msg)
            send_ops_alert(msg)
            raise


if __name__ == '__main__':
    main()
