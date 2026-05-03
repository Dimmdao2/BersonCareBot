# STAGE B6 PLAN — Шаблоны программ: UX pass-1 конструктора

> **Дисциплина:** коммит после каждого закрытого **EXEC** или **FIX**; пуш пачками после **B3, B6, B7** или по явной команде пользователя — [`MASTER_PLAN.md`](MASTER_PLAN.md) §9. **CI между коммитами:** таргетные проверки; **не** `pnpm run ci` на каждый коммит; полный CI перед пушем; при падении полного CI — `ci:resume:*` (`.cursor/rules/test-execution-policy.md`, `.cursor/rules/pre-push-ci.mdc`). **Канон:** [`PRE_IMPLEMENTATION_DECISIONS.md`](PRE_IMPLEMENTATION_DECISIONS.md).

## 1. Цель этапа

Визуально привести список шаблонов и конструктор к читаемому состоянию: превьюшки, двухколоночный layout, sticky-шапка, CTA черновик/опубликовать/архив; модалка «Элемент из библиотеки» с превью.

**Важно:** запуск B6 идёт после завершения фазы A в параллельном потоке. Перед началом кода нужен короткий code-state check конструктора, чтобы зафиксировать фактическое состояние полей/групп и не кодить по устаревшим предположениям. См. [`PRE_IMPLEMENTATION_DECISIONS.md`](PRE_IMPLEMENTATION_DECISIONS.md).

Источник: [`../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md) §2.8, §3 B6.

## 2. Hard gates before coding

- **B1** закрыт (или фильтры списка шаблонов согласованы).
- Выполнен pre-check текущего состояния конструктора после завершения A; результаты зафиксированы в `LOG.md` перед первым коммитом B6.
- Не менять контракты PATCH/snapshot/assign и не добавлять новые доменные поля.

## 3. In scope / out of scope

### In scope

- [`TreatmentProgramConstructorClient.tsx`](../../apps/webapp/src/app/app/doctor/treatment-program-templates/[id]/TreatmentProgramConstructorClient.tsx)
- [`TreatmentProgramTemplatesPageClient.tsx`](../../apps/webapp/src/app/app/doctor/treatment-program-templates/TreatmentProgramTemplatesPageClient.tsx)
- Превью по типам item в модалке библиотеки.
- Верификация бага «этапы не правятся в черновике» (`editLocked = busy || isArchived`) — починить если воспроизводится, **точечно**.
- Визуальная декомпозиция блоков: list chrome, constructor chrome, library modal cards, CTA strip.

### Out of scope

- Удаление или «временное скрытие» блоков A1/A3 в конструкторе.
- Изменение item-types / snapshot логики.

## 4. Декомпозиция реализации

1. **Pre-check (обязательный)**
   - просмотреть актуальный `TreatmentProgramConstructorClient` и связанный page client;
   - зафиксировать в `LOG.md`, какие блоки уже из A присутствуют и что считаем неизменяемым доменным baseline.
2. **List UI pass**
   - превью в списке шаблонов, счётчики, статус-chip.
3. **Constructor UI pass**
   - двухколоночный layout, sticky header, CTA strip, читаемые зоны stage/items.
4. **Library modal pass**
   - карточки-превью по всем типам item.
5. **Stability + regression**
   - точечная проверка `editLocked` сценария;
   - no-op на snapshot/assign/PATCH контракты.

## 5. Execution checklist

1. [ ] Pre-check после завершения A зафиксирован в LOG.
2. [ ] Список шаблонов: превью/счётчики по ТЗ.
3. [ ] Конструктор: layout + CTA + статус-бейдж.
4. [ ] Модалка библиотеки: превью для exercise/lfk_complex/test_set/recommendation/lesson.
5. [ ] `editLocked` bug проверен; если есть — исправлен точечно.
6. [ ] Существующие тесты конструктора зелёные; добавить тесты под новые куски UI по необходимости.
7. [ ] Smoke: черновик → опубликовать → архив.

## 6. Stage DoD

- Критерии ТЗ §6 для B6 (в части UX), согласованные с `PRE_IMPLEMENTATION_DECISIONS`.
- [`LOG.md`](LOG.md).

## 7. Координация с PROGRAM_PATIENT_SHAPE

B6 стартует после завершения A; этап не дублирует доменные изменения A, а адаптирует визуальный слой поверх фактического кода.
