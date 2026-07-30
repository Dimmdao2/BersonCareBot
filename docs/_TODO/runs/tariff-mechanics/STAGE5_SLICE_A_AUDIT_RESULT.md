VERDICT: FAIL

Коммит закрывает часть webapp-путей, но все три механики остаются обходимыми через достижимые write paths. Кроме того, несколько UI проглатывают правильный backend-отказ.

### 5.1 — внешний календарь

| Write/read path | Guarded? | Evidence |
|---|---:|---|
| `POST /api/admin/google-calendar/start` | Да | `external_calendar` до создания OAuth state |
| `GET /api/admin/google-calendar/callback` — сохраняет token/email | Да | Повторная проверка entitlement перед записью |
| `PATCH /api/admin/settings` — calendar id/enabled/token/email, включая отключение | Да | Ключи фильтруются в [route.ts](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:458) |
| `GET /api/admin/google-calendar/calendars`, чтение settings/status | Не gated — верно | Читающие пути не изменены |
| Refusal в UI | Да | `apiJson` переносит `message`; callback показывает `tariff_disabled` |

Обнаруженная write surface календаря закрыта полностью. Protected-action rows `connect.start`, `connect.callback` и shared settings PATCH указывают на действительно guarded handlers.

### 5.2 — дневники пациента

| Write path | Guarded? | Evidence |
|---|---:|---|
| `POST /api/patient/mood` | Да | `patient_diaries` перед `submitScore` |
| `PATCH .../practice/completion/[id]/feeling` | Да | Перед атомарной записью warmup-feeling |
| Server actions symptom entry: add/update/delete | Да | Общий `patientDiariesRefusal` |
| Server actions LFK session: mark/update/delete | Да | Общий `patientDiariesRefusal` |
| `POST /api/doctor/clients/[userId]/symptom-trackings` | **Нет** | Создаёт tracking без entitlement в [route.ts](/home/dev/dev-projects/bcb-wt-[redacted-token]/[userId]/symptom-trackings/route.ts:21) |
| `renameSymptomTracking`, `archiveSymptomTracking` server actions | **Нет** | Реальные mutations в [actions.ts](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:143) |
| Bot/integrator: symptom tracking/entry и LFK complex/session create | **Нет** | Четыре direct-public mutations в [writePort.ts](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:1150), включая прямые INSERT в [writeDiaryLfkDirect.ts](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:245) |
| Signed legacy integrator events для тех же четырёх типов | **Нет** | Активный generic ingress принимает event type, handlers пишут в [events.ts](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:256); штатный producer помечен retired, но signed endpoint остаётся callable |
| Diary pages, journals, stats and data export | Не gated — верно | `patient_diaries` встречается только в mutation handlers/registry/tests |

### 5.9 — механики владельца

| Mechanic/path | Guarded? | Evidence |
|---|---:|---|
| Today: patient-home block/item actions | Да | Все проходят через combined `cms_pages + patient_home_today` helper |
| Today: four doctor settings actions | Да | Practice target/mood icons; rotation/cooldowns дополнительно проверяют `warmups` |
| Today: direct URL | Да | `notFound()` при выключенном entitlement в [page.tsx](/home/dev/dev-projects/bcb-wt-[redacted-token]-home/page.tsx:33) |
| Today: navigation | **Нет** | Безусловная ссылка «Главная пациента» остаётся в [ContentNav.tsx](/home/dev/dev-projects/bcb-wt-[redacted-token].tsx:202) |
| Today/warmups: direct `PATCH /api/admin/settings` | **Нет** | Patient-home keys валидируются и записываются, но entitlement-проверка существует только для payments/calendar; запись выполняется в [route.ts](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:781) |
| Warmups: doctor client schedule PATCH | Да | `warmups` guard |
| Warmups: rotation/cooldown actions | Да | Combined Today + warmups guards |
| Warmups: create/edit CMS sections and pages inside `systemParentCode=warmups` | **Нет** | `saveContentPage`, `saveContentSection`, `attachArticleSectionToSystemFolder` проверяют только `cms_pages`, например [actions.ts](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:102) |
| Promo: doctor PATCH and refresh POST | Да | Оба handlers guarded |
| Promo: direct settings PATCH | **Нет** | `patient_default_promo_treatment_program_template_id` проходит без `promo` entitlement |
| Promo: automatic materialization from treatment/reminders/go pages | **Нет** | `tryEnsureDefaultPromoInstanceId` создаёт promo instance в [patientTreatmentProgramEntry.ts](/home/dev/dev-projects/bcb-wt-[redacted-token]-program/patientTreatmentProgramEntry.ts:27); также reminders create и promo action |
| Promo: patient action comment/complete | **Нет** | Ensures and mutates promo instance in [action/route.ts](/home/dev/dev-projects/bcb-wt-[redacted-token]-program-promo/action/route.ts:65) |
| Pure reads: schedule GET, promo GET, existing patient content | Не gated — верно | Read exemptions are preserved |

Patient-side behaviour for `patient_home_today` was not invented: the patient Today runtime was untouched. Only the administrator configuration page was gated, as required.

## MUST FIX

1. **`patient_diaries` is bypassable.** A patient can still create symptom/LFK diary data through the bot/integrator; a doctor can create tracking, and patient server actions can rename/archive tracking. Impact: a clinic with the mechanic off continues using and changing diaries.

2. **`patient_home_today` does not satisfy “absent”.** The direct page correctly refuses, but the navigation link remains visible. Additionally, a clinic owner can mutate Today settings directly through `PATCH /api/admin/settings`.

3. **`warmups` is bypassable.** CMS actions can create/edit/move content into the warmups cluster, and the shared settings API changes rotation/cooldown keys without checking `warmups`. Impact: CMS-enabled clinics can operate warmups while that mechanic is off.

4. **`promo` is bypassable.** The shared settings endpoint can select a promo template, while patient treatment/reminder/go flows can materialize new promo instances and the patient action can mutate them without entitlement. An existing configured template therefore continues creating promo instances after the toggle is turned off.

5. **Visible refusals are swallowed.** Backend messages are correct, but the actual UI replaces them with generic errors:

   - mood: [PatientHomeMoodCheckin.tsx](/home/dev/dev-projects/bcb-wt-[redacted-token].tsx:94);
   - warmup feeling: [PatientContentPracticeComplete.tsx](/home/dev/dev-projects/bcb-wt-[redacted-token]/[slug]/PatientContentPracticeComplete.tsx:119);
   - warmup schedule: [DoctorClientWarmupSchedulePanel.tsx](/home/dev/dev-projects/bcb-wt-[redacted-token].tsx:118);
   - promo save/refresh: [DefaultPromoProgramClient.tsx](/home/dev/dev-projects/bcb-wt-[redacted-token]-program-promo/DefaultPromoProgramClient.tsx:33);
   - Today panels ignore returned `error`, for example [PatientHomePracticeTargetPanel.tsx](/home/dev/dev-projects/bcb-wt-[redacted-token]-home/PatientHomePracticeTargetPanel.tsx:25).

## Protected-action registry

Положительные rows, добавленные для calendar, mood, feeling, symptom/LFK entries, schedule, promo и Today actions, указывают на действительно guarded handlers.

Но registry неполон, а две добавленные exemptions неверны: `renameSymptomTracking` и `archiveSymptomTracking` названы «metadata/lifecycle», хотя оба изменяют дневник. Это делает coverage формально зелёным при открытой mutation surface: [protectedActionRegistry.ts](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/app-[redacted-token].ts:1105).

## Tests would notice?

| Mechanic | Removal/reopening | Test catches? |
|---|---|---:|
| External calendar | Remove start-route guard | Да |
| External calendar | Remove callback or settings PATCH guard | **Нет** |
| Diaries | Remove mood guard | Да |
| Diaries | Remove feeling, symptom/LFK action or integrator guard | **Нет** |
| Today | Remove practice-target action guard | Да |
| Today | Restore nav link/direct page or remove owner-helper guard | **Нет** |
| Warmups | Remove schedule PATCH guard | Да |
| Warmups | Remove settings/content guards | **Нет** |
| Promo | Remove doctor PATCH guard | Да |
| Promo | Remove refresh, settings, materialization or patient-action guard | **Нет** |
| Refusal UI | Replace tariff message with generic error | **Нет** |

Нет source-text assertions и не создано нового single-`it` файла: расширен существующий test file. Новые tests вызывают реальные handlers, но все entitlement resolvers и refusal helpers замоканы; реальный default-off/org-override resolution и UI delivery не проверяются.

## Что верно

- Calendar connect/callback/change/disconnect закрыты, а calendar reads сохранены.
- Основные webapp diary-entry actions действительно guarded.
- Pure reads и exports не получили entitlement gate.
- Direct URL Today отказывает; patient-side Today не изменён.
- Тексты backend-отказов называют действие и способ снять запрет, без выдуманных чисел.
- Targeted Vitest: **1 file, 9/9 passed**.
- `pnpm --filter webapp typecheck`: **passed**.
- Coverage checker воспроизводимо падает только на ранее существующем `org-branding/service.ts` finding.

## Scope

`git diff --stat`: **23 files, 572 insertions, 61 deletions**.

Scope finding: [check-s4-entitlement-coverage.ts](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/scripts/check-s4-entitlement-coverage.ts:73) изменён вне разрешённых путей §1.

Mechanic/system-settings registry, migration `0275`, seat chokepoint, file write port, billing implementation и support system не изменены.

## Непроверенные claims

- Manual mutation claim для calendar guard removal — не проверялся: read-only режим запрещает временно удалять guard.
- Manual mutation claim для mood guard removal — не проверялся по той же причине.
- Manual mutation claim для promo guard removal — не проверялся по той же причине.
- Worker lint claim — lint повторно не запускался.
- DEV runtime probe и full CI не запускались согласно scope.