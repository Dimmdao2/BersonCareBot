# PATIENT_HOME_CMS_WORKFLOW_INITIATIVE

Инициатива дорабатывает не саму витрину пациента, а рабочее место врача/админа для настройки главной пациента и связанных CMS-разделов.

Базовая витрина уже реализована и закрыта в `docs/PATIENT_HOME_REDESIGN_INITIATIVE`. Текущая проблема в другом: редактору неудобно наполнять блоки, создавать недостающие разделы, понимать почему блок не виден на главной, и безопасно менять slug разделов.

## Цель

Сделать настройку главной пациента понятной и завершенной:

- из настройки блока можно выбрать существующий раздел/материал/курс или создать недостающий;
- для `situations` редактор работает с разделами, а UI так и пишет: "раздел", не "материал";
- пустой или битый блок явно объясняет, почему он не показывается пациенту;
- slug раздела можно менять только через безопасный rename-flow, который обновляет ссылки и сохраняет редирект;
- настройки главной, CMS-разделы и runtime пациента остаются согласованными.

## Не цель

- Не переписывать пациентскую главную заново.
- Не делать visual redesign patient shell/nav/home cards — это scope `PATIENT_APP_VISUAL_REDESIGN_INITIATIVE`.
- Не трогать `globals.css`, `AppShell`, `PatientHeader`, `PatientBottomNav`, `PatientTopNav`, `navigation.ts`, `button-variants.ts`, `patientHomeCardStyles.ts` ради визуального стиля.
- Не менять модель курсов / `treatment_program_*`.
- Не добавлять платежи, подписочный gate или новую модель доступа.
- Не хардкодить slug-и из `CONTENT_PLAN.md`.
- Не переносить размещение главной в поля `content_sections`.
- Не открывать публично защищенные media URL и внутренние patient routes.
- Не добавлять env-переменные.

## Runtime Source Of Truth

- Блоки главной: `patient_home_blocks`.
- Элементы блоков: `patient_home_block_items`.
- Разделы: `content_sections`.
- Материалы: `content_pages`.
- Курсы: `courses`.
- Скалярные настройки: `system_settings` (`scope='admin'`), только если настройка действительно scalar runtime config.

## Документы

- [`MASTER_PLAN.md`](MASTER_PLAN.md) - полный план реализации по фазам.
- [`PROMPTS_PLAN_EXEC_AUDIT_FIX.md`](PROMPTS_PLAN_EXEC_AUDIT_FIX.md) - copy-paste промпты для Composer.
- [`LOG.md`](LOG.md) - журнал исполнения фаз.

Декомпозиция по этапам (рабочие phase files для Composer):

- [`00_AUDIT_UX_CONTRACT_PLAN.md`](00_AUDIT_UX_CONTRACT_PLAN.md)
- [`01_DIAGNOSTICS_LABELS_PLAN.md`](01_DIAGNOSTICS_LABELS_PLAN.md)
- [`02_UNIFIED_BLOCK_EDITOR_PLAN.md`](02_UNIFIED_BLOCK_EDITOR_PLAN.md)
- [`03_INLINE_CREATE_SECTIONS_PLAN.md`](03_INLINE_CREATE_SECTIONS_PLAN.md)
- [`04_SAFE_SLUG_RENAME_PLAN.md`](04_SAFE_SLUG_RENAME_PLAN.md)
- [`05_CREATE_RETURN_FLOWS_PLAN.md`](05_CREATE_RETURN_FLOWS_PLAN.md)
- [`06_QA_RELEASE_PLAN.md`](06_QA_RELEASE_PLAN.md)

## Ключевые продуктовые решения

1. **Slug нельзя просто редактировать как обычное поле.**  
   Rename slug - отдельное действие с транзакционным обновлением ссылок и slug-history/redirect.

2. **`situations` = CMS-разделы.**  
   Блок выбирает `content_sections`, использует `icon_image_url`, fallback - инициалы/нейтральная иконка. Материалы внутри раздела настраиваются в CMS.

3. **Пустой видимый блок на runtime может не рендериться.**  
   В настройках это должно быть явно видно: "Блок включен, но пациент его не увидит, пока нет видимых элементов".

4. **Создание из блока должно возвращать редактора в контекст блока.**  
   Для разделов - inline-create в настройке блока. Для тяжелых сущностей (курс, полноценный материал) допустим быстрый draft + ссылка "Дописать в CMS" или переход в CMS с return flow.

5. **Работы идут малыми фазами.**  
   Сначала диагностика и термины, потом единый block editor, затем inline-create, потом безопасный slug rename.

6. **Не смешивать с визуальным редизайном пациента.**  
   Эта инициатива может читать patient runtime для понимания контрактов, но не меняет visual primitives, shell/nav или внешний вид patient home cards.

## Ветка выполнения

Рекомендуемая рабочая ветка для EXEC/FIX:

`patient-home-cms-workflow-initiative`

Если ветка не существует — создать от актуальной ветки разработки перед стартом Phase 0 EXEC.

## Основные затрагиваемые зоны

- `apps/webapp/src/app/app/doctor/patient-home/page.tsx`
- `apps/webapp/src/app/app/settings/patient-home/*`
- `apps/webapp/src/app/app/doctor/content/sections/*`
- `apps/webapp/src/modules/patient-home/*`
- `apps/webapp/src/infra/repos/pgContentSections.ts`
- `apps/webapp/db/schema/*`
- `apps/webapp/db/drizzle-migrations/*`

## Связь с `PATIENT_APP_VISUAL_REDESIGN_INITIATIVE`

`PATIENT_APP_VISUAL_REDESIGN_INITIATIVE` отвечает за внешний вид пациентского приложения: shell, навигацию, shared patient primitives и карточки главной. Эта CMS-workflow инициатива отвечает за редакторскую систему наполнения главной и CMS-разделы.

Если обе инициативы активны параллельно:

- выполнять их в разных ветках;
- не объединять фазы и prompt-файлы;
- visual-ветка не меняет CMS contracts, migrations, services/repos/API routes;
- CMS-workflow ветка не меняет patient visual tokens, shell/nav и card styling;
- возможные merge conflicts ожидаемы только вокруг тестов или shared imports, но не вокруг продуктового источника данных.

## Правила исполнения

- Новые DB runtime-запросы - через Drizzle ORM.
- `modules/*` не импортируют infra/db/repos напрямую.
- Route handlers и server actions остаются тонкими.
- Новые setting keys не добавлять без реальной необходимости; интеграционные настройки не в env.
- Перед push: `pnpm install --frozen-lockfile && pnpm run ci`.

