-- =====================================================================================
-- 窩的家 Supabase — 場勘規劃書 雲端草稿 建表 SQL
-- 建立日期：2026-08-03
-- 架構依據：窩的家/系統部/規格書/場勘規劃書_規格書.md
--          窩的家/系統部/評估與討論/車可充移植包_評估與架構決策_2026-07-26.md
-- 指示來源：Joan 2026-08-03「我不要寫回 RAGIC 我要求寫進 SUPABASE」
--
-- 執行方式：Supabase Dashboard → SQL Editor → 貼上整份 → Run
-- 可重複執行（全部 IF NOT EXISTS / OR REPLACE），跑第二次不會壞資料。
--
-- ⚠️ 尚未執行。Worker 端 action 未建（2026-08-03 該 Worker 有另一 session 在改）。
-- =====================================================================================


-- =====================================================================================
-- 1. 草稿表
--    一位場勘人員可有多份草稿。草稿內容整包存 JSONB（前端 S 物件的 snapshot），
--    不拆欄位——欄位還在跟勁豪確認中，拆了每次調整都要改 schema 與 Worker。
--    查詢只靠 reporter / updated_at，不查 JSONB 內部，故不建 GIN 索引。
-- =====================================================================================

create table if not exists public.survey_drafts (
  id               text        primary key,          -- 前端 genId() 產生，如 d1754212345abc
  reporter         text        not null,             -- 場勘人員姓名。由 Worker 依 token 決定，前端無法指定
  name             text        not null default '',  -- 草稿顯示名，前端 draftName()：縣市區＋姓＋稱謂
  step             smallint    not null default 0,   -- 使用者離開時停在第幾步（0-4）
  payload          jsonb       not null,             -- 完整草稿：cover/site/device/power/install/cpages/notes/bom
  size_kb          integer     not null default 0,   -- 便於前端顯示與容量預警（照片是 base64，會胖）
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table  public.survey_drafts is
  '場勘規劃書雲端草稿。前端經 Cloudflare Worker 存取，不直連。平板現場填→公司電腦續編。';
comment on column public.survey_drafts.reporter is
  '場勘人員姓名。由 Worker 依 token 決定，前端無法指定——沿用工作日誌的防冒名防線。';
comment on column public.survey_drafts.payload is
  '前端 snapshot() 的整包 JSON。刻意不拆欄位：欄位定義未定案（屋齡分級／電梯／冷氣三項待 Joan 拍板）。';
comment on column public.survey_drafts.size_kb is
  '草稿位元組數／1024。照片以 base64 存在 payload 內，Free 版 500MB 上限要靠這欄監看。';


-- =====================================================================================
-- 2. 索引
-- =====================================================================================

-- 列表頁：某人的草稿依最後編輯時間排序
create index if not exists survey_drafts_reporter_updated_idx
  on public.survey_drafts (reporter, updated_at desc);

-- 保留期清理用（若日後要做）
create index if not exists survey_drafts_updated_idx
  on public.survey_drafts (updated_at desc);


-- =====================================================================================
-- 3. updated_at 自動更新
--    touch_updated_at() 已由 worklog_schema.sql 建立；此處 or replace 保持冪等。
-- =====================================================================================

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists survey_drafts_touch_updated_at on public.survey_drafts;
create trigger survey_drafts_touch_updated_at
  before update on public.survey_drafts
  for each row execute function public.touch_updated_at();


-- =====================================================================================
-- 4. RLS — 全鎖，只有 Worker 的 service_role 進得來
--
--    ⚠️ 與彣錩原始碼相反，不要照抄它。
--    車可充 10-場勘規劃書的 supabase-setup.sql L30-36 用 for all to anon
--    using(true) with check(true)，等於全網任何人可讀可改可刪。
--    那不是疏漏，是它刻意保留的 MVP 政策。
--
--    窩的家：啟用 RLS 且不建任何 policy → anon / authenticated 全部拒絕。
--    service_role 依 Supabase 設計繞過 RLS，只有持該 key 的 Worker 能存取。
-- =====================================================================================

alter table public.survey_drafts enable row level security;

-- 明確撤銷，不倚賴預設值
revoke all on public.survey_drafts from anon, authenticated;

-- ⚠️ 用 psql 以 postgres 身分建表時，Supabase Dashboard 那套 default privileges
--    不會自動套到 service_role，必須明確 grant，否則 API 會回
--    42501 permission denied for table（2026-08-03 實際踩到）。
--    這不影響安全性：service_role 本來就是繞過 RLS 的後端專用角色，
--    key 只存在 Vercel 環境變數，不會出現在前端。
grant select, insert, update, delete on public.survey_drafts to service_role;


-- =====================================================================================
-- 5. 驗收
-- =====================================================================================

-- 應看到 8 個欄位
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'survey_drafts'
order by ordinal_position;

-- 應看到 rowsecurity = true
select relname, relrowsecurity
from pg_class
where relname = 'survey_drafts';

-- 應該是 0 筆（不建任何 policy 才是對的）
select count(*) as policy_count
from pg_policies
where schemaname = 'public' and tablename = 'survey_drafts';
