# Список на ПЕРЕДЕЛКУ (не на удаление) — #1074

> Решение владельца 29.07: живые-БД тесты и мутант-убийцы НЕ удаляем, а переписываем в единый взрослый
> формат (builders + zod + fast-check + матрица на одноразовом Postgres). Правило порядка: **новая форма
> покрывает случай и краснеет на внесённой руками поломке → только потом старый файл снимаем.** Port-then-retire,
> никогда не наоборот (иначе окно без защиты). Знание из старых тестов переносим, файлы пересобираем.

## A. Живые-БД тесты — 31 файлов (перенести утверждения в матрицу принципал×орг×операция)

         1	apps/integrator/src/infra/db/directPublic/writeReminderRulesDirect.rls.integration.test.ts
         2	apps/webapp/src/app-layer/db/drizzle.smoke.test.ts
         3	apps/webapp/src/app-layer/stats/loadAdminReminderStats.test.ts
         4	apps/webapp/src/infra/adminAuditLog.devDb.integration.test.ts
         5	apps/webapp/src/infra/platformUserFullPurge.devDb.integration.test.ts
         6	apps/webapp/src/infra/platformUserMergePreview.devDb.integration.test.ts
         7	apps/webapp/src/infra/repos/orgBrandRevisionGuard.devDb.integration.test.ts
         8	apps/webapp/src/infra/repos/pgAuthRateLimitEvents.devDb.integration.test.ts
         9	apps/webapp/src/infra/repos/pgBookingScheduling.deactivateWorkingHours.devDb.integration.test.ts
        10	apps/webapp/src/infra/repos/pgBookingScheduling.readChokepoint.devDb.integration.test.ts
        11	apps/webapp/src/infra/repos/pgDoctorAnalyticsMetricAccounts.devDb.integration.test.ts
        12	apps/webapp/src/infra/repos/pgDoctorClients.appointmentJoin.devDb.integration.test.ts
        13	apps/webapp/src/infra/repos/pgDoctorClients.devDb.integration.test.ts
        14	apps/webapp/src/infra/repos/pgDoctorPhase13d.devDb.integration.test.ts
        15	apps/webapp/src/infra/repos/pgEmailChallengeAtomicAttempts.devDb.integration.test.ts
        16	apps/webapp/src/infra/repos/pgEmailOtpPublicAtomicConsume.devDb.integration.test.ts
        17	apps/webapp/src/infra/repos/pgOnlineIntake.devDb.integration.test.ts
        18	apps/webapp/src/infra/repos/pgOtpDecayingLockoutAtomicEscalation.devDb.integration.test.ts
        19	apps/webapp/src/infra/repos/pgPatientBookings.devDb.integration.test.ts
        20	apps/webapp/src/infra/repos/pgPatientHomeBlocks.test.ts
        21	apps/webapp/src/infra/repos/pgPhase14DCommsTail.devDb.integration.test.ts
        22	apps/webapp/src/infra/repos/pgPhoneChallengeAtomicAttempts.devDb.integration.test.ts
        23	apps/webapp/src/infra/repos/pgPlatformUserMerge.devDb.integration.test.ts
        24	apps/webapp/src/infra/repos/pgProgramItemDiscussion.doctorComments.devDb.integration.test.ts
        25	apps/webapp/src/infra/repos/pgProgramItemDiscussion.doctorComments.test.ts
        26	apps/webapp/src/infra/repos/pgReminderJournal.pg.test.ts
        27	apps/webapp/src/infra/repos/pgReminderProjection.pg.test.ts
        28	apps/webapp/src/infra/repos/pgSupportCommunication.devDb.integration.test.ts
        29	apps/webapp/src/infra/repos/pgUserProjection.devDb.integration.test.ts
        30	apps/webapp/src/infra/repos/pgWebPushOnlyReminders.pg.test.ts
        31	apps/webapp/src/infra/repos/timezoneContract.stage8.pg.test.ts

## B. Мутант-убийцы — добавляются по мере прогона (сейчас известны только по пилотам)

- Заполняется из таблиц вердиктов: тест с классом KEEP_PROVEN (убил неэквивалентного мутанта-решения).
- Если он уже поведенческий — оставить как есть; если убивает по-старому (через внутренности) — переписать.

## C. Связанное (входы от соседей)

- `apps/webapp/src/infra/repos/pgBroadcastEmailRecipients.test.ts` — текст-пин рядом с фиксом соседа
  (fcec056ec, потеря email-получателей). Переписать в живой-БД тест (стиль pgWebPushOnlyReminders.pg.test.ts):
  красный на старом `ANY(${userIds}::uuid[])`, зелёный на фиксе. См. заметку #1074.

## D. Места фиксов багов соседа — писать тесты ПО-НАШЕМУ (site, не пропись)

> Владелец 29.07: «бери не инструкцию, а место где он работал». Ниже — SITE (коммит + файл + какое
> ПОВЕДЕНИЕ защищать), а не его шаги. Как писать (поведенческий / property / живая-БД матрица) решаем сами
> по нашему методу; файлы кода фиксов НЕ трогаем — только тесты. Это НОВЫЕ тесты, очередь сборки (HOW-B).

1. **reminders — `pgReminderProjection.markSeen`** (фикс `14c4e8a69`).
   Site: `apps/webapp/src/infra/repos/pgReminderProjection.ts`. Защищать: `markSeen(user, [occ-a, occ-b])`
   реально помечает нужные строки и не падает. Инвариант-ловушка: старый `ANY(${occurrenceIds})` (record-cast,
   тот же класс, что баг рассылки) — тест обязан быть КРАСНЫМ на нём. → живая БД.
2. **alerting — `relayOutboundRoute`** (фикс `48d34aa79`).
   Site: маршрут outbound-доставки. Защищать поведение: сбой email → запись инцидента
   `outbound_delivery_provider/email` с классификацией ошибки; сбой SMS → `smsc/provider_send_failed`;
   policy-denial → инцидент НЕ пишется; web-push → поведение не изменилось. → поведенческий на границе
   (incident-recorder как внешний контракт, проверяем аргументы+решение, не факт вызова).
3. **TZ карточка — `ClientBookingHistoryPanel`** (фикс `163851aec`).
   Site: `apps/webapp/src/.../ClientBookingHistoryPanel*`. Защищать: при не-московской IANA-зоне timeline,
   оплата, начало и конец визита показываются в ЭТОЙ зоне, а не хардкодом Москва. → UI/рендер-тест.
4. **TZ календари** (фикс `474686b6a`).
   Site: admin/doctor calendar routes + booking service + reminder create/PATCH. Защищать: календарные роуты
   с не-московской app-зоной (включая корректный отказ резолвера зоны); booking service без `filters.timeZone`;
   reminder create/PATCH с пустой строкой зоны. → роут/интеграционный + поведенческий.

**Известное ограничение метода:** пункты 1 (и связанный C — рассылка) — живая БД; 2 — граница с внешним
контрактом; 3 — UI; 4 — роуты. Все сдаются арбитром: внести поломку руками → тест обязан покраснеть.
