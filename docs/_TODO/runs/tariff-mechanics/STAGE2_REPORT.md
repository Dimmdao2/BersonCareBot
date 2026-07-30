# ИТОГ

Механизм лестницы реализован и зафиксирован двумя коммитами:

- `380b7aa39 feat(entitlements): add configurable access ladder #1069`
- `297bd0bfb test(entitlements): prove configurable lifecycle policy #1069`

Push и merge не выполнялись. План, канон, billing и mock-payment routes не изменялись. Посторонние env-правки остались незатронутыми.

## Отчёт по пунктам

1. **2.1 — два уровня лестницы.** Добавлены системная и механическая политики с `graceDays`, `warningCount`, `readOnlyDays`, `terminalState`; пустое значение означает «не настроено»: [types.ts:124](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/types.ts:124), [migration:4](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/db/drizzle-migrations/0276_access_lifecycle_ladder_local.sql:4), [constructor:101](/home/dev/dev-projects/bcb-wt-[redacted-token].tsx:101). Владелец задаёт все четыре поля на системном уровне и отдельно для механики. Тест: [service.test.ts:348](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/service.test.ts:348). При удалении механической политики тест получил системное `grace` вместо механического `read_only`.

2. **2.2 — приоритет механики.** Единственная строка выбора — `mechanicPolicy ?? systemAccessPolicy`: [service.ts:219](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/service.ts:219). Владелец решает, какие механики переопределяют общий режим. При fault-injection тест показал `policySource: system`, `state: grace` вместо `policySource: mechanic`, `state: read_only`.

3. **2.3 — один resolver.** `resolveMechanicAccessFromSnapshot()` получает tariff, активные исключения организации и уже вычисленное коммерческое состояние: [service.ts:196](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/service.ts:196), [pgOrgEntitlements.ts:175](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:175). Локальных commercial-флагов не добавлено. `no_trial` без настроенного тарифа возвращает `unconfigured`, а не придуманное отключение. При восстановлении старого `no_trial → disabled` тест упал: ожидал `unconfigured`, получил `disabled`.

4. **2.4 — поведение ступеней.** `grace` возвращает дату окончания и число предупреждений; `read_only` разрешает чтение, но блокирует mutation; `disabled` блокирует чтение и прямую страницу: [service.ts:230](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/service.ts:230), [requireEntitlement.ts:44](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/app-layer/guards/requireEntitlement.ts:44). Resolver и visibility adapter ничего не удаляют и не изменяют в данных — отключение только скрывает доступ, поэтому повторное включение открывает прежние записи. Тест: [service.test.ts:435](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/service.test.ts:435). При возврате безусловного разрешения чтения `deniedRead.ok` стал `true`.

5. **2.5 — критичные механики.** Механика класса `никогда` возвращается как `full_access` до чтения тарифа, override или terminal policy: [service.ts:205](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/service.ts:205). Тест хранит `patient_card=false` одновременно в тарифе и персональном исключении: [service.test.ts:400](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/service.test.ts:400). При удалении этой ветви результат стал `disabled`. 2FA, журнал, экспорт, уведомления и экстренная помощь по канону вообще не являются тарифными рубильниками, поэтому их нельзя положить в ladder или сохранить как `false`.

6. **2.6/2.6a — удалены решения агента.**

   - Порог предупреждения теперь поле `warningAtPercent`: [service.ts:354](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/service.ts:354). При возврате `80` тест получил `below_warning` вместо настроенного владельцем `warning`.
   - Seat baseline `1` удалён; отсутствие лимита даёт `clinic_seat_limit_unconfigured`: [clinic-seats/service.ts:35](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/clinic-seats/service.ts:35), [pgOrganizationInvites.ts:150](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:150). При возврате UI-default `1` тест получил значение `1` вместо пустого поля.
   - Литеральный `MECHANIC_DEFAULT_ENABLED` удалён; включение берётся из тарифа или персонального исключения.
   - `no_trial → false` заменён на `unconfigured`.
   - Seed `7/3/21` удалён из `0259`; forward-миграция удаляет только точно совпадающий старый агентский seed, не трогая изменённую владельцем настройку: [0276 migration:26](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/db/drizzle-migrations/0276_access_lifecycle_ladder_local.sql:26).
   - `start_event` теперь любое непустое настроенное значение: [saasEntitlements.ts:159](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:159).
   - Terminal берётся из политики. При подмене результата на постоянный `disabled` тест ожидал настроенный `full_access`, но получил `disabled`.

7. **2.6b — числа для класса `запас`.** `TariffQuotaMap` допускает `patient_count` и `branches` только с `unit: items`; возможности вроде `courses` по-прежнему запрещены типом: [types.ts:103](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/types.ts:103), [service.test.ts:308](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/service.test.ts:308). При удалении этих двух ключей `typecheck` дал восемь ошибок в constructor, normalization и тесте.

8. **2.7 — конструктор.** Интерфейс показывает «Терпение: дней», «Предупреждений», «Только чтение: дней», «Затем» и начинает с пустых значений: [CommercialConstructorClient.tsx:255](/home/dev/dev-projects/bcb-wt-[redacted-token].tsx:255). Тест: [CommercialConstructorClient.ui.test.tsx:10](/home/dev/dev-projects/bcb-wt-[redacted-token].ui.test.tsx:10). После удаления русской подписи тест упал с `Unable to find ... Терпение: дней`.

9. **3.1a — чтение больше не разрешается безусловно.** Ранний `return {ok:true}` удалён; решение принимает ladder: [requireEntitlement.ts:49](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/app-layer/guards/requireEntitlement.ts:49). При восстановлении старого return тест разрешил чтение в `disabled` и упал.

10. **3.1b — единый visibility adapter.** Один результат обслуживает specialist navigation, patient navigation и direct URL: [requireEntitlement.ts:79](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/app-layer/guards/requireEntitlement.ts:79). Он подключён к меню специалиста [doctor/layout.tsx:77](/home/dev/dev-projects/bcb-wt-[redacted-token].tsx:77), пациентскому course-блоку [patient/page.tsx:47](/home/dev/dev-projects/bcb-wt-[redacted-token].tsx:47) и прямым страницам обеих сторон, например [doctor courses:57](/home/dev/dev-projects/bcb-wt-[redacted-token].tsx:57) и [patient courses:19](/home/dev/dev-projects/bcb-wt-[redacted-token].tsx:19). При принудительном `visible=true` direct URL перестал выдавать `NEXT_NOT_FOUND`, и тест упал.

## Проверки

- Exact Vitest: 3 файла, 20/20 тестов.
- Финальный UI-test: 1/1.
- `pnpm --filter webapp typecheck` — успешно.
- `pnpm --filter webapp lint` — успешно.
- Disposable PostgreSQL concurrency proof — успешно; DEV/TEST/PROD не затрагивались.
- Полный CI не запускался.
- Статический поиск runtime-кода не нашёл старых `80%`, seat baseline `1`, `MECHANIC_DEFAULT_ENABLED`, `no_trial ? false`, фиксированных длительностей или выбранного terminal state.

## Что осталось не настраиваемым и почему

- Порядок ступеней, названия состояний и перевод дней в миллисекунды остаются константами механизма. Владелец задаёт значения и terminal, но не переписывает сам автомат состояний.
- Класс `никогда` остаётся кодовым security-инвариантом. Критичные функции нельзя превратить в тарифный рубильник через конструктор.
- В runtime SQL остаётся обработчик события `organization_provisioned`. CHECK, заставлявший владельца выбирать только его, удалён, но автоматические producers других событий — например, неоплаты — относятся к запрещённому здесь billing scope. Настроить другое имя уже можно; автоматически вызвать его пока некому.
- Числа пациентов и филиалов теперь можно сохранять и типобезопасно передавать, но их транзакционные счётчики и enforcement не строились этим этапом.
- `warningCount` хранится и возвращается resolver’ом вместе с датой. Расписание фактической доставки нескольких billing-предупреждений не добавлялось, поскольку billing был исключён из scope.
- Visibility adapter подключён к существующей сквозной поверхности курсов как поведенческое доказательство. Остальные будущие разделы должны подключаться к этому же адаптеру при реализации своих поверхностей; отдельной логики состояния им добавлять нельзя.
- Старые `7/3/21` присутствуют только как точный шаблон удаления исторического seed в forward-миграции, не как действующая политика.
- Live DEV migration не выполнялась: её должен запустить lead в каноническом дереве.