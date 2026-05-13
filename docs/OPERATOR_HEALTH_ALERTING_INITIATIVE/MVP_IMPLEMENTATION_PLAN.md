# MVP — Operator Health & Alerting (реализация)

Канон инициативы: [MASTER_PLAN.md](MASTER_PLAN.md). Полные фазы: [PHASE_A](PHASE_A_DATA_MODEL_AND_CORE_ALERTING.md) … [PHASE_G](PHASE_G_TESTS_AND_DOCS.md). Журнал: [LOG.md](LOG.md).

Этот документ — **исполняемый план MVP** с фиксированными решениями, чтобы избежать scope creep и двусмысленностей.

---

## 1. Цель MVP

- Персистентные **операторские инциденты** с дедупом и **одним** Telegram-алертом при первом открытии.
- Событийная регистрация сбоев синка Google Calendar в **обоих** рубитайм-путях обработки.
- Две регулярные пробы исходящей доступности: **MAX** (`getMyInfo`) и **Rubitime** (`get-schedule`).
- Отображение открытых инцидентов в admin «Здоровье системы».

---

## 2. Fixed decisions (обязательные для MVP)

1. **Dedup key:** `direction:integration:error_class` (без `recordId`).
2. **GCal сбой:** `direction = outbound`, `integration = google_calendar`.
3. **Оба GCal entrypoint под хук инцидентов:**  
   - [postCreateProjection.ts](../../apps/integrator/src/integrations/rubitime/postCreateProjection.ts)  
   - [webhook.ts](../../apps/integrator/src/integrations/rubitime/webhook.ts)
4. **Таблица:** `public.operator_incidents`.
5. **Пробы:** только MAX + Rubitime.
6. **Endpoint проб:** только защищённый (`integratorWebhookSecret`), без публичного unauthenticated доступа.
7. **Resolution в MVP:** автоматический `resolve` **только по успешным пробам** MAX/Rubitime; без Telegram «восстановлено».

---

## 3. Scope boundaries

### In scope

- `operator_incidents` schema + migration.
- Integrator repo/service для `reportFailure` и `resolveByPrefix`.
- Хуки GCal fail в двух обработчиках Rubitime.
- Probe runner (MAX + Rubitime) + scheduler trigger.
- Webapp read/API/UI (блок открытых инцидентов).
- Тесты и док-обновления по затронутым участкам.

### Out of scope

- Last webhook health-таблица (фаза C).
- Recovery notifications в TG/email (фаза E).
- Auto-merge / media-worker / projection debounce алерты.
- Пробы Telegram, GCal-only probe, SMSC, SMTP.
- UI-действия «закрыть инцидент».

---

## 4. Data contract MVP

### 4.1 Таблица `public.operator_incidents`

Минимальные поля:

- `id` uuid pk
- `dedup_key` text not null
- `direction` text not null (`outbound` | `inbound_webhook` | `internal`)
- `integration` text not null (`google_calendar` | `rubitime` | `max`)
- `error_class` text not null
- `error_detail` text null (truncate до 500–1000)
- `opened_at` timestamptz not null default now()
- `last_seen_at` timestamptz not null default now()
- `occurrence_count` integer not null default 1
- `resolved_at` timestamptz null
- `alert_sent_at` timestamptz null

Индексы:

- уникальность открытого: `UNIQUE (dedup_key) WHERE resolved_at IS NULL`
- чтение для UI: индекс на `last_seen_at DESC` с фильтром `resolved_at IS NULL`

### 4.2 `error_class` taxonomy (MVP)

- `GOOGLE_TOKEN_HTTP_*`, `GOOGLE_CALENDAR_HTTP_*`, `GOOGLE_EVENT_ID_MISSING`
- `max_probe_failed`
- `rubitime_get_schedule_failed`
- fallback: `unknown_error_class`

---

## 5. План реализации (шаги + проверки)

Порядок: **A1 → A2 → B1 → B2 → C1 → C2 → D1**.

### A1 — Миграция и схема

Изменения:

- [apps/webapp/db/schema](../../apps/webapp/db/schema) — добавить таблицу.
- Сгенерировать миграцию Drizzle.

Проверки:

- `rg "operator_incidents" apps/webapp/db/schema apps/webapp/db/migrations`
- Целевая проверка миграции в локальной БД.

Критерий закрытия:

- Таблица создаётся с нужными индексами, rollback/повторный apply не ломаются.

---

### A2 — Integrator repo + reportFailure

Изменения:

- [apps/integrator/src/infra/db/repos](../../apps/integrator/src/infra/db/repos) — repo `openOrTouchIncident`.
- Новый helper/service для формирования `dedup_key`, отправки TG только при первом открытии.
- Использовать паттерн из [dataQualityIncidentAlert.ts](../../apps/integrator/src/infra/db/dataQualityIncidentAlert.ts) (`eventId` <= 240).

Проверки:

- Unit на гонку: 2 параллельных открытия одного ключа -> 1 открытая запись.
- Unit на повтор: `occurrence_count` растёт, Telegram второй раз не уходит.

Критерий закрытия:

- `reportFailure` идемпотентен и безопасен при concurrency.

---

### B1 — Хуки GCal fail в двух местах

Изменения:

- [postCreateProjection.ts](../../apps/integrator/src/integrations/rubitime/postCreateProjection.ts)
- [webhook.ts](../../apps/integrator/src/integrations/rubitime/webhook.ts)

Проверки:

- `rg "google calendar sync failed" apps/integrator/src/integrations/rubitime`
- Тест: мок `syncRubitimeWebhookBodyToGoogleCalendar` бросает ошибку -> `reportFailure` вызван.

Критерий закрытия:

- Любой GCal fail в рубитайм-потоке открывает/обновляет один инцидент по `error_class`.

---

### B2 — MVP probe runner (MAX + Rubitime)

Изменения:

- Модуль раннера проб в integrator (`infra`/`app` слой, без смешения с webhook handlers).
- MAX probe через `getMaxBotInfo`.
- Rubitime probe через `fetchRubitimeSchedule` с envelope-проверкой `status: ok`; пустые слоты не считаются fail.

Проверки:

- Nock/моки на оба probe-пути.
- Таймауты на внешний fetch.

Критерий закрытия:

- Пробы дают `ok|fail|skipped_not_configured` и пишут инциденты только для `fail`.

---

### C1 — Scheduler + защищённый trigger

Изменения:

- Защищённый internal endpoint (например `POST /internal/operator-health-probe`) в integrator.
- Проверка секрета через `integratorWebhookSecret`.
- Один механизм запуска: systemd timer **или** worker interval (выбрать и зафиксировать в [LOG.md](LOG.md)).

Проверки:

- Без секрета endpoint возвращает отказ.
- С секретом запускает runner.

Критерий закрытия:

- Пробы запускаются по расписанию и недоступны извне без секрета.

---

### C2 — Минимальный resolve в MVP

Изменения:

- На успешной probe MAX/Rubitime: `resolve` по префиксу `outbound:max:*` / `outbound:rubitime:*`.
- Для GCal auto-resolve в MVP **не добавлять**.

Проверки:

- Unit: fail -> open, success -> resolved_at set.
- Повторный success не меняет состояние критично (идемпотентно).

Критерий закрытия:

- Открытые probe-инциденты не копятся бесконечно после восстановления канала.

---

### D1 — Webapp read/API/UI

Изменения:

- Порт в `modules/*`, реализация в `infra/repos/*` (соблюсти clean architecture).
- [buildAppDeps.ts](../../apps/webapp/src/app-layer/di/buildAppDeps.ts) wiring.
- [system-health/route.ts](../../apps/webapp/src/app/api/admin/system-health/route.ts) расширить полем `operatorIncidentsOpen` (limit 20).
- [SystemHealthSection.tsx](../../apps/webapp/src/app/app/settings/SystemHealthSection.tsx): блок списка открытых инцидентов.

Проверки:

- [system-health/route.test.ts](../../apps/webapp/src/app/api/admin/system-health/route.test.ts): 403 guard, happy-path payload.
- UI test: рендер блока при непустом `operatorIncidentsOpen`.

Критерий закрытия:

- Админ видит открытые инциденты в текущей вкладке здоровья.

---

## 6. Файлы, которые разрешено менять

- `apps/webapp/db/schema/**`, `apps/webapp/db/migrations/**`
- `apps/integrator/src/infra/**`, `apps/integrator/src/app/**`, `apps/integrator/src/integrations/rubitime/**`
- `apps/webapp/src/modules/**` (порты/сервисы), `apps/webapp/src/infra/repos/**`, `apps/webapp/src/app/api/admin/**`, `apps/webapp/src/app/app/settings/**`
- `docs/OPERATOR_HEALTH_ALERTING_INITIATIVE/**`, `apps/webapp/src/app/api/api.md`

Не менять в MVP:

- unrelated домены (courses, patient flows вне health), CI workflow.

---

## 7. Definition of Done (MVP)

- [ ] Один открытый инцидент на `outbound:google_calendar:{error_class}` при множественных однотипных ошибках.
- [ ] GCal fail учитывается из обоих путей: `postCreateProjection` и `webhook`.
- [ ] Пробы MAX и Rubitime работают по расписанию; Rubitime `status: ok` с пустыми слотами не считается fail.
- [ ] Probe trigger защищён секретом.
- [ ] В admin health виден список открытых инцидентов.
- [ ] Для probe-инцидентов есть минимальный auto-resolve без recovery-нотификаций.
- [ ] Нет новых env для интеграционных ключей; параметры через `system_settings` только если нужны.
- [ ] Перед merge: зелёный `pnpm run ci`.

---

## 8. Риски и смягчение

| Риск | Смягчение |
|------|-----------|
| Rubitime throttle конфликтует с пиком записи | запуск пробы в тихом окне + уважать `withRubitimeApiThrottle` |
| MAX отключён/не настроен | `skipped_not_configured`, без открытия инцидента |
| Рост таблицы | для MVP без retention; post-MVP добавить архив/TTL |
| Секрет случайно не проверяется в endpoint | обязательный negative-test без секрета |

---

## 9. Оценка

**5–7 инженерных дней**, ~2.5–4.5k LOC с тестами.

---

## 10. Трекинг задач (markdown)

- [ ] A1: schema + migration `public.operator_incidents`
- [ ] A2: integrator repo + `reportFailure` + concurrency tests
- [ ] B1: GCal fail hooks в `postCreateProjection.ts` и `webhook.ts`
- [ ] B2: probe runner (MAX + Rubitime)
- [ ] C1: защищённый trigger + scheduler
- [ ] C2: minimal auto-resolve probe incidents
- [ ] D1: webapp read/API/UI + tests
- [ ] Docs: `LOG.md`, `api.md`, итоговые проверки и CI
