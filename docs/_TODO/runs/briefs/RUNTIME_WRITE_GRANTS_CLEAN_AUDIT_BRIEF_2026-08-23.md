# Независимый аудит — узкие runtime INSERT-grants

## Режим: тест или взгляд

Смешанный проход по `AGENTS.md` §24.4: точный состав ролей/отношений/колонок и отсутствие лишнего проверяются
взглядом на diff и сгенерированные SQL; достижимое INSERT/RLS-поведение — существующим rollback-only тестом на
именованной DEV. Прочитать `AGENTS.md` (маршрут, §1, §5, §10a/10b, §24) до действий.

## Authority

- `docs/_TODO/CURRENT_GOAL.md`: «**Полностью работающая система на TEST и закрытый трек D.**»
- исходная runtime-находка из handoff: приложение получает `42501` на записи рассылок и публичного адреса клиники;
- кандидат `796f88d48` в `wt/runtime-write-grants-clean-20260823`;
- отчёт `docs/_TODO/runs/integrator-cleanup/RUNTIME_WRITE_GRANTS_CLEAN_2026-08-23.md`.

## Scope и запреты

Проверить только:

1. `app_staff` INSERT `public.broadcast_audit`: добавлены ровно `organization_id`, `executed_at`;
2. `app_staff` INSERT `public.broadcast_audit_recipients`: добавлен ровно `organization_id`;
3. `app_staff` INSERT `public.clinic_public_directory_entries`: добавлены ровно восемь фактически emitted
   Drizzle-колонок (`description`, `public_contact_phone`, `public_contact_email`, `public_website_url`,
   `locations_json`, `logo_media_id`, `photo_media_ids`, `card_is_published`);
4. generated DEV/TEST SQL побайтно следует рукописному `relation-access.ts`;
5. существующий `runtime-role-write-grants.devDbProof.test.mjs` независимо доказывает: полный штатный INSERT
   проходит, отзыв каждой новой колонки даёт `42501`, чужая организация закрыта RLS, всё завершается rollback;
6. в кандидат не попали operator-alert migration/functions, HLS/media telemetry, широкая census-обёртка,
   `outgoing_delivery_queue`, Therapysto или иной несвязанный scope.

Не трогать `wt/night-*`, `wt/therapysto-*`, `wt/reaudit-*` и файлы инициативы Therapysto. Не менять продуктовый
код. Аудитор может оставить только audit-artifact и строку с бинарным вердиктом по `796f88d48` в
`docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md`; их нужно закоммитить явными путями до конца хода.

## Критерий

`PASS, FOR LAND` только если все шесть пунктов доказаны. Иначе `FAIL, NOT FOR LAND` с достижимым сценарием,
impact и точным нарушенным требованием. Полный CI, deploy, push, PROD и `--execute` не выполнять. Долгого
фонового ожидания нет: закончить отчётом, записью очереди и коммитом за один ход, до 25 минут.
