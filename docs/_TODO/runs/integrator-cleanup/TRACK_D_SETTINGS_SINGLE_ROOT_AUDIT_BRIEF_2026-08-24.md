# Тест или взгляд — независимый аудит единственного settings root

Сначала прочитай `AGENTS.md`: карту заголовков перед каждым действием, §1 о миграциях и разборе прав, §4,
§9–§10b и §24 целиком. Это `auditor-live`: продуктовый fix не делай. Временные fault injection обязательно
откати; оставить и закоммитить можно только audit-artifact и действительно нужные acceptance-тесты.

## Authority

- Owner contract: `AGENTS.md` §4 — настройки живут только в `public.system_settings`; зеркала, синхронизации и
  очереди между settings stores нет; global row использует `organization_id IS NULL`, org override — non-null.
- Track D: `docs/_TODO/INTEGRATOR_CLEANUP_AND_SIMPLIFICATION/IMPLEMENTATION_PLAN.md`.
- Исправляемый исторический план: `docs/_TODO/SAAS_FOUNDATION/SAAS_S5_SETTINGS_ROOT_SPLIT.md`.
- Связанное owner-approved разбиение auth surfaces: `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md` §F4.
- Candidate: ветка `wt/track-d-settings-single-root-20260824`, коммит реализации `fd4aa2364` плюс merge свежей
  `feat/doctor-ui-rebuild`. Сравнивай с `850b69c7c`.

## Сначала классификация

До чтения существующих тестов для каждого пункта ниже запиши `тест` или `взгляд` по природе требования. Разовые
удаления, декларации, тела SQL и cutover paths проверяй итоговым состоянием/интроспекцией. Повторяемое поведение
resolver-ов и матрицы доступа проверяй самым дешёвым публичным слоем; для уже зелёной защиты выполни fault
injection по независимым классам. Полный CI не запускай: его после landing запускает ведущий. Для БД используй
только именованную DEV `bcb_webapp_dev`, owner-aware rollback-only candidate preflight; миграцию не применять.

## Blind kill-set

Составь свой список до чтения тестов как минимум по этим классам:

1. Отсутствует любая из 27 auth-surface строк.
2. Любая поверхность получила неверный default: staff/platform-admin — только email; patient — email,
   Telegram, MAX и Yandex; остальное выключено.
3. Миграция получает defaults из legacy/mirror row вместо явной owner-матрицы.
4. Любой активный runtime/write/cutover/refresh путь читает или пишет `app_runtime_settings` либо её audit.
5. Public/patient/pre-session resolver способен прочитать secret/restricted или не зарегистрированный ключ.
6. Значение или org override одной auth surface доступно другой surface/организации.
7. Остались dual write, sync-trigger, mirror fallback, mismatch telemetry или второй settings audit.
8. DROP mirror ломает зависимые функции/triggers/views.
9. `declaration.ts`, census, сгенерированные privileges/allowlists расходятся.
10. Новая миграция содержит GRANT/REVOKE/ROLE/POLICY либо выполняется не под владельцем тела.
11. Был изменён уже применённый migration-файл вместо нового forward migration.
12. Ошибочно удалён `public.system_settings_audit` или перестал работать canonical audit path.
13. Потеряны org-scoped settings либо global fallback semantics.
14. Server/integrator/media/scheduler readers лишились нужного доступа или получили прямой доступ к таблице.
15. Повторный rollback-only прогон матрицы не идемпотентен.
16. A→B cutover, refresh script или TEST readiness-check всё ещё требует удалённый mirror artifact/table.
17. В кандидат случайно попал future Therapysto domain cutover либо перестали поддерживаться текущие старые TEST
    origin/addresses. Домены не переключать и TEST не деплоить.

## Обязательная проверка миграции и прав

Письменно перечисли: создаваемые/изменяемые/удаляемые объекты, owner каждой функции, фактические table/column
operations тела и соответствие `deploy/postgres/privileges/declaration.ts`. Подтверди отсутствие privilege SQL.
Прогони существующий owner-aware rollback-only candidate preflight на DEV и не оставь данных/ledger changes.

## Evidence и результат

Уже заявленный evidence не принимай на веру: `64` — это результат команды
`node --test scripts/prod-to-target-baseline-policy.test.mjs deploy/host/prod-to-target-cutover-path-resolvable.test.mjs deploy/postgres/privileges/relation-access.test.mjs deploy/postgres/privileges/function-census.test.mjs`.
Лично реши, достаточно ли этого, и добери только недостающее.

Создай короткий отчёт
`docs/_TODO/runs/integrator-cleanup/TRACK_D_SETTINGS_SINGLE_ROOT_AUDIT_2026-08-24.md`: по каждому пункту
`PASS|FAIL|BLOCKED` и точное evidence; отдельная таблица fault injection «сломано → что покраснело»; число
непойманных классов. Finding существует только для достижимого нарушения owner requirement/repo rule/runtime.
Если PASS — закоммить только отчёт и необходимые acceptance tests сообщением с `#987`. Если FAIL — продукт не
исправляй: оставь отчёт и/или падающий acceptance test, закоммить их и явно передай точный сценарий ведущему.
