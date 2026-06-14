# Остаточные задачи (follow-ups / хвосты) — единый список

Сведено 2026-06-14 при закрытии чата по треку данных/синхронизации записей. Каждый пункт детализирован в своём доке (ссылка). Booking-sync фиксы F1/F1b/F2/F4/F5 — **сделаны и закоммичены** в `feat/doctor-ui-rebuild` (это список того, что ОСТАЛОСЬ).

## Booking-sync / данные записей

- [ ] **F3 — прод-катовер на canonical** (главное). Деплой+миграция `0119` → diagnose → ручной разбор конфликтов → `backfill … --commit --delete-test --collapse-dups --drop-stale-from-csv [--drop-legacy=…]` → флип `booking_doctor_appointments_read_source` → `canonical`. **Зона: владелец/прод-доступ.** Полная инструкция: [`../OPERATIONS/BOOKING_CANONICAL_CUTOVER.md`](../OPERATIONS/BOOKING_CANONICAL_CUTOVER.md).
- [ ] **Ручной разбор конфликтов на проде** — двойные брони и ошибочные `admin_manual` записи (инстансы overlap-бага) решаются руками по Rubitime CSV (какая запись реальна; ошибочную ручную — удалить через кабинет). Часть F3. Детали + dev-пример: [`../OPERATIONS/BOOKING_CANONICAL_CUTOVER.md` §Ручная обработка](../OPERATIONS/BOOKING_CANONICAL_CUTOVER.md).
- [ ] **GCal + напоминания → читать из canonical** (до отключения Rubitime). Сейчас синхронизируются из сырого Rubitime-вебхука в интеграторе, не из canonical. **Зона: интегратор / `BOOKING_REWORK`.** Детали: [`APPOINTMENTS_PARITY_S0.md`](APPOINTMENTS_PARITY_S0.md) (G4/G5), [`../OPERATIONS/BOOKING_CANONICAL_CUTOVER.md` §После cutover](../OPERATIONS/BOOKING_CANONICAL_CUTOVER.md).
- [ ] **Фильтр `deleted_at IS NULL`** в `pgClientHistory` (история пациента у врача) + `pgDoctorAnalyticsMetricAccounts` (аналитика) — оставлены без фильтра при F1b, soft-deleted может всплыть там. **Низкий приоритет** (не влияет на календарь/слоты/KPI). Детали: [`SYNC_BEHAVIOR_ANALYSIS.md`](SYNC_BEHAVIOR_ANALYSIS.md).

## UI-ребилд кабинета врача (идёт в параллельном чате)

- [ ] **Замечания по реализованным страницам** (shell/«Сегодня»/«Пациенты»/«Расписание»/«Коммуникации») — полный worklist: [`REVIEW_2026-06-13.md`](REVIEW_2026-06-13.md); план по этапам: [`ROADMAP.md`](ROADMAP.md).
- [ ] **Жест «пометить непрочитанным»** в комментариях (свайп/правый клик) — **backlog**, после ядра. См. [`ROADMAP.md` §0 D3](ROADMAP.md).
- [ ] **Отдельная детальная страница «Задачи»** для врача (не в обзорном ревью) — следующий шаг. См. [`REVIEW_2026-06-13.md` §1.3](REVIEW_2026-06-13.md).
- [ ] **Открытые вопросы-проверки**: §1.4 сигналы пациентов (почему пусто — пороги), §3.8 цвет «сегодня» — отвечены/помечены в [`REVIEW_2026-06-13.md`](REVIEW_2026-06-13.md) / [`ROADMAP.md`](ROADMAP.md).

## Прочее
- [ ] **Push + полный CI** ветки `feat/doctor-ui-rebuild` перед мержем в main — по правилам репо (`pre-push-ci`). Push не делался намеренно.

> Дублируется в памяти: `booking-overlap-allowed-bug-2026-06`, `doctor-ui-rebuild-owner-review-2026-06`.
