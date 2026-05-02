# Аудит выполнения CMS_RESTRUCTURE_PLAN (вариант C)

**Дата аудита:** 2026-05-02.  
**Объект:** соответствие реализации в репозитории документу [`CMS_RESTRUCTURE_PLAN.md`](CMS_RESTRUCTURE_PLAN.md), записи в [`LOG.md`](LOG.md), корректность ключевых правил в коде.  
**Метод:** статический обзор кода (`rg`/чтение файлов), сверка с текстом плана и логом; полный корневой **`pnpm run ci`** в рамках первичного аудита не гонялся. **Обновление 2026-05-02:** рекомендации по журналу и кросс-ссылкам в документах закрыты отдельным проходом (см. [`LOG.md`](LOG.md) → «пост-аудит CMS Composer»).

---

## 1. Итоговая оценка

| Критерий | Оценка |
|----------|--------|
| Соответствие целям плана (таксономия, CMS, patient-home, защита встроенных slug) | **Выполнено** в коде и миграции |
| Согласованность шапки плана и `LOG.md` с фактическим поведением | **Хорошо** |
| Согласованность **нумерованных шагов 1–7 внутри тела** `CMS_RESTRUCTURE_PLAN.md` с кодом | **Выровнено** (текст шагов 3/7 и абзаца «Что входит» обновлён по результатам аудита) |
| Полнота журнала для ops (контрольный SQL после миграции на конкретной БД) | **Шаблон и инструкция** внесены в `LOG.md` (2026-05-02); фактический результат по prod по-прежнему вносится командой вручную при приёмке |

---

## 2. Сводка: шаги плана ↔ реализация

| Шаг в плане | Суть | Статус | Где в коде / артефактах |
|-------------|------|--------|-------------------------|
| 1 | Backfill-матрица slug → `kind` / `system_parent_code` | OK | Совпадает с [`types.ts`](../../apps/webapp/src/modules/content-sections/types.ts) `classifyExistingContentSectionSlug` и SQL [`0017_content_sections_kind_system_parent.sql`](../../apps/webapp/db/drizzle-migrations/0017_content_sections_kind_system_parent.sql) |
| 2 | Миграция + CHECK + индекс | OK | Файл миграции выше; ограничения `kind`, `system_parent_code`, «article без parent» |
| 3 | Порт + фильтры + защита rename | OK | Порт и фильтры: [`ports.ts`](../../apps/webapp/src/modules/content-sections/ports.ts), [`pgContentSections.ts`](../../apps/webapp/src/infra/repos/pgContentSections.ts). Запрет rename: **только** `IMMUTABLE_SYSTEM_SECTION_SLUGS` (текст плана после аудита приведён к этому правилу). |
| 4 | Sidebar + все страницы = article | OK | [`ContentPagesSidebar.tsx`](../../apps/webapp/src/app/app/doctor/content/ContentPagesSidebar.tsx), [`content/page.tsx`](../../apps/webapp/src/app/app/doctor/content/page.tsx) (`isArticlePage`, `articlePages`) |
| 5 | Папка CMS, создание с `system_parent_code`, формы | OK | `sections/new?systemParentCode=`, [`SectionForm.tsx`](../../apps/webapp/src/app/app/doctor/content/sections/SectionForm.tsx), [`actions.ts`](../../apps/webapp/src/app/app/doctor/content/sections/actions.ts) `placement` / `taxonomyFromPlacement` |
| 6 | Patient-home кандидаты по кластеру | OK | [`blocks.ts`](../../apps/webapp/src/modules/patient-home/blocks.ts) `isPatientHomeContentSectionCandidateForBlock` / `…Page…`, [`service.ts`](../../apps/webapp/src/modules/patient-home/service.ts) `listCandidatesForBlock`, `assertCmsTargetExists` |
| 7 | UI + сервис: защита immutable slug | OK | UI и `renameSectionSlug` согласованы с шагом 7 в плане после выравнивания текста. |

---

## 3. Проверка функций и правил (выборочно)

### 3.1. Таксономия и размещение (`modules/content-sections`)

- `SYSTEM_PARENT_CODES` и `IMMUTABLE_SYSTEM_SECTION_SLUGS` заданы явно; `isValidSectionTaxonomy` запрещает `article` + не-null parent — согласовано с CHECK в SQL.
- `taxonomyFromPlacement` / `placementFromTaxonomy` покрывают статьи, четыре папки и `system_root` для строк вида `emergency` / `materials` / `workouts` — покрывает UX формы.
- **Тесты:** [`types.test.ts`](../../apps/webapp/src/modules/content-sections/types.test.ts) включает roundtrip placement и backfill intent.

### 3.2. Репозиторий `pgContentSections`

- `upsert`: нормализация `kind`/`systemParentCode`, вызов `isValidSectionTaxonomy` — отклонение невалидных комбинаций на запись.
- `renameSectionSlug`: перед транзакцией `if (isImmutableSystemSectionSlug(o))` → ошибка; **не** проверяется «любой `kind=system`» — это соответствует обновлённому тексту плана: пользовательские подразделы в папке можно переименовывать.

### 3.3. CMS hub (`doctor/content/page.tsx`)

- Страницы в общем списке фильтруются через принадлежность разделу с `kind === "article"` (`isArticlePage`).
- Режим `systemParentCode`: подразделы `kind=system` с нужным `systemParentCode`.
- Ссылки «Создать раздел» с query — соответствует шагу 5 плана.

### 3.4. Patient-home

- Кандидаты: фильтрация в `listCandidatesForBlock` через хелперы из `blocks.ts` — единая точка с серверной валидацией `assertCmsTargetExists` (та же логика кластеров).
- `useful_post`: только опубликованные страницы (в резолвере пациента страница уже из `getBySlug` с patient-visible) из разделов `kind=article` — совпадает с решениями в шапке плана (стр. 47–48, 138–139).
- `subscription_carousel`: в `isPatientHomeContentSectionCandidateForBlock` / `…Page…` для карусели — permissive `true`, inline-создание раздела из блока без правила — `systemParentCodeForPatientHomeBlock` → `undefined` и ошибка `inline_section_not_supported_for_block` в actions — совпадает с планом (стр. 142).

### 3.5. Резолверы и «сегодня»

- `patientHomeResolvers.ts`: для `situations` / `sos` / `useful_post` добавлена фильтрация по таксономии; карусель без жёсткого фильтра — OK.
- `todayConfig.ts`: разминка только из страниц кластера `warmups` через `isPatientHomeContentPageCandidateForBlock("daily_warmup", …)`.
- `patientHomeRuntimeStatus.ts` + `buildPatientHomeResolverSyncContext`: передаются `kind`/`systemParentCode` разделов и `section` страниц — синхронно с резолверами.

### 3.6. Тесты (наличие, не полный перечень)

Имеются целевые тесты: `content-sections/types`, `pgContentSections`, `sections` (Form, actions), `patient-home` (`blocks`, `service`, settings actions), `ContentPagesSidebar`, `PatientHomeToday`, `patientHomeResolvers`, `patientHomeRuntimeStatus`, и др. Полный прогон `pnpm --dir apps/webapp test` на момент закрытия задачи был зелёным.

---

## 4. Журнал `LOG.md`

**Сильные стороны**

- Есть отдельная запись **«CMS Composer — шаг 0»** (таксономия в документах).
- Есть запись **«CMS Composer — реализация варианта C»** с перечислением областей (БД, CMS, patient-home, резолверы) и явным уточнением про rename только для immutable.

**Пробелы (закрыто в журнале 2026-05-02, см. запись «пост-аудит CMS Composer»):**

- В DoD плана указан контрольный `SELECT` по БД после backfill — в `LOG.md` добавлен **шаблон** запроса и инструкция добавить строку со сводкой после миграции на окружении.
- Строка «Проверки» в записи реализации заменена на явный перечень: `typecheck`, `lint`, полный `test` webapp.

---

## 5. Документ `CMS_RESTRUCTURE_PLAN.md`

**Сильные стороны**

- Шапка: статус **«реализовано»** и краткое описание варианта C согласованы с кодом.
- Таксономия, мотивации отдельно, DoD в целом отражают продукт.

**Несоответствия внутри текста плана (устранены в той же правке, что и добавление ссылки на этот аудит):** ранее шаги 3 и 7 и абзац в «Что входит» трактовали запрет rename для **всех** `kind=system`; фактическая реализация — только **immutable** slug. Текст `CMS_RESTRUCTURE_PLAN.md` приведён в соответствие с кодом и этим аудитом.

---

## 6. Риски и ограничения (не блокеры аудита)

- **Миграция на БД:** применение `0017_*.sql` на конкретном окружении и сверка счётчиков `GROUP BY kind, system_parent_code` остаётся операционным шагом; в репозитории только SQL.
- **`PLAN_DOCTOR_CABINET.md` / `RECOMMENDATIONS_AND_ROADMAP.md`:** ссылки на аудит и примечание о варианте C добавлены в проходе 2026-05-02 (см. `LOG.md`).

---

## 7. Заключение

Реализация **варианта C** в коде и миграции **соответствует** целям и шапке `CMS_RESTRUCTURE_PLAN.md`, а также записи в `LOG.md` после дополнения журнала (команды проверки + шаблон ops-`SELECT`). Расхождения нумерованных шагов 3/7 и абзаца «Что входит» с кодом **устранены** в тексте плана. Связанные документы инициативы (`PLAN_DOCTOR_CABINET`, `RECOMMENDATIONS_AND_ROADMAP`, `CMS_AUDIT`, `TARGET_STRUCTURE_DOCTOR`, `README`) синхронизированы с вариантом C — см. запись **«пост-аудит CMS Composer»** в [`LOG.md`](LOG.md).
