# Ч5 — DI cleanup report

## Что переведено на DI и как

- `app/app/doctor/schedule/page.tsx`: `pgDoctorCalendarTimezonePort` добавлен в
  `buildAppDeps()` как `doctorCalendarTimezone`; страница передаёт этот порт в
  `getDoctorEffectiveCalendarIana`. Уже существующий вызов `doctorWorkspace.listDirectory`
  использует тот же экземпляр `deps`.
- `app/app/doctor/content/library/delete-errors/page.tsx`: `listMediaDeleteErrors` добавлен
  в `buildAppDeps()` как `mediaDeleteErrors.list`; вызов остаётся внутри того же
  `withDoctorWorkspacePrincipal` и получает тот же аргумент `100`.
- `app/app/doctor/exercises/actionsShared.ts`: `pgListExerciseUsageForMediaIds` добавлен
  в `buildAppDeps()` как `lfkExerciseMediaUsage.listForMediaIds`; вызывается в той же
  PostgreSQL-ветке с тем же `mediaIds`. In-memory ветка не менялась.

Поведение не менялось: для всех трёх мест сохранены вызываемая функция, аргументы,
контекст principal и результат.

## Репойнт пути (B)

- `app/app/patient/reminders/RemindersPageBody.tsx` и
  `app/app/patient/sections/[slug]/page.tsx` теперь импортируют
  `resolvePatientContentSectionSlug` напрямую из
  `@/modules/content-sections/resolvePatientContentSectionSlug`.
- `infra/repos/resolvePatientContentSectionSlug.ts` был только re-export shim; после
  репойнта потребителей не осталось, поэтому файл удалён.

## Почему C оставлено

- `runWithWebappDbOperationFamily` в patient diary и PatientHomeToday не является
  репозиторием: это `AsyncLocalStorage`-обёртка, которая передаёт метку семейства
  операции и callback (`saasIsolationOperationContext.ts`). Она не открывает и не
  вызывает хранилище, поэтому остаётся санкционированной общей дверью SaaS-изоляции.
- `modules/system-settings/configAdapter.ts` содержит прямые адаптеры настроек, но
  явно оставлен для Ч7 в другой ветке. В Ч5 не менялся.

## Проверки

- `pnpm lint` — PASS.
- `cd apps/webapp && npx tsc --noEmit` — PASS.
- `cd apps/webapp && pnpm vitest run --project=route` — PASS: 29 файлов, 113 тестов.
- `cd apps/webapp && pnpm vitest related --run --project=fast --passWithNoTests <7 changed source paths>` — PASS: 6 файлов, 75 тестов.

## НЕ СДЕЛАНО

- Новые тесты не добавлялись: это рефакторинг, для которого план задаёт проверку
  компиляцией и существующими тестами.
- Полный CI не запускался по границам задачи.
- Не тронуты прочие direct imports вне перечисленных A/B и Ч7-allowlist.
