# SaaS S4 — тарифы, магазин, entitlements и абонементы

> План ЭТАПА 4 из [`SEQUENCE.md`](./SEQUENCE.md): развернуть уже принятые владельцем решения в исполнимые
> чек-листы. Этот документ планирует работу; он не является отчётом о выполнении и не разрешает действия на
> PROD/TEST сам по себе.

## 0. Цель и место в последовательности

На TEST должен появиться рабочий коммерческий контур без реального эквайринга клиники:

`тариф (данные global_admin) → entitlements механик → клиника → единый гейт механики`

Параллельно нужен магазин курируемых пакетов упражнений с доступом по грантам на канонические `content_id`,
аналитика global_admin по клиникам и завершённая существующая подсистема пациентских абонементов.

Этот результат входит в owner-facing финиш TEST до копирования нового продукта на новый домен
([`SEQUENCE.md:9-18`](./SEQUENCE.md), [`SAAS_ENFORCE_ROADMAP.md:11-25`](./SAAS_ENFORCE_ROADMAP.md)). Старый
`bersoncare` PROD не является целью и не переключается.

## 1. Провенанс: что именно решил владелец

Ни один пункт ниже не расширяет решение владельца без явной пометки.

| Решение | Источник |
|---|---|
| Тариф → флаги механик → клиника; цена и состав — данные global_admin, не хардкод | [`OWNER_DECISIONS_FOR_REVIEW.md:39-42`](./OWNER_DECISIONS_FOR_REVIEW.md); `/home/dev/.claude/projects/-home-dev-dev-projects-BersonCareBot/memory/store-tariff-entitlements-model.md:10-21`; taskdb `#751` |
| На старте нет реальных денег: global_admin назначает тариф вручную; PSP, invoices и lifecycle позже | [`OWNER_DECISIONS_FOR_REVIEW.md:43-44`](./OWNER_DECISIONS_FOR_REVIEW.md); memory `store-tariff-entitlements-model.md:19` |
| Тариф даёт дефолт; global_admin может точечно переопределить механику клинике | [`OWNER_DECISIONS_FOR_REVIEW.md:45-46`](./OWNER_DECISIONS_FOR_REVIEW.md); memory `store-tariff-entitlements-model.md:19` |
| Нужен полный конструктор всех механик, не 2–3 пресета | [`OWNER_DECISIONS_FOR_REVIEW.md:47-48`](./OWNER_DECISIONS_FOR_REVIEW.md); memory `store-tariff-entitlements-model.md:14-19` |
| Пакеты магазина курирует только global_admin из платформенной библиотеки; собственные упражнения клиники остаются отдельной фичей | [`OWNER_DECISIONS_FOR_REVIEW.md:49-51`](./OWNER_DECISIONS_FOR_REVIEW.md); memory `store-tariff-entitlements-model.md:12-19`; taskdb `#724` |
| Файлы не копируются: покупка/выдача доступа создаёт грант на канонический `content_id` | [`OWNER_DECISIONS_FOR_REVIEW.md:49-51`](./OWNER_DECISIONS_FOR_REVIEW.md); taskdb `#724` |
| Порядок P0→P5: фундамент, `requireEntitlement`, конструктор, пакеты, аналитика, затем реальный billing | [`OWNER_DECISIONS_FOR_REVIEW.md:52-53`](./OWNER_DECISIONS_FOR_REVIEW.md); memory `store-tariff-entitlements-model.md:19` |
| Global_admin нужна аналитика в разрезе клиник, не только пользователей | [`OWNER_DECISIONS_FOR_REVIEW.md:54-55`](./OWNER_DECISIONS_FOR_REVIEW.md); memory `store-tariff-entitlements-model.md:17` |
| Абонементы не строить заново: достроить существующие `modules/memberships` | [`OWNER_DECISIONS_FOR_REVIEW.md:107-113`](./OWNER_DECISIONS_FOR_REVIEW.md); memory `subscription-system-already-exists.md:10-16` |
| PROD заморожен; рабочая приёмка выполняется на TEST, новый продукт затем рождается отдельной копией со стенами | [`OWNER_DECISIONS_FOR_REVIEW.md:90-105`](./OWNER_DECISIONS_FOR_REVIEW.md); memory `launch-model-new-domain-test-is-live.md:10-40` |

Taskdb-связи, прочитанные как контекст, а не как новое решение: `#724`/`#751` — этот коммерческий контур;
`#752` — уже принятый split UI по `global_admin/clinic_admin/doctor`; `#755` — отдельные настройки clinic_admin;
`#738`/`#747` — регистрация и provisioning, не scope этого плана.

## 2. Фактическая база в коде на 2026-07-15

План строится поверх следующего, а не рядом с ним.

| Область | Что уже есть | Фактический разрыв |
|---|---|---|
| SaaS entitlements | `saas_tariffs`, существующий `be_organizations.tariff_id`, `saas_org_entitlement_overrides` ([`saasEntitlements.ts:24-59`](../../../apps/webapp/db/schema/saasEntitlements.ts)); `MECHANICS` и приоритет `override > tariff > true` ([`types.ts:6-23`](../../../apps/webapp/src/modules/org-entitlements/types.ts), [`service.ts:10-36`](../../../apps/webapp/src/modules/org-entitlements/service.ts)); PG-port ([`pgOrgEntitlements.ts:16-43`](../../../apps/webapp/src/infra/repos/pgOrgEntitlements.ts)) | Нет global_admin CRUD/назначения/редактора; текущие 14 ключей нельзя считать доказанно полным перечнем без method-level инвентаря |
| Гейт механик | Центральная функция `requireEntitlement()` существует ([`requireEntitlement.ts:7-23`](../../../apps/webapp/src/app-layer/guards/requireEntitlement.ts)) | Она прямо помечена route-by-route slice и используется только на `POST /api/doctor/courses` ([`courses/route.ts:49-77`](../../../apps/webapp/src/app/api/doctor/courses/route.ts)); auth вызывается дважды; системного покрытия нет |
| Контентные гранты | Две существующие поверхности `content_access_grants` и `content_access_grants_webapp`; webapp-таблица уже имеет nullable `organization_id` ([`schema.ts:370-395`](../../../apps/webapp/db/schema/schema.ts), [`schema.ts:2288-2306`](../../../apps/webapp/db/schema/schema.ts)); `modules/entitlements` и `pgEntitlements` выдают гранты на `content_id` ([`service.ts:5-40`](../../../apps/webapp/src/modules/entitlements/service.ts), [`pgEntitlements.ts:9-76`](../../../apps/webapp/src/infra/repos/pgEntitlements.ts)) | Service/port реализуют только грант пользователю; `organization_id` не участвует в write/read API. Нельзя создавать третью параллельную систему грантов |
| Products | `modules/products` активирует покупку и выдаёт content grants ([`products/service.ts:330-379`](../../../apps/webapp/src/modules/products/service.ts)) | `be_products` — org-scoped patient commerce; это не готовый platform-global магазин клиник и не SaaS-тариф |
| Платформенная/клиническая ЛФК | `lfk_exercises`, media и templates уже имеют `organization_id` ([`schema.ts:906-1023`](../../../apps/webapp/db/schema/schema.ts)); существующие `modules/lfk-exercises`/`modules/lfk-templates` являются каноническими движками упражнений/наборов | Нужно отделить platform-global rows/package curation от собственных clinic rows, не создавать второй LFK engine |
| Аналитика | Raw/push/user-hourly таблицы уже имеют `organization_id` ([`productAnalytics.ts:17-84`](../../../apps/webapp/db/schema/productAnalytics.ts), [`productAnalytics.ts:117-147`](../../../apps/webapp/db/schema/productAnalytics.ts)) | Ingest types и write path не несут org; platform hourly не имеет org dimension; dashboard остаётся user/platform aggregate ([`types.ts:56-68`](../../../apps/webapp/src/modules/product-analytics/types.ts), [`pgProductAnalytics.ts:57-176`](../../../apps/webapp/src/infra/repos/pgProductAnalytics.ts), [`types.ts:173-187`](../../../apps/webapp/src/modules/product-analytics/types.ts)) |
| Абонементы пациента | Зрелые `modules/memberships` + `be_subscription_packages`/patient packages/usages. Bulk recalc уже есть ([`memberships/service.ts:1148-1387`](../../../apps/webapp/src/modules/memberships/service.ts)); Finance уже монтирует панель ([`PatientTabFinances.tsx:353`](../../../apps/webapp/src/app/app/doctor/patients/[userId]/tabs/PatientTabFinances.tsx)); visit badge и mapping уже есть ([`pgPatientClinical.ts:290-377`](../../../apps/webapp/src/infra/repos/pgPatientClinical.ts), [`PatientTabKarta.tsx:1055-1062`](../../../apps/webapp/src/app/app/doctor/patients/[userId]/tabs/PatientTabKarta.tsx)) | Решение владельца было записано до этих доработок. Нужен reality-based reverify/hardening, а не повтор ST-01…ST-05 и не второй модуль |

Критическое разделение терминов:

- `saas_tariffs` — тариф клиники на механику платформы;
- `be_subscription_packages` — пациентский абонемент на визиты внутри одной клиники;
- `be_products` — org-scoped продукт для пациента;
- store exercise package — platform-global курируемый пакет контента для выдачи клинике.

Эти четыре сущности нельзя схлопывать, переименовывать друг в друга или связывать неявным общим `status`.

## 3. Жёсткие рамки исполнения

- Не менять порядок `SEQUENCE.md` и не возобновлять OFF/ON-cutover старого PROD.
- Не трогать PROD, `/opt/env`, реальные каналы и старый `bersoncare`.
- Не менять DDL/RLS/ownership/provisioning `be_organizations` и не решать три вопроса из
  [`OWNER_DECISIONS_FOR_REVIEW.md:119-125`](./OWNER_DECISIONS_FOR_REVIEW.md). Существующий `tariff_id` можно
  использовать как уже созданный контракт; если назначение тарифа требует расширить границу `be_organizations`,
  этап останавливается с **ТРЕБУЕТСЯ РЕШЕНИЕ ВЛАДЕЛЬЦА**, а не создаёт обходную таблицу.
- Не использовать `system_settings` как склад entitlement-флагов: тарифы и overrides уже имеют отдельную модель.
- Не добавлять env-переменные для тарифов, магазина, грантов или аналитики.
- Не строить новый `memberships`, `products`, `entitlements`, LFK/media engine или вторую таблицу грантов.
- Tenant resolution и auth выполняются до entitlement. `organizationId` не принимается из body/query как источник
  авторизации. Канонический method-level порядок зафиксирован в
  [`SAAS_ENFORCE_ROADMAP.md:681`](./SAAS_ENFORCE_ROADMAP.md).
- Platform/global_admin cross-tenant read/write идёт через отдельный проверяемый platform port/context, а не через
  `adminMode`, случайно выбранную clinic session или BYPASSRLS
  ([`SAAS_ENFORCE_ROADMAP.md:675-677`](./SAAS_ENFORCE_ROADMAP.md)).
- Новые запросы — Drizzle, business logic — modules/service, зависимости — ports + DI; routes остаются тонкими.
- UI global_admin строится только на текущем role split (`#752`) и существующих doctor shared/shadcn primitives.
- Каждая фаза: executor → независимый code audit → fixer → повторный audit. UI-фазы получают сценарий данных,
  скриншоты и две независимые печати по `docs/AGENT_AUTORUN_SCHEME.md`/`docs/ORCHESTRATION_BINDINGS.md`.

## 4. Порядок фаз

`S4-0 → S4-1 → S4-2 → S4-3 → S4-4 → S4-5 → S4-6`

- `S4-0` закрывает полноту mechanic registry и не даёт строить гейты по догадкам.
- `S4-1` закрепляет единственный resolver/chokepoint до появления UI управления.
- `S4-2` делает тарифы и overrides управляемыми global_admin.
- `S4-3` строит магазин на существующих content grants.
- `S4-4` добавляет clinic dimension в существующую аналитику.
- `S4-5` подтверждает/доводит существующие абонементы отдельно от SaaS billing.
- `S4-6` собирает всё на TEST; реальный PSP остаётся поздней отдельной фазой.

### Формат закрытия каждого checkbox

Каждый `- [ ]` ниже закрывается только записью из трёх обязательных полей: **что изменено**, **где** — точные
`file:line` после изменения, **доказательство** — test/checker/screenshot и его результат. `Scope` и строковые ссылки
в начале каждой фазы — минимальные стартовые точки, а не разрешение менять все перечисленные файлы. Если будущего
файла ещё нет, план указывает существующий composition/schema/UI anchor; выдумывать заранее имя файла и номер строки
запрещено. Без всех трёх полей checkbox остаётся открытым.

## 5. S4-0 — reality lock и полный реестр механик

**Цель:** доказать полный набор коммерчески управляемых механик и их реальные action boundaries до изменений.

**Scope:** `modules/org-entitlements/**`, app-layer guards/DI, route/service inventory, этот план и будущий execution
log. Никаких UI/DDL/поведенческих изменений.

**Стартовые `file:line`:** registry [`types.ts:6-23`](../../../apps/webapp/src/modules/org-entitlements/types.ts),
resolver [`service.ts:10-36`](../../../apps/webapp/src/modules/org-entitlements/service.ts), DI
[`buildAppDeps.ts:492-494`](../../../apps/webapp/src/app-layer/di/buildAppDeps.ts), текущий единственный consumer
[`courses/route.ts:49-77`](../../../apps/webapp/src/app/api/doctor/courses/route.ts). **Общее доказательство:**
method-level matrix + executable coverage-check + resolver tests; в execution log — точные строки для каждого action.

- [ ] Построить method-level матрицу `mechanic → entrypoint/method/action → текущий auth guard → principal source →
  entitlement point → service/port`; для каждого пункта указать `file:line`. Доказательство: в матрице нет строк
  уровня «весь каталог routes», а checker сопоставляет реальные export/action symbols.
- [ ] Проверить все текущие `MECHANICS` из
  [`org-entitlements/types.ts:6-21`](../../../apps/webapp/src/modules/org-entitlements/types.ts) против реальных
  product surfaces и owner-list из memory `store-tariff-entitlements-model.md:12-19`.
- [ ] Для отсутствующей поверхности поставить статус `declared_no_surface` с доказательством code-search; не
  придумывать route только ради флага.
- [ ] Любую найденную механику, которой нет в registry, добавить в единый typed registry вместе с русской подписью и
  стабильным ключом. Доказательство: constructor и chokepoint импортируют один registry, локальных копий массива нет.
- [ ] Зафиксировать default для нового/неуказанного флага. Текущий код использует `true`
  ([`service.ts:19-26`](../../../apps/webapp/src/modules/org-entitlements/service.ts)); изменение этого поведения —
  **ТРЕБУЕТСЯ РЕШЕНИЕ ВЛАДЕЛЬЦА** и не входит автоматически в S4.
- [ ] Добавить статический coverage-check: каждый защищаемый action имеет ровно одну mechanic mapping; неизвестный
  mechanic и дублирующий mapping дают non-zero exit.
- [ ] Расширить существующие unit tests resolver-а: override > tariff > default; неизвестные DB-ключи не ломают
  typed result; новый ключ registry автоматически попадает в constructor/test matrix.

**Проверка:** targeted tests `org-entitlements/service.test.ts` + coverage-check + webapp typecheck.

**Выход:** перечень механик доказан кодом, а не размером старого массива или старого плана.

## 6. S4-1 — единый entitlement chokepoint

**Цель:** все действия одной механики проходят один общий entitlement boundary; routes не содержат копий правил.

**Scope:** `app-layer/guards/requireEntitlement.ts`, общий mechanic action registry/guard, composition root, shared
feature guards/services и их tests. Не менять tariff UI и store.

**Стартовые `file:line`:** guard
[`requireEntitlement.ts:7-23`](../../../apps/webapp/src/app-layer/guards/requireEntitlement.ts), его тест
[`requireEntitlement.test.ts:1-79`](../../../apps/webapp/src/app-layer/guards/requireEntitlement.test.ts), двойной
auth call [`courses/route.ts:49-54`](../../../apps/webapp/src/app/api/doctor/courses/route.ts), DI export
[`buildAppDeps.ts:1583-1585`](../../../apps/webapp/src/app-layer/di/buildAppDeps.ts). **Общее доказательство:**
contract matrix `401/403/success`, static direct-use guard и A/B isolation tests.

- [ ] Разделить auth/context resolution и проверку entitlement так, чтобы auth выполнялся один раз. Текущий
  `courses` POST не должен последовательно вызывать и `requireDoctorWorkspaceApiContext()`, и функцию, которая снова
  вызывает тот же auth ([`courses/route.ts:49-54`](../../../apps/webapp/src/app/api/doctor/courses/route.ts)).
- [ ] Оставить одну typed реализацию `requireEntitlement(ctx, mechanic)` (точное имя может сохраниться), которая:
  получает server-derived org context; вызывает только `orgEntitlements`; возвращает единый 403
  `entitlement_required` с mechanic key; не знает route paths.
- [ ] Для механики с несколькими routes поставить gate на общем feature guard/application command boundary. Route
  вправе только вызвать общий boundary; локальные `if tariff/mechanic/override` и повторные DB reads запрещены.
- [ ] Применить mapping из S4-0 к каждому action со статусом `protected`; read/write гранулярность берётся из матрицы,
  а не угадывается по имени каталога.
- [ ] Доказать ordering `auth → tenant/principal → entitlement → service`: unauthenticated даёт 401, wrong role/org
  даёт 403/404 существующего authz, disabled entitlement даёт 403, service не вызывается при любом отказе.
- [ ] Доказать isolation: выключение mechanic у org A не влияет на org B; request body/query с чужим org ID не меняет
  resolver target.
- [ ] Добавить static guard, запрещающий прямые вызовы `isMechanicEnabled` вне единственного chokepoint и запрещающий
  локальные чтения `saas_tariffs`/`saas_org_entitlement_overrides` из routes/modules features.
- [ ] Сохранить backward compatibility для клиники без назначенного тарифа и override согласно принятому default из
  S4-0.

**Проверка:** `requireEntitlement.test.ts`; по одному контрактному тесту на mechanic action family; static guard;
webapp typecheck/lint. Не плодить по одному тяжёлому route test на каждый одинаковый alias.

**Выход:** coverage-check показывает `protected action count = mapped action count`, а поиск по feature routes не
находит дублирующих entitlement-условий.

## 7. S4-2 — global_admin CRUD тарифов, ручное назначение и overrides

**Цель:** global_admin управляет тарифами как данными и вручную задаёт тариф/исключения клинике без PSP.

**Scope:** расширение `modules/org-entitlements` ports/service/types, PG implementation, thin global_admin API,
global_admin page/nav, focused tests. DDL только если реальный schema diff доказан; не менять `be_organizations`
schema/policies/provisioning.

**Стартовые `file:line`:** tariff/override schema
[`saasEntitlements.ts:24-59`](../../../apps/webapp/db/schema/saasEntitlements.ts), существующий PG read port
[`pgOrgEntitlements.ts:16-43`](../../../apps/webapp/src/infra/repos/pgOrgEntitlements.ts), composition
[`buildAppDeps.ts:492-494`](../../../apps/webapp/src/app-layer/di/buildAppDeps.ts), текущий global-admin nav contract
[`doctorNavLinks.ts:36-52`](../../../apps/webapp/src/shared/ui/doctor/doctorNavLinks.ts) и его settings cluster
[`doctorNavLinks.ts:105-135`](../../../apps/webapp/src/shared/ui/doctor/doctorNavLinks.ts). **Общее доказательство:**
service/API authz tests, tariff/override A/B contract и desktop/mobile constructor acceptance.

- [ ] Расширить существующий module/port CRUD-операциями `list/get/create/update/deactivate tariff`,
  `assign/unassign existing tariff`, `list/upsert/delete org override`. Не создавать `modules/tariffs` рядом.
- [ ] Валидировать mechanics по единому registry S4-0; сохранять полный map флагов, а не частичный UI-пресет.
- [ ] Сохранять `name`, `description`, `priceMinor`, `currency`, `isActive`, mechanics как DB data. В коде нет названий
  тарифов, цен или готовых tier compositions.
- [ ] Не удалять активный тариф физически: деактивация сохраняет исторические ссылки. Иное поведение — инженерное
  предложение и требует отдельного data-lifecycle обоснования.
- [ ] Реализовать manual assignment через уже существующий `tariff_id` только в узком audited platform write port.
  Доказательство: порт может изменить только tariff reference, не становится универсальным editor
  `be_organizations`. Если это невозможно без изменения заблокированной границы — **ТРЕБУЕТСЯ РЕШЕНИЕ ВЛАДЕЛЬЦА**.
- [ ] Реализовать точечный override по `(organization_id, mechanic)` поверх существующей unique identity
  ([`saasEntitlements.ts:37-57`](../../../apps/webapp/db/schema/saasEntitlements.ts)); удаление override возвращает
  tariff default, не записывает копию default.
- [ ] Все API/page actions требуют `global_admin` platform capability. `clinic_admin`/doctor получают 403 и не видят
  nav item; `adminMode` в clinic session не является cross-tenant полномочием.
- [ ] UI: список тарифов, compact create/edit form, цена как данные, grid всех mechanic toggles, clinic assignment и
  per-clinic override editor. Путь `/app/doctor/admin/tariffs` и API `/api/admin/tariffs/**` — **инженерное
  предложение**; перед реализацией сверить с текущей навигацией `#752`, не создавать второй admin shell.
- [ ] Select с opaque tariff/org ID показывает label через `displayLabel`; UI использует doctor shared primitives,
  без bespoke cards и лишних поясняющих текстов.
- [ ] Audit trail фиксирует actor, tariff, target org, before/after flags и причину ручного override без secret/PII.
- [ ] E2E contract: создать тариф с выключенной mechanic, назначить org A → action A запрещён; org B не изменился;
  override A=true возвращает доступ; удаление override снова применяет tariff=false; unassign возвращает принятый
  default S4-0.

**Проверка:** module/service unit tests; API global_admin/clinic_admin authorization tests; constructor RTL contract;
targeted visual acceptance desktop/mobile с двумя клиниками и двумя печатями.

**Выход:** тарифная сетка полностью настраивается global_admin; ни одного hardcoded price/tier; реальных денежных
операций и PSP нет.

## 8. S4-3 — магазин курируемых пакетов и org content grants

**Цель:** global_admin собирает platform packages из канонического контента; клиника получает доступ грантом без
копирования файлов или упражнений.

**Scope:** существующие `modules/lfk-exercises`, `modules/lfk-templates`, `modules/entitlements`,
`modules/products` только как переиспользуемые primitives; минимальная package model/UI/API; content access checks.

**Стартовые `file:line`:** org-capable webapp grant row
[`schema.ts:370-395`](../../../apps/webapp/db/schema/schema.ts), legacy/integrator grant row
[`schema.ts:2288-2306`](../../../apps/webapp/db/schema/schema.ts), user-only port
[`entitlements/ports.ts:1-20`](../../../apps/webapp/src/modules/entitlements/ports.ts), PG implementation
[`pgEntitlements.ts:9-76`](../../../apps/webapp/src/infra/repos/pgEntitlements.ts), current product grant issue
[`products/service.ts:330-379`](../../../apps/webapp/src/modules/products/service.ts), LFK ownership columns
[`schema.ts:906-1023`](../../../apps/webapp/db/schema/schema.ts). **Общее доказательство:** grant lifecycle tests,
A/B list/direct-ID/media negatives и no-copy invariant over canonical content/media IDs.

- [ ] Сначала зафиксировать инженерное решение хранения package composition: переиспользовать существующий ordered
  template primitive либо добавить минимальную platform package entity. Доказательство выбора: нет второго exercise,
  media, purchase или access engine; package содержит ссылки на canonical exercise/content IDs и порядок.
- [ ] Явно разделить platform rows и clinic-owned exercises по существующему `organization_id` contract. Global_admin
  curator видит platform library; clinic create/edit flow продолжает создавать только clinic-owned content и не
  становится частью store.
- [ ] Инвентаризировать обе текущие grant tables и projection flow. Выбрать один канонический write/read path внутри
  существующего `modules/entitlements`; третья grant table запрещена.
- [ ] Расширить `EntitlementsPort` org-scoped grant операциями: target `organizationId`, canonical `contentId`,
  `purpose`, `expiresAt`, `revokedAt`, source package/tariff metadata. Не подменять org grant набором user grants.
- [ ] Grant upsert/revoke идемпотентен; повторная выдача не создаёт дубль; revoke/expiry немедленно снимают store
  access, не удаляя канонический контент.
- [ ] Access predicate для clinic-facing чтения покрывает owner constraint из taskdb `#724`: own clinic content OR
  active org grant OR content assigned in patient program. Конкретный SQL/RLS/service split проходит отдельный
  security audit; payload `organizationId` не участвует в решении.
- [ ] Файлы/media references остаются теми же canonical IDs/URLs. Добавить доказательство отсутствия copy path:
  выдача package не создаёт новые `media_files`, `lfk_exercises` или object keys.
- [ ] `exercise_packages` mechanic gate применяется через S4-1 chokepoint отдельно от specific package grant:
  mechanic ON не даёт все пакеты; grant без mechanic ON не открывает store surface.
- [ ] Global_admin может создать/редактировать/архивировать package и его ordered composition; clinic_admin/doctor
  не могут курировать platform packages.
- [ ] Clinic store list/detail возвращают только доступные packages/content; org B без grant не видит package A по
  list, direct ID и media playback path.
- [ ] Связать package availability с tariff composition там, где пакет включён в тариф. Семантика отдельной ручной
  «покупки» без PSP против «включено в тариф» не зафиксирована источниками достаточно точно: до product UI поставить
  **ТРЕБУЕТСЯ РЕШЕНИЕ ВЛАДЕЛЬЦА**; foundation grant API не должен угадывать checkout.

**Проверка:** entitlements service/PG tests; package service tests; RLS/isolation matrix A/B; no-copy invariant;
global_admin curator visual acceptance; clinic list/direct-ID/media negative cases.

**Выход:** несколько demo packages можно выдать клиникам на TEST, и всё содержимое остаётся единственным каноническим
контентом.

## 9. S4-4 — аналитика global_admin по клиникам

**Цель:** дать владельцу platform view с отдельной строкой/серией по каждой клинике, сохранив clinic isolation.

**Scope:** существующий `modules/product-analytics`, schema/migrations только для доказанного org-dimension gap,
отдельный platform aggregate port/API/page. Не строить новую analytics subsystem.

**Стартовые `file:line`:** ingest type
[`types.ts:56-68`](../../../apps/webapp/src/modules/product-analytics/types.ts), current port
[`ports.ts:14-30`](../../../apps/webapp/src/modules/product-analytics/ports.ts), write/rollup path
[`pgProductAnalytics.ts:57-176`](../../../apps/webapp/src/infra/repos/pgProductAnalytics.ts), org-bearing raw/user schema
[`productAnalytics.ts:17-84`](../../../apps/webapp/db/schema/productAnalytics.ts) и
[`productAnalytics.ts:117-147`](../../../apps/webapp/db/schema/productAnalytics.ts). **Общее доказательство:**
trusted-org ingest tests, org-dimensional rollup invariant, platform/clinic authz matrix и PII-free A/B view.

- [ ] Протянуть `organizationId` в ingest contract из доверенного session/resource context; event body не может
  назначать клинику самостоятельно.
- [ ] Зафиксировать deterministic org-at-ingest для каждого event family и explicit `unknown/unattributed` bucket.
  Multi-enrollment rule не угадывать: resource-derived org обязателен; по-настоящему org-agnostic событие остаётся
  `unknown` с причиной. Это инженерное safety-предложение; оно не приписывается владельцу.
- [ ] Исправить hourly/user-hourly identity так, чтобы события одного пользователя в двух клиниках не схлопывались в
  одну строку. Backfill не приписывает org по «первой клинике».
- [ ] Расширить существующий dashboard builder/types clinic breakdown, не создавая параллельный dashboard service.
- [ ] Сделать отдельный audited platform aggregate port для cross-tenant выборки. Clinic analytics port по-прежнему
  ограничен одной org; clinic_admin A не может получить B, в том числе фильтром/query param.
- [ ] Минимальный набор до решения о KPI: количество событий/активных пользователей по клинике и окно времени,
  выведенные из существующих event types. Точный инвесторский набор KPI, retention formulas и визуальная композиция
  — **ТРЕБУЕТСЯ РЕШЕНИЕ ВЛАДЕЛЬЦА**; агент не объявляет «регистрации/retention» решёнными владельцем.
- [ ] Global_admin page показывает clinic label, период и explicit unknown bucket; никаких patient names/phones в
  cross-tenant summary.
- [ ] Проверить org A/B + shared patient: platform total равен сумме clinic buckets + unknown; clinic A API/UI не
  раскрывает B; global_admin видит обе клиники через platform scope.

**Проверка:** ingest/rollup/dashboard unit tests; migration/backfill invariant на disposable fixture; authorization
tests; PII scan; global_admin visual acceptance с неравными данными A/B.

**Выход:** per-clinic breakdown доказан данными и isolation tests; неизвестные события видны, а не тихо приписаны.

## 10. S4-5 — абонементы: reverify и доводка существующего

**Цель:** закрыть owner pain поверх `modules/memberships`, учитывая, что bulk/visit/Finance уже реализованы после
исходной фиксации решения.

**Scope:** только существующий membership service/port/repo, существующие doctor patient-card surfaces и targeted
tests. `be_subscription_packages` не используется как SaaS tariff/store package.

**Стартовые `file:line`:** membership port
[`ports.ts:44-120`](../../../apps/webapp/src/modules/memberships/ports.ts), bulk implementation
[`service.ts:1148-1387`](../../../apps/webapp/src/modules/memberships/service.ts), bulk tests
[`service.test.ts:1100-1693`](../../../apps/webapp/src/modules/memberships/service.test.ts), Finance mount
[`PatientTabFinances.tsx:353`](../../../apps/webapp/src/app/app/doctor/patients/[userId]/tabs/PatientTabFinances.tsx),
visit projection [`pgPatientClinical.ts:290-377`](../../../apps/webapp/src/infra/repos/pgPatientClinical.ts) и badge
[`PatientTabKarta.tsx:1055-1062`](../../../apps/webapp/src/app/app/doctor/patients/[userId]/tabs/PatientTabKarta.tsx).
**Общее доказательство:** one-flow trace, idempotency/concurrency tests и visual proof Finance/Visit/Calendar/Overview.

- [ ] Трассировкой подтвердить один путь `Finance → DoctorClientMembershipsPanel → recalc API →
  recalcPastSessionsForPackage → append-only be_package_usages → appointment package ref → visit/calendar UI` с
  `file:line` на каждом звене.
- [ ] Bulk proof: окно `[soldAt, now)`, только состоявшиеся eligible visits, already-debited no-op, stop at zero,
  service mismatch skip, повторный и параллельный запуск без double debit. Основа уже есть в
  [`memberships.md:24-36`](../../../apps/webapp/src/modules/memberships/memberships.md) и
  [`service.test.ts:1100-1693`](../../../apps/webapp/src/modules/memberships/service.test.ts).
- [ ] Проверить транзакционную атомарность `runWithPackageLock` и partial unique debit index; failure посередине не
  оставляет usage без appointment ref/history и не уменьшает баланс дважды.
- [ ] Visit proof: canonical appointment mapping, а не legacy record ID, приводит к package title/display number;
  visit badge тестируется на linked/unlinked/cross-org cases.
- [ ] Finance proof: создание с датой, список активных packages, кнопка «Пересчитать», summary результата и обновление
  баланса доступны в существующей Finance tab без второй формы/панели.
- [ ] Calendar/Overview/Visits используют один formatter/summary source; после recalc метка и остаток обновляются без
  ручного reload там, где текущий UI contract обещает refresh.
- [ ] Если все пункты уже зелёные, этап закрывается как `reverified-existing` без code rewrite. Реальный найденный gap
  чинится минимально в текущем модуле и фиксируется в execution log.
- [ ] Не добавлять PSP/tenant billing: patient membership payment domain остаётся отдельным от SaaS tariff billing.

**Проверка:** targeted membership service/PG/API/RTL tests; visual scenario в Finance, Visit, Calendar и Overview;
cross-org IDOR negative. Полный CI не запускать только ради reverify без новых изменений.

**Выход:** пять owner pains подтверждены реальным текущим flow; нет второго subscription engine.

## 11. S4-6 — TEST product acceptance и интеграционный gate

**Цель:** доказать весь коммерческий контур на TEST со включёнными стенами до нового-domain copy launch.

**Стартовые `file:line`:** последовательность и запрет legacy cutover
[`SEQUENCE.md:9-18`](./SEQUENCE.md), TEST/new-domain launch
[`OWNER_DECISIONS_FOR_REVIEW.md:90-105`](./OWNER_DECISIONS_FOR_REVIEW.md), финальная product-приёмка roadmap
[`SAAS_ENFORCE_ROADMAP.md:574-575`](./SAAS_ENFORCE_ROADMAP.md). **Общее доказательство:** scenario log с точными
UI/API entrypoint `file:line`, A/B screenshots, двумя seals, security negatives и одним финальным CI результатом.

- [ ] Подготовить непересекающиеся demo fixtures: global_admin, clinic_admin/doctor A, clinic_admin/doctor B;
  разные тарифы/overrides, минимум несколько store packages, грант только одной клинике, абонемент пациента с
  прошедшими визитами. Не использовать реальные patient PII.
- [ ] Global_admin: создать/изменить тариф, задать полный mechanic map, назначить его A, сделать override, курировать
  package, выдать grant, увидеть A/B analytics.
- [ ] Clinic A: разрешённые mechanics работают, выключенные получают `entitlement_required`, granted package и media
  доступны, собственные clinic exercises остаются отдельными.
- [ ] Clinic B: не видит тарифные overrides/гранты/content/analytics A; её собственные mechanics и exercises работают
  согласно её тарифу.
- [ ] Абонемент: создать с прошлой датой в Finance, пересчитать, увидеть ledger-derived остаток и package marker в
  Visit/Calendar/Overview.
- [ ] Security negatives: unauthenticated, doctor вместо global_admin, clinic_admin cross-tenant, forged org ID,
  direct package/content/media ID, expired/revoked grant.
- [ ] Product smoke падает на 401/403/5xx там, где ожидается успех, unexpected empty results, RLS/principal errors и
  cross-org disclosure; ожидаемые entitlement 403 классифицируются отдельно.
- [ ] На каждую UI-фазу сохранить desktop/mobile screenshots всех состояний и получить две независимые seals.
- [ ] После закрытия всех фаз выполнить один финальный integration gate `pnpm install --frozen-lockfile && pnpm run ci`
  перед merge/deploy checkpoint; не повторять full CI без изменения кода.
- [ ] TEST deploy/smoke выполняется только отдельным авторизованным оркестраторским проходом по каноническому runbook.
  Этот план не разрешает SSH/DB/service actions и никогда не направляет команды на старый PROD.

**Выход:** tariff grid, entitlement enforcement, несколько store packages, clinic analytics и memberships работают
на TEST для A/B; старый PROD не затронут.

## 12. Решения, которых нет в источниках

Исполнитель не имеет права заполнить эти пробелы «разумным дефолтом»:

1. **ТРЕБУЕТСЯ РЕШЕНИЕ ВЛАДЕЛЬЦА:** store UX/commerce без PSP — отдельная ручная «покупка» пакета, только
   включение пакета в тариф или обе механики.
2. **ТРЕБУЕТСЯ РЕШЕНИЕ ВЛАДЕЛЬЦА:** точный набор KPI/formulas/layout аналитики по клиникам. До ответа разрешён только
   безопасный org-dimensional foundation и минимальные существующие event counts.
3. **ТРЕБУЕТСЯ РЕШЕНИЕ ВЛАДЕЛЬЦА:** любое изменение default entitlement для новой/неназначенной клиники с текущего
   `true` на fail-closed/иной режим.
4. **ТРЕБУЕТСЯ РЕШЕНИЕ ВЛАДЕЛЬЦА:** любое расширение заблокированной границы `be_organizations`; обходная модель не
   создаётся.

Не являются owner decisions и не должны так называться: конкретные route names, package storage table, audit event
shape, deactivation strategy и состав минимального technical dashboard. Это инженерные решения, проверяемые
архитектурой и acceptance этого плана.

## 13. Definition of Done

- [ ] Каждый пункт, приписанный владельцу, имеет ссылку на `OWNER_DECISIONS_FOR_REVIEW.md`, memory или taskdb.
- [ ] Полный mechanic registry доказан method-level матрицей; все protected actions проходят единый chokepoint.
- [ ] Global_admin управляет тарифами/назначением/overrides как данными; clinic_admin/doctor не получают platform
  scope; `be_organizations` boundary не расширена.
- [ ] Store packages global-admin-curated; clinic exercises отделены; org access работает через существующие grants;
  canonical content/media не копируются.
- [ ] Global_admin видит безопасный clinic breakdown; клиники не видят аналитику друг друга; unknown org не скрыт.
- [ ] Memberships owner pains закрыты через существующий `modules/memberships`, без повторной реализации.
- [ ] TEST A/B acceptance, security negatives, screenshots/seals и финальный CI gate закрыты; PROD не затронут.

## 14. Обязательный execution log

При начале исполнения создать рядом `SAAS_S4_TARIFFS_STORE_ENTITLEMENTS_LOG.md` и после каждой фазы фиксировать:

- run/agent IDs, commit range и фактически затронутые files;
- закрытые checklist IDs и доказательства `file:line`;
- tests/smokes/screenshots/seals;
- найденные расхождения текущего кода с этим baseline;
- owner decisions с исходной ссылкой; инженерные решения — отдельно и без атрибуции владельцу;
- residual risks/blocked пункты, включая точную формулировку **ТРЕБУЕТСЯ РЕШЕНИЕ ВЛАДЕЛЬЦА**.
