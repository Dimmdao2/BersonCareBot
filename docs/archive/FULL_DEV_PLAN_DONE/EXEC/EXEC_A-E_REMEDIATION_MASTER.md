# EXEC A-E Remediation Master Plan

> Дата: 2026-03-25  
> Назначение: промежуточный, глубоко декомпозированный план полной доработки пакетов A-E  
> Основание: `finsl_fix_report.md`, `FIX_PLAN_EXECUTION_REPORT.md`, `QA_CHECKLIST.md`, `USER_TODO_STAGE.md`, `EXEC_A..E`

---

## 1) Scope и цель

Довести пакеты **A-E** до состояния:

- нет критичных и high findings по code review;
- соответствие `EXEC_A..E`;
- соответствие policy владельца из `USER_TODO_STAGE.md`;
- закрыта секция Pack E в `QA_CHECKLIST.md`;
- подтвержденный `pnpm run ci` PASS после каждого блока.

Ключевая особенность: по отчётам блокер сконцентрирован в **Pack E**.  
Пакеты A-D в основном green, но требуют финальной верификации и точечных закрытий.

---

## 2) Источники истины (обязательные)

1. `docs/FULL_DEV_PLAN/finsl_fix_report.md`
2. `docs/FULL_DEV_PLAN/FIX_PLAN_EXECUTION_REPORT.md`
3. `docs/FULL_DEV_PLAN/EXEC/QA_CHECKLIST.md`
4. `docs/FULL_DEV_PLAN/USER_TODO_STAGE.md`
5. `docs/FULL_DEV_PLAN/EXEC/EXEC_A_QUICK_FIXES.md`
6. `docs/FULL_DEV_PLAN/EXEC/EXEC_B_SETTINGS_ADMIN!!.md`
7. `docs/FULL_DEV_PLAN/EXEC/EXEC_C_RELAY_OUTBOUND!.md`
8. `docs/FULL_DEV_PLAN/EXEC/EXEC_D_REMINDERS!!.md`
9. `docs/FULL_DEV_PLAN/EXEC/EXEC_E_INTEGRATIONS!!.md`

---

## 3) Актуальная проблемная матрица A-E

## A-D

- По отчётам в основном выполнены и зелёные.
- Нужна финальная ревизия "ничего не регресснуло после E-патчей".

## E (главный риск)

- CRITICAL: конфликт `channel_link` может перезаписать владельца binding (нарушение policy).
- HIGH: E.6 и E.7 не выполнены.
- HIGH: E.5 не закрыт до DoD (нет nock-coverage; по отчёту были проблемы с верификацией CI).
- MEDIUM: для E.5 интеграция sync размещена в `rubitime/webhook.ts`, тогда как инструкция E.5 указывает `rubitime/connector.ts`.
- MEDIUM: риск timezone drift в parser `recordAt`.

---

## 4) Стратегия исполнения (порядок обязателен)

1. **Wave 1 (CRITICAL/HIGH Pack E):** закрыть безопасность и контрактность.
2. **Wave 2 (E.5 completion):** привести Google Calendar sync к полному DoD.
3. **Wave 3 (E.6):** reverse API + auto-email bind policy.
4. **Wave 4 (E.7):** стандартизовать integration test infra + smoke README.
5. **Wave 5 (A-D regression pass):** перепроверка A-D после изменений E.
6. **Wave 6 (финал):** обновление отчётов и QA checklist.

Нельзя переходить к следующей wave без зелёного CI на текущей.

---

## 5) Универсальные правила исполнения для агента

- Выполнять атомарно, по задачам ниже.
- После каждой задачи: `pnpm run ci`.
- При FAIL:
  - исправить;
  - повторить `pnpm run ci`;
  - максимум 3 попытки;
  - после 3 FAIL: STOP и запись в `finsl_fix_report.md`.
- Не менять старые миграции, только новые файлы.
- Все policy-решения только из `USER_TODO_STAGE.md`.
- После каждого шага обновлять:
  - `docs/FULL_DEV_PLAN/finsl_fix_report.md`
  - при необходимости `docs/FULL_DEV_PLAN/FIX_PLAN_EXECUTION_REPORT.md`

---

## 6) Декомпозиция работ

## Wave 1 — Pack E CRITICAL/HIGH

### E-R1.1 Fix channel-link conflict policy (CRITICAL)

**Проблема:** нельзя делать silent takeover binding.  
**Файлы:**
- `apps/webapp/src/modules/auth/channelLink.ts`
- `apps/webapp/src/app/api/integrator/channel-link/complete/route.ts`
- тесты рядом

**Действия:**
1. В `completeChannelLinkFromIntegrator` заменить conflict-стратегию:
   - если `(channel_code, external_id)` уже привязан к другому user -> вернуть `conflict`.
   - не менять существующий `user_id`.
2. В route:
   - добавить явный ответ для `conflict` (рекомендуется `409`).
   - сохранить идемпотентную ветку `used_token -> 200 already_used`.
3. Добавить логирование конфликтного случая.
4. Добавить TODO-hook/порт для уведомления админа и пользователя (как минимум структурированный warning), без изобретения новых policy.

**Тесты (минимум):**
- Unit: conflict branch.
- Route integration: `409` на conflict.
- Regression: повторный complete того же токена остаётся идемпотентным.

**DoD:**
- Нет перезаписи чужого binding.
- Поведение конфликта детерминировано и покрыто тестами.

---

### E-R1.2 Validate Pack E dependency contract (HIGH)

**Проблема:** E.5 требует `googleapis`, E.7 требует `nock`.

**Файлы:**
- `apps/integrator/package.json`
- `pnpm-lock.yaml`

**Действия:**
1. Убедиться, что зависимости реально добавлены package manager-ом:
   - `googleapis` в dependencies.
   - `nock` в devDependencies.
2. Проверить lockfile изменился согласованно.

**DoD:**
- Пакеты присутствуют в `package.json` и lockfile.

---

## Wave 2 — Pack E.5 completion

### E-R2.1 Align integration point with EXEC (MEDIUM)

**Проблема:** EXEC E.5 указывает `rubitime/connector.ts` для вызова sync.

**Файлы:**
- `apps/integrator/src/integrations/rubitime/connector.ts`
- `apps/integrator/src/integrations/rubitime/webhook.ts`

**Действия:**
1. Перенести/дублировать вызов `syncAppointmentToCalendar` в корректный слой по архитектуре пакета.
2. Не допустить двойного вызова sync на один webhook.
3. Обновить тесты на место вызова.

**DoD:**
- Вызов sync расположен согласно EXEC.
- Нет дублирующих side effects.

---

### E-R2.2 Close Google Calendar API testing gap (HIGH)

**Проблема:** нет nock integration tests.

**Файлы:**
- `apps/integrator/src/integrations/google-calendar/*.test.ts`

**Действия:**
1. Добавить `nock`-тесты на:
   - token refresh (`oauth2.googleapis.com/token`) success/fail;
   - create event (POST);
   - update event (PATCH);
   - delete event (DELETE, включая 404 tolerant path).
2. Проверить disabled-flag путь: 0 внешних вызовов.

**DoD:**
- Критические outbound path покрыты nock.
- Нет реальных сетевых вызовов в CI.

---

### E-R2.3 Fix recordAt timezone ambiguity (MEDIUM)

**Проблема:** принудительное добавление `Z` может сдвигать локальное время.

**Файлы:**
- `apps/integrator/src/integrations/google-calendar/sync.ts`
- `apps/integrator/src/integrations/google-calendar/sync.test.ts`

**Действия:**
1. Явно разделить форматы:
   - ISO с timezone -> не трогать.
   - `YYYY-MM-DD HH:mm:ss` -> парсить как локальное бизнес-время по оговорённому правилу.
2. Зафиксировать поведение в тестах (не допускать скрытого timezone drift).

**DoD:**
- Парсинг времени детерминирован и покрыт тестами.

---

## Wave 3 — Pack E.6 (обязательная реализация)

### E-R3.1 Rubitime reverse API

**Файлы:**
- `apps/integrator/src/integrations/rubitime/client.ts`
- `apps/integrator/src/integrations/rubitime/connector.ts`
- webapp route/UI из EXEC

**Действия:**
1. Добавить `updateRecord(id, data)` и `cancelRecord(id)` (если API Rubitime доступен).
2. Прокинуть M2M path webapp -> integrator -> Rubitime.
3. Если reverse API недоступен: задокументировать external blocker в контракте и отчёте.

**Тесты:**
- Integration mock клиента на update/cancel.

---

### E-R3.2 Auto-email bind policy

**Файлы:**
- `apps/integrator/src/integrations/rubitime/connector.ts`
- `apps/webapp/src/modules/integrator/events.ts`
- tests рядом

**Действия:**
1. Вытаскивать email из Rubitime payload и эмитить `user.email.autobind`.
2. В webapp обработать policy из `USER_TODO_STAGE.md`:
   - invalid email -> skip;
   - verified email уже есть -> skip;
   - conflict email другого пользователя -> warning + notify admin/user;
   - иначе сохранить как unverified.

**Тесты:**
- Unit connector emit;
- Unit events policy branches.

---

## Wave 4 — Pack E.7 (test infra)

### E-R4.1 External domain nock coverage

**Действия:**
1. Для доменов: `api.telegram.org`, MAX API, `googleapis.com`, SMSC, Rubitime:
   - минимум 1 nock-тест критичного outbound.
2. Зафиксировать запрет реальных сетевых вызовов в тестах.

### E-R4.2 Webhook inject coverage

**Действия:**
1. Проверить/добавить `fastify.inject` тесты для:
   - `/webhook/telegram`
   - `/webhook/max`
   - `/webhook/rubitime/*`
2. Проверять: HTTP 200 + ожидаемый event в gateway mock.

### E-R4.3 Manual smoke doc

**Файл:**
- `apps/integrator/e2e/README.md` (новый)

**Содержимое:**
- пошаговый smoke для staging;
- входные сообщения/команды;
- ожидаемый результат в UI/боте/БД.

---

## Wave 5 — A-D regression pass

### E-R5.1 Targeted regression on A-D touched areas

**Действия:**
1. Запустить целевые тесты модулей, затронутых E изменениями:
   - auth email/channel-link;
   - messaging relay;
   - reminders/integrator endpoints (smoke regression).
2. Проверить, что не нарушены принципы из A-D (`QA_CHECKLIST` секции A-D).

### E-R5.2 Contract review

**Действия:**
1. Актуализировать `apps/webapp/INTEGRATOR_CONTRACT.md` по итогам E.5-E.7.
2. Проверить, что flow numbering не конфликтует.

---

## Wave 6 — финал и отчётность

### E-R6.1 QA checklist closeout

Отметить секцию Pack E в `docs/FULL_DEV_PLAN/EXEC/QA_CHECKLIST.md`:
- send-email HMAC,
- email OTP via integrator,
- TG deep-link hardening,
- MAX deep-link,
- Google Calendar feature flag + idempotency + nock,
- Rubitime reverse,
- email autobind policy,
- networkless tests,
- contract актуален.

### E-R6.2 Final reports

1. Обновить `docs/FULL_DEV_PLAN/finsl_fix_report.md`:
   - шаги, файлы, команды, CI результат, блокеры/риски.
2. Обновить `docs/FULL_DEV_PLAN/FIX_PLAN_EXECUTION_REPORT.md`:
   - статус A-E после remediation.

### E-R6.3 Final gate

Обязательный финальный прогон:

```bash
pnpm install --frozen-lockfile
pnpm run ci
```

---

## 7) Формат отчёта для слабого агента (после каждого шага)

Использовать шаблон:

1. `Step ID`: (например `E-R2.2`)
2. `Что сделано`: 3-7 bullets
3. `Файлы`: список путей
4. `Тесты`: что добавлено/обновлено
5. `Команды`: точные команды
6. `Результат`: PASS/FAIL
7. `Если FAIL`: причина + что исправлено + номер попытки
8. `Статус шага`: Done / Blocked

---

## 8) Критерий завершения A-E remediation

- Все CRITICAL/HIGH findings закрыты.
- Pack E шаги E.1-E.7 завершены или имеют формально задокументированный внешний blocker.
- Секция Pack E в `QA_CHECKLIST.md` закрыта.
- `INTEGRATOR_CONTRACT.md` синхронизирован.
- `pnpm run ci` подтверждённо PASS.

