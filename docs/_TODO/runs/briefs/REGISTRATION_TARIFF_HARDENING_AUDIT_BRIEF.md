# Независимый аудит registration tariff hardening

**Тест или взгляд:** смешанный один pass. Поведение архивирования/гонки и provisioning rollback — тест; deploy-order,
scope и отсутствие ослабленных старых guards — взгляд. Единственный канон правил — `AGENTS.md`, особенно §1, §5,
§10b и §24. Authority — `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md` §2.6a, Р-1/Р-7, worker brief
`docs/_TODO/runs/briefs/REGISTRATION_TARIFF_HARDENING_BRIEF.md` и candidate `8c7e5d9db`.

До чтения новых тестов составить blind kill-set. Не считать worker report доказательством.

## Обязательные guarantees

1. Законный NULL registration policy остаётся выбором тарифа человеком; организация создаётся без тарифа, если
   одновременно нет активного trial policy.
2. Непустая policy не может остаться ссылкой на inactive tariff ни через `archiveTariff`, ни через
   `updateTariff(...isActive=false)`.
3. Проверить реальную гонку двух транзакций: одновременные `setRegistrationTariffPolicy(active tariff)` и
   deactivate/archive не могут обе закоммититься с итогом `policy.tariff_id = inactive tariff`. Последовательные
   unit mocks этого не доказывают. Переиспользовать private disposable PostgreSQL; новую инфраструктуру не строить.
4. Если stale non-NULL ссылка уже существует, `app.start_provisioned_organization_trial()` даёт стабильную
   `registration_tariff_policy_tariff_invalid` и внешняя provisioning transaction не оставляет organization,
   membership или изменённый intent. Missing/NULL row не ошибочны.
5. `deploy-prod.sh` fail-fast проверяет C5A файл и применяет overlay в рабочем порядке относительно specialist-owner
   и reference-catalog overlays; никакого PROD/DEV/TEST действия.
6. Candidate не должен ослаблять unrelated specialist-signup rollout guard. Изменение старого source assertion
   допустимо только если канонический DB-backed runtime contract действительно сделал прежнюю проверку ложной; это
   доказать чтением актуального settings path, не просто зелёным smoke.

## Fault injection / evidence

- каждый named behavior fault либо убит существующим/добавленным acceptance test, либо остаётся красным test handoff;
- обязательны как минимум: убрать registration-policy archive guard; вернуть silent INNER JOIN collapse; удалить
  C5A apply/require из deploy; concurrent set/deactivate interleaving;
- временный product fault полностью откатить;
- сохранить можно только намеренные acceptance tests и один audit report под `docs/_TODO/runs/tariff/`;
- product fix не делать.

## Проверки

Focused tests и private PostgreSQL smoke через host-lock, static smoke, shell syntax, scoped ESLint/typecheck,
raw-SQL gate и `git diff --check`. Report обязан дать killed/missed по named classes, exact commands, SHA и limits.
DEV/TEST/PROD не трогать; migration/schema/journal/new harness запрещены.
