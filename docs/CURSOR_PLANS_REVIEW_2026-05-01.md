# CURSOR_PLANS_REVIEW_2026-05-01

## Для агентов (не путать контексты)

- Этот файл описывает планы в **домашнем каталоге Cursor** `~/.cursor/plans` (на машине пользователя), **а не** единственный источник правды по репозиторию.
- **В репозитории BersonCareBot** отдельное дерево: **`<репо>/.cursor/plans/`** — см. [`.cursor/plans/archive/README.md`](../.cursor/plans/archive/README.md). Пример закрытого трека в корне репо: **Integrator → Drizzle** (2026-05-15, `integrator_drizzle_*.plan.md` + [`docs/INTEGRATOR_DRIZZLE_MIGRATION/LOG.md`](INTEGRATOR_DRIZZLE_MIGRATION/LOG.md)); закрытое по методологии — в **`<репо>/.cursor/plans/archive/`**.
- Ниже по тексту — **архивный снимок методики и таблиц на 2026-05-01**; счётчики и «активные в корне» для **`~/.cursor/plans`** после уборок **2026-05-01** и **2026-05-14** не совпадают с промежуточными цифрами в таблицах. Актуальное правило уборки домашнего каталога — блок **«2026-05-14»** в конце и [`docs/TODO.md`](TODO.md) §Cursor-планы.
- Исторически в корне **`~/.cursor/plans`** иногда держали и полностью закрытые structured-планы; **сейчас** такие уносят в **`~/.cursor/plans/archive/*-closed/`**, чтобы в корне оставались в основном открытые треки.

Ревизия планов из **`~/.cursor/plans`**: подкаталоги `archive/*` — закрытые и устаревшие копии; после 2026-05-14 волна **`archive/2026-05-14-closed/`** дополняет **`2026-05-01-closed/`**.

## Методика и ограничения

- **Быстрые маркеры:** блок `todos` во frontmatter (`pending` / `in_progress` / `completed` / `cancelled`), при наличии — поле `status`/`completed_at` у плана.
- **Явно не закрытые планы** не стоит оценивать «только по коду»: полезнее **журналы выполнения** (инициативные `LOG.md`, `AGENT_EXECUTION_LOG`, коммиты). Расхождение с текущим кодом часто означает, что работа по плану была сделана, а затем область **переехала или переписана**: план морально устарел, а YAML не обновляли.

## Storylama (соседний репозиторий)

**Storylama** — отдельный проект рядом с BersonCare; часть `.plan.md` была записана с **перепутанным окном Cursor** (в ссылках — `dev-projects/storylama` или в заголовке явно **StoryLama**). Такие файлы помечены **`status: obsolete`** и перенесены в **`archive/2026-05-01-obsolete/`**:

- `stage0-foundation-plan_17402226.plan.md`, `stage1-overview-microplan_73e1be87.plan.md`
- `stage_10_mailing_plan_8e68e4b6.plan.md`, `stage_10_remediation_2003bdbf.plan.md`, `stage_10_remediation_b6d8c899.plan.md`
- `stage_11_tenants_plan_1762cacb.plan.md`
- `theme-standardization_2f5b3077.plan.md`, `theme-standardization_78e0ff4b.plan.md`

Ранее в obsolete уже лежали: `storylama_cleanup_plan_388c3629.plan.md`, `web_ui_audit_and_fix_faf118b8.plan.md` и др. (см. таблицы ниже).

## Архив: волна 2026-05-01 (все планы без структурированных `todos`)

Все активные файлы, у которых во frontmatter **нет** списка вида `todos:` + пунктов `- id:`, помечены **`status: obsolete`** и перенесены в **`archive/2026-05-01-obsolete/`** — в том числе roadmap/stage/MVP/auth/CMS/**`locale_and_translations`** и остальные «текстовые» планы. Исключений по Storylama не делалось: критерий единый (**нет `- id:` в todos**).

## Архив: волна 2026-05-01 (первая прогонка)

- В **`archive/2026-05-01-closed/`** перенесены планы с полностью закрытыми todos (без `pending`/`in_progress`).
- В **`archive/2026-05-01-obsolete/`** — дубликаты и морально устаревшие варианты (см. список в конце первой версии обзора: bigbang-restructure, isolation-orchestration, worker_retries, webapp_v1, landing_redesign, finalize_domain_migration, `webapp_startup_optimization_71cef5bc` и т.д.).

## Архив: волна 2026-05-01 (дополнение — закрыты по todos, доведён общий статус)

Помечены в чек-листе `completed` / `status: completed` (где не было) и перенесены в **`archive/2026-05-01-closed/`**:

| Файл | Комментарий |
|------|----------------|
| `bersoncare_full_decomposition_18eb957a.plan.md` | Уже был `status: completed`; добавлен `completed_at`. |
| `patient_ui_standards_e00a01f5.plan.md` | Все todos `completed` → план закрыт. |
| `patient_nav_fab_removal_bab577f9.plan.md` | Часть пунктов `cancelled` по решению; план закрыт с `executionNote`. |
| `unified-media-preview-click-pattern_df9abc7e.plan.md` | Все рабочие todos `completed` / отмена осознанная. |
| `bot_menu_and_max_start_parity_10a46796.plan.md` | Все фазы закрыты или `cancelled`. |
| `media_upload_&_attachment_377d865c.plan.md` | Все фазы закрыты или `cancelled`. |

В **`archive/2026-05-01-obsolete/`** (пустые или дублирующие закрытый контент):

| Файл | Причина |
|------|---------|
| `fix_migration_orchestration_bedc03f1.plan.md` | Пустой `todos: []` и тело; актуальный закрытый план — `archive/2026-05-01-closed/fix_migration_orchestration_a945a419.plan.md`. |
| `media_upload_&_attachment_fa8fcec0.plan.md` | Пустой stub; полный план — закрытый `media_upload_&_attachment_377d865c` в том же архиве. |

## Архив: волна 2026-05-01 (частично закрытые + Storylama)

Помечены **`status: obsolete`** + `obsolete_reason` / `obsolete_at` и перенесены в **`archive/2026-05-01-obsolete/`**:

| Файл | Пометка |
|------|---------|
| `platform_user_merge_&_dedup_a6e3f1c6.plan.md` | Частично по YAML; дальше — по `docs/ARCHITECTURE/PLATFORM_USER_MERGE.md` и логам. |
| `s3_media_storage_migration_fd9e71d1.plan.md` | Частично; остаток presign/confirm — по текущему коду и деплой-докам. |
| `web_ui_audit_and_fix_faf118b8.plan.md` | Частично; чек-лист ориентирован на старый webapp/Storylama-наследие в структуре экранов. |
| `storylama_cleanup_plan_388c3629.plan.md` | План стабилизации репозитория **Storylama**; для BersonCare не ведётся. |
| `лёгкий,_быстрый_и_стабильный_вход_на_всех_платформах_edb6e13c.plan.md` | Инженерные todos закрыты; оставался только блок ручной верификации — не держим как активный трекер. |

## Счётчики (**снимок на конец ревизии 2026-05-01**, только домашний `~/.cursor/plans`)

- **`~/.cursor/plans/archive/2026-05-01-closed/`:** 187 файлов.
- **`~/.cursor/plans/archive/2026-05-01-obsolete/`:** 70 файлов.
- **В корне** `~/.cursor/plans` на ту дату насчитано **5** `*.plan.md` со structured `todos` по методике ревизии (после волны **2026-05-14** состав корня и числа **другие** — см. блок в конце документа).

## Ранее разобранные точечные кейсы

### `webapp_startup_optimization_71cef5bc.plan.md`

Уже в **`archive/2026-05-01-obsolete/`** — морально устарел относительно трека стабильного входа и закрытых auth-работ.

### `integration-keys-db-admin_fffecfed.plan.md`

По состоянию на **2026-05-01** оставался **активным** в корне `~/.cursor/plans` (переход интеграций на DB-backed runtime + admin, `system_settings`). Перед работой сверить **текущее** наличие файла в корне или в `archive/*` на своей машине. В теле плана — секция **«Проверка кода (2026-05-01)»**.

## Активные планы — историческая таблица (**снимок 2026-05-01**, домашний `~/.cursor/plans`)

Дата **`mtime`** — последнее изменение файла на диске (в планах часто нет поля `created:`).

На дату снимка в корне рассматривали **только** планы со **структурированным** списком `todos` / `- id:`.

| Файл | Открытых по YAML | Заметка |
|------|------------------|---------|
| `rubitime_booking_rework_d75a62d4.plan.md` | 7 `pending` | Основной открытый трек по очной записи / каталогу. |
| `integration-keys-db-admin_fffecfed.plan.md` | 6 `pending` | DB-backed интеграционные ключи. |
| `notifications_topics_system_settings_450b7cc3.plan.md` | 6 `pending` на снимке | Темы рассылок в `system_settings`; при последующем закрытии всех todo файл переносился в `2026-05-14-closed` (см. каталог на диске). |
| `fix-booking-rubitime_ad1df272.plan.md` | 0 (все `done`) | Перенесён **2026-05-14** в `~/.cursor/plans/archive/2026-05-14-closed/`. |
| `quick_durable_ia_cleanup_e4cbf8dd.plan.md` | 0 (все `completed`) | Перенесён **2026-05-14** в `~/.cursor/plans/archive/2026-05-14-closed/`. |

**2026-05-14:** из корня **домашнего** каталога дополнительно убрано **67** файлов с полностью закрытыми structured todos (в том числе часть строк выше, не только две последние) — каталог `~/.cursor/plans/archive/2026-05-14-closed/`. Текущий список в корне **не** восстанавливать из этой таблицы — смотреть диск или опираться на **`<репо>/.cursor/plans/`** для задач монорепозитория.

Остальные бывшие «крупные» планы с множеством `pending` (**patient-home visual**, **dev_db merge matrix**, **production masterplan**, **stage 6**, **ui catalog toolbar**, **MAX меню**, **admin media library**, **stage12 hardening**, **stage4 secrets**) помечены **`status: obsolete`** и перенесены в **`archive/2026-05-01-obsolete/`** (для `dev_db_merge_test_matrix` в причине зафиксировано: высокая стоимость / низкая польза).

Убраны из корня как черновики Storylama: `stage0`/`stage1`, stage 10–11 с путями `dev-projects/storylama`, оба `theme-standardization` (см. раздел **Storylama** выше).

Планы **без** структурированного YAML `todos` (`todos: []` или нет `- id:`), включая roadmap/stage/MVP/**`locale_and_translations`** и пр., перенесены в **`obsolete`** одной шестой порцией — см. раздел **«Архив: волна … (все планы без структурированных todos)»** выше.

---

## 2026-05-14 — домашний `~/.cursor/plans`, волна `archive/2026-05-14-closed/`

- Из **корня** `~/.cursor/plans/` перенесены файлы `*.plan.md`, у которых у **всех** structured пунктов `todos` (с полем `id`) статус только `completed` \| `cancelled` \| `done` — **67 файлов** в `~/.cursor/plans/archive/2026-05-14-closed/`.
- В корне после переноса остаются планы с **открытыми** todo (`pending` / `in_progress`) и файлы, у которых нет полностью закрытого набора structured todos (при следующей ревизии — вручную или по тому же правилу).
- Описание каталога: `~/.cursor/plans/archive/2026-05-14-closed/README.md`.

---

*Путь к планам на машине: `/home/dev/.cursor/plans`. Этот файл в репозитории — фиксация методики и снимка состояния на 2026-05-01 (таблицы ниже по смыслу исторические); актуальные пути к архивам IDE — см. блок 2026-05-14 выше и [`docs/TODO.md`](TODO.md) §Cursor-планы.*
