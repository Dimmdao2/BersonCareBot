# Одна дверь продажи места — сведение `wt/seat-invoice-20260819` в `wt/seat-door-20260820`, 20.08

Ветка `wt/seat-invoice-20260819` (`c1150234866a4d13cec02cb395da325bb88ebc9f`) влита в
`wt/seat-door-20260820` мерж-коммитом `1f8851ff9`. Сама ветка `wt/seat-invoice-20260819` НЕ
трогалась и остаётся на месте до решения ведущего — по инструкции брифа.

Все пять требуемых поведений сверены против действующей редакции реестра решений владельца
(`docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md` §5а-0). Ниже — по каждому пункту:
какое решение требует, что сделано, чем доказано.

## 1. Одна дверь (Р-15)

**Требует:** Р-15, дословно владельца 19.08 про прежнее двоение — «Как можно решать что-то в двух
местах?».

**Дефект, который был живым до мержа:** `seatOveragePurchase.ts` (дверь покупки места) и
`invites/route.ts` (дверь приглашения сверх лимита) расходились в ответе на кончившийся оплаченный
период — оба формально звали `seatOverageQuote.ts`, но `service.ts` и
`infra/repos/transactionQuotaPort.ts` отвечали на этот случай по-разному (второй считал полный
месячный тариф за ноль оставшихся дней).

**Что сделано:** решение целиком стянуто в `modules/saas-billing/seatOverage.ts`, функция
`decideSeatOverage` — единственное место, где считается «можно ли продать, почём, на какой отрезок
и до какого момента живёт счёт». `proratedSeatPriceMinor` внутри файла НЕ экспортируется.
`transactionQuotaPort.ts`'s `resolveClinicTeamAvailability` — единственный порт-обёртка, вызывающая
`decideSeatOverage`; ни у неё, ни у репозиториев (`pgSaasBilling.ts`, `inMemorySaasBilling.ts`) нет
параметров, которыми можно подсунуть свою цену/окно/срок.

**Доказательство:**
- `grep -n "decideSeatOverage\|resolveClinicTeamAvailability" apps/webapp/src/infra/repos/transactionQuotaPort.ts`
  — единственный вызов `decideSeatOverage`, единственная реализация `resolveClinicTeamAvailability`.
- Обе двери (`seatOveragePurchase.ts` → `service.ts` → `pgSaasBilling.ts`'s
  `createSeatOverageInvoiceIfNeeded` → `quota.resolveClinicTeamAvailability()`; и
  `invites/route.ts` → `pgOrganizationInvites.ts:148` → тот же `quota.resolveClinicTeamAvailability`)
  сходятся на одном и том же вызове — проверено чтением обеих цепочек импортов.
- Структурный гейт (п.2 ниже) проверяет это же утверждение статически на каждом коммите, а не
  только в момент этой проверки.

## 2. Структурный гейт единственности двери

**Требует:** сам факт того, что «одна дверь» — архитектурный инвариант (AGENTS.md §5 «Один общий
проход, и мимо него нельзя»), а не соглашение, которое можно тихо нарушить в будущем PR.

**Что сделано:** `scripts/check-seat-overage-single-door.mjs` (AST-проверка на `typescript`)
перенесён из `wt/seat-invoice-20260819` и адаптирован под действующую редакцию Р-19: канонический
пример и фикстура self-теста больше не используют `invoiceExpiresAt`/`invoiceValidityDays` (эти поля
удалены из типов, см. п.4). Гейт проверяет, что все 4 обязательных поля любого литерала
`invoiceKind: 'seat_overage'` (`amountMinor`, `servicePeriodStartsAt`, `servicePeriodEndsAt`,
`expiresAt`) — обращения к свойствам ОДНОЙ переменной, которая сама привязана к вызову
`decideSeatOverage`/`resolveClinicTeamAvailability`. Подключён в `apps/webapp/package.json`'s
lint-цепочку сразу после `check-migration-privileges.mjs --self-test`.

**Доказательство:**
- `node scripts/check-seat-overage-single-door.mjs` → `OK` (на текущем дереве).
- `node scripts/check-seat-overage-single-door.mjs --self-test` →
  `5 bypass forms rejected` + `canonical door writer accepted`.
- Живая инъекция: создан `apps/webapp/src/infra/repos/__injectSeatDoorTest.ts` со второй дверью
  (плоский объектный литерал с `invoiceKind: 'seat_overage'`, поля НЕ от `decideSeatOverage`) — гейт
  покраснел (`exit 1`, 4 находки); файл удалён, гейт снова зелёный. Инъекция не вошла в коммит.

## 3. Место открывается сразу, пропорция ОТ МОМЕНТА (Р-15)

**Требует:** Р-15 действующей редакции — «Место открывается СРАЗУ… Пропорция считается ОТ МОМЕНТА
добавления места до конца оплаченного периода, не от начала суток».

**Что сделано:**
- Открытие места больше не привязано к оплате: и в `pgSaasBilling.ts`, и в `inMemorySaasBilling.ts`
  строка `paidAdditionalSeats + 1` вставляется в момент **выставления** счёта
  (`createSeatOverageInvoiceIfNeeded`), а не в `captureSaasBillingPaymentSucceeded`/`markPaid`. Оба
  места несут явный комментарий на этот счёт.
- `decideSeatOverage` считает `servicePeriodStartsAtMs = Math.max(startsAtMs, asOfMs)` — от
  фактического момента вызова (`asOf`), не от полуночи; сохранённого «момента открытия»
  (`seatOpenedAt`) в схеме решения больше нет — было специфично для отменённого перевыставления
  (Р-19, см. п.4).

**Доказательство:**
- `apps/webapp/src/modules/saas-billing/seatOverage.unit.test.ts` — тест «quotes a mid-period seat…»
  проверяет цену по формуле от `asOf`, не от начала суток.
- `apps/webapp/src/modules/saas-billing/seatInvoiceDebt.test.ts` — тест
  «добавляет долг к сумме следующего периода и гасит его преемником» проверяет, что
  `paidAdditionalSeats` становится `2` сразу после выставления ДВУХ счетов (оплаченного и
  неоплаченного), а не только после оплаты.
- `pnpm run typecheck` — чисто; целевой vitest-прогон (см. «Верификация» ниже) — зелёный.

## 4. Отдельным счётом место оплачивается один раз, на момент открытия (Р-15/Р-19)

**Требует:** Р-15 — «Отдельным счётом место оплачивается ОДИН раз, на момент открытия нового
места — до конца периода клиника оплатила, получила»; Р-19 (20.08, дословно владельца — «короче
перевыставление — бред, убирать») — отменяет отдельный срок «от выставления» и перевыставление
просроченного счёта целиком.

**Что сделано (всё вычищено из кода этим мержем):**
- `SeatOveragePurchasableOffer.invoiceExpiresAt`, `decideSeatOverage`'s `invoiceValidityDays`/
  `seatOpenedAt` — удалены из `seatOverage.ts`.
- `ports.ts`: `invoiceValidityDays` из входа `createSeatOverageInvoiceIfNeeded`,
  `listExpiredSeatOverageInvoices`, `reissueExpiredSeatOverageInvoice` — удалены из контракта.
- `pgSaasBilling.ts`/`inMemorySaasBilling.ts`: обе реализации `listExpiredSeatOverageInvoices` и
  `reissueExpiredSeatOverageInvoice` удалены целиком (~130 строк в pg-репозитории); `expiresAt`
  счёта за место = `offer.servicePeriodEndsAt` (единый срок — конец периода, не отдельная
  «длительность»).
- `service.ts`: `runDueSeatOverageInvoiceReissues` удалён целиком (~76 строк); вызывающий его тик
  (`app/api/internal/saas-billing/renewal/tick/route.ts`) больше не зовёт и не включает результат
  перевыставления в ответ.
- Явно НЕ тронут (по брифу — другая, оставленная функция): `reissueWithSuccessor` в
  `invoiceOperations.ts` — используется ИСКЛЮЧИТЕЛЬНО долговой цепочкой Р-18
  (`createOwnTariffRenewalInvoice`/`carrySeatDebtInto`), не про перевыставление просроченного счёта
  за место. Проверено: единственные вызовы — из кода долга, тестов Р-18.
- Просроченный счёт за место теперь просто протухает и его сумма едет долгом в счёт следующего
  периода (Р-18, уже сделано ранее и не переделывалось этим мержем) — `readSeatDebtForPeriod`/
  `carrySeatDebtInto` оставлены нетронутыми.
- Удалены тесты, фиксировавшие отменённое поведение: `seatOverageInvoiceLifetime.unit.test.ts`
  (перевыставление/срок-от-выставления, Р-19) и производные assertions в
  `seatOverage.unit.test.ts`/`service.test.ts`.

**Доказательство:**
- `git grep -n "invoiceExpiresAt\|invoiceValidityDays\|reissueSeatOverageInvoice\|listExpiredSeatOverageInvoices\|reissueExpiredSeatOverageInvoice\|runDueSeatOverageInvoiceReissues" apps/webapp/src`
  — пусто (кроме `reissueWithSuccessor`, который это другая функция — см. выше).
- `pnpm run typecheck` — чисто.
- `seatInvoiceDebt.test.ts` (9/9 тестов, Р-18) — зелёный после мержа, подтверждает, что долговой
  путь не задет.

## 5. Точка отсчёта — Москва, явно (Р-16)

**Требует по букве брифа:** сделать «конец суток» явно московским, не заводя таймзону организации.

**Что фактически найдено и сделано:** ветка `wt/seat-invoice-20260819` (коммит с обоснованием —
`SEAT_INVOICE_WORLD_PRACTICE_2026-08-19.md`, владелец: «окей, я принимаю, всё») ещё ДО этого мержа
убрала из расчёта места понятие «суток»/«полуночи» целиком: `decideSeatOverage` считает пропорцию
целыми днями НАЗАД от конца периода (стайл Stripe, абсолютные ISO-моменты, `DAY_MS`-арифметика без
округления к границе суток в каком-либо часовом поясе). Сам реестр решений (§5а-0, статус Р-16)
уже отмечает: «к счёту за место больше НЕ ОТНОСИТСЯ». `getAppDisplayTimeZone`
(московская отображаемая зона) при этом жив и используется — но на пациентских экранах, не в
денежном расчёте места.

**Решение по этому пункту в рамках мержа:** московскую константу в расчёт места НЕ добавлял —
добавление отсутствующего понятия «сутки» туда, где владелец сам же его убрал 19.08 днём позже
(и это явно записано в реестре), было бы расширением скоупа и внесением заново отменённого. Это
**вопрос владельцу, не выполненное требование**: буква брифа просит «сделай Москву явной», а более
свежее решение того же 19.08 говорит «часовых поясов в этом расчёте больше нет вовсе». Оставляю
как есть и прошу подтвердить, что Р-16 в применении к счёту за место закрыт статусом «не
относится», а не с довеском.

**Доказательство отсутствия таймзоны в пути:** `git grep -n "TimeZone\|Moscow\|Europe/Moscow" apps/webapp/src/modules/saas-billing/seatOverage.ts apps/webapp/src/infra/repos/transactionQuotaPort.ts`
— пусто.

---

## Что НЕ взято из ветки и почему

| Что | Почему не взято |
|---|---|
| Отдельный срок счёта «от выставления» (`invoiceExpiresAt`/`invoiceValidityDays`) | Р-19 (20.08) отменил целиком — «перевыставление — бред, убирать» |
| `listExpiredSeatOverageInvoices`/`reissueExpiredSeatOverageInvoice`/`runDueSeatOverageInvoiceReissues` | То же — механизм перевыставления просроченного счёта, отменён Р-19 |
| `seatOverageInvoiceLifetime.unit.test.ts` | Тестировал отменённый Р-19 срок-от-выставления |
| «Отмена счёта закрывает место» в `pgSaasBilling.ts`/`inMemorySaasBilling.ts`'s `cancelSaasBillingInvoice` | Отменено Р-17 — счёт за место в принципе не отменяем (`seat_invoice_not_cancellable`), решение живёт только в `invoiceOperations.ts`'s `saasBillingInvoiceCancelVerdict` |
| `seatOverageCancelledInvoice.unit.test.ts` | Тестировал ровно отменённое Р-17 поведение — удалён целиком |
| `seatOverageUnpaidErosion.unit.test.ts` | Проверял эрозию цены при перевыставлении — сценарий, которого после Р-19 больше не существует (перевыставления нет) |
| Явная московская константа в расчёте места (буква брифа, п.5) | Найдено уже отменённым более поздним решением того же 19.08 (см. п.5 выше) — вынесено вопросом, не сделано в обход |
| `seatOpenedAt` как отдельно сохраняемый момент | Был нужен только перевыставлению как якорь возврата к «настоящему» открытию — Р-19 убрал перевыставление, вместе с ним и нужду в этом поле |

## Non-collapsible конфликт: `moveSeatOverageAllowance` vs `readSeatDebtForPeriod`/`carrySeatDebtInto`

Первый конфликт в `pgSaasBilling.ts` был add/add РАЗНЫХ функций, не текстовым дублированием одной
и той же идеи — оставлены ОБЕ: `readSeatDebtForPeriod`/`carrySeatDebtInto` (Р-18, долг) из
`feat/doctor-ui-rebuild`, и `moveSeatOverageAllowance` (счётчик `paidAdditionalSeats`, идемпотентный
`greatest(…, 0)`) из ветки. Докстринг `moveSeatOverageAllowance` переписан под текущую модель:
пишущих сейчас двое — выставление счёта (+1) и успешный возврат (-qty); отмена не пишет сюда вовсе,
потому что отмены счёта за место не существует как действия (Р-17).

## Верификация (по брифу — ограниченная область)

- `npx vitest run src/modules/saas-billing/ src/app-layer/booking/publicBookingSeatIndependence.unit.test.ts src/app/api/clinic/billing/ src/app/api/clinic/invites/` → **12 test files passed, 162 tests passed**.
- `npx vitest run src/app/app/settings/TeamSection.ui.test.tsx` → **1 test file passed, 8 tests passed**.
- `pnpm run typecheck` (tsc --noEmit) → чисто, 0 ошибок.
- `node scripts/check-seat-overage-single-door.mjs` → `OK`; `--self-test` → 5/5 форм обхода отклонены, канонический пример принят; живая инъекция и откат подтверждены (см. п.2).
- `pnpm run ci` **НЕ запускался** — по прямому запрету брифа (владелец 20.08, консолидация веток идёт).

## Собранные по ходу «немых» конфликты (не показаны маркерами git, но меняли поведение)

Три случая, где 3-way merge не поставил `<<<<<<<`, потому что правки лежали в текстово непересекающихся
диапазонах, но были семантически несовместимы — найдены и исправлены только сверкой поведения, не
диффа:
1. `pgSaasBilling.ts`'s `cancelSaasBillingInvoice` — докстринг с одной стороны, тело функции с
   другой, разъехались; взято тело feat (Р-17), докстринг сверен под него.
2. `transactionQuotaPort.ts`'s чистая (бесконфликтная) перезапись ветки тихо убрала экспорт
   `decideClinicTeamQuota`, который использовал НЕ участвовавший в конфликте тест
   `publicBookingSeatIndependence.unit.test.ts` — мигрирован на `decideSeatOverage`.
3. Ветка тихо переименовала исход `purchaseSeatOverage`'s `'checkout'` → `'seat_opened'` —
   сломало сравнение в `seatInvoiceDebt.test.ts` (Р-18-тест, не участвовавший в конфликте) —
   исправлено сравнение на новое имя исхода.

Плюс: два ассерта `paidAdditionalSeats).toBe(1)` в `seatInvoiceDebt.test.ts` фиксировали СТАРУЮ
модель «место открывается по оплате» (докстринг теста так и говорил: «Место, за которое заплатили,
открыто; неоплаченное — нет»). Под действующей моделью (п.3 выше) оба места (оплаченное и
неоплаченное) открываются сразу — исправлено на `toBe(2)` в обоих местах, с объяснением в
комментарии теста; остальные ассерты этих двух тестов (сумма долга, `carriedDebtMinor`, статус
`void`/`supersededByInvoiceId`) не зависели от этого и не менялись.
