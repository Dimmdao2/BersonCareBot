# BACKLOG_TAILS

Короткий операционный список хвостов, которые удобно держать под рукой вне папок инициатив.

Дата фиксации: 2026-05-01.

## Критичные хвосты (закрыть первыми)

- Нет открытых критичных хвостов по состоянию на 2026-05-01.

## Средние хвосты

- `TREATMENT_PROGRAM_INITIATIVE` (архив): планово разгребать `LEGACY_CLEANUP_BACKLOG.md` (старые boundary-нарушения, не блокируют runtime).
- `PATIENT_HOME_REDESIGN_INITIATIVE` (архив): остаточная pixel-полировка пустых состояний и микро-UX мелочи (не блокеры).

## Низкий приоритет / наблюдение

- `PATIENT_APP_SHADCN_ALIGNMENT_INITIATIVE`: пока docs-only backlog, стартовать только отдельным решением.
- Deferred patient routes (`/messages`, `/emergency`, `/lessons`, `/address`, `/intake/*`, booking landing): покрывать в будущих фазах `APP_RESTRUCTURE_INITIATIVE` только если маршруты сохраняются в целевой IA.
- `VIDEO_HLS_DELIVERY`: крупная инфраструктурная инициатива, пока в состоянии проектирования (без кода).
- `APP_RESTRUCTURE_INITIATIVE` — **этапы 2–9** по [`RECOMMENDATIONS_AND_ROADMAP.md`](APP_RESTRUCTURE_INITIATIVE/RECOMMENDATIONS_AND_ROADMAP.md) (CMS `kind`, хаб, уведомления, ядро пациента и т.д.).
- `APP_RESTRUCTURE_INITIATIVE` — **этап 9 «PROGRAM_PATIENT_SHAPE»** (новая модель плана лечения): docs зафиксированы 2026-05-03, см. [`APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md`](APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md). Нарезка A1–A5; реализация — после согласования open questions §5 плана.
- `COURSES_INITIATIVE` (геткурс-модель): docs зафиксированы 2026-05-03, см. [`COURSES_INITIATIVE/README.md`](COURSES_INITIATIVE/README.md). Стартует **последней**, после ядра пациентского `PROGRAM_PATIENT_SHAPE_PLAN` и оплаты.

### Хвосты по «Плану лечения» / «Курсам» (2026-05-03)

- **Расписание** структурированное (дни недели/время) для групп этапа — **conditional**: после накопления feedback пациентов/врачей за 2–3 месяца после релиза групп (этап A3).
- **Push в бот** о назначении / изменении плана / переходе этапа — отдельный контур интегратора, после A5.
- **PWA-push** — после запуска web-push.
- **Cross-stage детекция бейджа «Новое»** (если тот же `item_ref_id` уже видели в прошлом этапе) — по запросу.
- **Метрики выполнения** (compliance %, skip-streak, per-group compliance) — на базе `program_action_log` (этап A4); отдельный экран статистики у врача.
- **Галочки выполнения по каждому упражнению внутри комплекса** как отдельные записи `program_action_log` — повышение грануляности; по запросу клиники.
- **Шкала боли** отдельно от «тяжести» в форме оценки занятия — по запросу клиники.
- **Сертификаты курсов**, промокоды, реферальные ссылки — backlog `COURSES_INITIATIVE` C-A6.

### APP_RESTRUCTURE — хвосты этапа 1 (2026-05-01)

- **Ops:** перед первым применением `0016_drop_news_broadcast_channels` на БД с ценными строками `news_items` — readonly выгрузка и фиксация в тикете/хранилище (в репо артефакт не коммитится); см. [`LOG.md`](APP_RESTRUCTURE_INITIATIVE/LOG.md) §«Этап 1».
- **Продукт/интеграция:** массовая доставка по выбранным `channels` после записи в `broadcast_audit` — отдельный контур (сейчас UI и аудит фиксируют намерение).
- **Архитектура:** мутации мотивации в [`motivation/actions.ts`](../apps/webapp/src/app/app/doctor/content/motivation/actions.ts) (raw SQL) — вынести в порт/DI; baseline [`STRUCTURE_AUDIT.md`](APP_RESTRUCTURE_INITIATIVE/STRUCTURE_AUDIT.md) §III по news/RSC не обновлять (immutable).

### Хвосты ASSIGNMENT_CATALOGS / defer-wave (2026-05-04)

- **`clinical_tests.scoring_config`:** решение владельца — колонка **не нужна**; инженерный follow-up: миграция `DROP` + чистка кода (см. [`APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md`](APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md) §7).
- **`recommendations.domain` → `kind` (D5):** **отложено**; см. [`ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/STAGE_D5_PLAN.md`](ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/STAGE_D5_PLAN.md).

## Что уже перенесено в архив (2026-05-01)

- `PATIENT_HOME_REDESIGN_INITIATIVE`
- `PATIENT_APP_VISUAL_REDESIGN_INITIATIVE`
- `PATIENT_APP_STYLE_TRANSFER_INITIATIVE`
- `TREATMENT_PROGRAM_INITIATIVE`
- `PATIENT_APP_PAGES_VISUAL_REDESIGN_INITIATIVE` (пустая папка-призрак)
- `PATIENT_HOME_CMS_WORKFLOW_INITIATIVE` (принято текущее состояние; см. `archive/2026-05-initiatives/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/LOG.md`)
