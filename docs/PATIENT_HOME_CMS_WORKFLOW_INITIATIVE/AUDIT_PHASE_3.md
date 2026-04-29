# AUDIT — Phase 3 (INLINE_CREATE_SECTIONS)

Аудит выполнения Phase 3 против `03_INLINE_CREATE_SECTIONS_PLAN.md` (scope, behavior, out of scope, checklist, completion criteria, documentation artifacts). Дата аудита: 2026-04-29.

Источник факта о составе работ: записи **2026-04-29 — Phase 3 — EXEC** в `LOG.md` и текущее дерево файлов из этого списка.

---

## 1. Verdict

**Pass with notes.**

Inline-create раздела для сценария «пустые кандидаты у `situations`» реализован: server action, валидация, порт `contentSections`, UI-форма, тесты. Замечания: запись в `patient_home_block_items` отсутствует (нет схемы; согласовано с completion criteria «без смены схемы»); URL иконки/обложки валидируются, но в `content_sections` не сохраняются до миграции колонок.

---

## 2. Checklist coverage (`03_INLINE_CREATE_SECTIONS_PLAN.md`)

| Пункт чеклиста | Статус | Доказательство |
| --- | --- | --- |
| Server action implemented with strict validation. | **Да** | `createContentSectionForPatientHomeBlock` в `actions.ts`: `requireDoctorAccess`, Zod, slug/media/slug uniqueness, `patientHomeCmsBlockAllowsContentSection`. |
| UI inline form integrated into block editor. | **Да** | `PatientHomeCreateSectionInlineForm.tsx`, `PatientHomeBlockCandidatePicker` + `PatientHomeBlockEditorDialog`. |
| Successful create auto-adds item. | **Да (UI)** | `onInlineSectionCreated` добавляет `item` в локальный список; персистентная строка блока — после `patient_home_*`. |
| Duplicate/invalid slug failures handled. | **Да** | `getBySlug` + паттерн slug; тесты в `actions.test.ts`. |
| Media URL policy reused. | **Да** | `validateOptionalMediaUrl` + `API_MEDIA_URL_RE` / `isLegacyAbsoluteUrl`. |
| Tests for action + UI added/updated. | **Да** | `actions.test.ts`, `patientHomeBlockEditor.test.tsx`. |
| `LOG.md` updated. | **Частично** → **FIX** | Была запись Phase 3 EXEC, но **не** выполнен явный пункт плана §Documentation Artifacts: контракт action и edge cases в журнале; плюс дублирующая запись «повторный запрос». |

---

## 3. Scope vs plan

| Пункт `03` Scope | Статус |
| --- | --- |
| 1. Server action `createContentSectionForPatientHomeBlock` | **Да** |
| 2. Validate doctor/admin, block, title/slug, media, uniqueness | **Да** (`requireDoctorAccess` = врач или админ по `canAccessDoctor`) |
| 3. Create via content sections port | **Да** |
| 4. Add as `patient_home_block_item` | **Отложено** | Нет таблицы; UI получает элемент из ответа action. |
| 5. Keep user in editor context | **Да** | Диалог не закрывается; список обновляется локально. |

---

## 4. Out of scope (негативная проверка)

| Запрет | Статус |
| --- | --- |
| No inline pages/courses | **Ок** |
| No slug rename | **Ок** |
| No patient runtime style changes | **Ок** (footprint — doctor/settings/modules) |

---

## 5. Mandatory fixes (до FIX)

1. **`LOG.md`:** добавить явный **контракт** `createContentSectionForPatientHomeBlock` (вход, успех, ошибки, ограничения персистенции) и **edge cases** согласно `03` §Documentation Artifacts.
2. **`LOG.md`:** убрать дублирующую запись **Phase 3 — EXEC (повторный запрос)**, перенеся смысл «повторная проверка» в одну запись Phase 3.

---

## 6. Mandatory fixes — статус после FIX (2026-04-29)

**Сделано:**

1. В основной записи **Phase 3 — EXEC** в `LOG.md` добавлен подпункт с контрактом action и edge cases; дублирующая запись удалена.
2. Обновлён этот файл (`AUDIT_PHASE_3.md`) разделом §6.

---

## 7. Readiness to Phase 4

После появления схемы `patient_home_block_items` и миграции колонок медиа у `content_sections` — повторно прогнать чеклист §2 и smoke создания раздела с записью строки блока.
