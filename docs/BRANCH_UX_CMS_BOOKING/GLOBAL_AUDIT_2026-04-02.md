# Глобальный аудит блока разработки: Записи в webapp и Напоминания

**Дата:** 2026-04-02  
**Аудитор:** agent (Cursor, claude-4.6-opus-high-thinking)  
**Scope:** `docs/BRANCH_UX_CMS_BOOKING/` — все фазы оригинального PLAN.md + Booking Rework (Stages 1–15) + Reminders Phase (Stages S1–S5)

---

## 1. Сводка по фазам оригинального PLAN.md

| Фаза | Задач | Статус | Аудит |
|------|-------|--------|-------|
| 0 — Чистка UI/UX | 8 | **done** (все 0.1–0.8) | pass (`AUDIT_PHASE_0.md`) |
| 1 — CMS + Медиабиблиотека | 13 | **done** (все 1.1–1.13; 1.13 superseded продуктовым решением) | pass (`AUDIT_PHASE_1.md`) |
| 2 — Нативный модуль записи | 24 → расширен до 15 стадий | **done** (см. §2 Booking Rework) | pass по стадиям |
| 3 — UX кабинета врача | 6 | **done** (все 3.1–3.6 + rework) | pass (`AUDIT_PHASE_3.md`) |
| 4 — Рассылки | 4 → расширен до 6 задач | **done** (4.1–4.6 + rework) | approve (`AUDIT_PHASE_4.md`) |
| 5 — Личный помощник | — | вне scope текущей ветки | — |

**Итоговый аудит ветки (фазы 0–4):** `FINAL_AUDIT.md` — решение **merge**, CI green.

---

## 2. Booking Rework: City + Service (Stages 1–15)

Оригинальная фаза 2 была расширена в отдельный подпроект из 15 стадий.

| Стадия | Название | Задач | Статус | Аудит |
|--------|----------|-------|--------|-------|
| S1 | Spec & Contracts | 5 | done | audit fixes applied |
| S2 | DB & Seed | 6 | done | audit fixes applied |
| S3 | Admin Catalog | 5 + remediation | done | audit remediation done |
| S4 | Patient Flow In-person | 6 + remediation | done | audit remediation done |
| S5 | Integrator Bridge & Cutover | 5 + remediation | done | audit remediation done |
| S6 | Test Audit Release | 5 + remediation | done | approve (`AUDIT_STAGE_2_6.md`) |
| S7 | Booking Wizard Pages | 9 + remediation | done | audit remediation done |
| S8 | Audit Remediation / Docs Sync | 6 | done | — |
| S9 | Online Intake Spec | 6 | done | — |
| S10 | Intake DB & API | 9 | done | — |
| S11 | Rubitime Compat Bridge | 11 | done | — |
| S12 | Patient Wizard Online | 7 | done | — |
| S13 | Doctor/Admin Inbox | 5 | done | — |
| S14 | Release Hardening | 5 | done | — |
| S15 | Final Test Audit Release | 1 | done | CI green, 1013 tests |

### Верификация кода

| Артефакт | Статус |
|----------|--------|
| Миграции 046–049 | Присутствуют, DDL корректен, **applied на dev** (2026-04-02) |
| Модуль `booking-catalog` (types/ports/service) | Присутствует, тесты passed |
| Модуль `online-intake` (types/ports/service) | Присутствует, тесты passed |
| Admin API cities/branches/services/specialists/branch-services | Все routes + tests |
| Patient Wizard (format → city → service → slot → confirm) | Присутствует, тесты есть |
| Patient Intake (LFK + nutrition) | Присутствует |
| Doctor Inbox (`/app/doctor/online-intake`) | Присутствует |
| Integrator v2 contracts (`internalContract.ts`, `schema.ts`) | Присутствует |
| Legacy resolve flag | Присутствует, v1 online активен |
| Seed / backfill скрипты | Присутствуют, idempotent, dry-run default |
| Compat sync (Stage 11): `source` + `compat_quality` | Присутствует в storage layer |
| Cutover runbook | Присутствует |

### Замечания

1. **Wizard step numbering (minor):** 5 экранов, но `totalSteps={4}` в shell; город и услуга оба «шаг 2». Не влияет на функциональность.
2. **`source`/`compat_quality` не экспортированы в доменную модель `PatientBookingRecord`** — используются только в storage layer.
3. **Stages 8–15 не имеют отдельного формального аудит-документа** (в отличие от S1–S7 с `AUDIT_STAGE_2_6.md`). CI green, тесты есть.
4. **Online-safe gate не закрыт** — legacy resolve остаётся включённым. Ожидаемое ограничение, документировано.

### Release checklist (`CHECKLISTS.md`): 2 open пункта

- `[ ]` online-safe gate перед глобальным `RUBITIME_LEGACY_PROFILE_RESOLVE_ENABLED=false`
- `[ ]` итоговая SHA + дата CI для каждого Stage 8–15 в `EXECUTION_LOG.md`

---

## 3. Reminders Phase (Stages S1–S5)

| Стадия | Задач | Статус | Аудит |
|--------|-------|--------|-------|
| S1 — Контракты | 7 | done | rework → fixed |
| S2 — DB + Core Service | 10 | done | approve |
| S3 — Бот-уведомления | 9 | done | approve (post-fix) |
| S4 — Webapp UI | 10 (без S4.T06 — v2) | done | rework → fixed |
| S5 — Тест и релиз | 5 | done | — |
| **Global Audit** | — | rework_required → **fixed** | 2 critical + 2 major → closed |
| **Global Fix** | — | applied, CI green | — |

### Верификация кода

| Артефакт | Статус |
|----------|--------|
| Миграции 050–051 | Присутствуют, **applied на dev** (2026-04-02) |
| Типы `ReminderRule` с `linkedObjectType/Id`, `customTitle/Text` | Присутствуют |
| `ReminderJournalPort` (отдельный файл `reminderJournalPort.ts`) | Присутствует |
| Service: create/delete/snooze/skip object+custom | Присутствует |
| PG + in-memory repos для rules и journal | Присутствуют |
| API routes: create, [id], [id]/snooze, [id]/skip + тесты | Присутствуют |
| Integrator: inline keyboard, snooze/skip handlers, deep link builder | Присутствуют |
| Подтверждение вопроса (`confirmQuestion`, `q_confirm:yes/no`) | Telegram полностью; MAX — шаблоны текстов есть, полных скриптов нет (scope cut) |
| Skip reason guard (не утекает админу) | Присутствует + тест `supportRelay.test.ts` |
| UI: `ReminderCreateDialog`, `LfkComplexCard`, `SectionWarmupsReminderBar` | Присутствуют |
| Журнал (`/app/patient/reminders/journal/[ruleId]`) | Присутствует |
| DI wiring (`buildAppDeps.ts`): `reminderJournal`, `remindersService` | Wired |
| M2M sync правил (Critical #1 Global Fix) | Присутствует: `reminderRulesRoute.ts` |
| Гонка skip/snooze (Critical #2 Global Fix) | Guard `WHERE status <> 'skipped'` |

### Замечания

1. **MAX q_confirm — частичная реализация.** Тексты шаблонов есть, полные скрипты не реализованы (нет entry-point в меню MAX). Документировано как scope cut.
2. **In-memory journal не подключён в DI** — при отсутствии `DATABASE_URL` `reminderJournalPort = undefined`, snooze/skip → `not_available`. Нормальное поведение; in-memory только для тестов.
3. **Нет dedicated теста для `handleReminders` handler end-to-end** — покрыты keyboard helpers и mapIn parsing. Сам handler тестируется косвенно.

---

## 4. Миграции: статус на dev

**Подтверждено прогоном 2026-04-02:**

| БД | Команда | Результат |
|----|---------|-----------|
| Integrator (`bersoncarebot_dev`) | `ENV_FILE=.../.env pnpm --dir apps/integrator run db:migrate` | 4 новых applied, остальные Skipping |
| Webapp (`bcb_webapp_dev`) | `pnpm --dir apps/webapp run migrate` | Все 51 миграция already applied |

Пункт чеклиста **«Все миграции применяются на dev»** → **[x]**.

---

## 5. Инцидент: Rubitime расхождения

Обнаружен и задокументирован в `REMINDERS_PHASE/EXECUTION_LOG.md`:

- **Проблема:** системные расхождения `record_at` (-120/-60 мин) из-за наивных дат Rubitime без timezone; dead/pending outbox из-за неверного lookup `platform_user_id`.
- **Решение:** централизация timezone (`appTimezone.ts`); re-sync скрипт (26 тестов); код-фикс lookup по `phoneNormalized`; runbook.
- **Статус (prod, 2026-04-02):** точечная починка выполнена на хосте:
  - `repair-outbox --record-ids=8059457` -> `found=0` (requeue не требовался);
  - `rubitime_records`: `8059457` переведена в `canceled` (`manual_not_found_cleanup`);
  - точечный fix `record_at` для `8062187` (`manual_record_at_fix`);
  - финальный compare `/root/rubitime-compare-report-20d-final.json`: `mismatches=0`, `apiErrors=0`, `notFoundActive=0`, `notFoundCanceled=1` (допустимо).

---

## 6. Дополнительные работы (вне основного плана)

| Работа | Статус |
|--------|--------|
| Rubitime slots integration fix (реальный `get-schedule`) | done |
| DB-first config (integration keys → `system_settings`) | done |
| Chunk load recovery для Telegram WebView | done |
| Nginx caching документация | done |
| Cabinet UX (активные записи, журнал прошлых) | done |
| `seed-system-settings-from-env.mjs` hotfix (PG type inference) | done |

---

## 7. TODO / Техдолг

**Правило исполнения:** пункты техдолга выполняются только после отдельного согласования с владельцем продукта.

### Из `TODO_BACKLOG.md` (фазы 0–4)

| ID | Область | Статус |
|----|---------|--------|
| AUDIT-BACKLOG-010 | Рассылки: `inactive` фильтр через `lastEventBefore` | open |
| AUDIT-BACKLOG-011 | Рассылки: `sms_only` фильтр | open |
| AUDIT-BACKLOG-020 | Integrator events pipeline | open |
| AUDIT-BACKLOG-021 | Appointments service (мост Rubitime) | open |
| AUDIT-BACKLOG-022 | Doctor desktop sidebar layout | open |
| AUDIT-BACKLOG-023 | Channel link conflict notifications | open |
| AUDIT-BACKLOG-024 | pgUserProjection Rubitime email | open |

### Из Booking Rework

| Элемент | Статус |
|---------|--------|
| `TODO.SLOTS.CACHE.T01` — singleflight, TTL, 429 retry для слотов | pending |
| Online-safe gate (legacy-off) | не закрыт |

### Из Reminders Phase

| Элемент | Статус |
|---------|--------|
| MAX q_confirm скрипты | scope cut |

---

## 8. Итоговая оценка

### Выполнено

- **55 задач оригинального PLAN.md** (фазы 0–4) — все закрыты
- **15 стадий Booking Rework** (81+ задач) — все закрыты, CI green, cutover runbook готов
- **41 задача Reminders Phase** (S1–S5) — все закрыты, Global Audit findings исправлены, CI green
- **Инцидент Rubitime** — обнаружен, диагностирован, код-фикс применён; точечная prod-починка выполнена (см. §5)
- **Миграции dev** — integrator и webapp applied (подтверждено 2026-04-02)
- Итого: **~180+ атомарных задач** за период ветки

### Перед production release

1. **Rubitime re-sync + repair-outbox** — runbook `RUNBOOK_RUBITIME_RESYNC.md` обновлён, точечная операция на prod выполнена; поддерживать мониторинг compare-отчёта.
2. **Booking: online-safe gate** — legacy resolve не отключается до подтверждения online intake на prod.
3. **Миграции prod** — применяются автоматически при деплое (integrator: startup, webapp: deploy script).
4. **Ручной smoke-test** на работающем стенде: существующие категории напоминаний, diary tabs, content sections, support relay, вопросы admin forward.

### Риски

- **Rubitime rate limiting** (`TODO.SLOTS.CACHE.T01`) — при burst запросов слотов возможен `slots_unavailable`. Singleflight/cache pending.
- **Stages 8–15 без формального аудит-документа** — код покрыт CI и тестами, но нет отдельного audit MD.
- **Wizard step numbering** — косметический дефект (город и услуга оба «шаг 2» из 4).

### Вердикт

Блок разработки **«Записи в webapp и Напоминания»** выполнен по существу полностью. Код в репозитории, тесты проходят, CI green, документация актуальна. Перед production-деплоем остаётся запуск re-sync Rubitime на хосте и ручной smoke-test по чеклисту напоминаний.

---

## 9. План действий по приоритетам владельца (2026-04-02)

### Критично

1. **Email из Rubitime (autobind):**
   - Подтвердить целевой контракт (когда автопривязываем, когда не трогаем email).
   - Реализовать и покрыть тестами сценарии `invalid/verified/conflict`.
   - Прогнать `pnpm run ci`, затем smoke на реальных кейсах.

2. **Слоты записи под нагрузкой (cache/singleflight):**
   - Добавить singleflight/coalescing одинаковых запросов в integrator.
   - Добавить bounded retry/backoff для 429/временных 5xx.
   - Добавить короткий TTL cache и stale-on-error fallback.
   - Проверить метрики/логи и зафиксировать runbook.

3. **Привязка к MAX:**
   - Заполнить `admin_max_ids` и `doctor_max_ids` в `system_settings` (scope `admin`).
   - Выровнять паритет flows Telegram/MAX для рабочих сценариев привязки.
   - Добавить smoke-кейсы для link/otp/question/reminder flows в MAX.

### Важно и безопасно

4. **Smoke-тесты продукта:**
   - Напоминания (старые категории + новые object/custom).
   - Diary tabs, content sections, support relay, question confirm flow.
   - Зафиксировать результат в `REMINDERS_PHASE/EXECUTION_LOG.md`.

5. **Документация:**
   - Обновить `SERVER CONVENTIONS`, `RUNBOOK_RUBITIME_RESYNC`, релизные чеклисты после фактических прод-операций.

### Отдельно согласовать с владельцем

6. **Онлайн-консультации (верстка + анкета):**
   - Сначала согласовать exact UX, перечень вопросов и текст анкеты.
   - Только после согласования менять `FormatStepClient`, `LfkIntakeClient`, `NutritionIntakeClient` и API-поля.
