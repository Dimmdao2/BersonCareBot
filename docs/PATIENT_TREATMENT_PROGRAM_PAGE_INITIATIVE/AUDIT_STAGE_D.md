# AUDIT — STAGE D (list page polish)

**Дата:** 2026-05-05  
**Проверяет:** Stage D EXEC output  
**Baseline:** `STAGE_D.md`, `ROADMAP_2.md §1.1`  
**Целевые файлы:**

| Файл | Статус |
|------|--------|
| `apps/webapp/src/app/app/patient/treatment-programs/page.tsx` | в scope |
| `apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramsListClient.tsx` | в scope |
| `apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramsListClient.test.tsx` | в scope (должен оставаться зелёным) |
| `apps/webapp/src/app/app/patient/treatment-programs/page.nudgeResilience.test.tsx` | в scope (должен оставаться зелёным) |

---

## 1. Scope check — нет изменений вне scope

| Проверка | Результат |
|----------|-----------|
| Нет правок в `db/schema/` | ✅ |
| Нет новых миграций | ✅ |
| Нет правок в `modules/` | ✅ |
| Нет новых `patientVisual` токенов (только reuse) | ✅ (`patientSurfaceProgramClass` — alias, добавлен в Stage C) |
| Нет new custom chrome в route-компоненте | ✅ |

---

## 2. Проверка критериев D1–D4

### D1 — Hero активной программы

| Критерий | Проверка | Результат |
|----------|----------|-----------|
| Название программы (`title`) | `<h2>{hero.title}</h2>` | ✅ |
| `current_stage_title` | `Текущий этап: {hero.currentStageTitle}` (null → «—») | ✅ |
| Бейдж `planUpdatedLabel` | `<span aria-hidden>●</span><span>{label}</span>` c `role="status"` | ✅ |
| `planUpdatedLabel` через бэкенд-badge | `deps.treatmentProgramInstance.patientPlanUpdatedBadgeForInstance` → `formatBookingDateLongRu` | ✅ |
| CTA → detail-страница | `routePaths.patientTreatmentProgram(hero.instanceId)` | ✅ |
| Использует patient primitives | `patientSurfaceProgramClass`, `patientPrimaryActionClass`, `patientMutedTextClass` | ✅ |
| Hero только при наличии активной программы | `{hero ? <section>…</section> : <emptyState>}` | ✅ |

### D2 — Архив завершённых программ

| Критерий | Проверка | Результат |
|----------|----------|-----------|
| Под `<details>` | `<details className={cn(patientCardClass, "group")}>` | ✅ |
| Заголовок «Завершённые программы» | `<summary>Завершённые программы</summary>` + счётчик | ✅ |
| Свёрнут по умолчанию | Нет атрибута `open` | ✅ |
| Каждая позиция — ссылка на detail | `routePaths.patientTreatmentProgram(p.id)` | ✅ |
| Используются patient primitives | `patientCardClass`, `patientCardCompactClass`, `patientMutedTextClass` | ✅ |

### D3 — Empty state

| Критерий | Проверка | Результат |
|----------|----------|-----------|
| Текст «Здесь появится программа после назначения врачом» | Присутствует в `<p>` | ✅ |
| Ссылка → `/messages` | `href={messagesHref}` → `routePaths.patientMessages` = `/app/patient/messages` | ✅ |
| Текст ссылки осмыслен | «Написать в чат клиники» | ✅ |
| Нет несогласованных CTA | Только одна ссылка, нет кнопок без действия | ✅ |
| Поверхность — patient primitive | `patientSurfaceInfoClass` | ✅ |

### D4 — Нет процентной аналитики

| Проверка | Результат |
|----------|-----------|
| `grep '%\|percent\|progress'` в `PatientTreatmentProgramsListClient.tsx` | 0 совпадений ✅ |
| `grep '%\|percent\|progress'` в `page.tsx` | 0 совпадений ✅ |

---

## 3. Тесты (D5)

```
pnpm --dir apps/webapp exec vitest run src/app/app/patient/treatment-programs

Test Files  4 passed (4)
Tests       14 passed (14)
```

| Файл | Статус |
|------|--------|
| `PatientTreatmentProgramsListClient.test.tsx` | ✅ зелёный |
| `page.nudgeResilience.test.tsx` (список) | ✅ зелёный |
| `PatientTreatmentProgramDetailClient.test.tsx` | ✅ зелёный (рядом, не деградировал) |
| `[instanceId]/page.nudgeResilience.test.tsx` | ✅ зелёный (рядом, не деградировал) |

---

## 4. Целевые проверки (D6)

| Команда | Результат |
|---------|-----------|
| `pnpm --dir apps/webapp lint --max-warnings=0 -- src/app/app/patient/treatment-programs` | ✅ |
| `pnpm --dir apps/webapp exec tsc --noEmit` | ✅ |
| `pnpm --dir apps/webapp exec vitest run src/app/app/patient/treatment-programs` | ✅ |

---

## 5. Соответствие ROADMAP_2 §1.1

| Требование ROADMAP | Статус |
|--------------------|--------|
| Hero: название программы | ✅ |
| Hero: текущий этап (`current_stage_title`) | ✅ |
| Hero: бейдж «План обновлён» (через `planUpdatedLabel`) | ✅ |
| Hero: CTA → `/app/patient/treatment-programs/[instanceId]` | ✅ |
| Архивные программы — под `<details>`, «Завершённые программы» | ✅ |
| Empty state: «Здесь появится программа после назначения врачом» | ✅ |
| Empty state: ссылка на `/messages` | ✅ |
| Нет процентной аналитики прогресса | ✅ |
| Все стили — patient primitives / shadcn base | ✅ |
| Нет новых одноразовых chrome-компонентов в route | ✅ |

---

## 6. Находки

### Critical (0)

Нет.

### Major (0)

Нет.

### Minor

#### M1 — `...ListClient.tsx` без `"use client"` при наличии «Client» в имени файла

**Файл:** `PatientTreatmentProgramsListClient.tsx`  
**Описание:** По соглашению проекта суффикс `Client` в имени компонента сигнализирует о наличии директивы `"use client"`. В данном файле директива отсутствует, поскольку компонент не использует хуки и не требует клиентского контекста (работает как RSC). Функциональная корректность не нарушена — тесты зелёные, компонент рендерится корректно в обоих контекстах.  
**Риск:** низкий (вводит в заблуждение разработчика, который ожидает клиентский компонент); реальной ошибки нет.  
**Рекомендация:** defer — переименование файла потребует правок в `page.tsx`, обоих test-файлах и логах, стоимость выше пользы на этапе D. Зафиксировать в `LEGACY_CLEANUP_BACKLOG.md` для отдельного tech-debt тикета.

---

## 7. Итог

| Уровень | Кол-во | Закрыто |
|---------|--------|---------|
| Critical | 0 | — |
| Major | 0 | — |
| Minor | 1 | defer (M1) |

**Вердикт: PASS.** Stage D полностью соответствует `STAGE_D.md` и `ROADMAP_2 §1.1`. Все 14 тестов зелёные, lint и typecheck чистые.

---

## MANDATORY FIX INSTRUCTIONS

### Critical — нет обязательных правок.

### Major — нет обязательных правок.

### Minor M1 — DEFER

**Действие:** не исправлять в рамках Stage D.  
**Обоснование:** компонент функционально корректен, переименование меняет множество файлов без пользы для пользователя.  
**Follow-up:** добавить запись в `docs/TREATMENT_PROGRAM_INITIATIVE/LEGACY_CLEANUP_BACKLOG.md` (или эквивалент) с задачей «Rename `PatientTreatmentProgramsListClient.tsx` → `PatientTreatmentProgramsList.tsx` + update imports in `page.tsx`, test files, `LOG.md`».

### Итог FIX для Stage D: исправления не требуются. Разрешён переход к `COMMIT`.
