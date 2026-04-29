# FINAL_AUDIT — Patient Home CMS Workflow

Дата первичного аудита: 2026-04-29  
Дата синхронизации документации с кодом (pass): 2026-04-29

## 1. Итоговый вердикт

**PASS по коду и автоматическим gate:** контракт персистентности (`patient_home_blocks` / `patient_home_block_items`), редактор врача и runtime основной страницы `/app/patient` согласованы через `deps.patientHome` и миграцию `0009_patient_home_cms_blocks`.

**OPEN (продуктовый gate, не код):** ручной smoke по [`06_QA_RELEASE_PLAN.md`](06_QA_RELEASE_PLAN.md) в целевом окружении — зафиксировать результат в [`LOG.md`](LOG.md).

Практический статус: **release-ready по data path и CI**; полный «release signed off» — после ручного QA.

Чеклист плана в репозитории: [`CMS_RELEASE_READY_PLAN_STATUS.md`](CMS_RELEASE_READY_PLAN_STATUS.md).  
Журнал синхронизации документов: [`DOC_SYNC_AND_PASS_CLOSURE.md`](DOC_SYNC_AND_PASS_CLOSURE.md).

## 2. Что проверялось (актуальный scope)

### Документы инициативы

- `README.md`, `MASTER_PLAN.md`, `BLOCK_EDITOR_CONTRACT.md`, `LOG.md`
- Фазы `00`–`06`, `AUDIT_PHASE_0.md` … `AUDIT_PHASE_6.md`
- `ROLLBACK_SQL.md`, `CMS_RELEASE_READY_PLAN_STATUS.md`, `DOC_SYNC_AND_PASS_CLOSURE.md`

### Кодовые зоны (release-ready)

- `apps/webapp/db/schema/patientHome.ts`, `db/schema/schema.ts`, `db/drizzle-migrations/0009_patient_home_cms_blocks.sql`, `0008_content_section_slug_history.sql`
- `apps/webapp/src/infra/repos/pgPatientHomeBlocks.ts`, `inMemoryPatientHomeBlocks.ts`
- `apps/webapp/src/modules/patient-home/ports.ts`, `service.ts`, `service.test.ts`, `blocks.ts`
- `apps/webapp/src/app-layer/di/buildAppDeps.ts`
- `apps/webapp/src/app/app/settings/patient-home/actions.ts`, `actions.test.ts`, `PatientHomeBlockEditorDialog.tsx`, `PatientHomeBlockEditorItems.tsx`
- `apps/webapp/src/app/app/doctor/patient-home/page.tsx`
- `apps/webapp/src/app/app/patient/page.tsx`, `patient/home/PatientHomeToday.tsx`, `PatientHomeSituationsRow.tsx`
- `apps/webapp/src/infra/repos/pgContentSections.ts`, `pgContentPages.ts`
- `apps/webapp/src/app/app/doctor/content/sections/*` (rename actor, icon/cover формы)

### Команды проверки (рекомендуемый минимум после изменений в зоне)

```bash
pnpm install --frozen-lockfile && pnpm run ci
pnpm --dir apps/webapp run db:verify-public-table-count
pnpm --dir apps/webapp exec vitest run src/modules/patient-home/service.test.ts src/app/app/settings/patient-home/actions.test.ts
```

Результат на дереве с закрытым release-ready батчем: **root CI — pass**; `tsc` / `lint` — в составе CI.

## 3. Подтверждено как выполненное

### 3.1. Диагностика, термины и пустые состояния

`blockEditorMetadata.ts` покрывает CMS-блоки и системные зоны; копирайт согласован с типами целей.

### 3.2. Единый редактор блока

`PatientHomeBlockEditorDialog.tsx` — единый поток: видимость блока, превью, элементы, кандидаты, ошибки серверных действий.

### 3.3. Inline-create CMS-раздела (персистентно)

`createContentSectionForPatientHomeBlock` создаёт строку в `content_sections` (включая `icon_image_url` / `cover_image_url` при передаче) и добавляет элемент в `patient_home_block_items` через `deps.patientHome.addCmsBlockItem`.

### 3.4. Safe slug rename

Миграция `0008`, схема `contentSectionSlugHistory`, rename action с записью `changed_by_user_id`, обновление `patient_home_block_items` в транзакции rename в `pgContentSections`, редиректы patient URL.

### 3.5. Return-flow для создания контента

`patientHomeCmsReturnUrls.ts`, страницы `new` с query-контекстом и баннером возврата (см. фазы 5–6 и `AUDIT_PHASE_5`).

### 3.6. Персистентность блоков и runtime

- Таблицы и Drizzle: `patient_home_*` + миграция `0009`.
- Редактор: server actions без заглушек `bump()`, страница врача — снимки из БД.
- Пациент: primary (`situations`, `daily_warmup`) и вторичная зона (carousel, SOS, courses) резолвятся из CMS при **видимом** блоке; иначе — описанные в коде fallback.

### 3.7. Repair

`repairPatientHomeBlockItemAction` обновляет список элементов из БД (refresh резолва), а не локальную «псевдо-починку» текста.

## 4. Findings после release-ready (актуальные)

Закрытые ранее в §4 **blocker/high** пункты (отсутствие `patient_home_*`, demo-only редактор, отсутствие icon/cover, только `revalidatePath`, отсутствие actor/CHECK) **сняты реализацией §10** — см. [`DOC_SYNC_AND_PASS_CLOSURE.md`](DOC_SYNC_AND_PASS_CLOSURE.md).

**Остаётся зафиксировать вручную:**

- **LOW / process:** пройти чеклист `06_QA_RELEASE_PLAN.md` и записать в `LOG.md`.

**Backlog (не регресс PASS):**

- Перенос операций `content_section_slug_history` с raw SQL на Drizzle в `pgContentSections` — отдельный refactor.
- Выровнять mini-app / альтернативный entry главной с тем же SoT — при продуктовой необходимости.
- Clean-arch долг `modules/patient-home/repository.ts`, `newsMotivation.ts` — см. проектные правила и backlog.

## 5. Сверка с целями инициативы (README)

| Цель | Статус | Комментарий |
| --- | --- | --- |
| Выбрать раздел/материал/курс из настройки блока | **Да** | Персистентное добавление и порядок в БД. |
| Создать недостающий раздел из блока | **Да** | Раздел + `patient_home_block_items`. |
| `situations` = разделы, корректные подписи | **Да** | Метаданные + runtime. |
| Пустой/битый блок объясняет невидимость | **Да** | Резолв + превью редактора. |
| Safe slug rename + redirect | **Да** | История, ссылки, `changed_by_user_id`, CHECK. |
| Согласованность настроек главной, CMS и runtime | **Да (основной `/app/patient`)** | SoT `patient_home_*` + сервис; см. §4 про mini-app как опцию. |
| Не ломать visual redesign scope | **Да** | Изменения data-path; стили shell/cards не целевой объект. |
| Без новых env vars | **Да** | |
| Actions через `buildAppDeps` | **Да** | |

## 6. Release / merge readiness

Код и **root CI** — зелёные на актуальном дереве после release-ready батча.

Для полного продуктового подписания: **ручной QA** по `06_QA_RELEASE_PLAN.md` + запись в `LOG.md`.

## 7. Выполненный порядок работ (release-ready batch)

Совпадает с планом «сначала schema → editor → runtime → мелкие правки → тесты/docs → CI»; детали перечислены в [`LOG.md`](LOG.md) (запись **Release-ready — FIX**) и в §10 ниже.

## 8. Финальное заключение

Инициатива по **контракту персистентной главной** для основного patient home path закрыта в коде; остаётся операционный шаг ручной проверки и поддержание документации в согласовании с кодом (см. `DOC_SYNC_AND_PASS_CLOSURE.md` при будущих расхождениях).

## 9. Примечание об устаревших версиях этого файла

До синхронизации 2026-04-29 в документе сохранялись абзацы про demo-only редактор и отсутствие `patient_home_*`. Они **исторически верны для предыдущего снимка кода** и **неверны** после батча §10. Актуальная правда — §1–§8 и ссылки на `CMS_RELEASE_READY_PLAN_STATUS.md`.

## 10. Пост-реализация (release-ready batch) — краткая сводка

- Миграция `0009_patient_home_cms_blocks.sql`; Drizzle `patientHome.ts`; расширения `content_sections` / `content_section_slug_history`.
- Сервис `createPatientHomeService`, репозитории, `deps.patientHome`.
- Редактор и actions; страница врача из БД.
- Runtime `/app/patient` + вторичная зона от CMS.
- Root `pnpm install --frozen-lockfile && pnpm run ci` — **pass**.

Ручной QA по `06_QA_RELEASE_PLAN.md` в сессии release-ready **не выполнялся** — **OPEN**.

## 11. Связанные артефакты

- [`CMS_RELEASE_READY_PLAN_STATUS.md`](CMS_RELEASE_READY_PLAN_STATUS.md) — статус пунктов плана.
- [`DOC_SYNC_AND_PASS_CLOSURE.md`](DOC_SYNC_AND_PASS_CLOSURE.md) — описание доработки документации.
