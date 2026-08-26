# Domain access audit — messages, comments, broadcasts and notification settings (2026-08-26)

## Authority

Read `AGENTS.md` heading map before every action, then §1/§1a/§1b, §2–§6, §9, §10a, §10b and §24 in full.
Product authority: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` D3, D4, D7, D17, D20 and E2;
`docs/ARCHITECTURE/NOTIFICATION_CHANNELS.md`; `docs/OWNER_DECISIONS.md`. Candidate is the current
`feat/doctor-ui-rebuild` head contained by this audit worktree.

Owner oracle from `docs/OWNER_DECISIONS.md`:
> «любой запрос к базе данных без контекста и точного совпадения разрешений выдаёт 0 строк и пишет ошибку в журнал»

## Тест или взгляд

This is an independent whole-path audit, not a product fixer. Inspect one-time structure, grants and generated
artifacts; use only smallest targeted behavior checks and safe rollback-only named DEV/TEST probes under real roles.
Never use a disposable database. Do not deploy, push, run full CI, print secret values, send real broadcasts or leave
durable rows. Do not edit production code or leave temporary fault injections. Return findings in the final log; make
no commit unless a durable acceptance test is justified by §10a/§10b.

## Required audit

Before reading existing tests, derive a blind kill-set. Trace complete positive, denial, retry and unsubscribe paths:

1. Patient ↔ clinic conversations, support questions, doctor replies, appointment/program comments and unread/status
   updates; archived patients must retain the product-defined conversation behavior and blocked patients must be
   denied where required.
2. Doctor broadcasts through branded clinic channels, ordinary notification messages through allowed personal
   channels, topic preferences and signed unsubscribe. Verify branded-only broadcast restriction without weakening
   ordinary bot notifications or phone confirmation.
3. Enumerate every port/function/relation/trigger and runtime role; check exact CRUD/EXECUTE, owner, definer/invoker,
   RLS, context and tenant binding. Include audit/action journals only where the real path reads or writes them.
4. Compare with privilege declarations, generated DEV/TEST artifacts, runtime overlays and configuration ownership:
   clinic SMTP/sender/address, Telegram/MAX bot binding, global capability, per-clinic enablement and per-user channel
   preference. Detect configured-but-unusable channels, wrong-tenant fallback, old mirrors and duplicate writers.
5. Findings require a reachable scenario, user impact, exact seam, violated authority and exact evidence command.
   Style and speculative hardening are not findings.

Output a compact matrix `user action → runtime role → function/port → relations/settings → PASS|FAIL|BLOCKED`, then
one deduplicated MUST-FIX list and unproved live cases.
