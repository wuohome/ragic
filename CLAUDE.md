# Claude Code notes for `wuohome/ragic`

This repo contains GitHub Pages frontends and Ragic utility scripts for Wuohome. For the scheduling UI (`schedule.html`, `schedule-view.html`, `schedule-common.js`), do **not** infer business rules only from code comments or current Ragic rows.

## Canonical scheduling docs

Before changing schedule behavior, read these Obsidian PRDs on Joan's Windows machine:

- `C:/Second Brain/Obsidian/窩的家/系統部/排班表/排班表_規格書.md` — current schedule rules. This is the main source of truth.
- `C:/Second Brain/Obsidian/窩的家/系統部/每日行程點名/每日行程點名_規格書.md` — LINE/n8n daily check-in, trash duty, and environmental cleaning fee rules.
- `C:/Second Brain/Obsidian/窩的家/系統部/排班表/排班表_開發紀錄.md` — history only; current rules override old entries.

## Scheduling rule guardrails

- 4F is Friday-only. Non-Friday days should expect only 1F/2F/3F.
- Trash duty (`全棟垃圾清運`) is separate from floor duty and avoids Wednesday/Sunday.
- Manual changes must not be overwritten by auto-scheduling.
- Existing Ragic fields are overloaded: `1002026 部門` is also used for source labels, `1000967 備註` stores floor/trash/reason, and `1000966 是否計入8天` also stores missed states. Treat this as technical debt, not a clean schema.

## Fairness / debt model for future optimization

Joan does **not** want a simple "this month count" or "previous month count" fairness model.

Future schedule dashboard / auto-schedule work should follow the PRD's v2 principle:

- use long-term weighted fairness ledgers, not only current-month totals;
- keep separate ledgers for floor duty, trash duty, and evening duty;
- compute `expected`, `actual`, and `debt = expected - actual`;
- calculate `expected` from each day's eligible people, excluding leave, gov-rest, long leave, post-resignation dates, and protected newcomer periods;
- missed floor duty / missed trash duty gives no `actual` credit;
- 2026/07/01 is the environmental-maintenance fee cutover:
  - before 2026/07/01: no retroactive fee; historical missed work may be discounted and used only as fairness reference;
  - on/after 2026/07/01: missed floor duty = 200, missed trash duty = 300, and payment does not count as completed work;
- resignation after scheduling: future duties after resignation date should be voided/reassigned, not marked missed or fined;
- proxy/代理 completion: proxy gets completion credit; original assignee gets no completion credit but is not fined if coordinated in advance.

Do not implement a new fairness dashboard that marks someone "overloaded" from current-month totals alone. It must explain whether high load is debt repayment or true over-assignment.

## Verification expectations

This repo has no canonical test suite for the static schedule pages. For schedule changes, create a focused temporary verification script under OS temp (`hermes-verify-*`) that checks local source, deployed GitHub Pages assets when relevant, and live Ragic invariants. Report it as ad-hoc verification, not suite green.
