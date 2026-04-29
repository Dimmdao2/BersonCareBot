# AUDIT — Phase 5 (CREATE / RETURN FLOWS)

Аудит выполнения Phase 5 против `05_CREATE_RETURN_FLOWS_PLAN.md` (goal, scope, behavior requirements, checklist, completion criteria, documentation artifacts, out of scope). Дата аудита: 2026-04-29.

Источник факта о составе работ: запись **2026-04-29 — Phase 5 — EXEC** в `LOG.md`, текущее дерево кода.

---

## 1. Verdict

**Pass with notes.**

Поток «новая страница контента» и «новый курс (черновик)» получают query `returnTo` / `patientHomeBlock` (и для контента — опционально `suggestedTitle` / `suggestedSlug`), парсинг с allowlist путей и отбрасыванием open redirect, UI возврата после успеха — реализованы. Смешанный блок `subscription_carousel` получает сгруппированные CTA с явными заголовками групп. Замечания на момент аудита: зазор **`/app/doctor/content/sections/new`** без return-context — **закрыт в Phase 6 FIX**; **(б)** для **`situations`** при непустом списке нет второго CTA «Создать раздел» в группах; **(в)** пикер всегда подставляет `returnTo=/app/doctor/patient-home`, а не путь из settings.

**Post-audit:** §5.1, `LOG.md` (Phase 6 — FIX).

---

## 2. Checklist coverage (`05_CREATE_RETURN_FLOWS_PLAN.md` §Phase Checklist)

| Пункт чеклиста | Статус | Доказательство |
| --- | --- | --- |
| `content_page` create path from block editor implemented. | **Да** | `buildPatientHomeContentNewUrl` → `/app/doctor/content/new?…`; `PatientHomeBlockCandidatePicker` — ссылка «Создать материал в CMS» для релевантных блоков/групп (`PatientHomeBlockCandidatePicker.tsx`). |
| `course` create path from block editor implemented. | **Да** | `buildPatientHomeCourseNewUrl`; страница `doctor/courses/new` + `DoctorCourseDraftCreateForm` (POST `/api/doctor/courses`, `status: "draft"`). |
| Return context preserved. | **Да** *(после Phase 6 FIX для раздела)* | Контент, курс — как в исходном аудите. Раздел: `sections/new/page.tsx` + баннер в `SectionForm` (см. §5.1). |
| Mixed block shows grouped create actions. | **Да** | Для `subscription_carousel`: группы `content_section` / `content_page` / `course` с заголовками и CTA (`alwaysShowGroupHeading`, `showCreateCtaForGroup` в `PatientHomeBlockCandidatePicker.tsx`). |
| Tests for context/return flow updated. | **Да** | `patientHomeCmsReturnUrls.test.ts`, `patientHomeBlockEditor.test.tsx`; дискриминированный `SaveContentPageState` в `actions.test.ts`, `ContentForm.test.tsx` (по журналу EXEC). |
| `LOG.md` updated. | **Да** | Запись **2026-04-29 — Phase 5 — EXEC**. |

---

## 3. Behavior requirements (`05` §Behavior Requirements)

| Требование | Статус | Комментарий |
| --- | --- | --- |
| User always sees a path to create missing target from block editor. | **Почти** | Для `daily_warmup`, `sos`, `subscription_carousel`, `courses` — CTA покрывают заявленные типы. Для `situations` при непустом списке отдельного CTA «ещё один раздел» в пикере нет (контракт Phase 3 — полный inline для разделов; частичный разрыв с «всегда виден путь» в смысле §Completion). |
| Return to block editor context is explicit and reliable. | **Да для страницы, курса и нового раздела** *(раздел — после Phase 6 FIX)* | `parsePatientHomeCmsReturnQuery`, баннеры. Для `sections/new` до FIX см. §5.1 (история). |
| Mixed block create actions are grouped and clearly labeled. | **Да** | Заголовки «Разделы» / «Материалы» / «Курсы» + кнопки-ссылки внутри группы. |

---

## 4. Completion criteria (`05` §Completion Criteria)

| Критерий | Статус |
| --- | --- |
| Editors can create or reach creation flow for every target type without losing context. | **Частично** | `content_page` и `course` — контекст и возврат согласованы с планом. `content_section` через `/app/doctor/content/sections/new` — после **Phase 6 FIX** баннер возврата и `savedSlug` как у новой страницы контента (см. §5.1). Остаётся UX без второго CTA «раздел» при непустом `situations` (§5.3). |

---

## 5. Scope vs plan — выявленные зазоры

### 5.1. `content/sections/new` и return-query

**Было при аудите Phase 5:** страница не читала `searchParams`, контекст блока после сохранения раздела терялся.

**Исправлено (Phase 6 FIX):** `doctor/content/sections/new/page.tsx` вызывает `parsePatientHomeCmsReturnQuery` и передаёт результат в `SectionForm`; при успешном `saveContentSection` — баннер и ссылка на `returnTo`; тип `SaveContentSectionState` при успехе включает `savedSlug`.

### 5.2. `returnTo` из UI пикера всегда doctor patient-home

В `PatientHomeBlockCandidatePicker` зафиксировано `returnBase = PATIENT_HOME_CMS_DEFAULT_RETURN_PATH` (`/app/doctor/patient-home`). Редактор открывается и с `doctor/patient-home`, и с `settings/patient-home`; во втором случае после создания материала ссылка «Открыть экран…» ведёт на doctor-маршрут. Это не нарушает allowlist в `patientHomeCmsReturnUrls.ts`, но ослабляет «вернуться туда, откуда пришли».

### 5.3. Блок `situations` и непустой список

`showCreateCtaForGroup` не включает код `situations` — при уже выбранных разделах пользователь не видит в пикере вторую ссылку «Создать раздел» (в отличие от `subscription_carousel` / `sos` для секций). Дополнительный раздел по-прежнему возможен через обходной путь (CMS разделов), но не из того же паттерна, что Phase 5 для смешанного блока.

---

## 6. Out of scope (негативная проверка)

| Запрет (`05` §Out Of Scope) | Статус |
| --- | --- |
| No course model changes. | **Ок** | Черновик через существующий API с полями, ожидаемыми эндпоинтом (`DoctorCourseDraftCreateForm`); отдельной смены схемы курса в Phase 5 не видно. |
| No billing or subscription gating. | **Ок** | Нет новых gate/billing веток в проверенных файлах Phase 5. |
| No broad redesign of CMS content/course forms. | **Ок** | Точечные пропсы/баннеры и отдельная страница курса, без переразметки всего CMS. |

---

## 7. Documentation artifacts (`05` §Documentation Artifacts)

| Артефакт | Статус |
| --- | --- |
| `LOG.md` with chosen strategy | **Да** | EXEC Phase 5. |
| `BLOCK_EDITOR_CONTRACT.md` if create paths changed | **Да** | Пункт Phase 5 в «Заметки для следующих фаз». |

---

## 8. Test gate (`05` §Test Gate)

По журналу Phase 5 EXEC выполнялись: Vitest (в т.ч. `patientHomeCmsReturnUrls.test.ts`, `patientHomeBlockEditor.test.tsx`, `actions.test.ts`, `ContentForm.test.tsx`), `tsc --noEmit`, `lint` для `apps/webapp`. Полный root CI в плане не требовался — **согласовано с `05`**.

---

## 9. Безопасность return-query (кратко)

`parsePatientHomeCmsReturnQuery`: при невалидном `returnTo` возвращается **`null` целиком** (включая при валидном `patientHomeBlock`), что закрывает open redirect за счёт отказа от patient-home контекста на странице `content/new` — согласовано с тестом «rejects open redirect even with valid block» в `patientHomeCmsReturnUrls.test.ts`. Страница `courses/new` при `null` подставляет дефолтный контекст — приемлемо для курса по умолчанию.
