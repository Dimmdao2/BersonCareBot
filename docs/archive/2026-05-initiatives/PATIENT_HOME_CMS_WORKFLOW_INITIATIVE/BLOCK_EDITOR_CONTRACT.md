# BLOCK_EDITOR_CONTRACT

Документ Phase 0: единый контракт редактора блоков главной пациента для последующих фаз `PATIENT_HOME_CMS_WORKFLOW_INITIATIVE`.

## Нормативный источник

- Продуктовые решения и резолвинг целей: `docs/archive/2026-05-initiatives/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/MASTER_PLAN.md` (§1.1 runtime, §2.1–2.4).
- SoT данных: `docs/archive/2026-05-initiatives/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/README.md` (`patient_home_blocks`, `patient_home_block_items`, CMS-таблицы).

Колонка **allowed target types** ниже согласована с `MASTER_PLAN.md` §1.1 (карта `patientHomeResolvers`). Источник кодов и типов целей в репозитории: `apps/webapp/src/modules/patient-home/blocks.ts` (Phase 1); при расхождении с таблицей — обновить документ или код (см. раздел «Обязательная повторная верификация» §A).

## Аудит снимка репозитория (Phase 0 → Phase 1)

**Phase 0:** пути из `00_AUDIT_UX_CONTRACT_PLAN.md` для модульных резолверов (`patientHomeResolvers.ts` и т.д.) и таблицы `patient_home_*` в `apps/webapp/db` на момент аудита **не** были в дереве; главная `/app/patient` собиралась из `page.tsx` / `PatientHomeToday.tsx` без `patient_home_blocks`.

**Phase 1:** добавлены `apps/webapp/src/app/app/settings/patient-home/*`, `patientHomeUnresolvedRefs.ts`, `blocks.ts`, экран `doctor/patient-home` — редакторский слой **появился**, привязка к БД `patient_home_*` и полноценные резолверы остаются для следующих фаз.

**Phase 2:** единая модалка «Настроить» (`PatientHomeBlockEditorDialog`) объединяет видимость блока, превью, список элементов (reorder / hide / delete / repair-CTA) и picker кандидатов; отдельные модалки add/repair сведены к реэкспортам на тот же компонент. Server actions в `settings/patient-home/actions.ts` на момент Phase 2 — **заглушки** (`revalidatePath` без записи в `patient_home_*`); целевой repair с выбором новой цели — в последующих фазах (см. `AUDIT_PHASE_2.md`).

Ниже таблица по-прежнему описывает **целевой** контракт инициативы (runtime по `MASTER_PLAN.md`), а не только текущую легаси-сборку `page.tsx`.

## Таблица контракта (целевой редактор + runtime)

| code | title (admin copy) | allowed target types | item noun (RU) | add action label | can manage items | empty preview behavior | empty runtime behavior | missing target behavior | inline create status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `situations` | Быстрые ситуации (разделы) | `content_section` | раздел | Добавить раздел | yes | Если блок включён и нет видимых элементов: в превью явно указать, что на главной пациента блок не появится, пока нет видимых элементов (см. Phase 1 в MASTER_PLAN). Если блок скрыт — указать, что пациенты блок не увидят. | При нуле резолвящихся элементов блок на runtime обычно **не рендерится** (правило MASTER_PLAN §2.1). | Элемент с битой/скрытой/неопубликованной целью не попадает в выдачу; в админке — диагностика «неразрешённая ссылка» и сценарий repair/create для разделов где применимо. | **full** для разделов (MASTER_PLAN §2.3: inline-create для `content_section` обязателен в финале). |
| `daily_warmup` | Разминка дня (hero) | `content_page` | материал | Добавить материал | yes | Как для остальных контентных блоков: включён без элементов — предупреждение о невидимости на главной; скрыт — про скрытие. | **Исключение** (MASTER_PLAN §2.1): на runtime сохраняется «полированный» пустой hero-состояние, если блок предусмотрен продуктом, даже без элементов (не регрессировать существующий UX). | Битая страница исключается из резолва; в админке — причина + repair/переход в CMS. | **partial** (MASTER_PLAN §2.3: фаза 1 — создание в CMS с `returnTo`/черновик; не обязательно полный inline draft сразу). |
| `useful_post` | Полезный пост | `content_page` | материал | Выбрать материал | yes | Как для контентных блоков с item-list: включён без валидной CMS-страницы — предупреждение/empty preview. В настройках item есть галочки `show_title` («Отображать заголовок текстом») и бейдж «Новый пост». | Без резолвящейся CMS-страницы блок **не рендерится** на главной пациента. Бейдж «Новый пост» хранится в `patient_home_block_items.badge_label`, видимость текстового заголовка — в `patient_home_block_items.show_title`. | Битая страница исключается из резолва; в админке — repair/переход в CMS. | **partial** (страница через CMS / return flow; без inline draft в редакторе блока). |
| `subscription_carousel` | Подписки и уведомления | `content_section`, `content_page`, `course` | раздел / материал / курс | Добавить раздел / материал / курс | yes | Диагностика пустого включённого блока — как выше. | Без резолвящихся элементов блок **может не показываться** пациенту (общее правило §2.1). | Смешанные типы: неразрешённая цель не рендерится в карусели; админка показывает тип и причину. | **partial** (разные типы целей; курсы и тяжёлые материалы — через return flow, MASTER_PLAN §2.3). |
| `sos` | Если болит сейчас | `content_section`, `content_page` | раздел или материал | Добавить раздел или материал | yes | Пустой включённый блок — явное объяснение невидимости на главной. | Нет валидных целей — блок **может не рендериться** (аналогично §2.1 для контентных блоков с нулём items). | Emergency/CMS-цель не найдена — элемент пропускается; копирайт/CTA могут иметь fallback-маршруты по продуктовым правилам; в админке — repair. | **partial** (inline для раздела; страница — через CMS/return по §2.3). |
| `courses` | Курсы | `course` | курс | Добавить курс | yes | Пустой включённый список — предупреждение о невидимости ряда курсов на главной. | Ноль опубликованных/видимых курсов в блоке — ряд **не показывается**. | Неопубликованный или отсутствующий курс не попадает в список; в админке — статус и действия (не путать с оплатой/gate — вне scope инициативы). | **partial** (MASTER_PLAN §2.3: не создавать полный курс inline без безопасного переиспользования формы; return flow + авто-добавление после выбора). |

## Согласованность с терминологией (MASTER_PLAN §2.4)

- Для `situations` в UI недопустимо обобщённое «материал» в значении CMS-раздела: использовать **раздел**.
- `daily_warmup` и `useful_post` — только **материал** (`content_page`); `useful_post` без hero-пустого исключения: без валидной страницы блок на главной скрыт.
- `subscription_carousel` и `sos` — составные подписи к действию добавления, отражающие union типов.

## Заметки для следующих фаз

- После ввода `blocks.ts` / `getPatientHomeBlockEditorMetadata` сверить enum `PatientHomeBlockCode` и матрицу типов с колонкой **allowed target types**.
- При склейке легаси-`page.tsx` с `patient_home_blocks` заново пройти колонки **empty runtime** и **missing target** по фактическому коду резолверов и обновить этот документ.
- **Phase 1 (2026-04-29):** копирайт кнопок/превью/диалогов зафиксирован в `blockEditorMetadata.ts` и UI `settings/patient-home/*`; при изменении продуктовых формулировок синхронизировать с этой таблицей.
- **Phase 2 (2026-04-29, FIX):** один вход «Настроить» на карточке блока; превью в диалоге остаётся текстовым (не интерактивная миниатюра runtime). Текущий **repair** в UI до персистентных данных — заглушка (оптимистичное обновление демо-строки + `repairPatientHomeBlockItemAction`); нормативное поведение из колонки **missing target** таблицы — после подключения БД и сценария выбора цели / CMS-return.
- **Phase 3 (2026-04-29):** inline-create раздела (`content_section`) из редактора для пустого списка кандидатов «Ситуации»: server action `createContentSectionForPatientHomeBlock` + форма в диалоге; привязка строки к `patient_home_block_items` и колонки медиа у `content_sections` — после миграций; URL медиа валидируются политикой до сохранения схемы.
- **Phase 5 (2026-04-29):** из `PatientHomeBlockCandidatePicker` — ссылки «Создать материал в CMS» (`/app/doctor/content/new?returnTo=…&patientHomeBlock=…`), «Создать курс» (`/app/doctor/courses/new?…`), «Создать раздел» (`/app/doctor/content/sections/new?…`); для `subscription_carousel` — сгруппированные CTA по типам; после сохранения новой страницы — баннер возврата на экран настройки главной (`ContentForm` + `parsePatientHomeCmsReturnQuery`). Черновик курса: `/app/doctor/courses/new` + POST `/api/doctor/courses` (модель курса не менялась).

## Обязательная повторная верификация (AUDIT_PHASE_0 §2, FIX)

Выполнить при появлении целевого кода на ветке; закрывает обязательные пункты аудита, которые нельзя было выполнить при частичном дереве.

### A. `blocks.ts` и резолверы

После появления в репозитории `apps/webapp/src/modules/patient-home/blocks.ts` и файлов резолвинга (как минимум `patientHomeResolvers.ts` или эквивалент по фактической структуре модуля):

1. Сверить каждый `PatientHomeBlockCode` и допустимые типы целей с колонкой **allowed target types** в таблице выше.
2. При расхождении с `MASTER_PLAN.md` §1.1 — обновить **либо** эту таблицу, **либо** код и зафиксировать решение в PR (не оставлять молчаливый дрейф).

### B. Редактор и `patientHomeUnresolvedRefs`

Пути `apps/webapp/src/app/app/settings/patient-home/*`, `patientHomeUnresolvedRefs.ts` и экран `doctor/patient-home` появились в **Phase 1**. При дальнейшем изменении резолвинга, превью или списка файлов из `00_AUDIT_UX_CONTRACT_PLAN.md` (**Code Areas To Review**):

1. Прочитать все файлы из этой секции (актуальный список путей на момент проверки).
2. Сверить фактическое поведение **empty runtime** и **missing target** с колонками таблицы; при расхождении с `MASTER_PLAN.md` — обновить таблицу и/или план отдельным согласованным изменением.

## Обязательная повторная верификация (AUDIT_PHASE_1 §2, FIX)

Чеклист `01_DIAGNOSTICS_LABELS_PLAN.md` (**No functional regression in existing add/edit/reorder/repair actions**) на момент Phase 1 был закрыт **условно**: целевых server actions ещё не было.

**Уточнение Phase 2 FIX (2026-04-29):** в репозитории появились server actions `reorderPatientHomeBlockItemsAction`, `togglePatientHomeBlockItemVisibilityAction`, `deletePatientHomeBlockItemAction`, `repairPatientHomeBlockItemAction`, `setPatientHomeBlockVisibilityAction` с побочным эффектом только `revalidatePath` (записи в `patient_home_*` нет). Пункты 1–3 ниже по-прежнему означают **полный** smoke и персистенцию после появления таблиц и реализации actions; до этого строка чеклиста Phase 1 в `AUDIT_PHASE_1.md` остаётся **условно да** с отсылкой к `AUDIT_PHASE_2.md` §8.

После появления операций с побочными эффектами, **включая запись в БД** (добавление / редактирование списка / порядок / repair элементов блоков):

1. Выполнить smoke по четырём сценариям (add, edit списка, reorder, repair) и зафиксировать результат в `LOG.md` или в PR.
2. Прогнать релевантные автотесты (`vitest` для затронутых файлов) и при необходимости дополнить RTL, если копирайт зависит от исхода действия.
3. Обновить запись в `AUDIT_PHASE_1.md` (таблица чеклиста, строка про регрессию) с **Да**, когда проверки выполнены на ветке с полным workflow.
