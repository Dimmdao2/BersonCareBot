# Сведение дублей канонического специалиста (solo-specialist)

Разовое приведение исторических данных к продуктовой модели booking-rework: **один специалист
на все филиалы**. Плюс код-фикс, чтобы дубли/NULL не возвращались.

## Проблема

Исторически запись шла через Rubitime, где для **каждого филиала** заводился отдельный
«специалист» — фактически дубли одного человека (владельца). При проекции в канон это дало:
- несколько строк `be_specialists` для одного физлица;
- часть `be_appointments (source=rubitime_projection)` с `specialist_id = NULL` (кооператор не
  был смаплен на момент проекции).

Состояние на dev (read-only, 2026-06-14):
- 2 строки `be_specialists`, обе «Дмитрий Берсон» (primary `518ea988…` — 234 записи; дубль
  `c9515025…` — 5 записей);
- 120 `be_appointments` с `specialist_id = NULL` (104 confirmed + 16 cancelled, ранние Jan–May);
- оба rubitime-cooperator id (37449, 34729) **уже** маппятся на primary (рецидив через маппинг
  не активен), но дубль-строка `be_specialists` ещё активна.

## Источники рецидива и код-фикс

| Источник | Фикс |
|----------|------|
| `resolveDefaultSpecialistId` берёт первого активного, а активных два → ручное создание может попасть в дубль | Скрипт деактивирует дубль → primary единственный активный → детерминизм |
| Немапленный кооператор → `specialist_id = NULL` в проекции | Код: `resolveSoloSpecialistId` в `apps/webapp/src/infra/repos/pgBookingRubitimeBridge.ts` — при немапленном кооператоре и **ровно одном** активном специалисте привязывает к нему (insert + update проекции). Регресс-тест в `pgBookingRubitimeBridge.test.ts`. |

## Скрипт

| | |
|--|--|
| Файл | `apps/webapp/scripts/consolidate-specialist-identity.ts` |
| npm | `pnpm --dir apps/webapp run consolidate-specialist-identity` |
| По умолчанию | **dry-run** (только подсчёт) |

### Что делает (в одной транзакции при `--commit`)

1. **Primary** — авто-детект: активный специалист с наибольшим числом записей среди тёзок
   (override `--canonical=<uuid>`).
2. **Duplicates** — активные специалисты той же организации с тем же `full_name` (кроме primary);
   `--merge-all` снимает фильтр по имени.
3. **Repoint FK** (8 таблиц) дублей → primary. Для link-таблиц с `UNIQUE(specialist_id, …)`
   (`be_specialist_locations`, `be_specialist_rooms`, `be_specialist_service_availability`) —
   conflict-safe: дубль-строка, которая столкнулась бы с существующей primary-строкой по
   остальным колонкам ключа, удаляется (равенство `=` пропускает NULL = семантика NULLS DISTINCT).
4. **Remap** `be_external_entity_mappings (specialist:rubitime)` дублей → primary.
5. **Deactivate** дубль-строки `be_specialists` (`is_active=false`; **не** hard-delete — сохраняем
   ссылочную историю/аудит).
6. **Assign NULL** `be_appointments.specialist_id IS NULL` → primary (вкл по умолчанию;
   `--no-assign-nulls` отключает). `branch_id` **не трогаем** — отдельное измерение.

### Флаги

| Флаг | Назначение |
|------|------------|
| `--commit` | применить (иначе dry-run) |
| `--canonical=<uuid>` | задать primary явно |
| `--org=<uuid>` | ограничить организацией |
| `--merge-all` | сливать всех прочих специалистов (без фильтра по имени) — осознанно |
| `--no-assign-nulls` | не привязывать NULL-записи |

### Безопасность

- dry-run по умолчанию; запись только `--commit` (одна транзакция, ROLLBACK при ошибке).
- Идемпотентно: повторный прогон после сведения не находит дублей и меняет 0 строк.
- dev = реальные ПДн: печатаются только id/числа/имя специалиста (владелец, не пациент).
- Audit-лог (commit): `.tmp/specialist-consolidation/applied-<ts>.json`.

## Runbook

```bash
set -a && source apps/webapp/.env.dev && set +a
pnpm --dir apps/webapp run consolidate-specialist-identity                 # dry-run, сверить PLAN
pnpm --dir apps/webapp run consolidate-specialist-identity -- --commit     # только по ОК владельца
pnpm --dir apps/webapp run consolidate-specialist-identity                 # идемпотентность: 0 дублей
```

Dry-run на dev (2026-06-14): primary `518ea988`, dup `c9515025`; repoint be_appointments=5,
be_specialist_locations=2, be_specialist_service_availability=5 (collisions=0); deactivated=1;
null_appointments_assigned=120; external_mappings_remapped=0 (маппинг уже на primary).

## Проверка (read-only)

```sql
SELECT count(*) active FROM be_specialists WHERE is_active = true;          -- ожидаем 1
SELECT count(*) null_spec FROM be_appointments WHERE specialist_id IS NULL; -- ожидаем 0 (после assign)
```

## Прод

Та же последовательность; перед `--commit` — dry-run и явное подтверждение. После деплоя код-фикса
новый inbound не плодит дубль/NULL — консолидация разовая.
