# BACKLOG_TAILS

Короткий операционный список хвостов, которые удобно держать под рукой вне папок инициатив.

Дата фиксации: 2026-05-01.

## Критичные хвосты (закрыть первыми)

- Нет открытых критичных хвостов по состоянию на 2026-05-01.

## Средние хвосты

- **`INTEGRATOR_DRIZZLE_MIGRATION`:** активные планы в `.cursor/plans/integrator_drizzle_*.plan.md`, журнал — `docs/INTEGRATOR_DRIZZLE_MIGRATION/LOG.md`.
- `TREATMENT_PROGRAM_INITIATIVE` (архив): планово разгребать `LEGACY_CLEANUP_BACKLOG.md` (старые boundary-нарушения, не блокируют runtime).
- `PATIENT_HOME_REDESIGN_INITIATIVE` (архив): остаточная pixel-полировка пустых состояний и микро-UX мелочи (не блокеры).

## Низкий приоритет / наблюдение

- `PATIENT_APP_SHADCN_ALIGNMENT_INITIATIVE` — **архив** (2026-05-05): [`archive/2026-05-initiatives/PATIENT_APP_SHADCN_ALIGNMENT_INITIATIVE/README.md`](archive/2026-05-initiatives/PATIENT_APP_SHADCN_ALIGNMENT_INITIATIVE/README.md); дальнейшие UI-проходы — в мини-инициативах по экрану, см. [`APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md`](APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md) §1 п.4.
- Deferred patient routes (`/messages`, `/emergency`, `/lessons`, `/address`, `/intake/*`, booking landing): покрывать в будущих фазах `APP_RESTRUCTURE_INITIATIVE` только если маршруты сохраняются в целевой IA.
- `VIDEO_HLS_DELIVERY`: реализованы playback JSON, same-origin прокси HLS (`GET /api/media/[id]/hls/...`), пайплайн в **`apps/media-worker`**, см. архив [`VIDEO_HLS_DELIVERY/README.md`](archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/README.md) и operational log [`HLS_PROXY_DELIVERY_LOG.md`](archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/HLS_PROXY_DELIVERY_LOG.md).
- **`TREATMENT_PROGRAM_LFK_TEMPLATE_EXPAND`** (архив): журнал и блок «Не делали» — [`archive/2026-05-initiatives/TREATMENT_PROGRAM_LFK_TEMPLATE_EXPAND/LOG.md`](archive/2026-05-initiatives/TREATMENT_PROGRAM_LFK_TEMPLATE_EXPAND/LOG.md); post-prod legacy — [`TREATMENT_PROGRAM_LFK_TEMPLATE_LEGACY_TODO.md`](TREATMENT_PROGRAM_LFK_TEMPLATE_LEGACY_TODO.md).
- `APP_RESTRUCTURE_INITIATIVE` — **этапы 2–9** по [`RECOMMENDATIONS_AND_ROADMAP.md`](APP_RESTRUCTURE_INITIATIVE/RECOMMENDATIONS_AND_ROADMAP.md) (CMS `kind`, хаб, уведомления, ядро пациента и т.д.).
- `APP_RESTRUCTURE_INITIATIVE` — **этап 9 «PROGRAM_PATIENT_SHAPE»** (новая модель плана лечения): продуктовое ТЗ [`APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md`](APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md); execution A1–A5 закрыт — см. [`archive/2026-05-initiatives/PROGRAM_PATIENT_SHAPE_INITIATIVE/README.md`](archive/2026-05-initiatives/PROGRAM_PATIENT_SHAPE_INITIATIVE/README.md).
- `COURSES_INITIATIVE` (геткурс-модель): docs зафиксированы 2026-05-03, см. [`COURSES_INITIATIVE/README.md`](COURSES_INITIATIVE/README.md). Стартует **последней**, после ядра пациентского `PROGRAM_PATIENT_SHAPE_PLAN` и оплаты.

### Хвосты по «Плану лечения» / «Курсам» (2026-05-03)

- **Расписание** структурированное (дни недели/время) для групп этапа — **conditional**: после накопления feedback пациентов/врачей за 2–3 месяца после релиза групп (этап A3).
- **Контроли по этапу (post-MVP):** перейти от «одной вычисляемой даты контроля» к модели нескольких контролей внутри этапа (history/reschedule/next-control) с явной отметкой прохождения каждого контроля.
- **Комментарий к факту выполнения (post-MVP):** добавить пациентский `note` для факта выполнения `exercise` / `lesson` / actionable `recommendation` (сейчас note есть только в LFK post-session).
- **Push в бот** о назначении / изменении плана / переходе этапа — отдельный контур интегратора, после A5.
- **PWA-push** — после запуска web-push.
- **Cross-stage детекция бейджа «Новое»** (если тот же `item_ref_id` уже видели в прошлом этапе) — по запросу.
- **Метрики выполнения** (compliance %, skip-streak, per-group compliance) — на базе `program_action_log` (этап A4); отдельный экран статистики у врача.
- **Отдельные строки `program_action_log` на упражнение внутри ЛФК-комплекса** (`lfk_exercise_done`, ключ активности `:ex:`) и **несколько сессий за календарный день** — в продукте с 2026-05-06; отдельный врачебный дашборд по агрегатам — по запросу.
- **Шкала боли** отдельно от «тяжести» в форме оценки занятия — по запросу клиники.
- **Сертификаты курсов**, промокоды, реферальные ссылки — backlog `COURSES_INITIATIVE` C-A6.

### APP_RESTRUCTURE — хвосты этапа 1 (2026-05-01)

- **Ops:** перед первым применением `0016_drop_news_broadcast_channels` на БД с ценными строками `news_items` — readonly выгрузка и фиксация в тикете/хранилище (в репо артефакт не коммитится); см. [`LOG.md`](APP_RESTRUCTURE_INITIATIVE/LOG.md) §«Этап 1».
- **Продукт/интеграция:** массовая доставка по выбранным `channels` после записи в `broadcast_audit` — отдельный контур (сейчас UI и аудит фиксируют намерение). Поведение превью / `dev_mode` / журнал: [`ARCHITECTURE/DOCTOR_BROADCASTS.md`](ARCHITECTURE/DOCTOR_BROADCASTS.md).
- **Архитектура:** мутации мотивации в [`motivation/actions.ts`](../apps/webapp/src/app/app/doctor/content/motivation/actions.ts) (raw SQL) — вынести в порт/DI; baseline [`STRUCTURE_AUDIT.md`](APP_RESTRUCTURE_INITIATIVE/STRUCTURE_AUDIT.md) §III по news/RSC не обновлять (immutable).

### Хвосты ASSIGNMENT_CATALOGS / defer-wave (2026-05-04)

- **`tests.scoring_config`:** колонка **не нужна**; в репо — миграция **`0040`**, код обновлён; **dev** — миграции прогнаны. **Prod** — при деплое (см. [`APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md`](APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md) §7, [`AUDIT_DEFER_CLOSURE_GLOBAL.md`](archive/2026-05-initiatives/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/AUDIT_DEFER_CLOSURE_GLOBAL.md) §8).
- **`recommendations.domain` → `kind` (D5):** **отложено (owner pause)**; при возобновлении — см. таблицу **TODO** в [`DEFER_CLOSURE_MASTER_PLAN.md`](archive/2026-05-initiatives/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/DEFER_CLOSURE_MASTER_PLAN.md) §8 и [`STAGE_D5_PLAN.md`](archive/2026-05-initiatives/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/STAGE_D5_PLAN.md).

## Что уже перенесено в архив (2026-05-01)

- `PATIENT_HOME_REDESIGN_INITIATIVE`
- `PATIENT_APP_VISUAL_REDESIGN_INITIATIVE`
- `PATIENT_APP_STYLE_TRANSFER_INITIATIVE`
- `TREATMENT_PROGRAM_INITIATIVE`
- `PATIENT_APP_PAGES_VISUAL_REDESIGN_INITIATIVE` (пустая папка-призрак)
- `PATIENT_HOME_CMS_WORKFLOW_INITIATIVE` (принято текущее состояние; см. `archive/2026-05-initiatives/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/LOG.md`)
- `PROGRAM_PATIENT_SHAPE_INITIATIVE` (execution A1–A5 закрыт; см. `archive/2026-05-initiatives/PROGRAM_PATIENT_SHAPE_INITIATIVE/`)
- `ASSIGNMENT_CATALOGS_REWORK_INITIATIVE` (execution B1–B7 + defer-wave D1–D6 закрыты в доках; см. `archive/2026-05-initiatives/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/`)

**Дополнительно (2026-05-14):** в `docs/archive/2026-05-initiatives/` перенесены **WEBAPP_MIGRATIONS_DRIZZLE_UNIFICATION_INITIATIVE**, **PATIENT_REMINDER_UX_INITIATIVE**, **PATIENT_SHELL_MD_BREAKPOINT**, **PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE**, **TREATMENT_PROGRAM_LFK_TEMPLATE_EXPAND**; закрытые Cursor-планы — `.cursor/plans/archive/`.
