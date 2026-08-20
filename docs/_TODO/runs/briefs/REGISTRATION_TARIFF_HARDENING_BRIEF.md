> **Retired-path notice.** Any command or path below that targets a pre-B0 retired database executor is preserved only as historical evidence; it is not runnable or current guidance. Other content in this document is unchanged. See [the current B0 retirement rule](/docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT.md).

# Регистрация клиники не теряет настроенный тариф

Роль: worker. Единственный канон правил — `AGENTS.md`; прочитать §1, §4a, §5, §9–§10 и §24. Authority —
`docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md` §2.6a, решения Р-1/Р-7, и текущий разрыв,
записанный там же: `deploy/host/deploy-prod.sh` не применяет C5A runtime overlay.

Источник оракула: `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md` §5а-0 Р-1 — «У нас должна быть
настройка — какой тариф выдаётся при регистрации. Если настройка пустая — значит тариф человек выбирает. И также
настройка, какой даётся триал после регистрации — он и подключается»; Р-7 — «клинику завели — выдаётся настроенный
на этот случай тариф с триалом».

## Человеческий разрыв

Администратор выбрал стартовый тариф, затем этот тариф архивировали. Настройка остаётся непустой, но C5A молча
трактует неактивную ссылку как «настройка пустая»; новая клиника создаётся без обещанного тарифа/доступа. Кроме того,
PROD deploy не применяет уже существующий `deploy/postgres/c5a-platform-operations-runtime.sql`, поэтому свежая
версия функции и её grants/owners могут не доехать вообще.

## Минимальная реализация

1. В существующем `PlatformEntitlementsPort` запретить `updateTariff(... isActive=false)` и `archiveTariff()` для
   тарифа, на который ссылается непустая `saas_registration_tariff_policy`, тем же способом и в той же транзакции,
   которым уже защищён активный `saas_trial_policy`. Стабильная ошибка должна различать registration policy.
2. Повторить эквивалентное поведение в in-memory port; не вводить новый сервис/порт/таблицу.
3. В `app.start_provisioned_organization_trial()` отличить законный `tariff_id IS NULL` от битой ссылки на
   отсутствующий/неактивный тариф. Битая непустая ссылка должна дать стабильную ошибку и откатить всю транзакцию,
   а не создать организацию без тарифа. Законный NULL остаётся выбором тарифа человеком.
4. Включить существующий C5A overlay в `deploy/host/deploy-prod.sh` в корректной post-migration последовательности;
   добавить fail-fast `require_file`. PROD не запускать.
5. Переиспользовать существующие route/service tests и
   `docs/_TODO/SAAS_FOUNDATION/scripts/smoke-phase3-specialist-signup-provisioning.mjs`; расширить их только
   недостающими guarantees: archive/update refusal, NULL остаётся legal, inactive reference rolls back, deploy
   действительно применяет C5A до зависящего provisioning overlay. Новой DB test infrastructure не создавать.

## File scope

- `apps/webapp/src/infra/repos/pgPlatformEntitlements.ts`
- `apps/webapp/src/infra/repos/inMemoryPlatformEntitlements.ts`
- существующие ближайшие tests в `apps/webapp/src/**`
- `deploy/postgres/c5a-platform-operations-runtime.sql`
- `deploy/host/deploy-prod.sh`
- `docs/_TODO/SAAS_FOUNDATION/scripts/smoke-phase3-specialist-signup-provisioning.mjs`
- один worker report под `docs/_TODO/runs/tariff/`

Без migration/journal/schema, без новых env/role/queue/harness, без DEV/TEST/PROD mutation, без unrelated 5.1/5.5/
upgrade/receipt/Track D.

## Проверки

- focused route/service tests через общий host-lock;
- smoke `--static-only`, затем существующий private disposable PostgreSQL run: это ровно clean transaction/rollback
  proof, для которого A0 допустима; DEV не заменять и не клонировать;
- shell syntax/targeted deploy-script assertion, scoped ESLint, webapp typecheck, raw-SQL gate, `git diff --check`;
- commit только явных путей с `#1057 #1069`, дерево чистое.

## Готовность

- непустая registration policy физически не может остаться на архивированном тарифе через оба admin write-path;
- если такая битая ссылка всё же уже есть, новая организация полностью откатывается со стабильной ошибкой;
- policy NULL по-прежнему создаёт организацию без тарифа для последующего выбора;
- PROD script fail-fast проверяет C5A файл и применяет его в доказанном порядке, но PROD не затронут;
- worker report называет exact commands и не выдаёт собственные зелёные тесты за независимый аудит.
