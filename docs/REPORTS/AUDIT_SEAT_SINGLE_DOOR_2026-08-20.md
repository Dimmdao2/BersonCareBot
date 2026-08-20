# Независимый адверсарный аудит — «одна дверь продажи места», сведение `wt/seat-invoice-20260819` → `wt/seat-door-20260820`, 20.08

**Роль:** независимый адверсарный гейт. Код и сведение делал другой агент (Sonnet 5); его отчёт
`docs/REPORTS/SEAT_SINGLE_DOOR_2026-08-20.md` прочитан как заявка подсудимого, не как доказательство.
**Задача:** доказать, что работа сломана, неполна или тащит отменённое.

**Проверенные sha (в этом клоне):**
- HEAD ветки `wt/seat-door-20260820` — `ec1d94f3c284e62ec1f94b8dadd7775e75ad5660`
- мерж-коммит сведения `wt/seat-invoice-20260819` → `wt/seat-door` — `1f8851ff944cd4563591f907650d52d3c5b0a715`
- слитый tip `wt/seat-invoice-20260819` — `c1150234866a4d13cec02cb395da325bb88ebc9f`
- правка лида (перегенерация артефакта прав, п.9) — `5c5d202d140123893697d8f8eefb3c8d9c14a730`

**Источник требований:** `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md` §5а-0, решения владельца
Р-15…Р-19. Требование, которого нет в решениях владельца, — вопрос, а не работа.

**Ограничения соблюдены:** ничего не чинил (только доказывал), скоуп не расширял, ПРОД (135.106.162.170)
не трогал, полный `pnpm run ci` не запускал. Все инъекции сняты, дерево оставлено чистым (`git status` пуст).

## Таблица проверок

| # | Утверждение | Команда / метод | Вывод | Вердикт |
|---|---|---|---|---|
| 1 | Дверь ДЕЙСТВИТЕЛЬНО одна — мимо `decideSeatOverage` место не продать | `git grep decideSeatOverage`, чтение обеих живых цепочек (покупка `service.purchaseSeatOverage`→`createSeatOverageInvoiceIfNeeded`; приглашение `pgOrganizationInvites.ts:148`→`resolveClinicTeamAvailability`), проверка входа порт-обёртки, проверка `createManualSaasBillingInvoice` | `decideSeatOverage` — единственная функция решения; зовут её порт-обёртка `resolveClinicTeamAvailability` (`transactionQuotaPort.ts:248`) и in-memory-двойник (`inMemorySaasBilling.ts:972`, тот же самый файл-решение). Вход порт-обёртки — только `{excludedPendingEmail?}`, ни цены, ни окна, ни срока не подсунуть. `proratedSeatPriceMinor` не экспортируется. Обе двери берут `offer.priceMinor`. Админский ручной счёт хардкодит `invoiceKind: 'tariff_period'` (`service.ts:501`) — место им не выписать | **PASS** |
| 2 | Структурный гейт ловит вторую дверь | `node scripts/check-seat-overage-single-door.mjs` (OK, exit 0) + `--self-test` (5/5 форм отклонены) + живая инъекция второй двери `__auditSeatDoorProbe.ts` с полем `amountMinor` из локальной арифметики | Гейт зелёный на чистом дереве; на инъекции с ПЛОСКИМ литералом `invoiceKind: 'seat_overage'` краснеет (exit 1, 2 находки: «builds amountMinor outside the single door», «writes … from a decision the door did not make»). Инъекция снята, `git status` чист | **PASS** (с не-блокирующим наблюдением, см. ниже) |
| 3 | Р-19 «перевыставление — бред, убирать» исполнено полностью | `git grep` по `reissueSeatOverageInvoice/listExpiredSeatOverageInvoices/reissueExpiredSeatOverageInvoice/runDueSeatOverageInvoiceReissues/seatOpenedAt`; чтение `seatOverage.ts`, обоих репо | Функций перевыставления/списка просроченных в дереве НЕТ вовсе. `seatOpenedAt` удалён. Срок счёта за место `expiresAt = offer.servicePeriodEndsAt` в обоих репо (`pgSaasBilling.ts:1745`, `inMemorySaasBilling.ts:1016`). План описывает перевыставление только как отменённое. Остатки `invoiceValidityDays/invoiceExpiresAt` в дереве — это ОБЩИЙ жизненный цикл счёта (тариф/ручной/продление), законный по Р-18, НЕ механизм места | **PASS** |
| 4 | Р-15 пропорция считается ОТ МОМЕНТА, не от начала суток | Чтение `seatOverage.ts:139-157`; fault-injection `servicePeriodStartsAtMs = Math.max(...)` → `= startsAtMs`, прогон `seatOverage.unit.test.ts` | `servicePeriodStartsAtMs = Math.max(startsAtMs, asOfMs)` — от момента; гранулярность суток привязана к КОНЦУ периода (стиль Stripe), не к полуночи и не к глобальному поясу. Граничные случаи: кончившийся период → `paid_period_over` (guard `endsAtMs <= asOfMs`); деления на ноль нет (`endsAtMs > startsAtMs` гарантирован). Инъекция «от начала периода» краснит 2 поведенческих теста, откат — зелёные | **PASS** |
| 5 | Р-16 московские сутки | `git grep TimeZone/Moscow/Europe/Moscow` по денежному пути; сверка со статусом Р-16 в §5а-0 | Пояса в расчёте места НЕТ (grep пуст). Ветка убрала понятие «суток» из расчёта целиком — все моменты абсолютные. Реестр §5а-0 сам отмечает Р-16 «к счёту за место больше НЕ ОТНОСИТСЯ». Отчёт корректно вынес букву брифа («сделай Москву явной») ВОПРОСОМ владельцу, а не переоткрыл отменённое понятие суток. Это верное применение правила «требования нет в плане → вопрос» | **PASS** (как вопрос, не работа) |
| 6 | Р-18 перенос долга `carried_debt_minor` не потерян при сведении | `git grep carried_debt_minor/carriedDebtMinor` в `pgSaasBilling.ts` | `readSeatDebtForPeriod`/`carrySeatDebtInto` живы (стр. 159/210), `carriedDebtMinor` протянут во всех путях продления (стр. 1105/1130/1174/1979/1996). Долговой тест `seatInvoiceDebt.test.ts` зелёный | **PASS** |
| 7 | Разведение конфликтов ничего не потеряло — обе функции add/add-конфликта живы | `grep moveSeatOverageAllowance/readSeatDebtForPeriod/carrySeatDebtInto` в `pgSaasBilling.ts` | Все три определены и вызваны: `moveSeatOverageAllowance` (243; `+1` при выставлении стр. 1757, `-qty` при возврате стр. 2236), `readSeatDebtForPeriod` (159), `carrySeatDebtInto` (210). Ни одна ветвь конфликта не потеряна | **PASS** |
| 8 | Тесты бьют в поведение, а не в форму | Fault-injection в `seatOverage.ts` (см. п.4); прогон целевых сьютов | Слом реализации → красные тесты (2 в `seatOverage.unit.test.ts`). `npx vitest run src/modules/saas-billing/` → 9 файлов / 126 тестов зелёные; `+ invites/ billing/ publicBookingSeatIndependence` → ещё 3 файла / 36 тестов; `pnpm run typecheck` → exit 0 | **PASS** |
| 9а | `generate-cli.mjs --check` | `node deploy/postgres/privileges/generate-cli.mjs --check` | `EXIT=0`, дословно: «`--check`: артефакты соответствуют декларации побайтно.» (4× `ok … совпадает побайтно`) | **PASS** |
| 9б | В дельте `5c5d202d1` нет CREATE ROLE / BYPASSRLS / табличных грантов рантайм-ролям | `git show 5c5d202d1 \| grep '^+' \| grep -iE 'CREATE ROLE\|BYPASSRLS\|ALTER ROLE\|SUPERUSER'` и `grep GRANT … runtime-роли` | Ни одной такой строки. Дельта — DEFINER-функция шва `app.set_platform_organization_is_active(uuid,boolean)`, `OWNER TO app_seam_org_directory_owner`, `REVOKE ALL … FROM PUBLIC`, гейт `require_accepted_context`, декларация поверхности SELECT/UPDATE на `be_organizations[id,is_active,updated_at]`, счётчики definer-гейтов 372→373 и поверхностей 404→405, строка port-context. Регистрация непроверенной правки лида, не новый скоуп | **PASS** |

## Вердикт: **PASS. Блокеров нет.**

Заявка отчёта подтверждена независимой проверкой по всем девяти пунктам. Работа не сломана, не тащит
отменённого (Р-19/Р-17 вычищены целиком из кода и тестов), гейт и поведенческие тексты реально краснеют на
инъекциях в проверяемое, права-артефакт лида — механическая перегенерация без расширения модели прав.

### Не-блокирующие наблюдения → вопросы владельцу (не чинил, скоуп не заводил)

1. **Гейт единственности двери слеп к `as const` / `satisfies` / шаблонному литералу.** `isSeatOverageInvoiceLiteral`
   требует `ts.isStringLiteral(property.initializer)`, поэтому вторая дверь, написанная как
   `invoiceKind: 'seat_overage' as const` (или через `satisfies`, или `` `seat_overage` ``), гейтом НЕ ловится
   — я это воспроизвел живьём (первая инъекция с `as const` дала зелёный гейт). Это НЕ дефект сегодняшнего
   кода (обе настоящие двери пишут плоский литерал, который гейт ловит; модель угроз гейта — СЛУЧАЙНОЕ
   расхождение будущего PR, а не намеренный обход), и не требование из плана владельца. Вынесено как вопрос:
   стоит ли доусилить `isSeatOverageInvoiceLiteral`, чтобы он снимал `as`/`satisfies`-обёртку и покрывал
   шаблонный литерал. Правило Р-15 «одна дверь» этим наблюдением НЕ нарушено.

2. **Формулировка отчёта «единственная порт-обёртка, вызывающая `decideSeatOverage`» неточна** (косметика, не
   дефект): `decideSeatOverage` зовут ДВА места — порт-обёртка `resolveClinicTeamAvailability` и in-memory-репо
   напрямую. Архитектурно это по-прежнему одна дверь-решение (тот же файл-функция), поведение эквивалентно;
   расхождение только в тексте отчёта.

3. **Р-16 (буква брифа «сделай Москву явной») остаётся открытым вопросом владельцу** — как и написано в отчёте
   подсудимого. Проверка подтвердила: добавлять московскую константу было бы внесением отменённого 19.08
   понятия суток. Требуется подтверждение владельца, что Р-16 в применении к счёту за место закрыт статусом
   «не относится».

Все проверки выполнены только на этом клоне против `bcb_webapp_dev`/дерева; TEST/ПРОД не трогались,
`pnpm run ci` не запускался (запрет брифа — консолидация веток идёт).
