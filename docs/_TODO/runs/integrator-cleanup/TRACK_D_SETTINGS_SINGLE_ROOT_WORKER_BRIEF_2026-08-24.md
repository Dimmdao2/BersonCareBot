# Track D — единый корень настроек и восстановление входа

## Роль и authority

Ты — сильный implementation worker. Работаешь одним цельным проходом в собственной ветке от актуального
`feat/doctor-ui-rebuild`, коммитишь весь разрешённый результат до завершения хода. Сначала прочитай `AGENTS.md`:
маршрут, §1 (миграции и preflight), §4, §4a, §5, §7, §9–§10b и §24; затем `README.md`,
`docs/ARCHITECTURE/SERVER CONVENTIONS.md`, `docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`,
`deploy/HOST_DEPLOY_README.md`, действующие owner-решения Track D/брендирования и исторический
`docs/_TODO/SAAS_FOUNDATION/SAAS_S5_SETTINGS_ROOT_SPLIT.md`. При конфликте побеждают действующие правила и
более поздние owner-решения, исторический S5-план исправляется, а не исполняется против них.

Источник оракула — `AGENTS.md` §4, дословно: «Настройки живут ТОЛЬКО в `public.system_settings`» и
«Миграции и сиды пишут настройку в `public.system_settings` и всё — дублировать больше некуда.»

## Найденный достижимый дефект

На именованном TEST применены `20260823T173446_split_auth_settings_by_surface` и
`20260824T064008_apply_surface_auth_owner_defaults`, но отсутствует обязательная строка
`auth_surface_staff_oauth_yandex_enabled`. Поэтому `/app` и `/app/doctor/login` возвращают 500, а живые D17/D30
пути невозможно проверить. Первая миграция создавала surface-строки только из существующих legacy-строк и
дублировала их в `public.app_runtime_settings`; вторая только обновляла уже существующие строки. Это одновременно
показывает дефект полноты и нарушение текущего single-root контракта.

## Цель прохода

Сделай один законченный stage, после которого:

1. Все настройки имеют один канонический data-root — `public.system_settings`; приложение, интегратор, воркеры,
   generic runtime resolvers и миграции больше не читают и не пишут `public.app_runtime_settings` как вторую копию.
2. Сохраняются действующие security-инварианты: публичный/pre-session/patient код не получает произвольные
   secret-bearing строки. Переиспользуй существующий типизированный registry и существующие общие resolver seams;
   параметризуй/перенаправь их на `system_settings`, не создавай функцию на каждый флаг и не заводи новый store.
3. Удалены dual-write/sync/duplicate-audit пути и их privilege declarations/generated artifacts. Не оставляй
   обходной compatibility-write в зеркало. Исторические уже применённые миграции не редактируй: только новая
   forward migration с timestamp-именем.
4. Новая forward migration идемпотентно создаёт/обновляет в `system_settings` полную owner-матрицу 27 surface-auth
   настроек, независимо от наличия legacy rows. Финальные значения:
   - staff: email=true; sms/telegram/max/all oauth/passkey=false;
   - platform_admin: email=true; sms/telegram/max/all oauth/passkey=false;
   - patient: email/telegram/max/oauth_yandex=true; sms/oauth_google/oauth_vk/oauth_apple/passkey=false.
5. Если `app_runtime_settings` и его отдельный audit-store после перевода всех потребителей реально не нужны,
   forward migration удаляет их и относящиеся функции/триггеры; перед DROP докажи поиском все runtime references
   и переведи каждый живой consumer. Не удаляй `system_settings_audit`: это аудит канонической записи.
6. Обновлены активные планы/архитектурные документы, которые всё ещё объявляют два data-root, чтобы они не
   противоречили owner-решению. Исторические audit/evidence логи не переписывай.

## Обязательная инженерная проверка

- До правки составь инвентарь всех production references к `app_runtime_settings` и классифицируй: read, write,
  trigger, seam, privilege, generated, migration history, test/docs. Исторические применённые migration-файлы не
  переписываются, но новый итог обязан перекрыть их forward-only.
- Для каждой новой/изменённой SECURITY DEFINER функции выполни §1 «Перед приземлением миграции — разбор её прав»:
  owner/runtime role, relation/column access, declaration coverage. Миграция не содержит GRANT/REVOKE/POLICY.
- Новая таблица/абстракция запрещена. Сначала расширить существующий общий resolver/provider.
- Не касайся PROD. Не деплой на TEST. Не трогай доменный cutover и ветку
  `wt/therapysto-domain-cutover-ready-20260824`.
- Не запускай полный CI без отдельного repo-risk обоснования; сначала targeted/phase checks. DEV DB — только
  именованная `bcb_webapp_dev`, owner-aware rollback-only candidate preflight из своего checkout. Не создавай БД.
- Долгие host-команды не запускай фоном. Если ход подходит к пределу, сначала коммит и честный отчёт о том, что
  осталось; незакоммиченный продуктовый код недопустим.

## Acceptance

- Поведенческие тесты доказывают полную матрицу при полном отсутствии девяти legacy auth rows и отсутствие
  dual-write расхождения.
- Публичный, staff, patient, platform-admin, server/integrator и media/scheduler runtime reads сохраняют требуемую
  доступность и fail-closed для неподходящей audience/tenant роли.
- `rg` по живому production/deploy/declaration/generated scope не оставляет read/write зависимости от удалённого
  data-root; допустимы только исторические миграции/evidence, явно классифицированные в отчёте.
- Migration lint + owner-aware rollback-only DEV preflight PASS.
- Targeted tests/typecheck затронутых приложений PASS.
- Коммит содержит `#987`, причину, evidence и честно перечисляет непроверенный live TEST (его проверит лид после
  landing/deploy).

