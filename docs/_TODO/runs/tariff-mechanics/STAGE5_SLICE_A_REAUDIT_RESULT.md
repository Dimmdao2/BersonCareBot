VERDICT: FAIL

Перечисленные воркером paths в основном закрыты, но enumeration неполна. `patient_diaries` и `warmups` остаются достижимо обходимыми; кроме того, часть интерфейсных входов не скрыта и несколько новых CMS-отказов проглатываются.

## Completeness diff

| Механика | Список воркера | Независимый список / diff |
|---|---|---|
| `external_calendar` | В formal enumeration отсутствует; в registry/тексте: OAuth start, callback, четыре shared-settings keys | Write surface совпадает: `POST start`, пишущий `GET callback`, settings keys token/id/enabled/email. Пропущен интерфейсный вход: секция календаря видна при выключенной механике. |
| `patient_diaries` | Doctor tracking POST, rename/archive, четыре signed-event ветки, четыре direct bot writes; registry также содержит mood, feeling, symptom/LFK actions | Пропущены: пишущие read-paths diary/mood; doctor PATCH локального комментария упражнения; patient diary purge. |
| `patient_home_today` | 10 patient-home actions, 4 doctor settings actions, 7 shared keys, nav/direct page | Совпадает. Самостоятельно пропущенных Today paths нет. |
| `warmups` | Schedule PATCH, 2 doctor settings actions, 4 shared keys, 11 conditional CMS actions | Пропущены операции над `daily_warmup` через patient-home actions: visibility блока, add/visibility/delete/reorder/retarget items. Также вход «Разминки» не скрыт, часть CMS-клиентов проглатывает отказ. |
| `promo` | Doctor PATCH/refresh, shared key, patient action, reminders create, treatment/reminder/go materialization | Write surface совпадает. Пропущено скрытие doctor-menu entry. |

`createContentSectionForPatientHomeBlock` не добавлял к warmups-пропускам: `daily_warmup` разрешает только `content_page`, не `content_section`. `setPatientHomeBlockIcon` также неприменим к этому блоку.

## MUST FIX

1. **Read-paths создают объекты дневника при `patient_diaries=false`.** Открытие дневника вызывает два `ensure*` UPSERT в [loadPatientDiaryWeekWellbeing.ts](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:115), а обычный render достигает их из [PatientDiaryAuthenticatedMain.tsx](/home/dev/dev-projects/bcb-wt-[redacted-token].tsx:45). Аналогично `GET /api/patient/mood/today`, `GET /api/patient/mood/week` и patient home вызывают пишущие `getCheckinState`/sparklines: [wellbeingMoodService.ts](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/patient-mood/wellbeingMoodService.ts:119), [PatientHomeToday.tsx](/home/dev/dev-projects/bcb-wt-[redacted-token].tsx:280). Сценарий: пациент без singleton tracking просто открывает страницу — при выключенной механике создаются `general_wellbeing` и/или `warmup_feeling`. Нарушены 5.2 и канон §5.1 «нельзя создавать».

2. **Doctor PATCH продолжает менять LFK-дневник.** [route.ts](/home/dev/dev-projects/bcb-wt-[redacted-token]/[userId]/lfk-complex-exercises/[exerciseRowId]/route.ts:11) без entitlement вызывает `[redacted-token]`; вызов достижим из [DoctorLfkComplexExerciseOverridesPanel.tsx](/home/dev/dev-projects/bcb-wt-[redacted-token].tsx:57). Это patient-specific строка `lfk_complex_exercises`, не шаблон ЛФК. Impact: врач меняет объект дневника при выключенном `patient_diaries`.

3. **Полный purge дневника остаётся пишущим обходом.** Авторизованный пациент после OTP вызывает [POST `/api/patient/diary/purge`](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:28), который без entitlement удаляет все дневниковые данные на строке 95. Impact: при выключенной возможности существующее состояние не read-only, его можно необратимо изменить. Это особенно явно расходится с тем, что обычные entry/session delete и archive в той же механике уже guarded.

4. **`warmups` обходится через Today actions.** Общий helper проверяет только `cms_pages + patient_home_today` в [actions.ts](/home/dev/dev-projects/bcb-wt-[redacted-token]-home/actions.ts:105), хотя `daily_warmup` является управляемым item-блоком и принимает страницы из warmups-кластера: [blocks.ts](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/patient-home/blocks.ts:18), [blocks.ts](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/patient-home/blocks.ts:152). При Today=on/Warmups=off остаются доступны:

   - `togglePatientHomeBlockVisibility('daily_warmup', …)`;
   - `addPatientHomeItem`;
   - `updatePatientHomeItemVisibility`;
   - `deletePatientHomeItem`;
   - `reorderPatientHomeItems('daily_warmup', …)`;
   - `retargetPatientHomeItem`.

   Impact: клиника продолжает включать и полностью переконфигурировать ежедневные разминки при выключенном `warmups`. Registry ложно относит эти actions только к `cms_pages + patient_home_today`: [protectedActionRegistry.ts](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/app-[redacted-token].ts:250).

5. **Не выполнено обязательное скрытие входа для трёх механик.** План требует его для каждого пункта Stage 5: [TARIFFS_PAYMENTS_ADMIN_PLAN.md §5a](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md §5a:210).

   - External calendar показывается только по platform availability, без `external_calendar`: [settings/page.tsx](/home/dev/dev-projects/bcb-wt-[redacted-token].tsx:238).
   - «Разминки» безусловно включены в CMS nav: [ContentNav.tsx](/home/dev/dev-projects/bcb-wt-[redacted-token].tsx:213).
   - «Промо-программа» безусловно включена в doctor menu: [doctorNavLinks.ts](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:103).

   Impact: пользователю показываются входы в функции, которых нет в его тарифе. Existing data можно оставить читаемыми по прямым read-paths; это не требует сохранять управляющий menu entry.

6. **Новые warmups CMS-отказы не всегда доходят до пользователя.** Например:

   - Content nav молча откатывает `setSectionVisibility`: [ContentNav.tsx](/home/dev/dev-projects/bcb-wt-[redacted-token].tsx:180);
   - sections list игнорирует `error` у reorder/visibility/requires-auth=[redacted]](/home/dev/dev-projects/bcb-wt-[redacted-token].tsx:288);
   - pages list игнорирует отказ reorder/requires-auth=[redacted]](/home/dev/dev-projects/bcb-wt-[redacted-token].tsx:248);
   - lifecycle wrapper выбрасывает результат `applyContentLifecycle`: [lifecycleActions.ts](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:74).

   Сценарий достижим, поскольку warmups CMS entry сейчас виден. Пользователь видит откат/отсутствие результата без причины — прямое нарушение канона §5.6.

## Что верно

- Все четыре direct bot writes имеют guard; bot возвращает видимый action-specific отказ.
- Все четыре signed legacy diary-event ветки проверяют `patient_diaries`.
- Doctor tracking POST и `renameSymptomTracking`/`archiveSymptomTracking` guarded.
- Today link действительно скрывается, direct page остаётся закрытой, семь shared keys guarded.
- Все 11 перечисленных CMS handlers имеют условный warmups guard; четыре shared keys и schedule PATCH закрыты.
- Promo template selection, patient action, reminder creation и treatment/reminder/go materialization закрыты. Existing active promo возвращается до проверки и остаётся читаемым.
- Пять отдельно названных UI-мест теперь показывают backend message: mood, warmup feeling, schedule, promo save/refresh и четыре Today panels. Формулировки называют действие, не содержат выдуманных чисел и не заменяются generic «что-то пошло не так».
- Ложные exemptions `renameSymptomTracking` и `archiveSymptomTracking` удалены. Оставшиеся затронутые exemptions для self-create truthful: обе patient actions реально завершаются без записи.
- Diary/promo/Today read и export guards не добавлены. Patient pages изменены только в явно требуемых mutation/refusal/materialization flows.
- План требований не потерял: добавлен correction paragraph, а шесть подпунктов 7.2 лишь сведены в одну строку; текст требований сохранён.

## Test sensitivity

Две крупные регрессии, которые текущие тесты пропустят:

1. Удалить guard из `addLfkSessionDirect` на [writeDiaryLfkDirect.ts](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:415). **Тест не поймает:** direct test вызывает только `createSymptomTrackingDirect`; bot-message test получает уже готовый mocked refusal.

2. Удалить warmups guard из `saveContentPage` либо `attachArticleSectionToSystemFolder`. **Тест не поймает:** route test проверяет только `saveContentSection`. Остальные десять CMS mutation handlers поведением не покрыты.

Ни один текущий тест также не покрывает MUST FIX 1–6 выше.

## Scope и команды

Canonical baseline для correction commit: `57b184254`, непосредственный parent `8ecb98f18`.

- `git diff --stat 57b184254 8ecb98f18` → **44 files, 1307 insertions, 117 deletions**.
- `git diff --check 57b184254 8ecb98f18` → exit 0, ошибок whitespace нет.
- `git diff --word-diff ... TARIFFS_PAYMENTS_ADMIN_PLAN §5a...` → потерянных требований нет.
- `code-search.mjs`, затем точечные `rg`/`nl` → прослежены entry points до diary, CMS, settings и materialization write ports.
- Registry keys, migration `0275`, seat chokepoint, patient-file write port, billing и support не изменены. Patient-card/app как тарифные механики не затронуты; изменённые patient UI-файлы относятся к явно предписанным отказам и promo gating.
- Тесты не запускал: по прямому указанию не повторял уже выполненный lead run **4 files / 27 tests passed**. Full CI не запускался.

## Чистота дерева

Подтвердить clean tree нельзя. `git status --short --branch` в начале и в конце одинаково показывает 10 предсуществующих modified env-файлов (`.env.example`, четыре app examples и пять `deploy/env` examples); все они смонтированы как character devices. Аудит файлов не менял и эти mounts не трогал, но формально worktree **не clean**.