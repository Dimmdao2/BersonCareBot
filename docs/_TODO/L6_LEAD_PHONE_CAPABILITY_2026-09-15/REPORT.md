# Л6 — заполненный телефон роняет заявку в 500

Дата: 15.09.2026

Ветка: `wt/leads-reject-ctx`

Authority: `docs/_TODO/LEADS_AND_COMMUNICATION_VISIBILITY_2026-09-14.md`, очередь, Л6.

## Итог

Путь заявки с разрешённым заполненным телефоном больше не просит отсутствующую реляционную
способность `tenant_service`. Он вызывает объявленный именованный корень
`app.read_public_lead_trusted_phone_owner(text)`, после чего обычный путь заявки доходит до HTTP
`201`.

## Чего именно не хватало и как это установлено

Проверен весь вызов от публичной двери до SQL:

1. `POST /api/leads/public/submit` входит в `withPublicLeadsAccess` с source
   `api/leads/public/submit:POST`.
2. `withExplicitOrganizationPrincipal` ставит принципал организации; runtime отображает его на
   класс `tenant_service` и роль `app_tenant_service`.
3. При заполненном принятом поле `phone` дверь передаёт `accepted.get('phone')` в
   `resolveVerifiedLeadApplicant`.
4. Тот вызывал `findTrustedCanonicalUserIdByPhoneFromPool`, а функция выполняла прямой Drizzle
   `SELECT` по `public.user_contacts` и `public.platform_users`.
5. Для прямого relation-вызова runtime искал capability с именем `tenant_service`. Такой capability
   намеренно отсутствует: публичный класс ходит только через именованные корни. Поэтому ошибка
   возникала до отправки SQL в PostgreSQL.

Значит выдача общей relation-capability была бы неверным исправлением: она открыла бы самой
недоверенной двери глобальные отношения личности.

## Что объявлено и почему ровно столько

- В `deploy/postgres/privileges/declaration.ts` добавлена одна webapp capability:
  `tenant_service` → `app_tenant_service` →
  `app.read_public_lead_trusted_phone_owner(text)` с purpose
  `leads.trusted-phone-owner.read`.
- Там же объявлен один `SECURITY DEFINER`-корень владельца
  `app_seam_public_booking_owner`. `app_tenant_service` получает только `EXECUTE` этого корня.
- Владелец корня получает только колоночный `SELECT`:
  `user_contacts(platform_user_id, contact_kind, value_normalized, confirmed_at)` и
  `platform_users(id, merged_into_id)`.
- Корень возвращает только UUID, когда найден ровно один подтверждённый телефон у неслитой
  канонической учётки. Ноль или несколько совпадений дают `NULL`; строки контактов и профиль наружу
  не выходят, записей и подтверждений телефон не создаёт.
- Кросс-клиничное чтение двух отношений отмечено в единственной декларации как намеренное: телефон
  является глобальным ключом личности, а owner-решение требует найти существующую телефонную учётку
  в другой клинике для слияния с подтверждённой почтой. Организационный principal остаётся
  обязательным для принятия capability; прямой relation-двери у `tenant_service` по-прежнему нет.
- Функция создана миграцией
  `20260915T151000_public_lead_trusted_phone_owner_root.sql` под
  `app_seam_public_booking_owner`. В миграции нет `GRANT`, `REVOKE`, ролей или политик: все права
  приезжают только из декларации.
- Штатными командами пересобраны privilege- и port-context-артефакты для
  `bcb_webapp_dev`, `bersoncarebot_test` и `therapysto_prod`:
  `node deploy/postgres/privileges/generate-cli.mjs --all` и
  `node deploy/postgres/privileges/generate-cli.mjs --all --port-context-only`.

## Поведенческое доказательство и инъекции

Oracle — зафиксированный живой дефект Л6: разрешённый телефон давал `500`, а заявка обязана дать
`201`. Route-тест использует настоящий `resolveVerifiedLeadApplicant`, настоящий выбор
port-context capability и сгенерированный runtime-каталог; подменены только SQL-исполнитель и
внешняя граница слияния. Конечное наблюдение — HTTP `201` и созданная заявка с телефонной
канонической учёткой.

Зелёный прогон:

```text
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest --run --project=route src/app/api/leads/public/submit/route.route.test.ts"
Test Files 1 passed (1); Tests 13 passed (13)
```

Инъекция capability: строка `read_public_lead_trusted_phone_owner` временно удалена из
`REV10_CONTEXT.capabilities`, port-context артефакты пересобраны командой
`node deploy/postgres/privileges/generate-cli.mjs --all --port-context-only`, затем выполнена та же
locked-команда route-теста. Результат: `1 failed | 12 passed`; утверждение Л6 покраснело
`expected 500 to be 201`, runtime назвал
`Missing unique declared webapp port capability for app.read_public_lead_trusted_phone_owner(text)`.
Декларация восстановлена, артефакты пересобраны, повторный прогон дал `13 passed (13)`.

Инъекция Л3: вычисление `phone` временно заменено на `null`, затем выполнено:

```text
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest --run --project=unit src/app-layer/leads/resolveVerifiedLeadApplicant.unit.test.ts"
Test Files 1 failed (1); Tests 1 failed | 1 passed (2)
```

Покраснело ожидаемое слияние: вместо `phone-account` результат вернул `email-account`. После
восстановления `submittedPhone` та же команда дала `2 passed (2)`. Значит прежняя защита Л3 не
сломана.

## Проверки

- `/home/dev/brain/host-orch/run-tests.sh "bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot"`
  — `pending=1`, функция создана под `app_seam_public_booking_owner`, транзакция завершилась
  `ROLLBACK`, `migrate-dev preflight: PASS`.
- `/home/dev/brain/host-orch/run-tests.sh "pnpm run test:db-privileges"` — `tests 389`,
  `pass 188`, `fail 0`, `skipped 201` (opt-in живые проверки не включались).
- `node deploy/postgres/privileges/generate-cli.mjs --check` — privilege/allowlist артефакты трёх
  сред совпадают с декларацией побайтно.
- `node deploy/postgres/privileges/generate-cli.mjs --all --port-context-only --check` —
  port-context артефакты трёх сред совпадают с декларацией побайтно.
- `node deploy/postgres/privileges/generate-cli.mjs --census` — для каждой из трёх сред проверено
  `221 ACTIVE relations across 3620 source files`; patient-only поверхность не расширилась.
- `./node_modules/.bin/tsc --noEmit --strict -p deploy/postgres/privileges` — PASS.
- `pnpm --dir apps/webapp exec tsc --noEmit` — PASS после целевой сборки текущего
  `@bersoncare/platform-merge`; первая попытка видела старый локальный build-артефакт зависимости.
- `pnpm --dir apps/webapp exec eslint src/app/api/leads/public/submit/route.route.test.ts src/infra/repos/pgCanonicalPlatformUser.ts`
  — PASS.
- `/home/dev/brain/host-orch/run-tests.sh "node scripts/check-migration-privileges.mjs && bash apps/webapp/scripts/check-drizzle-migration-order.sh"`
  — `check-migration-privileges: OK (228 migration files)`, transaction-safe layout и порядок
  миграций — OK.
- `git diff --check` — PASS.

## НЕ СДЕЛАНО

- Миграция и reconcile на DEV не применялись; выполнен только обязательный rollback-only preflight.
- TEST не трогался, режим TEST не менялся, живой HTTP-проход на TEST не выполнялся.
- PROD не читался и не изменялся.
- Второй Next-сервер не запускался; общий `:5200` не трогался.
- Полный CI (`pnpm run ci`, `scripts/ci-record.mjs`) не запускался.
- Строка вердикта в `feat` и галочка очереди не записывались: это делает ведущий после независимой
  приёмки.

## Строка вердикта для ведущего

`Л6 PASS — заполненный разрешённый телефон проходит через объявленный узкий root app.read_public_lead_trusted_phone_owner(text) и публичная заявка отвечает 201; снятие capability даёт 500 и красит route-тест, submittedPhone-инъекция по-прежнему красит Л3; DEV migration preflight PASS с ROLLBACK; PROD/TEST/полный CI не тронуты.`
