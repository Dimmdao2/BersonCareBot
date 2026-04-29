# FINAL_AUDIT — Patient Home CMS Workflow

Дата: 2026-04-29

## 1. Итоговый вердикт

**Инициатива не может считаться полностью выполненной как продуктовый workflow.**

Закрыта значительная часть редакторского UX и инфраструктуры вокруг CMS-разделов:

- добавлены термины и диагностика блоков главной пациента;
- есть единый диалог «Настроить»;
- есть inline-create раздела для пустого `situations`;
- есть безопасный rename slug раздела с историей и редиректом пациентского URL;
- есть return-flow для создания материалов, курсов и разделов;
- есть фазовые аудиты, rollback-документ и модульная заметка.

Но ключевой контракт инициативы — **настройки главной, CMS-разделы и runtime пациента остаются согласованными** — сейчас не выполнен. Экран врача работает в основном на демо-строках и локальном состоянии, server actions для элементов блока не пишут в `patient_home_*`, а пациентская главная не читает `patient_home_blocks` / `patient_home_block_items`.

Практический статус: **partial / not release-complete**. Можно считать выполненным UX-каркас и часть CMS section tooling, но не финальный CMS workflow управления главной пациента.

## 2. Что проверялось

Документы инициативы:

- `README.md`, `MASTER_PLAN.md`, `BLOCK_EDITOR_CONTRACT.md`, `LOG.md`;
- фазовые планы `00`–`06`;
- `AUDIT_PHASE_0.md` … `AUDIT_PHASE_6.md`;
- `ROLLBACK_SQL.md`.

Кодовые зоны:

- `apps/webapp/src/app/app/doctor/patient-home/page.tsx`;
- `apps/webapp/src/app/app/settings/patient-home/*`;
- `apps/webapp/src/modules/patient-home/*`;
- `apps/webapp/src/app/app/doctor/content/sections/*`;
- `apps/webapp/src/app/app/patient/page.tsx`;
- `apps/webapp/src/app/app/patient/home/PatientHomeToday.tsx`;
- `apps/webapp/src/app/app/patient/sections/[slug]/page.tsx`;
- `apps/webapp/src/infra/repos/pgContentSections.ts`;
- `apps/webapp/db/schema/schema.ts`;
- `apps/webapp/db/drizzle-migrations/0008_content_section_slug_history.sql`.

Независимо запущенные проверки:

```bash
pnpm --dir apps/webapp exec vitest run src/modules/patient-home/blockEditorMetadata.test.ts src/modules/patient-home/patientHomeUnresolvedRefs.test.ts src/modules/patient-home/patientHomeCmsReturnUrls.test.ts src/app/app/settings/patient-home/patientHomeBlockEditor.test.tsx src/app/app/settings/patient-home/actions.test.ts src/app/app/doctor/content/actions.test.ts src/app/app/doctor/content/ContentForm.test.tsx src/shared/lib/contentSectionSlug.test.ts src/infra/repos/resolvePatientContentSectionSlug.test.ts src/infra/repos/pgContentSections.test.ts src/app/app/doctor/content/sections/actions.test.ts src/app/app/patient/sections/[slug]/page.slugRedirect.test.tsx src/app/app/patient/sections/[slug]/page.warmupsGate.test.tsx
pnpm --dir apps/webapp run db:verify-public-table-count
pnpm --dir apps/webapp exec tsc --noEmit
pnpm --dir apps/webapp lint
```

Результат: **pass**.

- Vitest: **13 files passed, 71 tests passed**.
- DB verify: **OK, 113 public tables match pgTable exports**.
- `tsc --noEmit`: **pass**.
- `lint`: **pass**.
- `ReadLints` по проверенным зонам: **no linter errors found**.

Не выполнялись:

- полный root CI `pnpm install --frozen-lockfile && pnpm run ci`;
- ручной / E2E smoke из `06_QA_RELEASE_PLAN.md`.

## 3. Подтверждено как выполненное

### 3.1. Диагностика, термины и пустые состояния

`apps/webapp/src/modules/patient-home/blockEditorMetadata.ts` покрывает CMS-блоки и системные зоны. UI использует корректные формулировки: `situations` как «раздел», `courses` как «курс», смешанные блоки как «раздел / материал / курс». Пустой включённый блок явно предупреждает, что пациент его не увидит.

### 3.2. Единый редактор блока

`PatientHomeBlockEditorDialog.tsx` объединяет статус, visibility switch, preview, список элементов и candidate picker. Старые add/repair/items модалки сведены к единому потоку или реэкспортам.

### 3.3. Inline-create CMS-раздела

`createContentSectionForPatientHomeBlock` создаёт `content_sections` через `deps.contentSections`, валидирует роль врача, block code, slug, duplicate slug и media URL policy. UI `PatientHomeCreateSectionInlineForm` добавляет созданную строку в локальный список редактора без закрытия диалога.

### 3.4. Safe slug rename

Есть миграция `0008_content_section_slug_history.sql`, схема `contentSectionSlugHistory`, action `renameContentSectionSlug`, UI `SectionSlugRenameDialog`, redirect resolver `resolvePatientContentSectionSlug`, редирект старого patient URL на новый slug. Тесты rename/redirect проходят.

### 3.5. Return-flow для создания контента

`patientHomeCmsReturnUrls.ts` ограничивает `returnTo` allowlist-ом и отбрасывает open redirect. `content/new`, `courses/new` и `content/sections/new` получают контекст блока и показывают путь возврата после сохранения.

## 4. Findings

### BLOCKER — нет персистентного workflow `patient_home_*`

Source of truth в `README.md` и `MASTER_PLAN.md`: `patient_home_blocks` и `patient_home_block_items`. В фактическом webapp-коде они не являются рабочей моделью:

- в Drizzle schema нет `patient_home_blocks` / `patient_home_block_items`;
- `apps/webapp/src/app/app/doctor/patient-home/page.tsx` берёт элементы из `getDemoPatientHomeEditorPayload`;
- `reorderPatientHomeBlockItemsAction`, `togglePatientHomeBlockItemVisibilityAction`, `deletePatientHomeBlockItemAction`, `repairPatientHomeBlockItemAction`, `setPatientHomeBlockVisibilityAction` только вызывают `revalidatePath`;
- `createContentSectionForPatientHomeBlock` создаёт `content_sections`, но не добавляет строку в `patient_home_block_items`.

Эффект: редактор выглядит рабочим, но после refresh / повторного открытия состояние возвращается к демо или серверным кандидатам. Настройки блока не становятся runtime-настройками.

### BLOCKER — пациентская главная не использует CMS block model

`/app/patient` не читает `patient_home_blocks`, не применяет `patient_home_block_items`, не использует `filterAndSortPatientHomeBlocks` / `patientHomeResolvers` из плана. Текущая главная собирается из `patientHomeBlocksForEntry`, `contentSections.listVisible`, `PatientHomeToday`, hardcoded secondary blocks и catalog/course queries.

Эффект: админский редактор не управляет тем, что реально увидит пациент. Главный acceptance инициативы про согласованность настроек главной и runtime не закрыт.

### HIGH — inline-create раздела не выполняет обещанное «создать и добавить в блок»

UI-кнопка называется «Создать раздел и добавить в блок», но действие добавляет строку только в локальное состояние React. В БД создаётся только `content_sections`. После refresh новый раздел может появиться как кандидат, но не как элемент блока.

Эффект: пользователь получает ложное ощущение сохранённой настройки главной.

### HIGH — icon / cover раздела заявлены в workflow, но не сохраняются

План и README говорят, что для `situations` важны `icon_image_url` / cover/icon поля. Форма inline-create принимает `iconImageUrl` и `coverImageUrl`, но сама предупреждает, что в `content_sections` нет колонок, а action эти значения не передаёт в порт.

Эффект: созданный из блока раздел не получает обещанные визуальные поля «сразу», а runtime `situations` не может использовать `icon_image_url` из текущей схемы.

### HIGH — новая DB-логика slug history реализована raw SQL, не Drizzle ORM

Инициатива добавила новую таблицу `content_section_slug_history`, но операции в `pgContentSections.ts` выполняются через `client.query(...)`. Это расходится с проектным правилом: новые таблицы и новые runtime-запросы должны использовать Drizzle ORM. Файл находится в infra, поэтому это не import-layer нарушение, но это нарушение принятого правила для новых DB work.

Эффект: архитектурный долг и риск расхождения с Drizzle schema / migration discipline.

### MEDIUM — repair broken target остаётся демо-операцией

Кнопка «Исправить» в `PatientHomeBlockEditorItems.tsx` локально ставит `resolved: true` и меняет title на `Исправлено: ...`; server action делает только `revalidatePath`. Нет выбора существующей цели, создания нужной цели, hide/delete path как полноценного repair-flow.

Эффект: один из центральных сценариев инициативы пока не работает на данных.

### MEDIUM — return-flow не завершает добавление созданной сущности в блок

Материал, курс и раздел можно создать с query-контекстом и вернуться на экран настройки. Но нет финального шага «добавить созданную сущность в конкретный блок» как персистентной операции. Для `situations` при непустом списке также нет постоянного CTA «Создать раздел» в группе, что уже зафиксировано в `AUDIT_PHASE_5.md`.

Эффект: редактору всё равно нужно знать, где искать созданную сущность, и действие не становится атомарным workflow.

### MEDIUM — audit trail rename не содержит actor

`MASTER_PLAN.md` предлагал `changedByUserId` / signature с `changedByUserId`, но фактическая схема `content_section_slug_history` хранит только `id`, `old_slug`, `new_slug`, `created_at`. Action требует doctor access, но не записывает, кто переименовал slug.

Эффект: для админского rename-flow нет нормальной операционной трассировки.

### MEDIUM — DB constraint `old_slug <> new_slug` отсутствует

Сервис проверяет `oldSlug !== newSlug`, но таблица `content_section_slug_history` не имеет CHECK constraint `old_slug <> new_slug`, хотя план явно упоминал такой SQL constraint.

Эффект: прямой SQL / будущий код может записать бессмысленную историю.

### MEDIUM — в модуле `patient-home` сохраняются legacy clean-architecture нарушения

В `apps/webapp/src/modules/patient-home/repository.ts` и `newsMotivation.ts` есть прямой импорт `@/infra/db/client`. Это не похоже на новую часть CMS workflow, но итоговая зона `modules/patient-home` остаётся не полностью соответствующей правилу module isolation.

Эффект: дальнейшее развитие workflow внутри этого модуля рискует закрепить обход портов.

### LOW — документация местами слишком оптимистична

Фазовые аудиты корректно пишут `pass with notes`, но суммарное чтение `LOG.md` и `AUDIT_PHASE_6.md` может создать ощущение, что инициатива закрыта. На самом деле major gaps вынесены в notes: demo data, no `patient_home_*`, no E2E manual QA, no full root CI.

Эффект: высокий риск преждевременного merge/release без понимания, что это UX scaffold, а не законченный workflow.

### LOW — full CI и manual QA не выполнены

Это согласовано с `06_QA_RELEASE_PLAN.md`, если нет push/release. Но для финального release-gate остаётся обязательным:

```bash
pnpm install --frozen-lockfile
pnpm run ci
```

и ручной smoke checklist из `06_QA_RELEASE_PLAN.md`.

## 5. Сверка с целями инициативы

| Цель | Статус | Комментарий |
| --- | --- | --- |
| Из настройки блока выбрать существующий раздел/материал/курс | **Частично** | UI выбора есть; кандидаты частично реальные; добавление не персистентно. |
| Создать недостающий раздел из блока | **Частично** | `content_sections` создаётся; связь с блоком не сохраняется. |
| `situations` говорит «раздел», не «материал» | **Да** | Метаданные и UI покрывают терминологию. |
| Пустой/битый блок объясняет невидимость | **Частично** | UI объясняет; диагностика основана на локальных/demo rows, не на runtime resolver. |
| Safe slug rename обновляет ссылки и сохраняет redirect | **В основном да** | `content_pages` и old patient URL покрыты; `patient_home_block_items` только если таблица существует; actor/DB check отсутствуют. |
| Настройки главной, CMS и runtime согласованы | **Нет** | Runtime пациента не использует `patient_home_*`; editor actions не сохраняют block state. |
| Не менять patient visual redesign scope | **Смешано по рабочему дереву** | В рамках CMS-файлов visual primitives не трогались, но рабочее дерево содержит параллельные изменения visual initiative; при review нужно разделять инициативы. |
| Не добавлять env vars | **Да** | Новых env vars в проверенном scope не выявлено. |
| Route handlers/actions тонкие, deps через composition root | **В основном да** | Server actions вызывают `buildAppDeps`; прямых DB вызовов в новых actions нет. |

## 6. Release / merge readiness

Текущий статус для merge/release: **не готово как завершённая инициатива**.

Можно мержить только если PR явно позиционируется как:

- UX scaffold / intermediate editor shell;
- safe section slug rename;
- return-flow groundwork;
- без заявления, что doctor patient-home полностью управляет runtime главной.

Нельзя мержить как «Patient Home CMS Workflow complete», пока не закрыты:

1. Drizzle schema и migrations для `patient_home_blocks` / `patient_home_block_items` или явное документированное решение, что текущий runtime source of truth другой.
2. Реальные repository/port/service операции для list/add/reorder/toggle/delete/repair block items.
3. Подключение doctor editor к тем же данным, что использует patient runtime.
4. Подключение patient runtime к block model или пересмотр `MASTER_PLAN.md` / README под фактическую модель.
5. Персистентный inline-create: section created -> item row added -> patient home resolves it.
6. Реальный repair-flow broken target.
7. Решение по icon/cover fields для `content_sections`.
8. Full root CI и ручной QA перед push/release.

## 7. Рекомендуемый порядок закрытия

1. **Сначала data contract:** добавить/подключить `patient_home_blocks` и `patient_home_block_items` в Drizzle schema, ports и infra repo.
2. **Затем editor persistence:** заменить `bump()` actions на реальные операции через service/ports.
3. **Затем runtime alignment:** пациентская главная должна читать тот же source of truth или документация должна честно поменять source of truth.
4. **Затем repair и create-return:** сделать broken-target repair и auto-add созданных сущностей реальными операциями.
5. **Затем QA gate:** пройти manual checklist и полный root CI.

## 8. Финальное заключение

Фазы 1–6 дали хороший UX-каркас и несколько полезных production-grade частей, особенно safe slug rename и return-query hardening. Но независимая сверка показывает, что инициатива остановилась до главного слоя: **персистентное управление блоками главной и связь с runtime пациента отсутствуют**.

Финальный статус: **не complete; requires follow-up implementation before release as final Patient Home CMS Workflow.**

## 9. Перепроверка статуса (2026-04-29 13:08 UTC+3)

Повторная сверка кода и документов перед push подтвердила, что ключевые блокеры остаются открытыми.

Дополнительно подтверждено:

- в `buildAppDeps` нет зависимости/порта уровня `patientHomeBlocks` для `patient_home_*`;
- в webapp нет отдельного API-контура `patient-home`, через который могла бы сохраняться конфигурация блоков;
- `doctor/patient-home` по-прежнему использует demo-items и локальный optimistic state;
- server actions в `settings/patient-home/actions.ts` для reorder/toggle/delete/repair/visibility остаются на `revalidatePath` без записи в БД;
- `/app/patient` и `PatientHomeToday` не читают `patient_home_blocks` / `patient_home_block_items`.

Что осталось недоделано до release-ready:

1. Drizzle-схема и миграции для `patient_home_blocks` / `patient_home_block_items` (или пересмотр SoT в документах).
2. Порт + сервис + DI для операций с блоками главной в `buildAppDeps`.
3. Персистентные actions редактора (`add/reorder/toggle/delete/repair/visibility`) вместо stub-логики.
4. Подключение runtime пациента к тому же source of truth, что использует редактор.
5. Персистентный inline-create (create section + insert item в блок).
6. Полноценный repair-flow broken target (выбор/создание цели, а не локальная пометка `resolved`).
7. Закрытие medium-хвостов slug history (actor + DB check) и icon/cover полей `content_sections` при принятии в scope.
8. Полный root CI (`pnpm install --frozen-lockfile && pnpm run ci`) и ручной QA checklist перед релизом.
