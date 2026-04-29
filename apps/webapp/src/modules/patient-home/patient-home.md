# Patient home — редактор главной (CMS workflow)

Краткий ориентир для разработчиков по **PATIENT_HOME_CMS_WORKFLOW_INITIATIVE**. Нормативный контракт и фазы: `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/MASTER_PLAN.md`, `BLOCK_EDITOR_CONTRACT.md` (в каталоге инициативы).

## Где UI редактора

- **Doctor:** `apps/webapp/src/app/app/doctor/patient-home/page.tsx` — карточки CMS-блоков, кандидаты с сервера где подключено.
- **Settings (legacy/параллельный вход):** `apps/webapp/src/app/app/settings/patient-home/*` — те же блоки и диалог «Настроить» (`PatientHomeBlockEditorDialog.tsx`).

## Модуль `modules/patient-home`

| Файл | Назначение |
| --- | --- |
| `blocks.ts` | Коды CMS-блоков и системных зон, `PatientHomeCmsBlockCode`, `patientHomeCmsBlockAllowsContentSection`. |
| `blockEditorMetadata.ts` | Копирайт превью, пустых состояний, лейблов добавления. |
| `patientHomeUnresolvedRefs.ts` | Тексты причин неразрешённой цели в админ-превью. |
| `patientHomeCmsReturnUrls.ts` | Phase 5: сборка/разбор query `returnTo`, `patientHomeBlock`, suggested title/slug; allowlist путей. |
| `patientHomeEditorDemo.ts` | Демо-строки кандидатов/элементов до полной БД. |

## Потоки создания и возврата (Phase 5)

- Новая **страница контента:** ссылки из `PatientHomeBlockCandidatePicker` → `/app/doctor/content/new?...` → `ContentForm` с `patientHomeContext`, баннер после успешного сохранения.
- Новый **курс (черновик):** `/app/doctor/courses/new` + `DoctorCourseDraftCreateForm` (POST `/api/doctor/courses`).
- **Раздел:** ссылка с query на `/app/doctor/content/sections/new` — страница парсит `returnTo` / `patientHomeBlock` (`parsePatientHomeCmsReturnQuery`), после успешного сохранения нового раздела — баннер возврата в `SectionForm` (Phase 6 FIX, симметрия с `content/new`).
- **Inline раздел** для пустого `situations`: `PatientHomeCreateSectionInlineForm` + `createContentSectionForPatientHomeBlock` в `settings/patient-home/actions.ts`.

## Связанные тесты (выборка)

- `patientHomeBlockEditor.test.tsx`, `blockEditorMetadata.test.ts`, `patientHomeUnresolvedRefs.test.ts`
- `patientHomeCmsReturnUrls.test.ts`, `settings/patient-home/actions.test.ts`
- Rename/редирект раздела: `contentSectionSlug.test.ts`, `pgContentSections.test.ts`, `resolvePatientContentSectionSlug.test.ts`, `doctor/content/sections/actions.test.ts`, `patient/sections/[slug]/page.slugRedirect.test.tsx`

См. также короткий обзор данных рантайма: `README.md` в этой папке.
