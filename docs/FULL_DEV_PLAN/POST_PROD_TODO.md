# POST_PROD_TODO

Дата: 2026-03-25  
Назначение: зафиксировать отложенные после prod-стабилизации задачи и единое понимание текущего состояния.

---

## 1) Как сейчас сделано (as-is)

### 1.1 Ключи интеграций и разрешенные ID

- Интеграционные ключи и URI в runtime читаются из env:
  - `apps/webapp/src/config/env.ts`
  - `apps/integrator/src/config/env.ts`
- Разрешенные ID входа (`ALLOWED_TELEGRAM_IDS`, `ALLOWED_MAX_IDS`, `ADMIN_MAX_IDS`, `DOCTOR_MAX_IDS`) также читаются из env и применяются в auth-сервисе webapp:
  - `apps/webapp/src/modules/auth/service.ts`
- В БД (`system_settings`) уже есть только часть управляемых параметров:
  - `patient_label`, `sms_fallback_enabled`, `debug_forward_to_admin`, `dev_mode`, `important_fallback_delay_minutes`, `integration_test_ids`
  - файлы: `apps/webapp/migrations/031_system_settings.sql`, `apps/webapp/src/modules/system-settings/*`

Итог: целевая модель “ключи интеграций и whitelist ID управляются из admin settings” реализована частично.

### 1.2 Stage 12 Reminders

- Базовый reminders-флоу реализован (экран, CRUD, bell, seen/unseen, статистика, relay уведомления об изменении rules).
- Полная policy “важных сообщений, вариант B” в утвержденном виде не закрыта end-to-end:
  - подтвержденное чтение как триггер (open/click),
  - delayed SMS fallback после окна ожидания,
  - лимиты/дедуп/очередь по policy из `USER_TODO_STAGE.md`.

---

## 2) Нумерация этапов (принято)

Единая нумерация, которую используем далее во всех новых документах:

- **Stage 14** = Settings/Admin
- **Stage 15** = PWA (отложен)

---

## 3) Отложено после prod (обязательный backlog)

## 3.1 Stage 12 — довести policy “важных сообщений” (вариант B)

Сделать отдельный post-prod пакет (Stage 12B):

1. Delivery policy engine по типам событий (appointment/lfk/chat/important/broadcast).
2. Для `important`:
   - fanout в мессенджеры + email;
   - ожидание `confirmed-read` по правилам;
   - SMS fallback по `important_fallback_delay_minutes`.
3. Единый idempotency/dedup/anti-spam слой:
   - лимит `20/день` на пользователя,
   - очередь совпадающих событий с паузой `30` секунд.
4. Метрики и хранение history по согласованному retention.
5. Полный набор integration + e2e сценариев policy.

## 3.2 Перенос ключей интеграций и whitelist ID в БД/admin

Сделать отдельный post-prod пакет (Stage 14.4+):

1. Добавить модель хранения секретов/URI/ID в БД (с разграничением доступа и аудитом).
2. Добавить admin API для управления этими значениями (без утечки секретов в UI).
3. Перевести runtime webapp/integrator на чтение из БД через безопасный cache/adapter.
4. Оставить env только как bootstrap/fallback (или только для секрета шифрования/доступа к secret-store).
5. Подготовить миграционный runbook: dual-read -> cutover -> cleanup.

## 3.2.a Детальный план (обязателен перед реализацией)

Перед стартом кодинга подготовить отдельный исполнимый план уровня `PLANS/`:

1. Разделить типы настроек:
   - secrets (ключи/токены),
   - non-secret runtime settings (URI/флаги/лимиты),
   - whitelist IDs.
2. Определить источник истины на переход:
   - phase 1: dual-read (DB -> env fallback),
   - phase 2: DB-only для non-secret + whitelist,
   - phase 3: перенос secrets в secret-store/защищенное хранилище и выдача в runtime.
3. Добавить аудит и маскирование секретов в UI/API.
4. Прописать rollback/cutover-checklist.
5. Закрыть тестами: unit/integration/e2e + smoke на staging.

Это задача post-prod.

## 3.3 Stage 17 — Карта пациента (следующий этап после 3.2)

После завершения пункта 3.2 (перенос ключей/whitelist в admin) следующим этапом запускается Stage 17.

См. целевой scope в разделе 3.4.

## 3.4 Stage 16 — Реферальная система

Отложено до отдельной декомпозиции в `PLANS/`.
Минимальный scope для старта:

1. `referral_codes`, `referral_visits`, `referral_conversions`.
2. Генерация персональной ссылки.
3. Копирование ссылки из UI + tracking перехода.
4. Базовая аналитика конверсии.

## 3.5 Stage 17 — Карта пациента

Отложено до отдельной декомпозиции в `PLANS/`.
Целевой scope по текущим документам:

- Из `RAW_PLAN.md`:
  - история приемов;
  - анамнез, жалобы/симптомы, осмотр, предположение/диагноз, рекомендации;
  - связь с динамикой дневников;
  - атрибуты: первичный/повторный прием, дата рождения, вес, рост, ИМТ, анамнез заболеваний;
  - сервисные поля по записи: услуга, длительность, филиал.
- Из `ROADMAP.md` (Stage 17):
  - `patient_cards`, `patient_visits`;
  - CRUD API;
  - UI карты пациента и формы записи визита.
- Из `MASTER_PLAN_EXEC.md`:
  - в текущий execution-пайплайн A-G Stage 17 не входил.

## 3.6 Stage 19 — Сценарии в БД

Отложено до отдельной декомпозиции в `PLANS/`.
Нужные блоки:

1. DB schema `script_definitions` + versioning + status (draft/published).
2. Runtime loader: DB-first + file fallback на переходный период.
3. Admin API для CRUD сценариев + аудит изменений.
4. UI редактор сценариев (минимум табличный).
5. Миграция текущих JSON-сценариев в БД + валидация/preview перед publish.

## 3.7 Stage 15 (PWA), OAuth скрытые варианты, Stage 20 — отложено post-prod

- Stage 15 (PWA): отложен до стабилизации основных прод-контуров.
- OAuth Google/Apple (скрытые варианты авторизации): остаются post-prod, пока в runtime только текущий согласованный flow.
- Stage 20 (мультитенантность/платежи): явно отложен до завершения Stage 19 и стабилизации core-платформы.

---

## 3.8 Матрица решений владельца по списку 1-9 (2026-03-25)

1. Детальный план переноса ключей из env в админку — **да, обязателен** (см. 3.2.a).
2. Перенос whitelist в админку — **да, в том же пакете** (см. 3.2, 3.2.a).
3. Пакет переноса (ключи + whitelist) — **post-prod**.
4. Скрытые варианты авторизации (OAuth Google/Apple) — **post-prod**.
5. Stage 15 (PWA) — **post-prod**.
6. Stage 16 (Referrals) — **post-prod**.
7. Stage 17 (Patient Card) — **следующий этап после пункта 1/2**.
8. Stage 19 (Scenarios DB) — **post-prod**.
9. Stage 20 (Multitenant/Payments) — **post-prod, после Stage 19**.

---

## 3.9 Уточнение по “важным сообщениям” (as-is)

По текущему коду webapp:

- `POST /api/integrator/reminders/dispatch` вызывает `handleReminderDispatch(...)`.
- `handleReminderDispatch(...)` сейчас возвращает `accepted: false` с причиной `"durable reminder dispatch is not implemented"`.

То есть на текущем этапе **нет подтвержденной end-to-end доставки “важных сообщений во все каналы”**.  
Соответственно, дело не только в отсутствии `read/open`-сигналов — не реализован durable dispatch-контур целиком.

---

## 4) Чего не хватает в планах прямо сейчас

В `docs/FULL_DEV_PLAN/PLANS/` отсутствуют полноценные исполнимые пакеты для:

- Stage 16 (Referrals),
- Stage 17 (Patient Card),
- Stage 19 (Scenarios DB).

Перед запуском реализации обязательна декомпозиция уровня `PLAN.md` + `FIX_PLAN_STAGE_XX.md` по образцу Stages 11–14.
