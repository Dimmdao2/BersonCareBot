# Critical independent audit — tariff paid-period candidate

**Дата:** 2026-08-02
**Кандидат:** `696467697` + `9d1c44107` (`c11902c64` — только evidence)
**Карточки:** `#1057`, `#1069`
**Итог:** **FAIL** — кандидат нельзя передавать на DEV migration/preflight. Пять сохранённых acceptance-тестов
воспроизводят преждевременную активацию будущего invoice, потерю pending target, сдвиг оплаченных дат manual
upgrade и две crash/replay-дыры. Ещё два обязательных пути отсутствуют по коду: boundary promotion оплаченного
future invoice и clinic tariff selection/schedule/cancel.

## Authority и метод

Продуктовый oracle: `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md` §5а-0 Р-10/Р-11/Р-14 и §5.6;
`docs/_TODO/OWNER_PUNCHLIST_2026-07-28.md` D-9; worker brief
`docs/_TODO/runs/briefs/TARIFF_CHANGE_PAID_PERIOD_BRIEF.md`.

Классификация до проверки: деньги, оплаченные даты, invoice authority и webhook replay — повторяемое дорогое
молчаливое поведение, поэтому поведенческий тест и fault injection; migration/schema/UI wiring — итоговое состояние,
поэтому взгляд и executable gates.

## Blind kill-set — составлен до чтения production-кода и тестов

1. Ранняя успешная renewal-оплата до текущей границы преждевременно меняет effective tariff/snapshot,
   `current_period_starts_at`/`current_period_ends_at` или organization projection; boundary затем применяет не тот
   invoice либо применяет его повторно.
2. При current yearly → pending monthly новый invoice ошибочно получает конец по yearly-периоду текущего тарифа,
   а не по monthly-периоду купленного target tariff.
3. Изменение live tariff после создания invoice/provider offer меняет активируемые tariff id/snapshot/dates вместо
   зафиксированных purchased values invoice.
4. Раздельные транзакции provider-event dedupe, invoice CAS, saved payment method и period action допускают
   `invoice=paid` без durable action, потерю будущего paid invoice или повторное продление периода после crash/retry.
5. Downgrade немедленно меняет текущую дверь/snapshot/dates/projection; intent создаётся до blockers; files ошибочно
   блокируют schedule, seats ошибочно блокируют, либо назначение текущего тарифа не отменяет pending.
6. Manual platform-admin upgrade сдвигает оплаченные start/end либо не обновляет effective full snapshot атомарно.
7. `0307` нарушает последовательность/temporary marker/journal/schema parity, не даёт unique index/FK/index либо
   добавляет запрещённую сущность/дату/service/evaluator; historical invoice snapshot ошибочно `NOT NULL`.

## Проверка сценариев

| #                                 | Вердикт                                     | Независимое доказательство                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Early renewal                  | **FAIL**                                    | `createOwnTariffRenewalInvoice` правильно ставит начало invoice в текущий end (`service.ts:583-589`), но webhook немедленно переносит будущие `tariffId/snapshot/start/end` в subscription и organization (`service.ts:697-749`, `pgSaasBilling.ts:578-622`). Сохранённый тест получает `2026-08-01..09-01` вместо неизменного текущего `2026-07-01..08-01`. `runDueSaasBillingRenewals` для уже существующего invoice только делает `continue` (`service.ts:495-525`); production-вызова отдельной boundary activation нет.                                                                                                                                                                     |
| 2. Pending target + другой period | **FAIL**                                    | Platform assignment хранит pending в subscription `source=manual` (`pgSaasBilling.ts:351-367,383-440`), а clinic renewal создаёт/читает `source=paid_subscription` и live organization tariff (`pgSaasBilling.ts:708-755`). Сохранённый тест получает `tariff-current` вместо `tariff-next`. В auto-renewal даты вычисляются до repository call по `billingPeriod` текущего tariff (`service.ts:495-522`, `pgSaasBilling.ts:758-788`), хотя внутри invoice выбирается pending target (`pgSaasBilling.ts:791-839`): yearly → monthly получит yearly end.                                                                                                                                          |
| 3. Invoice authority              | **PASS по инспекции, runtime limit**        | Новый invoice сохраняет полный `to_jsonb` snapshot в одной transaction с invoice; activation берёт `row.tariffId`, `row.tariffSnapshot` и invoice dates (`pgSaasBilling.ts:595-606,808-839`). Live edit после offer не является authority. `NULL` fallback ограничен историческими invoice. Реальная PostgreSQL-транзакция не запускалась: DB/migration запрещены brief, disposable DB-инфраструктуры в срезе нет.                                                                                                                                                                                                                                                                               |
| 4. Atomic/replay                  | **FAIL**                                    | Provider event пишется отдельно (`pgSaasBilling.ts:545-561`), invoice CAS/period action — второй transaction (`:578-622`), saved method — третья запись (`:1083-1098`); duplicate event завершает service до повторения незавершённого действия (`service.ts:710-748`). Два сохранённых fault-теста доказывают потерю invoice action после crash за dedupe и потерю saved method после crash за CAS.                                                                                                                                                                                                                                                                                             |
| 5. Downgrade scheduling           | **FAIL**                                    | Общий blocker вызывается до assignment (`org-entitlements/service.ts:560-589`); fault injection доказал numeric block, отдельный тест — отмену pending назначением current tariff. Files/seat не стали прямыми blockers. Но clinic POST не принимает target и покупает только current tariff (`app/api/clinic/billing/route.ts:38-52`), а settings UI прямо не имеет tariff-change UI (`BillingSection.tsx:58-97`): обязательных clinic select/schedule/cancel и проверки до provider intent нет. Дополнительно создан второй классификатор смены `tariffChangeAppliesNextPeriod` (`org-entitlements/service.ts:517-535`) вопреки brief:29-31; он считает unlimited → finite немедленной сменой. |
| 6. Manual platform upgrade        | **FAIL**                                    | Snapshot и organization projection пишутся одной manual transaction (`pgSaasBilling.ts:407-449`), но service пересчитывает период от `now` (`service.ts:399-418`). Сохранённый тест ожидал существующие `2026-07-01..08-01`, получил `2026-07-15..08-15`. Clinic upgrade charging не проверялся и не выводился: owner-money формула не решена.                                                                                                                                                                                                                                                                                                                                                   |
| 7. Migration `0307`               | **PASS по файлам/gates, один gate blocked** | `0307_tariff_change_paid_period_local.sql`: первая строка temporary marker, только nullable `pending_tariff_id` + FK/index и nullable invoice `tariff_snapshot`; journal `idx=307`, unique tag/when, `when=0306+1`; schema parity видна в `saasBilling.ts:93,141,162-166,212`. Journal gate и typecheck зелёные. `drizzle-kit check` остановился до проверки, потому что canonical config требует отсутствующий `DATABASE_URL`; URL не изобретался и БД не затрагивалась. Запрещённый evaluator находится не в migration, но нарушает общий scope среза.                                                                                                                                         |

## Findings

### F1 — CRITICAL: paid future invoice преждевременно заменяет текущий оплаченный период

Достижимый путь: клиника платит renewal до `current_period_ends_at`; успешный webhook сразу переводит invoice в
`paid` и тем же repository method переписывает effective tariff/snapshot/dates/projection будущим периодом.
Клиника теряет оставшийся оплаченный интервал, а boundary worker не имеет действия, которое позже продвинет ровно
этот invoice один раз. Нарушены Р-10/Р-14 и brief:46-51.

### F2 — CRITICAL: pending tariff не соединён с renewal, период считается по current tariff

Достижимый путь platform schedule создаёт pending на manual subscription; clinic pay работает с другой,
`paid_subscription`, строкой. Даже auto-renewal сначала вычисляет end по текущему billing period и лишь затем
repository выбирает pending tariff. Поэтому target может потеряться, а yearly → monthly invoice получить неверные
даты. Нарушены Р-14 и brief:42-53.

### F3 — CRITICAL: webhook dedupe/CAS/payment-method/action не атомарны и replay не завершает состояние

Crash между event insert и invoice action оставляет provider event, после чего replay распознаётся duplicate и
выходит; invoice остаётся pending. Crash после invoice CAS/action и до сохранения payment method оставляет invoice
paid, но replay снова выходит до missing write. Нарушено точное требование brief:50-51.

### F4 — HIGH: manual upgrade сдвигает уже оплаченные start/end

Upgrade entitlement применяется сразу, но service открывает новый период от времени назначения вместо сохранения
границ существующего оплаченного цикла. Нарушены Р-10 и brief:38-41.

### F5 — HIGH: clinic tariff-change путь из scope отсутствует

Clinic route не принимает target tariff и способен только повторно купить назначенный current tariff; UI не даёт
выбрать, запланировать или отменить pending tariff. Поэтому blockers физически нельзя выполнить до clinic provider
intent, как требует brief:42-54. Это не finding про неразрешённую цену upgrade: clinic upgrade invoice создавать
до owner-money решения действительно нельзя.

### F6 — HIGH: создан запрещённый второй evaluator, который пропускает restrictive unlimited → finite как immediate

`tariffChangeAppliesNextPeriod` дублирует смысл уже существующего общего `evaluateTariffDowngrade`, хотя brief:29-31
прямо запрещает дублирующий quota evaluator. Его numeric branch возвращает delayed только когда обе quota имеют
`kind=numeric`; переход unlimited → finite не распознаётся как downgrade и может немедленно отнять оплаченную
безлимитность. Это достижимое нарушение Р-14, не stylistic preference.

## Fault injection

Временные product faults вносились по одному и сразу откатывались. После них
`git diff -- apps/webapp/src/modules/saas-billing/service.ts apps/webapp/src/modules/org-entitlements/service.ts`
пуст.

| Убитая гарантия                                    | Команда                                                                                                                                                                   | Результат                                                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Renewal anchor заменён с current end на `now`      | `pnpm --dir apps/webapp exec vitest run src/modules/saas-billing/service.test.ts -t "anchors the next invoice at currentPeriodEndsAt"`                                    | exit 1, 1 failed / 15 skipped; received `2026-08-02..09-02` вместо `2026-09-01..10-01`; fault откатан. |
| Numeric `block` временно отключён                  | `pnpm --dir apps/webapp exec vitest run src/modules/org-entitlements/service.test.ts -t "refuses the tariff switch itself when a numeric mechanic is over the new limit"` | exit 1, 1 failed / 45 skipped; promise resolved; fault откатан.                                        |
| Ветка cancel pending назначением current отключена | `pnpm --dir apps/webapp exec vitest run src/modules/saas-billing/service.test.ts -t "assigning the current tariff cancels an already scheduled downgrade"`                | exit 1, 1 failed / 15 skipped; repository mutation не вызвана; fault откатан.                          |

Пять других тестов красные на неизменённом candidate и сохранены как permanent acceptance tests: early future
invoice, pending target, manual upgrade dates, crash after event dedupe, crash after invoice CAS. Не удалось
осмысленно kill-test invoice snapshot внутри реальной PostgreSQL transaction без запрещённого DB-прогона; одной
проверкой service arguments это требование не подменялось.

## Команды и результаты

- `pnpm --dir apps/webapp exec vitest run src/modules/saas-billing/service.test.ts src/modules/org-entitlements/service.test.ts src/app/api/payments/saasWebhook.route.test.ts src/app/api/admin/organizations/route.route.test.ts src/app/app/admin/commercial/CommercialConstructorClient.ui.test.tsx src/app/app/settings/BillingSection.ui.test.tsx` — exit 0, **6 files / 70 tests passed** на исходном candidate.
- `pnpm --dir apps/webapp exec vitest run src/modules/saas-billing/service.test.ts` — exit 1, **5 failed / 11 passed** после добавления acceptance tests.
- `pnpm --dir apps/webapp exec vitest run src/modules/saas-billing/service.test.ts src/modules/org-entitlements/service.test.ts src/app/api/payments/saasWebhook.route.test.ts src/app/api/admin/organizations/route.route.test.ts src/app/api/admin/commercial/route.route.test.ts src/app/api/admin/saas-billing/payments/route.route.test.ts src/app/app/admin/commercial/CommercialConstructorClient.ui.test.tsx src/app/app/settings/BillingSection.ui.test.tsx src/app/app/settings/billingCommercialState.test.ts` — exit 1, **5 failed / 76 passed (81 total)**; все пять failures — описанные acceptance gaps.
- `pnpm --dir apps/webapp typecheck` — exit 0.
- `pnpm --dir apps/webapp lint` — exit 0; внутри также зелёные raw-SQL, migration/journal и repository gates.
- `pnpm --dir apps/webapp exec eslint src/modules/saas-billing/service.test.ts` — exit 0 на финальном test diff.
- `bash apps/webapp/scripts/check-drizzle-journal-sync.sh` — exit 0.
- `node scripts/check-no-new-raw-sql.mjs` — exit 0; manifests: integrator 7, webapp 21.
- `node -e "const j=require('./apps/webapp/db/drizzle-migrations/meta/_journal.json'); console.log(JSON.stringify(j.entries.slice(-2), null, 2))"` — exit 0; `0306 idx=306 when=1793539230007`, `0307 idx=307 when=1793539230008`, unique/increasing by inspection.
- `pnpm --dir apps/webapp exec drizzle-kit check` — non-zero before schema check: canonical `apps/webapp/drizzle.config.ts` требует отсутствующий `DATABASE_URL`. Переменная не придумывалась и не печаталась.
- `git diff 696467697^..9d1c44107 --check && git diff --check` — exit 0 на финальном diff.
- `test -z "$(git diff -- apps/webapp/src/modules/saas-billing/service.ts apps/webapp/src/modules/org-entitlements/service.ts apps/webapp/src/infra/repos/pgSaasBilling.ts apps/webapp/db/drizzle-migrations/0307_tariff_change_paid_period_local.sql apps/webapp/db/schema/saasBilling.ts)"` — exit 0; временного product/migration/schema fault нет.

## Findings и limits

Итоговые findings — F1–F6 выше. Tenant/security boundary новых нарушений при инспекции scoped routes/repository
не найдено; это не компенсирует money/date failures.

Limits: никакая БД не мигрировалась и DEV/TEST/PROD не затрагивались; реальная PostgreSQL concurrency/rollback и
live tariff edit между offer/webhook не исполнялись. Поэтому invoice authority и schema parity подтверждены чтением
repository/migration/schema плюс typecheck/journal gate, но `drizzle-kit check` и DB behavior остаются
неисполненными. Worker report был открыт только после формирования blind kill-set и независимой инспекции; его
цифры доказательством не использовались.
