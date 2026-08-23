# Чистый bounded-кандидат: права записи рассылки и публичного адреса клиники

**Источник оракула:** `docs/_TODO/CURRENT_GOAL.md` — «Полностью работающая система на TEST и закрытый трек D.»

Канон — `AGENTS.md`: перед каждым действием выполнить карту заголовков и прочитать применимые §1, §5,
§10a/§10b и §24. Работать от актуальной `feat/doctor-ui-rebuild` в новой чистой ветке. Ветка
`wt/runtime-write-grants-20260823` — только источник для чтения: целиком её не переносить и не менять.

## Authority и точный scope

Закрыть ровно два уже воспроизведённых отказа TEST/DEV:

1. отправка рассылки под staff-принципалом упирается в `42501` на `broadcast_audit` /
   `broadcast_audit_recipients`;
2. создание публичного адреса клиники упирается в `42501` на `clinic_public_directory_entries`.

Из кандидата `567ae66ac` перенести только минимальные подтверждённые изменения:

- недостающие колоночные INSERT `broadcast_audit.organization_id`, `broadcast_audit.executed_at`,
  `broadcast_audit_recipients.organization_id`;
- недостающие Drizzle-колонки INSERT `clinic_public_directory_entries`: `description`,
  `public_contact_phone`, `public_contact_email`, `public_website_url`, `locations_json`, `logo_media_id`,
  `photo_media_ids`, `card_is_published`;
- узкий rollback-only DB-proof этих двух путей, где инъекция отзывает по одной конкретной колонке.

Не переносить migration `20260823T050000_operator_alert_dedup_gets_named_doors.sql`, operator-alert,
telemetry/HLS, runtime census и любые другие изменения салважа. Не заводить новую функцию/обёртку/гейт, если
можно параметризовать или сузить существующий DB-proof и declaration.

## Доказательство

- Права меняются только через `declaration.ts` и генератор; в миграциях нет GRANT/REVOKE/ROLE/POLICY.
- Живой rollback-only DEV: собственная organization проходит, чужая получает RLS-отказ для обоих путей.
- Отзыв каждой названной колонки отдельно красит DB-proof; `REVOKE ... ON TABLE` для инъекции запрещён.
- Оба generated `--check`, targeted privilege tests, webapp typecheck и scoped lint зелёные.
- Full CI не запускать: это локальный bounded-кандидат; он потребуется после интеграции нескольких веток.

Отчёт `docs/_TODO/runs/integrator-cleanup/RUNTIME_WRITE_GRANTS_CLEAN_2026-08-23.md`. Явно перечислить
перенесённые и сознательно не перенесённые файлы. Закоммитить только scoped-файлы до конца хода. `--execute`,
TEST, PROD, push запрещены. Ветки/файлы инициативы Therapysto не читать, не менять и не включать в commit.
Уложиться в 25 минут.
