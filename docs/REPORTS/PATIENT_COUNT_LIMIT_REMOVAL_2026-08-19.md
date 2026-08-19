# Лимит клиентов убран целиком — Т12, 19.08.2026

**Оракул:** `docs/OWNER_DECISIONS.md` → раздел «Тарифы и оплата», **Т12**. Дословно владелец:
«лимит клиентов - убрать». Толкование там же: количество клиентов/пациентов клиникой не
ограничивается ни в одном тарифе; считаем и продаём рабочие места, а не людей в базе; лимит
убирается целиком — из тарифа, из проверки и из экранов, **а не выставляется в «бесконечность»**.

Механика `patient_count` (класс «запас», ярлык «Пациенты») удалена из реестра, а не переведена в
`unlimited`. Ключа `patient_count` в кодовой базе больше нет ни в одном исполняемом выражении —
остались только три исторические ссылки в комментариях, которые объясняют, что тут стояло раньше.

## Что удалено, пофайлово

### Реестр и типы
- `apps/webapp/src/modules/org-entitlements/types.ts` — строка `patient_count` из `MECHANIC_REGISTRY`;
  тип `PatientStockQuota` (и он же из объединения `TariffQuota`); ключ `patient_count` из
  `TariffQuotaMap`; `WARNABLE_QUOTA_MECHANICS` сжат до `['files']`. Всё остальное — `MECHANICS`,
  `OrgMechanic`, списки конструктора — производные и подтянулись сами.
- `apps/webapp/src/infra/repos/transactionQuotaPort.ts` — `StockQuotaMechanic` теперь
  `'branches' | 'files'`, то есть тип физически не даёт взять блокировку под несуществующую квоту.

### Проверка (двери на запись)
- `apps/webapp/src/app/api/doctor/clients/route.ts` — убран `requireEntitlementForMutation(ctx,
  'patient_count')`, ветка статуса 403 и блок с текстом отказа. Создание клиента гейтится ролью
  рабочего места врача и больше ничем.
- `apps/webapp/src/infra/repos/pgPatientOrganizationEnrollment.ts` — **физическая дверь**: удалён
  `transactionQuotaPort.withinLock(..., 'patient_count')` вместе с пересчётом `org_enrollments` и
  advisory-локом `saas_quota:patient_count:<org>`. Новая связь вставляется без счёта и без лока.
- `apps/webapp/src/modules/patient-organization/service.ts` и `ports.ts` — снят зависимый
  `assertWriteClearance` (дверь 3.2) и код ошибки `patient_count_limit_reached` из результата порта.
- `apps/webapp/src/infra/repos/pgPatientOrganization.ts` — отображение `StockQuotaReachedError` →
  `patient_count_limit_reached` и ставший ненужным импорт.
- `apps/webapp/src/app-layer/doctor/createDoctorClient.ts` — вариант ошибки и его ветка проброса.
- `apps/webapp/src/app-layer/di/buildAppDeps.ts` — `assertWriteClearance` больше не инжектится в
  `createPatientOrganizationService`.
- `apps/webapp/src/app-layer/entitlements/protectedActionRegistry.ts` — маппинг
  `patient-count.client.create`. Файл маршрута выпал из реестра целиком, поэтому гейт покрытия
  (`check-s4-entitlement-coverage`) на нём больше ничего не требует и не считает дырой.
- `scripts/check-transaction-quota-port-boundary.mjs` — `orgEnrollments` убрана из
  `protectedTables`: у таблицы больше нет квоты, и требовать под неё порт квот означало бы
  требовать блокировку под то, чего нет. Красная и зелёная фикстуры самотеста переписаны на
  `branches`.

### Тариф и экраны
- `apps/webapp/src/app/api/admin/commercial/route.ts` — ключ `patient_count` из `tariffInputSchema`,
  схема `patientStockQuotaSchema` удалена, объединение `quotaSchema` для оверрайдов сжато до
  `storage | branch`.
- `apps/webapp/src/app/app/admin/commercial/CommercialConstructorClient.tsx` — карточка числа
  «Пациенты» ушла с экрана конструктора тарифа; осталась одна штучная карточка «Филиалы».
- `apps/webapp/src/app/app/settings/PayTariffButton.tsx` — ярлык `patient_count: 'пациенты'` в
  причинах отказа при понижении тарифа.
- `apps/webapp/src/modules/org-entitlements/service.ts` — ветка нормализации квоты `patient_count` и
  `patient_count` из `blockableMechanics` при переходе на меньший тариф.
- `apps/webapp/src/infra/repos/pgOrgEntitlements.ts`, `pgPlatformEntitlements.ts` — колонка
  `patient_count_used` больше не выбирается из аккессоров использования и не попадает в карты
  использования (экран «Использовано из включённого» и платформенный отчёт).

### Миграция
**`apps/webapp/db/drizzle-migrations/0050_a_clinic_is_billed_for_seats_not_for_people.sql`**
(запись в `meta/_journal.json`: `idx 50`, `when 1800000052000`). Три statement'а:

1. `BCB-MIGRATION-BACKFILL` — `UPDATE public.saas_tariffs`: ключ `patient_count` вычищен из
   `quotas`, `mechanics`, `downgrade_policies` и `mechanic_access_policies`.
2. `BCB-MIGRATION-BACKFILL` — `DELETE FROM public.saas_org_entitlement_overrides WHERE mechanic =
   'patient_count'`: персональные исключения организаций по этой механике.
3. `BCB-MIGRATION-OWNER: app_seam_org_commerce_owner` — форвард-`CREATE OR REPLACE` функции
   `app.resolve_organization_mechanic_access(uuid, text)`: `patient_count` убран из списка
   «механик-с-числом, которые всегда включены». Тело перенесено дословно из
   `0022_quota_mechanics_have_no_off_state.sql`, изменена одна строка; сама 0022 не правится.

Прав в миграции нет: ни GRANT/REVOKE, ни ролей, ни политик (AGENTS.md §1). Проверено гейтом
`check-migration-privileges` — «OK (52 migration files)».

**Сколько строк вычищено — НЕ ИЗМЕРЕНО.** Миграция написана, но не применена: из этой сессии нет
доступа к базе (`psql` к `bcb_webapp_dev` отбивает аутентификацию, а привилегированные команды идут
через порт-агента, а не из чата). Цифру даст сам прогон; предварительно её можно снять командой,
которую должен выполнить агент с доступом:

```sql
SELECT (SELECT count(*) FROM public.saas_tariffs
        WHERE quotas ? 'patient_count' OR mechanics ? 'patient_count'
           OR downgrade_policies ? 'patient_count' OR mechanic_access_policies ? 'patient_count')
       AS tariffs_to_clean,
       (SELECT count(*) FROM public.saas_org_entitlement_overrides
        WHERE mechanic = 'patient_count') AS overrides_to_delete;
```

## Какой тест закрывает поведение

Оба теста проверяют ПОВЕДЕНИЕ, а не отсутствие строки в коде.

1. **`apps/webapp/src/app/api/doctor/clients/route.route.test.ts`** — «при любом тарифе».
   Настоящие `POST /api/doctor/clients`, `createDoctorClient` и `createPatientOrganizationService`;
   подменён только порт `orgEntitlements`, и он отвечает `state: 'disabled'` на ЛЮБУЮ механику.
   Весь запрос выполняется внутри `runWithoutMechanicWriteClearance` — контекста, в котором прежняя
   дверь 3.2 бросала `MechanicWriteClearanceRequiredError`. Проверяется и результат (100 подряд
   созданных клиентов, все 200 OK), и то, что `resolveMechanicAccess` **не вызывался ни разу**:
   если бы у создания клиента остался хоть какой-нибудь тарифный гейт, он бы этот порт прочитал.
   Вторым кейсом закреплено, что отказ по существу (занятый email → 409) отказом остался.

2. **`apps/webapp/src/infra/repos/pgPatientOrganizationEnrollment.noClientCeiling.test.ts`** —
   «при любом числе уже существующих пациентов». Самый нижний этаж, где стоял потолок.
   `ensureInvitedOrganizationClientRelationship` прогоняется через фейковый `tx`, считающий каждый
   `execute` (и advisory-лок, и пересчёт `org_enrollments` шли только через него). Прогон
   параметризован «клиника уже с 0 / 1 / 42 / 10 000 клиентами»; во всех случаях связь заводится, а
   `executed` пуст. Вернувшийся в любой форме потолок обязан будет и залочиться, и пересчитать —
   оба следа тут красные.

**Арбитр (обязателен по `.cursor/rules/tests-check-behaviour-not-circumstances.mdc`):** вернуть в
`route.ts` строку `await requireEntitlementForMutation(gate.ctx, 'patient_count' as never)` — первый
тест обязан покраснеть на `resolveMechanicAccess` и на статусе; вернуть блок `withinLock` в
`pgPatientOrganizationEnrollment.ts` — второй обязан покраснеть на `executed`.

Удалён `apps/webapp/src/modules/patient-organization/service.mechanicWriteClearance.test.ts`: он
целиком описывал дверь 3.2 для `patient_count`, а двери больше нет. Его смысл — «запись клиента
проходит без тарифного разрешения» — перенесён в оба теста выше, но с обратным знаком.

## Гейты

Из корня репозитория, всё зелёное:

- `pnpm lint` — OK (в том числе `check-migration-privileges`, `check-drizzle-journal-sync`,
  `check-transaction-quota-port-boundary` вместе со своим самотестом);
- `pnpm typecheck` — Done по всем пакетам;
- `pnpm test:webapp` — **384 файла пройдено, 4 пропущено; 1779 тестов пройдено, 12 пропущено, 0 упало.**

## НЕ СДЕЛАНО

1. **🔴 Побочное последствие, требует решения владельца: состояние `read_only` больше не
   останавливает создание карточки клиента.** Вызов `requireEntitlementForMutation(ctx,
   'patient_count')` нёс ДВЕ разные вещи: (а) потолок по числу клиентов — его Т12 снимает прямо, и
   (б) коммерческую лестницу доступа (не оплачен период → «терпение» → «только чтение» → «выключено»)
   в применении к созданию клиента. Механика была единственным креплением (б) к этому маршруту, и
   вместе с ней ушло и оно. Кабинетный гейт (`isCabinetEntryBlocked`) закрывает только `disabled` и
   `unconfigured`, `read_only` он пропускает — значит клиника в рунге «только чтение» теперь может
   заводить новых клиентов, тогда как филиалы, курсы и запись ей по-прежнему отказывают.
   Из-за этого удалён кейс «refuses creating a patient card and never calls the write port» в
   `apps/webapp/src/app-layer/guards/requireEntitlementReadOnlyRefusesWrites.test.ts` — он проверял
   поведение, которое решением Т12 стало неверным.
   **Пункта об этом в плане владельца нет, поэтому это вопрос, а не работа.** Вопрос ведущему:
   должна ли неоплаченная клиника в рунге «только чтение» сохранять право заводить новых клиентов?
   Если нет — нужна отдельная строка скоупа: гейт лестницы на маршруте, не привязанный к квотной
   механике (кандидаты: расширить кабинетный гейт на `read_only` для мутаций, либо завести на
   маршруте проверку коммерческого состояния без механики). Своего решения тут не принято.

2. **Колонки `patient_count_used` в `deploy/postgres/c5a-platform-operations-runtime.sql`
   оставлены.** Функции `app.read_org_enforced_quota_usage(uuid)` и
   `app.read_current_org_tariff_transition_usage()` по-прежнему возвращают этот счётчик; код его
   больше не выбирает, так что на поведение он не влияет. Не тронуто сознательно: это артефакт
   привилегий, а не миграция — у обеих функций есть записи в `deploy/postgres/privileges/
   function-census.ts` и `declaration.ts` с перечнем читаемых отношений, и снятие чтения
   `public.org_enrollments` потянуло бы перегенерацию `deploy/postgres/generated/privileges.*.sql`
   и прогон `pnpm test:db-privileges`. Пункта об этом в Т12 нет, а объём — отдельная работа.
   Вопрос ведущему: заводить ли её отдельной строкой.

3. **Миграция 0050 не применена ни к одной базе** и, соответственно, число вычищенных строк не
   измерено (см. выше — из этой сессии нет доступа к БД). Прогон и замер — за агентом с доступом.

4. **Живой прогон приложения не выполнялся.** «Готово» по канону = галочка плана + зелёный full CI +
   живая проверка; здесь закрыты только гейты из брифа (`lint`, `typecheck`, `test:webapp`).
   Полный `pnpm ci` (в нём ещё `test`, `test:db-principal`, `test:db-privileges`, `build`,
   `build:webapp`, `audit`) не гонялся — бриф его не требовал.
