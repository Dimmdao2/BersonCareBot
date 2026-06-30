# Runbook: канонизация записей на проде (backfill + read-source cutover)

**Что это.** Перевод записей на приём на **единый источник истины — canonical `be_appointments`** (наша БД). Сейчас на проде сосуществуют два хранилища: legacy `appointment_records` (зеркало Rubitime, из него читают список/KPI по дефолту) и canonical `be_appointments` (из него читает календарь). Неполнота canonical порождала: KPI=0, «призраки»/пропажи записей в календаре, и баг «можно записаться на занятый слот» (проверка слота читает только canonical → не видит legacy-only записи). Этот ранбук добивает canonical до полноты, чистит мусор и переключает чтение на canonical.

**Зона/риски.** Пересекается с `BOOKING_REWORK_INITIATIVE` (mirror/cutover) и интегратором (Rubitime sync, Google Calendar). Правила Rubitime-sync не менять. Все правки данных скриптом — **идемпотентные и обратимые** (soft-delete = `deleted_at`, не hard-delete; cutover = флаг настройки).

**Контекст и обоснование:** [`../DOCTOR_UI_REBUILD_REVIEW/APPOINTMENTS_PARITY_S0.md`](../DOCTOR_UI_REBUILD_REVIEW/APPOINTMENTS_PARITY_S0.md), [`../DOCTOR_UI_REBUILD_REVIEW/SYNC_BEHAVIOR_ANALYSIS.md`](../DOCTOR_UI_REBUILD_REVIEW/SYNC_BEHAVIOR_ANALYSIS.md). Источник истины по записям при разборе конфликтов — **Rubitime CSV-выгрузка** `.tmp/rubitime-import/records.csv` (на хосте).

---

## Предусловия
1. **Ветка задеплоена на прод**, включая миграцию **`0119_be_appointments_soft_delete.sql`** (добавляет `be_appointments.deleted_at` + пересобирает overlap-constraint с `deleted_at IS NULL`). Проверить, что миграция применена на prod-БД.
2. **Доступ к prod-БД** через env-файл (см. [`../ARCHITECTURE/SERVER CONVENTIONS.md`](../ARCHITECTURE/SERVER%20CONVENTIONS.md)): `set -a && source /opt/env/bersoncarebot/webapp.prod && set +a`.
3. **Rubitime CSV** (свежая выгрузка, включающая отменённые записи — колонка «Статус») лежит по пути `.tmp/rubitime-import/records.csv` на хосте. CSV должен включать cancelled, иначе детект стале даст ложные срабатывания (см. ниже).
4. Скрипт: `apps/webapp/scripts/backfill-canonical-from-legacy-appointments.ts` (npm-команда `backfill-canonical-from-legacy-appointments`).

> ⚠️ Все прогоны — **скриптом** (dry-run по умолчанию), без ad-hoc SQL. Запуск env-файла обязателен (иначе psql/скрипт уйдёт не в ту БД).

---

## Шаги

### Шаг 1 — Деплой + миграция
Задеплоить ветку. Убедиться, что `0119` применилась на prod (`pg_get_constraintdef` для `be_appointments_specialist_no_overlap` должен содержать `deleted_at IS NULL`).

### Шаг 2 — Диагностика (READ-ONLY, без записи)
```bash
set -a && source /opt/env/bersoncarebot/webapp.prod && set +a
pnpm --dir apps/webapp backfill-canonical-from-legacy-appointments
```
Смотрим вывод:
- `Legacy live` vs `Canonical projection` — масштаб.
- `UNMAPPED legacy` по корзинам (test/block · cancelled · real active · future). **future должно быть ~0** (входящий поток непрерывный); если нет — сигнал, что свежий sync сломан, разобраться до cutover.
- `DUPLICATE clusters` — дубли по (слот+телефон). Флаг `⚠ MULTIPLE canonical` = реальная двойная бронь (редко), требует ручного разбора (раздел ниже).
- `STALE vs Rubitime CSV` — записи, которых нет в выгрузке (в пределах её дат) = удалены/перенесены в Rubitime, у нас зависли.

### Шаг 3 — Ручной разбор конфликтов (ДО записи) — см. раздел «Ручная обработка»
По диагностике решить, что чистить автоматически, а что — руками (двойные брони, ошибочные ручные записи).

### Шаг 4 — Реконсиляция (запись; идемпотентно, soft-delete)
```bash
pnpm --dir apps/webapp backfill-canonical-from-legacy-appointments -- \
  --commit --delete-test --collapse-dups --drop-stale-from-csv \
  --drop-legacy=<подтверждённые_вручную_ext_id_через_запятую>
```
Флаги:
- `--commit` — толерантная per-record проекция (батч НЕ падает на конфликте, собирает их в отчёт «⚠ CONFLICTS»).
- `--delete-test` — мягко удалить тест/блок (`+79189000782` «Берсон», `+70000000000` «БЛОК ОКНА») в legacy **и** canonical.
- `--collapse-dups` — схлопнуть дубли (оставить смапленную→неотменённую→свежую, остальные `deleted_at`); canonical у дублей общий, его НЕ трогает.
- `--drop-stale-from-csv` — мягко удалить стале (отсутствующие в CSV в пределах его дат) в legacy **и** canonical.
- `--drop-legacy=<ids>` — точечно удалить подтверждённые вручную ext-id (legacy+canonical).

### Шаг 5 — Проверка
Повторить Шаг 2 (диагностику) → должно стать **`UNMAPPED 0 / DUPLICATE 0 / STALE 0`**, в «⚠ CONFLICTS» — только то, что осознанно оставили (или 0). Глазами проверить календарь врача на ближайшую неделю (полнота).

### Шаг 6 — Cutover чтения на canonical
Переключить настройку `booking_doctor_appointments_read_source` → `canonical` (через админ-настройки приложения или системную настройку; scope `admin`). После этого список/KPI/календарь читают canonical (полный).

### Шаг 7 — Пост-проверка
- KPI расписания — ненулевые.
- Календарь и «вид списком» — показывают все записи (совпадают со списком в Rubitime).
- Создать тестовую запись на занятый слот → должно отклониться (overlap).

---

## Ручная обработка конфликтов (то, что НЕ чистится автоматически)

Толерантная проекция (`--commit`) не падает, а печатает блок **«⚠ CONFLICTS (N) — skipped, need review»** с `slot · phone · «name» · ext=<id> · <constraint>`. Это записи, которые при проекции в canonical создают пересечение слота. Классификация и действия:

| Тип конфликта | Как опознать | Действие |
|---|---|---|
| **Дубли** (несколько legacy на один реальный слот) | один (слот+телефон), несколько ext-id, `distinct_canonical=1` | `--collapse-dups` (авто) |
| **Тест/блок** | телефон `+79189000782`/`+70000000000`, имя «Берсон»/«БЛОК ОКНА» | `--delete-test` (авто) |
| **Стале** (удалены/перенесены в Rubitime) | есть `STALE vs CSV` / нет в выгрузке | `--drop-stale-from-csv` (авто) |
| **Реальная двойная бронь** (два РАЗНЫХ пациента на один специалист+слот) | оба в CSV как активные, разные телефоны/имена | **РУКАМИ** (ниже) |
| **Ошибочная ручная запись** (`admin_manual`, появилась из-за overlap-бага до фикса F2) | в canonical `source='admin_manual'`, в Rubitime (CSV) её НЕТ | **РУКАМИ** — удалить через кабинет (ниже) |

### Как разбирать вручную (истина = Rubitime CSV, колонка «Сотрудник» = специалист)
1. Взять `ext=<id>` и телефон/имя из строки конфликта.
2. Найти в `records.csv` (`#`=ext-id; поля Сотрудник/Услуга/«Дата записи»/Статус/комментарий клиента). Сверить: какая из двух записей на слоте реальна, не перепутан ли специалист, нет ли в комментарии «перенесите меня на …» (значит запись переехала — старая стале).
3. Резолв:
   - **Стале/перенесённая/отменённая** легаси-запись (нет в CSV или в CSV отменена) → добавить её `ext-id` в `--drop-legacy=…` (мягко удалит legacy+canonical).
   - **Ошибочная `admin_manual`** запись (её нет в Rubitime, это инстанс overlap-бага) → **удалить через кабинет врача (штатный flow удаления)**, НЕ скриптом (скрипт трогает только rubitime-projection/legacy, не admin_manual canonical). После удаления слот освободится, реальная запись спроецируется.
   - **Обе записи реальны** (настоящая двойная бронь в Rubitime) → это продуктовый вопрос: связаться/решить, какую оставить; вторую отменить в Rubitime. Скриптом не «лечить».
4. Перезапустить Шаг 4 с обновлённым `--drop-legacy` → конфликт уйдёт.

**Пример (по dev-разбору 2026-06-13):** на dev осталось 3 «осадочных» конфликта — Андреева (её 16:00 отменена в CSV, реальный слот у Бословяк → дроп стале), Менялкина (реальная Rubitime-запись, мешала ошибочная `admin_manual` Груздева, которой нет в Rubitime → удалить ручную запись), Вовк (переехала на вторник по комментарию в CSV, среду занял Аня Коган → дроп стале Ср-записей). Паттерн один: **CSV решает, кто реальный.**

---

## Откат (rollback)
- **Soft-delete обратим:** `UPDATE appointment_records SET deleted_at=NULL WHERE integrator_record_id IN (…)` и аналогично `be_appointments` по mapping — вернёт ошибочно удалённое.
- **Cutover обратим:** вернуть `booking_doctor_appointments_read_source` → `rubitime_legacy`.
- **Миграция 0119 аддитивна** (новая колонка + пересборка constraint), откат не требуется при rollback чтения.

## После cutover (отдельный трек, интегратор — ДО отключения Rubitime)
- **Google Calendar** и **напоминания** на проде синхронизируются из СЫРОГО Rubitime-вебхука в интеграторе, не из canonical (S0, G4/G5). Перед полным отключением Rubitime их надо перевести на canonical — это отдельная задача в зоне интегратора/`BOOKING_REWORK`, НЕ часть этого ранбука.
- Мелочь (низкий приоритет): фильтр `deleted_at IS NULL` ещё не добавлен в `pgClientHistory` (история пациента у врача) и `pgDoctorAnalyticsMetricAccounts` (аналитика) — soft-deleted может всплыть там; не влияет на календарь/слоты/KPI.

## Связанное
- Скрипт + статусы фиксов F1/F1b/F2/F4/F5: память `booking-overlap-allowed-bug-2026-06`, коммиты в `feat/doctor-ui-rebuild` (`fd3325a2`, `ac7837e8`, `6556c1ec`, `2d3cede7`).
- Поведение синка (create/cancel/reschedule/delete × обе стороны): [`../DOCTOR_UI_REBUILD_REVIEW/SYNC_BEHAVIOR_ANALYSIS.md`](../DOCTOR_UI_REBUILD_REVIEW/SYNC_BEHAVIOR_ANALYSIS.md).
