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
