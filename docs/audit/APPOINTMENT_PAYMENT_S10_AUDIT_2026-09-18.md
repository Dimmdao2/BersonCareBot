# S10 appointment payment — independent exact-candidate audit

Candidate: `0c5a9aa2eae1ddf99a91e00c2a9cddaf52fc07f3` (`git rev-parse HEAD`).
Authority: `docs/_TODO/APPOINTMENT_PREPAYMENT_VISIBILITY_2026-09-11.md`, S10;
owner brief dated 2026-09-18 (its detailed requirements take precedence).

## Classification before implementation/tests

- PAY-APPT-24: field order, labels, colours and action visibility — visual inspection/live; financial amounts and refunded-only history — money behaviour.
- PAY-APPT-25: heading, description, radio/amount controls — visual/live; positive bounded server amount and repeat payment — money behaviour.
- PAY-APPT-26: timeline/refund controls — visual/live; actual cash/provider movements, refund capability, amount and net balance — money behaviour.
- PAY-APPT-27: divider, move/cancel panels and removal from editor — visual/live, no UI tests.
- PAY-APPT-28: icons/badges placement — visual/live; one actual payment fact across projections — money behaviour.
- PAY-APPT-29: mobile/right panel geometry — visual/live; no UI tests.
- Cross-cutting owner requirement: existing models/ports, integer minor units, named DB root — inspection; tenant isolation — behaviour/catalog inspection.

## Blind kill-set (recorded before reading implementation or existing tests)

Oracle is the owner's financial requirement and conservation of actual money, not current DTO shape.

- K1: server accepts non-positive amount or amount above actual remaining debt, including after partial payment; UI total can raise the collectible amount.
- K2: repeating/concurrent collection or a pending online payment followed by cash credits more than the appointment debt; idempotent replay credits twice.
- K3: partial/full refund leaves net-paid amount/full-paid indicator unchanged, or permits cumulative refund above actual money.
- K4: shared/multi-slot payment is counted in full for each appointment, or refund of one slot corrupts another slot's paid state.
- K5: expiry cancels a paid appointment; refund leaves an expired intention falsely payable/paid.
- K6: cash refund against online money, unsupported auto-refund, or provider partial refund produces false amount/history or duplicate external refund.
- K7: cancelled appointment whose prepayment was fully refunded loses access to actual payment history; empty prepayment is paid.
- K8: client-selected organization/foreign appointment crosses the tenant boundary, or client amount/total bypasses server authority.

No product fixes, fixture creation, second Next, full CI, push or deploy are authorized.


## Итог по owner checklist

- PAY-APPT-24 → **FAIL** → после повторного provider refund фактическая сумма в модели чтения занижается (F3); обычные поля, порядок и кнопка неоплаченной записи подтверждены `/tmp/s10-audit-detail-mobile.png`, `/tmp/s10-audit-detail-wide.png`. Refunded-only отменённая запись проверена по веткам чтения, но не живьём: подходящих данных DEV нет.
- PAY-APPT-25 → **FAIL** → одновременные разные частичные платежи обходят ограничение остатка (F2, acceptance K2); обычная последовательная граница работает и проверена fault injection K1. Шапка, solo-описание, radio и numeric field проверены живьём, `/tmp/s10-audit-collect-mobile.png`, `/tmp/s10-audit-partial-mobile.png`.
- PAY-APPT-26 → **FAIL** → кассовый возврат не имеет runtime capability (F1); provider refund неправильно учитывает повтор и общие платежи (F3/F4), UI повторно вычитает возврат (F5), controls не соответствуют требованию (F7).
- PAY-APPT-27 → **PASS** → `/tmp/s10-audit-move-mobile.png`, `/tmp/s10-audit-cancel-mobile.png`: обе кнопки открывают соответствующие панели; отдельной отмены в редакторе нет. Diff `DoctorCalendarEventPanel.tsx` совпадает с живым состоянием; сохранение/отмена записи не выполнялись.
- PAY-APPT-28 → **FAIL** → общий indicator переиспользован в списках и сетке, но его paid-предикат расходится с деталями и помечает предоплату внесённой при отключённой предоплате (F6).
- PAY-APPT-29 → **BLOCKED** → выполнен независимый live-проход неоплаченной записи на mobile и wide; геометрия одиночной/парных кнопок соответствует требованию. Refund/paid/prepayment-состояния живьём недоступны без изменения данных; создание данных запрещено. Для трёх/четырёх footer actions выполнен только просмотр CSS, не live-приёмка. CI и выкладка не входят в этот audit brief.

## Достижимые нарушения

### F1 — кассовый возврат не доходит до финансового корня

**Требование:** PAY-APPT-26, owner brief §5/§7: оформить cash refund через работающий именованный DB-root.
**Сценарий:** принять наличные по записи, открыть возврат и оформить положительную сумму в пределах полученного.
`pgPatientPayments.ts:306` вызывает `app.refund_appointment_cash_payment(text)`, но новый корень добавлен только
в function declaration; записи capability рядом с существующим cash-settle нет.
`portContextRuntime.ts:302` отказывает с `Missing unique declared webapp port capability ...`.
**Impact:** возврат не оформляется, даже несмотря на успешный migration/reconcile и EXECUTE grant.

Доказательства:

```bash
rg -n 'refund_appointment_cash_payment|booking-payment.appointment.cash-refund|settle_appointment_cash_prepayment' deploy/postgres/generated/port-context-capabilities.bcb_webapp_dev.sql deploy/postgres/privileges/declaration.ts apps/webapp/src/infra/db/portContextRuntime.ts
node /home/dev/brain/tools/code-search.mjs 'booking-payment.prepayment.cash-settle capability' --repo bcb -k 6
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -c "SELECT count(*) AS refund_capabilities FROM app_ext.port_context_capabilities WHERE function_identity='app.refund_appointment_cash_payment(text)'::regprocedure;"
```

Последняя команда вернула **0**. Проверены declaration functions и capability registry, generated capabilities,
живой `app_ext.port_context_capabilities`, runtime lookup, обратная ссылка repo → root. Generated check при этом зелёный.

Кроме того, тело нового корня содержит `pg_catalog.greatest(0, v_paid_minor - v_amount_minor)`
(`20260918T162000_appointment_cash_refund.sql:97`). После восстановления capability это станет следующим
runtime-отказом: такой PostgreSQL-функции нет. Это одна незавершённая cash-refund цепочка, не отдельный scope.

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -c 'BEGIN READ ONLY; SELECT pg_catalog.greatest(0, 100); ROLLBACK;'
```

Результат: `function pg_catalog.greatest(integer, integer) does not exist`; `/tmp/s10-audit-cash-sql-expression.log`.
Ошибка прерывает read-only transaction; закрытие соединения откатывает её. Тело установленной функции сверено
через `pg_get_functiondef`, тот же вызов присутствует. Это inspection/runtime-expression proof, не новый тест.

### F2 — concurrent partial cash collection превышает остаток

**Требование:** PAY-APPT-25, owner brief §2: сервер отвергает сумму сверх фактического остатка.
**Сценарий:** разные суммы принимаются из параллельных вкладок до завершения первого запроса.
Каждый `createPayment` читает старый остаток (`staffAppointmentPayments.ts:313`), затем вызывает кассу.
Корень `app.settle_appointment_cash_prepayment(text)` блокирует appointment, но после блокировки не проверяет
остаток — добавляет сумму; разные суммы имеют разные idempotency keys.
**Impact:** пациенту зачисляется больше стоимости записи.

Acceptance `K2: simultaneous different cash amounts...` воспроизводит через настоящий app-layer service:
при стоимости `10_000` minor units запросы `6_000` и `5_000` дают `11_000` (команда A ниже).
DB не подменяется в заявлении о RLS: это service-level race proof плюс чтение фактического cash-root
(`20260906T101500_cash_settles_an_appointment_prepayment.sql`, блок после `FOR UPDATE`).

### F3 — provider idempotency не обеспечивает идемпотентность локального возврата

**Требование:** PAY-APPT-24/26, owner brief §5: реальные движения и правильная net-paid сумма; отдельно поручено проверить идемпотентность.
**Сценарий:** параллельные одинаковые refund-запросы читают одинаковый `alreadyRefunded`, получают одинаковый
provider idempotency key и одну фактическую provider-операцию. Затем оба безусловно вставляют `be_refunds`
и history (`payments/service.ts:829`, `pgPayments.ts:737`). Ни сериализации, ни unique provider-ref в модели нет.
**Impact:** один фактический возврат учитывается дважды; уменьшается оплата и завышается остаток к сбору.

Acceptance K3: внешний идемпотентный provider возвращает `3_000` из `10_000`, но публичный
`getPaymentState` показывает долг `6_000` вместо `3_000` (команда A). Adapter — внешняя заглушка с независимым
журналом фактически возвращенных денег; реальные app-layer/payment services и чтение истории исполняются.
Это не проверка аргументов собственного mock и не утверждение о пройденном provider sandbox.

### F4 — возврат одного слота расходует лимит другого

**Требование:** PAY-APPT-26 и явный shared/multi-slot case брифа;
`docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` §13.1: деньги возвращаются посеансно.
**Сценарий:** общий captured payment покрывает несколько записей. После возврата первой врач возвращает вторую.
`refundAppointmentPayment` вычитает сумму возвратов всего payment из доли одной записи
(`service.ts:818–823`; `pgPayments.ts:722` фильтрует payment/organization, не appointment).
**Impact:** вторая запись остаётся оплаченной, но вернуть её деньги нельзя.

Acceptance K4: общий платёж `20_000`, доли по `10_000`; после возврата первой доли вторая получает
`refund_amount_exceeds_payment` (команда A). Отказ происходит до внешнего provider call.

### F5 — панель повторно вычитает уже учтённый online refund

**Требование:** PAY-APPT-26, owner brief §5: внизу правильная вычисленная сумма возврата.
**Сценарий:** успешный частичный online refund, затем повторно открыть «Сделать возврат».
`listStaffAppointmentPaymentViews` уже уменьшает `payment.amountMinor` на refund
(`staffAppointmentPayments.ts:148–153`), а `AppointmentPaymentSection.tsx:344–350` вычитает его снова.
**Impact:** сумма следующего автовозврата занижена; после возврата половины суммы автовозврат исчезает,
хотя у provider остаётся половина денег. Проверка — чтение всей пары producer/consumer, без UI-теста.

### F6 — разные факты «Предоплата внесена» в деталях и indicator

**Требование:** PAY-APPT-28 и owner brief §3: одинаковый факт внесения, пустая предоплата не оплачена.
**Сценарий A:** частичная оплата меньше настроенной предоплаты. Детали показывают «Ожидается»/«Просрочена»
(`AppointmentPaymentSection.tsx:337`), а список/сетка — зелёную «Предоплата внесена» при любой положительной
`prepaymentPaidMinor` (`DoctorAppointmentIndicators.tsx:62`).
**Сценарий B:** предоплата отключена, но внесена частичная online-оплата. Детали — «Без предоплаты»,
indicator — «Предоплата внесена» по одному `paymentStatus === 'captured'`.
**Impact:** врач получает противоречивое подтверждение оплаты. Доказано инспекцией общих входов и обеих веток;
live оплаченного состояния не заявляется. Автоматизированного UI-теста нет.

### F7 — controls возврата не выполняют указанные условия

**Требование:** owner brief §5 / PAY-APPT-26: удержать комиссию; amount-field только при включённом «Указать сумму».
**Сценарий:** открыть возврат существующей оплаты. Checkbox комиссии всегда `disabled`, значение не участвует
в расчёте; amount-field рендерится постоянно и лишь отключается
(`AppointmentPaymentSection.tsx:747–782`, расчёт `:351–357`).
**Impact:** удержание комиссии недоступно, поле удержания видно вопреки явному условию владельца.
Проверено взглядом по diff; paid/refund live отсутствует по ограничению данных. Это конкретное невыполнение
owner controls, не предложение альтернативного дизайна.

## Acceptance handoff и границы доказательства

**Команда A (финальная acceptance-проверка):**

```bash
pnpm --dir apps/webapp exec vitest run src/app-layer/booking/staffAppointmentPayments.s10.unit.test.ts
```

Результат: **5 failed / 1 passed**, `/tmp/s10-audit-acceptance-final.log`. Все красные тесты падают
на неизменённом продукте, не на искусственной мутации. Дополнительные красные утверждения:

- K2 recollection: cash → full cash refund → такая же cash-сумма повторно; ключ, зависящий от net balance,
  возвращает старую строку оплаты, и остаток остаётся `10_000` вместо `0`.
- K6 cross-method: после cash-refund online-платежа auto-refund не вычитает уже возвращённые наличные
  и повторно отправляет provider сумму `10_000` вместо отказа.

Эти два теста фиксируют отказ публичного service с заменённым DB-port. Их полный HTTP/DB путь сейчас
блокируется ещё раньше F1; они **не объявляются отдельно воспроизведёнными live MUST FIX**.
После восстановления F1 тот же набор должен остаться oracle, а не переписываться под реализацию.

K1 на исходном продукте зелёный. Единственная временная product-мутация: убрать
`requestedAmountMinor > state.remainingMinor`; запуск:

```bash
pnpm --dir apps/webapp exec vitest run src/app-layer/booking/staffAppointmentPayments.s10.unit.test.ts -t 'K1:'
```

Результат мутации: красный `manualPaidMinor` — `11_000` вместо `6_000`,
`/tmp/s10-audit-K1-fault.log`. Исходный файл восстановлен побайтно в `finally`; финальная команда A снова
дала зелёный K1. Новые тесты проверяют дорогие молчаливые денежные отказы через результат цепочки;
независимый oracle — owner requirement + сохранение денег. Нет тестов DOM, строк, CSS, списка или DTO shape.
Файл включён project `unit` в `apps/webapp/vitest.config.ts`, а тот запускается
`.github/workflows/ci.yml:144` (`pnpm test:webapp:behavior`).

Kill-set disposition:

- K1: последовательное превышение остатка ловится мутацией. Positive/integer guards проверены по service и route Zod; отдельной мутацией не проверялись.
- K2: concurrent collection — красный acceptance; cash recollection — дополнительный красный service-level oracle; paid online+cash не принят end-to-end.
- K3: duplicate refund — красный acceptance; UI refund arithmetic — F5.
- K4: красный acceptance shared-payment refund.
- K5: только inspection expiry predicates и snapshot writes; paid/refunded runtime не проверен. Provider refund не обновляет `prepayment_paid_minor`, хотя читатель карточки считает net по журналу; отдельного решения о статусе записи после refund не выдумываю.
- K6: красный service-level cross-method oracle, full DB-путь блокирует F1. Реальный provider sandbox, возможность refund конкретного исходного provider payment, сведения о чеке не проверены.
- K7: ветки `hasPaymentActivity`, refunded brief и сумм кассы сохраняют историю при net-zero, кнопка collection скрыта по `cancelled`; refunded-only отменённая запись live не проверена.
- K8: route берет organization из guard, patient из записи; body принимает только action/amount/purpose/method/reason; repo и root сверяют tenant. RLS/FORCE RLS и owner/grants посмотрены в DEV, но атакующий runtime-проход и fault injection стены не выполнялись. **Полного blind PASS нет.**

## Live и сверка evidence ведущего

Обычный password-вход owner doctor по AGENTS §1a; общий `http://127.0.0.1:5200`, браузер Chromium.
Изменяющих действий в UI не выполнялось. Команды: `node /tmp/s10-live.cjs`, затем
`node /tmp/s10-panels.cjs`; это одноразовые браузерные инспекции/скриншоты, без assertions, не UI-тесты.
Viewport задавался `390×844` и `1024×768` в этих скриптах. Просмотрены лично:

- исходные `/tmp/appointment-payment-detail-mobile.png`, `/tmp/appointment-payment-collect-mobile.png`,
  `/tmp/appointment-payment-detail-wide.png` — только обычная неоплаченная запись;
- независимые `/tmp/s10-audit-detail-mobile.png`, `/tmp/s10-audit-collect-mobile.png`,
  `/tmp/s10-audit-partial-mobile.png`, `/tmp/s10-audit-move-mobile.png`,
  `/tmp/s10-audit-cancel-mobile.png`, `/tmp/s10-audit-detail-wide.png`.

`git -C /home/dev/dev-projects/BersonCareBot rev-parse HEAD` вернул тот же exact candidate.
CSS footer просмотрен командой `git show 7963573a0 -- apps/webapp/src/app/styles/doctor.css apps/webapp/src/shared/ui/doctor/DoctorModal.tsx`:
одна кнопка справа, две/три в ряд, четыре в две колонки. Live увидены одиночная и парные кнопки.

Данные DEV проверены read-only:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -c "BEGIN READ ONLY; SELECT a.id, a.organization_id, a.platform_user_id, a.status, a.price_minor, a.prepayment_required_minor, a.prepayment_paid_minor, a.payment_ref FROM public.be_appointments a WHERE a.deleted_at IS NULL AND (a.prepayment_paid_minor>0 OR a.payment_ref IS NOT NULL) LIMIT 12; SELECT status,count(*) FROM public.be_payments GROUP BY status; SELECT status,count(*) FROM public.patient_payment GROUP BY status; ROLLBACK;"
```

Первый и второй запросы вернули **0 rows**; третий — **1 paid** (не evidence оплаты appointment).
Поэтому создавать/подделывать live refund-состояние нельзя в разрешённом scope.

Проверки кандидата:

- `pnpm --dir apps/webapp typecheck` → PASS после подключения существующих workspace dependencies; `/tmp/s10-audit-typecheck-final.log`. Первый запуск выявил ошибки моего test setup и отсутствующий dependency link worktree — устранены только в тесте/локальных ссылках, не в продукте.
- `pnpm --dir apps/webapp exec vitest run src/app-layer/booking/staffAppointmentPaymentIntent.unit.test.ts src/modules/payments/service.test.ts src/modules/patient-payments/service.unit.test.ts src/modules/booking-calendar/service.unit.test.ts src/app-layer/booking/staffAppointmentPayments.s10.unit.test.ts` → исходные файлы PASS; совокупно **42 passed / 4 failed** до добавления concurrent-cash acceptance. `/tmp/s10-audit-targeted-final.log`. Это конкретный собственный набор; не подтверждение неназванного набора ведущего «47/47».
- `pnpm run check:db-privileges-generated` → PASS, `/tmp/s10-audit-generated.log`; совпадение артефактов не доказывает полноту capabilities (F1).
- `pnpm --dir apps/webapp exec eslint src/app-layer/booking/staffAppointmentPayments.s10.unit.test.ts` → PASS.
- `pnpm --dir apps/webapp lint` → PASS (включая repo gates), `/tmp/s10-audit-lint.log`; full CI не запускался.
- Migration ledger содержит `20260918T162000_appointment_cash_refund`, функция существует, owner `app_seam_payment_webhook_owner`, staff EXECUTE есть — сверено SQL catalog (лог `/tmp/s10-audit-db-catalog.log`). Preflight/execute не повторялись: historical PASS без exact-command log не сертифицирован; фактическая установленная функция всё равно не образует работающего пути F1.

Миграция меняет только функцию, использует существующие `patient_payment`, `be_appointments` и журналы,
права выдаются declaration/reconcile. Порты/Drizzle сохранены, новой модели и нового raw SQL в app-layer нет.
Integer amount проверяется route/service, БД хранит integer. Owner requirement §7 не получает общий PASS
из-за отсутствующей runtime capability и непройденного атакующего tenant proof.

## Граница и handoff

Прочитаны AGENTS §1/1a/5/9–10b/16–17/21/21a/24, README, `.cursor/rules`, local-dev/server/deploy canon;
`.claude/` и `docs/README.md` в candidate отсутствуют (проверено чтением этих точных путей).
Authority/backrefs: основной S10, `DOCTOR_MOBILE_UI_OWNER_ACCEPTANCE_2026-09-04.md` K2–K4,
`OWNER_PRODUCT_RULES.md` §13.1, точный поиск `PAY-APPT-24..29`/имени плана в owner-регистрах,
`.cursor/plans`, docs/audit и code-search по appointment payment/refund. Более новое требование этого
owner brief применялось непосредственно; план и чекбоксы не изменялись.

Вне scope новых задач не заведено. Перед полной приёмкой остаются исправления F1–F7, тот же фиксированный
acceptance-набор и live paid/refund-проход при разрешённых данных/среде. Нового общего audit/fix-цикла
для тех же денежных assertions не требуется. Действий на PROD/TEST, push, deploy, full CI не было.

Финальная проверка: `git diff --exit-code 0c5a9aa2e -- apps/webapp/src/app-layer/booking/staffAppointmentPayments.ts apps/webapp/src/modules/payments/service.ts apps/webapp/db/drizzle-migrations deploy/postgres/privileges/declaration.ts` — PASS, продукт совпадает с candidate. `git diff --cached --check` — PASS. В staging только этот audit-artifact и новый `staffAppointmentPayments.s10.unit.test.ts`; временные dependency symlinks и browser session storage удалены.
