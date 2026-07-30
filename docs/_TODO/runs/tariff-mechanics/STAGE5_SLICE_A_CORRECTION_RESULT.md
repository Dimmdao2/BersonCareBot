# Stage 5 Slice A — correction result

Дата: 2026-07-30. Карточка: `#1069`. Исправляемый verdict:
`STAGE5_SLICE_A_AUDIT_RESULT.md`, MUST FIX 1–5 и раздел protected-action registry.

Статус: реализация и целевые проверки завершены; чекбоксы 5.2 и 5.9 канонического плана остаются открытыми до
следующего аудита/приёмки. Читающие пути не получили mutation guard: существующие записи дневников и экземпляры
промо остаются видимыми и выгружаемыми.

## Закрытые пункты и mutation proof

1. Дневники. Doctor POST закрыт в
   `apps/webapp/src/app/api/doctor/clients/[userId]/symptom-trackings/route.ts`; rename/archive — в
   `apps/webapp/src/app/app/patient/diary/symptoms/actions.ts`; signed ingress — в
   `apps/webapp/src/modules/integrator/events.ts`; четыре прямых bot/integrator INSERT — в
   `apps/integrator/src/infra/db/directPublic/writeDiaryLfkDirect.ts`. Webapp возвращает существующий
   entitlement-текст; bot отправляет тот же текст пациенту в чат либо редактирует callback-сообщение.
   Тесты: `tariffMechanics.route.test.ts`, `events.diaryEntitlement.test.ts`,
   `writeDiaryLfkDirect.test.ts`. Mutation proof: удаление direct guard у symptom-tracking INSERT дало
   `promise resolved ... instead of rejecting`; после восстановления тест зелёный.

2. «Сегодня». Ссылка фильтруется в `apps/webapp/src/app/app/doctor/content/ContentNav.tsx`, direct-page guard
   сохранён; семь ключей shared settings проверяются адресно в
   `apps/webapp/src/app/api/admin/settings/route.ts`. Пользователь не видит пункт навигации, прямой URL не
   открывает страницу, API возвращает существующий отказ. Тесты: `tariffMechanicsRefusals.ui.test.tsx`,
   `tariffMechanics.route.test.ts`. Mutation proof: принудительно показанная ссылка сделала UI-тест красным —
   в документе появился link `Главная пациента`; после восстановления тест зелёный.

3. Разминки. Shared settings и все CMS-mutations, которые создают, изменяют, перемещают или меняют lifecycle,
   auth, visibility/order контента в кластере `warmups`, получили условный warmups guard. Пользователь получает
   существующий refusal message. Тест: `tariffMechanics.route.test.ts`. Mutation proof: удаление guard из
   `saveContentSection` дало `{ ok: true }` вместо ожидаемого отказа; после восстановления тест зелёный.

4. Промо. Адресно закрыт shared settings key, patient action и reminder materialization. Treatment/reminder/go
   entry flow проверяет механику перед созданием нового instance; уже существующий active instance возвращается
   до проверки и остаётся читаемым. Пользователь видит существующий отказ там, где выполняет mutation; фоновая
   materialization не создаёт instance. Тесты: `tariffMechanics.route.test.ts`,
   `patientTreatmentProgramEntry.test.ts`. Mutation proof: удаление `canMaterializePromo` check снова создало
   instance и вернуло redirect вместо `null`; после восстановления оба сценария (off и existing read) зелёные.

5. Видимые отказы. Backend `message` теперь показывается в mood, warmup feeling, warmup schedule, promo
   save/refresh; четыре Today panels показывают возвращённый action `error`.
   Тест: `tariffMechanicsRefusals.ui.test.tsx` (шесть UI-сценариев, Today panels проверяются параметризованно).
   Mutation proof: замена mood `data.message` на generic-текст сделала тест красным: получен generic вместо
   backend refusal; после восстановления тест зелёный.

6. Protected-action registry. Ложные exemptions rename/archive удалены, обе actions guarded и перечислены как
   protected; добавлены достижимые diary/promo write paths, shared settings и условные warmups CMS paths.
   Тест: реальный вызов `renameSymptomTracking` в `tariffMechanics.route.test.ts`. Mutation proof: удаление guard
   вернуло `{ ok: true }` вместо refusal; после восстановления тест зелёный. Список ключей mechanic registry не
   менялся.

## Write paths, перечисленные для трёх механик

### `patient_home_today`

- Patient-home content actions:
  `togglePatientHomeBlockVisibility`, `setPatientHomeBlockIcon`, `reorderPatientHomeBlocks`,
  `addPatientHomeItem`, `updatePatientHomeItemVisibility`, `updatePatientHomeItemPresentation`,
  `deletePatientHomeItem`, `reorderPatientHomeItems`, `retargetPatientHomeItem`,
  `createContentSectionForPatientHomeBlock`.
- Doctor settings actions:
  `savePatientHomePracticeTargetAction`, `savePatientHomeRepeatCooldownsAction`,
  `savePatientHomeWarmupRotationAction`, `savePatientHomeMoodIconsAction`.
- Shared `PATCH /api/admin/settings`: `patient_home_daily_practice_target`,
  `patient_home_daily_warmup_rotation_enabled`, `patient_home_daily_warmup_rotation_times`,
  `patient_home_daily_warmup_repeat_cooldown_minutes`,
  `patient_treatment_plan_item_done_repeat_cooldown_minutes`,
  `patient_home_warmup_skip_to_next_available_enabled`, `patient_home_mood_icons`.
- UI entry/direct access are not writes, but form the required boundary: conditional `ContentNav` entry plus the
  retained direct-page refusal.

### `warmups`

- Doctor client schedule: `PATCH /api/doctor/clients/[userId]/warmup-schedule`.
- Doctor settings actions: `savePatientHomeRepeatCooldownsAction`,
  `savePatientHomeWarmupRotationAction`.
- Shared `PATCH /api/admin/settings`: `patient_home_daily_warmup_rotation_enabled`,
  `patient_home_daily_warmup_rotation_times`, `patient_home_daily_warmup_repeat_cooldown_minutes`,
  `patient_home_warmup_skip_to_next_available_enabled`.
- Conditional CMS writes when current or target section belongs to `systemParentCode=warmups`:
  `saveContentPage`, `saveContentSection`, `attachArticleSectionToSystemFolder`,
  `applyContentLifecycle`, `setContentPageRequiresAuth`, `reorderContentPagesInSection`,
  `renameContentSectionSlug`, `deleteContentSection`, `setSectionRequiresAuth`,
  `setSectionVisibility`, `reorderContentSections`.
- Patient warmup feeling PATCH is a diary write and remains protected by `patient_diaries`; it does not create or
  configure warmup content.

### `promo`

- Doctor mutations: `PATCH /api/doctor/treatment-program-promo`,
  `POST /api/doctor/treatment-program-promo/refresh`.
- Shared `PATCH /api/admin/settings`:
  `patient_default_promo_treatment_program_template_id`.
- Patient mutations/materialization:
  `POST /api/patient/treatment-program-promo/action`,
  `POST /api/patient/reminders/create`,
  `resolvePatientTreatmentProgramEntry` / `resolveActiveTreatmentProgramInstanceId` as called from patient
  treatment, reminders and reminder-go flows.
- Pure GET/read of an existing active promo instance remains ungated; no deletion or hiding was added.

## Targeted verification

- `pnpm --dir apps/integrator typecheck` — passed.
- `pnpm --dir apps/webapp typecheck` — passed.
- `pnpm --dir apps/integrator lint` — passed.
- `pnpm --dir apps/webapp lint` — passed (`check-drizzle-journal-sync: OK`).
- `pnpm --dir apps/integrator exec vitest --run src/infra/db/directPublic/writeDiaryLfkDirect.test.ts` —
  1 file, 2 tests passed.
- `pnpm --dir apps/webapp exec vitest --run src/modules/treatment-program/patientTreatmentProgramEntry.test.ts
src/modules/integrator/events.diaryEntitlement.test.ts` — 2 files, 3 tests passed.
- `pnpm --dir apps/webapp exec vitest --run src/app/api/tariffMechanics.route.test.ts` —
  1 file, 15 tests passed.
- `pnpm --dir apps/webapp exec vitest --run src/app/api/tariffMechanicsRefusals.ui.test.tsx` —
  1 file, 6 tests passed.

Полный CI не запускался по ограничению mission. Coverage checker не используется как доказательство guard call.
