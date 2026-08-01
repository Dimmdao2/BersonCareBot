# B1.4 — независимый аудит удаления каталога товаров

Дата: 2026-08-01

Ветка: `wt/k4-round2`

Product: `82879072e`

Integration/renumber: `9ba46b865`

Raw-SQL test fix: `7d64667a2`

## Вердикт

**FAIL.** Пути записи и абонемента сохранены, migration/journal согласованы, но каталог не вырезан целиком:

- активный SaaS DB-regression gate всё ещё требует удалённые таблицы и падает;
- в исполняемом дереве остались старый компонент покупок пациента и неиспользуемый мост из product layer,
  а текущий API/module/DEV-ops текст продолжает объявлять удалённую поверхность.

Product-код аудитор не исправлял. Постоянно добавлены только acceptance-тест и этот отчёт.

## Kill-set, составленный до чтения тестов

| Исход | Поломка, которую нужно убить | Метод |
|---|---|---|
| Каталог удалён | Врач/администратор снова видит или создаёт отдельный товар; остаётся route/schema/table | итоговый diff + caller/back-reference search |
| Запись сохранена | Создание очной записи снова требует `productPurchaseId` или падает без удалённых таблиц | поведенческий unit acceptance |
| Абонемент сохранён | Пациент не может получить платёжную ссылку абонемента либо подтверждённый визит не списывает занятие | поведенческий unit acceptance |
| Негативные границы | Вернулся `commercial_access_state`; появилась продажа курса; исчезла общая проверка доступа к материалу | итоговый diff + точный поиск |
| Миграция | `0298` конфликтует с текущим `feat`, journal или доской брони | diff/journal gate/merge-tree |

## Матрица приёмки

| Пункт | Доказательство | Вердикт |
|---|---|---|
| Отдельный каталог недостижим из UI/API/schema | Каталожные route/page/module/repository/schema-файлы удалены; `rg` по runtime-идентификаторам таблиц и `productPurchaseId` дал пустой результат. Текущий settings/schedule UI показывает только абонементы. | **FAIL по полноте:** пользовательский путь удалён, но старые исполняемые артефакты и активный gate остались; см. F1–F2. |
| Запись без `productPurchaseId` | `createBookingOnCanonicalEngine` создаёт очную запись только по canonical branch/service и возвращает `confirmed`; acceptance-тест зелёный. | **PASS** |
| Продажа абонемента своим кодом | `purchaseCatalogPackageForPatient` идёт через `be_subscription_packages`/`be_patient_packages`, создаёт `patient_package:*` payment intent и возвращает checkout URL; acceptance-тест зелёный. | **PASS** |
| Списание визита | `reserveForAppointment` + `onVisitConfirmed` дают `reserve → consume → release`, переводят appointment ref на debit и уменьшают остаток; acceptance-тест зелёный. | **PASS** |
| `commercial_access_state` не возвращён | В production source/schema/deploy вне historical migrations совпадений нет. Единственное исполняемое совпадение — legacy `saasBillingTariffSnapshot.devDbProof.test.ts:112`, который пытается вставить уже удалённую колонку; он не входит в DB-free projects и не является доказательством DEV/DB. | **PASS для production**, известный негейтящий legacy-test residue ниже. |
| Продажа курса не построена | B1.4 diff не меняет `courses`/treatment-program; точный поиск course payment/checkout/productRef-path дал пустой результат. Существующий enrollment не является платёжным sale-path. | **PASS** |
| Общая проверка доступа к материалам сохранена | `resolvePatientCanViewContent` по-прежнему вызывает `entitlements.hasActiveContentGrant`; `pgEntitlements` читает `content_access_grants_webapp`. Удалена только выдача grant из покупки товара. | **PASS** |
| `0298` / journal / board / текущий `feat` | `0298` дропает `be_product_history_events`, `be_product_purchases`, `be_product_pay_links`, `be_products` в FK-безопасном порядке. Journal вставляет `idx=298`/`when=1793539220000` между `0297` и `0299`; board держит `0298` за `wt/k4-round2`. После `git fetch` новые commits `feat` меняют только docs; `git merge-tree --write-tree HEAD origin/feat/doctor-ui-rebuild` завершился без конфликта. | **PASS** |

## Findings

### F1 — MUST FIX: активный DB-regression gate падает на удалённых таблицах

Достижимый сценарий:

```text
node docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-12-json-payloads.mjs
→ check-p0-12-json-payloads: public.be_product_history_events missing from tiers-218.tsv
```

Причина: `tiers-218.tsv` уже очищен B1.4, но
`scripts/check-p0-12-json-payloads.mjs:35-36` и
`scope-derivation/p0-12-json-payload-columns.tsv:27-28` всё ещё требуют
`be_product_history_events` и `be_products`. Этот check вызывается из
`scripts/check-saas-db-regression.mjs:74`, поэтому repo audit/CI не может стать зелёным.

Impact: ветка не проходит интеграционный gate; запись об удалённой схеме расходится с executable census.

Bounded fix-round: удалить только строки удалённых product-таблиц из `expectedRows` и
`p0-12-json-payload-columns.tsv`, поправить связанные точные census expectations, если они покраснеют, затем запустить:

```bash
node docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-12-json-payloads.mjs
node scripts/check-saas-db-regression.mjs
```

### F2 — MUST FIX: старые сущности каталога остались в активном дереве

Точный поиск нашёл:

- `apps/webapp/src/app/app/settings/BookingPatientProductsSection.tsx:59` — компонент старых покупок пациента,
  единственное совпадение имени во всём `apps/webapp/src`, то есть сейчас он orphaned;
- `apps/webapp/src/modules/memberships/service.ts:510-527` — неиспользуемый
  `grantPrepaidCatalogPackage`, прямо описанный как мост «already paid via product layer»;
- `apps/webapp/src/modules/memberships/memberships.md:17` — действующий контракт всё ещё упоминает
  `productPurchaseId`;
- `apps/webapp/src/app/api/api.md:52-53` — текущий API registry всё ещё объявляет `products` и patient
  entitlements в booking-engine routes;
- `deploy/postgres/dev-c4-runtime-table-grants.sql:24-31` — активный DEV-ops файл объясняет отказ уже
  удалённого `/api/booking/products/purchase` и ссылается на удалённый `pgProducts.ts`.

Текущего пользовательского входа в компонент нет, поэтому это не скрытый 404 на живом экране. Но owner oracle
требует вырезать каталог **целиком**, а не только убрать imports; исполняемый компонент, product-layer bridge и
текущие contracts этому не соответствуют.

Bounded fix-round: удалить orphan component и dead bridge; обновить только текущие module/API/DEV-ops contracts.
Исторические migrations, архивные планы и provenance dumps не переписывать. Абонементный каталог
`be_subscription_packages` и его purchase/payment/consume path не трогать.

## Поведенческое доказательство и fault injection

Постоянный тест:
`apps/webapp/src/modules/patient-booking/catalogRemovalB14.unit.test.ts`.

Итоговый прогон:

```text
pnpm --dir apps/webapp exec vitest run --project=unit src/modules/patient-booking/catalogRemovalB14.unit.test.ts
→ Test Files 1 passed (1); Tests 3 passed (3)
```

Сила oracle проверена временными production-поломками; каждая поломка сразу откатана:

| Временная поломка | Точный запуск | Красное утверждение |
|---|---|---|
| `createBookingOnCanonicalEngine` отказывает очной записи с `catalog_unavailable` | `pnpm --dir apps/webapp exec vitest run --project=unit src/modules/patient-booking/catalogRemovalB14.unit.test.ts -t 'creates an in-person doctor booking without a catalog purchase'` | test failed с `Error: catalog_unavailable` |
| `purchaseCatalogPackageForPatient` отказывает с `catalog_unavailable` | `pnpm --dir apps/webapp exec vitest run --project=unit src/modules/patient-booking/catalogRemovalB14.unit.test.ts -t 'offers the existing membership through its own payment path'` | test failed с `Error: catalog_unavailable` |
| `onVisitConfirmed` всегда возвращает `skipped: true` | `pnpm --dir apps/webapp exec vitest run --project=unit src/modules/patient-booking/catalogRemovalB14.unit.test.ts -t 'reserves and consumes an active membership visit through the appointment lifecycle'` | ожидалось `{ skipped:false }`, получено `{ skipped:true }` |

Непойманных named faults нет. Это DB-free module-level доказательство; оно не заявляет PostgreSQL/RLS гарантию.

## Поиски и проверки

Пустые runtime-поиски:

```bash
rg -n -S 'be_product_history_events|be_product_purchases|be_product_pay_links|be_products' apps/webapp/src apps/webapp/db/schema packages --glob '*.{ts,tsx,mjs,js}' --glob '!**/*.test.*'
rg -n -S 'productPurchaseId|product_purchase_id' apps/webapp/src apps/webapp/db/schema packages --glob '*.{ts,tsx,mjs,js}' --glob '!**/*.test.*'
rg -n -S 'commercial_access_state|commercialAccessState' apps/webapp/src apps/webapp/db/schema packages deploy --glob '*.{ts,tsx,mjs,js,sql}' --glob '!*.test.ts' --glob '!*.test.tsx' --glob '!**/drizzle-migrations/**'
rg -n -S 'course_purchase|course_payment|course_checkout|subjectRef[^\n]*course|productRef[^\n]*course|createCoursePayment|purchaseCourse' apps/webapp/src/modules apps/webapp/src/app-layer apps/webapp/src/app/api apps/webapp/src/infra --glob '*.{ts,tsx}' --glob '!*.test.ts' --glob '!*.test.tsx'
```

Проверки:

```text
bash apps/webapp/scripts/check-drizzle-journal-sync.sh
→ check-drizzle-journal-sync: OK

node scripts/check-no-new-raw-sql.mjs
→ check-no-new-raw-sql: OK

pnpm --dir apps/webapp exec eslint src/modules/patient-booking/catalogRemovalB14.unit.test.ts
→ exit 0

pnpm --dir apps/webapp typecheck
→ exit 0

git diff --check
→ exit 0
```

После `git fetch origin feat/doctor-ui-rebuild` команда
`git rev-list --left-right --count origin/feat/doctor-ui-rebuild...HEAD` дала `4 6`; четыре новых remote-коммита
по `git diff --name-status 86eb9c029..origin/feat/doctor-ui-rebuild` меняют только документы и не занимают новый
номер миграции. `git merge-tree --write-tree HEAD origin/feat/doctor-ui-rebuild` завершился без конфликта.

## DEV / запреты

Live DEV-smoke не выполнялся. Точная проверка слушателей:

```text
ss -ltnp '( sport = :5200 or sport = :5202 or sport = :5210 or sport = :5211 )'
→ слушает только 127.0.0.1:5202

curl -sS -D - --max-time 5 http://127.0.0.1:5202/api/me
→ 404 Cannot GET /api/me; access-control-allow-origin: https://storylama.ru
```

Это не BersonCare webapp. Отдельный Next и новое платёжное/абонементное состояние ради уже закрытого
DB-free oracle не создавались; такой smoke всё равно не доказал бы PostgreSQL/RLS. PROD, deploy, DDL и миграции
на базе не выполнялись.

## B1.4 bounded fix-round — PASS

Fix-round на ветке `wt/k4-round2` закрыл только F1–F2:

- из active P0.12 JSON census удалены expectations для удалённых
  `be_product_history_events` и `be_products`;
- удалены orphan `BookingPatientProductsSection` и dead
  `grantPrepaidCatalogPackage`; purchase/consume path абонементов не менялся;
- текущие `memberships.md`, `api.md` и DEV C4 comment больше не объявляют product layer.

Проверки на итоговом diff:

```text
node docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-12-json-payloads.mjs
→ check-p0-12-json-payloads: OK

node scripts/check-saas-db-regression.mjs
→ check-saas-db-regression: OK

pnpm --dir apps/webapp exec vitest run --project=unit src/modules/patient-booking/catalogRemovalB14.unit.test.ts
→ Test Files 1 passed (1); Tests 3 passed (3)

pnpm --dir apps/webapp typecheck
→ exit 0

pnpm --dir apps/webapp exec eslint src/modules/memberships/service.ts src/modules/patient-booking/catalogRemovalB14.unit.test.ts
→ exit 0

node scripts/check-no-new-raw-sql.mjs
→ check-no-new-raw-sql: OK

git diff --check
→ exit 0
```

Exact active-tree census:

```bash
rg -n -S 'BookingPatientProductsSection|grantPrepaidCatalogPackage' apps/webapp/src --glob '*.{ts,tsx}'
rg -n -S 'productPurchaseId|product_purchase_id|booking/products/purchase|pgProducts\\.ts|be_product_history_events|be_products|be_product_pay_links' apps/webapp/src/modules/memberships/memberships.md apps/webapp/src/app/api/api.md deploy/postgres/dev-c4-runtime-table-grants.sql
```

Обе команды дали пустой результат. Historical migrations, планы/provenance, `0298`, journal, subscription-package
schema, booking behavior, course sales, DB/DEV/TEST/PROD/deploy не менялись.
