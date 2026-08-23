# Повторный независимый аудит D17 seam-owner, круг 2

**Источник оракула:** `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` — «узкая роль интегратора не мешает доставке».

Канон — `AGENTS.md`: перед каждым действием выполнить карту заголовков и прочитать применимые §1, §5,
§10a/§10b и §24. Ветка-кандидат `wt/d17-seam-owner-20260823`, исправление `ed8aaa1c1` поверх аудита
`ac1a68fa4`. Отчёты предыдущих ходов — входные данные, не доказательство.

## Scope и классификация «тест или взгляд»

Проверяется только снятие трёх блокеров аудита `D17_SEAM_OWNER_AUDIT_2026-08-23.md` и связанное исправление
переписи:

1. `user_channel_preferences` снова имеет только прежние пять колоночных SELECT, без табличного SELECT —
   **взгляд** на declaration/generated ACL и живую introspection в rollback-only транзакции.
2. `user_contacts` добавляет только `confirmed_at` и `is_primary`, не открывая остальные колонки —
   **взгляд + поведение**.
3. DB-proof краснеет при отзыве именно этих двух колонок, а не при `REVOKE ... ON TABLE` — **поведение**.
4. Census больше не схлопывает разные функции через aggregate/min и печатает разрыв по каждой функции —
   **взгляд + точечная инъекция**, если она дёшева.

## Обязательное независимое доказательство

- Своим rollback-only проходом на именованной DEV доказать три состояния для
  `app.read_integrator_delivery_target_snapshot(...)`: полный кандидат → успех; отозваны только
  `confirmed_at,is_primary` → `42501`; возвращены эти две колонки → успех.
- Отдельно доказать, что `app_seam_delivery_scope_owner` не читает `user_contacts.source_origin`, `id`,
  `created_at`, `updated_at` и не имеет табличного SELECT ни на `user_contacts`, ни на
  `user_channel_preferences`.
- Проверить diff всего кандидата относительно актуальной `feat/doctor-ui-rebuild`; изменения соседней
  Therapysto-инициативы не читать, не менять и не включать в verdict.
- Проверить оба generated `--check`, targeted privilege tests и затронутый DB-proof. Full CI не нужен:
  scope локальный, repo-level риска нет.

Аудитор продуктовый fix не делает. Временные инъекции обязан откатить. При PASS/FAIL записать один отчёт
`docs/_TODO/runs/integrator-cleanup/D17_SEAM_OWNER_REAUDIT2_2026-08-23.md`, строку вердикта в audit queue и
закоммитить только эти audit-artifacts. `--execute`, TEST, PROD, push запрещены. Уложиться в 25 минут; до конца
хода отчёт и коммит обязательны.

Вердикт: одна строка `PASS, FOR LAND` либо `FAIL, NOT FOR LAND` с конкретным достижимым impact.
