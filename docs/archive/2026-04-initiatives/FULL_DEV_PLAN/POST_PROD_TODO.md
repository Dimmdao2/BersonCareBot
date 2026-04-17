# POST_PROD_TODO — Задачи после стабилизации prod

Дата: 2026-03-25 (обновлено)  
Назначение: зафиксировать отложенные задачи, которые выполняются **после** стабилизации prod и завершения pre-prod пакетов.  
Pre-prod задачи (ключи/whitelist → admin, durable dispatch): см. `PRE_PROD_TODO.md`.

---

## Нумерация этапов (принято)

- **Stage 14** = Settings/Admin
- **Stage 15** = PWA (отложен)

---

## 1) Stage 17 — Карта пациента

Следующий этап после завершения pre-prod пакетов 1+2 (перенос ключей и whitelist в admin/DB).  
Подробный анализ готовности, список полей, и вопросы к владельцу — в `PRE_PROD_TODO.md`, раздел 4.

Целевой scope:

- DB: `patient_cards`, `patient_visits`
- API: CRUD
- UI: карта пациента, история визитов, динамика симптомов
- UI: форма записи визита (тип, жалобы, осмотр, диагноз, рекомендации)
- Связь с дневниками и записями из rubitime

Статус: **ожидает решений владельца** (поля, workflow, layout).

---

## 2) Stage 16 — Реферальная система

Отложено до отдельной декомпозиции в `PLANS/`.
Минимальный scope:

1. `referral_codes`, `referral_visits`, `referral_conversions`.
2. Генерация персональной ссылки.
3. Копирование ссылки из UI + tracking перехода.
4. Базовая аналитика конверсии.

---

## 3) Stage 19 — Сценарии в БД

Отложено до отдельной декомпозиции в `PLANS/`.
Нужные блоки:

1. DB schema `script_definitions` + versioning + status (draft/published).
2. Runtime loader: DB-first + file fallback на переходный период.
3. Admin API для CRUD сценариев + аудит изменений.
4. UI редактор сценариев (минимум табличный).
5. Миграция текущих JSON-сценариев в БД + валидация/preview перед publish.

---

## 4) Stage 15 (PWA), OAuth скрытые варианты, Stage 20

- **Stage 15 (PWA)**: отложен до стабилизации основных прод-контуров.
- **OAuth Google/Apple** (скрытые варианты авторизации): остаются post-prod, в runtime только текущий согласованный flow (Яндекс).
- **Stage 20** (мультитенантность/платежи): после Stage 19 и стабилизации core-платформы.

---

## 5) Матрица решений владельца (2026-03-25, обновлено)

| # | Задача | Статус |
|---|--------|--------|
| 1 | Перенос ключей из env в admin/DB | **PRE-PROD** → `PRE_PROD_TODO.md` п.1 |
| 2 | Перенос whitelist в admin/DB | **PRE-PROD** → `PRE_PROD_TODO.md` п.2 |
| 3 | Durable dispatch для важных сообщений | **PRE-PROD** → `PRE_PROD_TODO.md` п.3 |
| 4 | OAuth Google/Apple | post-prod |
| 5 | Stage 15 (PWA) | post-prod |
| 6 | Stage 16 (Referrals) | post-prod |
| 7 | Stage 17 (Patient Card) | **следующий после pre-prod 1+2** |
| 8 | Stage 19 (Scenarios DB) | post-prod |
| 9 | Stage 20 (Multitenant/Payments) | post-prod, после Stage 19 |

---

## 6) Чего не хватает в планах

В `docs/FULL_DEV_PLAN/PLANS/` отсутствуют полноценные исполнимые пакеты для:

- Stage 16 (Referrals)
- Stage 17 (Patient Card) — анализ готовности в `PRE_PROD_TODO.md` п.4
- Stage 19 (Scenarios DB)

Перед запуском реализации обязательна декомпозиция уровня `PLAN.md` + `FIX_PLAN_STAGE_XX.md` по образцу Stages 11–14.

---

## 7) Pack I — отложено после prod (EXEC_I, 2026-03-25)

### 7.1 Напоминания: полноценное расписание (EXEC_D / RAW §5)

В Pack I **не** реализовывать UI/логику «расписания» напоминаний (календарь, привязка ко времени суток, визуальный таймлайн и т.п.) поверх текущей страницы `/app/patient/reminders`. Текущий экран — правила по категориям и статистика за 30 дней. Расширение до полного расписания — отдельная задача post-prod (согласовать с `EXEC_D_REMINDERS!!.md`).

### 7.2 Бейдж непрочитанных в чате поддержки (I.11)

Счётчик в шапке пациента: `countUnreadForUser` в `pgSupportCommunication.ts` — входящие сообщения **не** от `sender_role = 'user'` с `read_at IS NULL`. Если на prod отображается завышенное число (тестовый бэкфилл, дубли), **не** править логику подсчёта в Pack I; при необходимости ops вручную помечает сообщения прочитанными (только после проверки данных):

```sql
-- ОПАСНО: затронет все непрочитанные входящие от «не user» для пользователя.
-- Замените :platform_user_id на uuid из platform_users.
UPDATE support_conversation_messages m
SET read_at = COALESCE(read_at, now())
FROM support_conversations c
WHERE c.id = m.conversation_id
  AND c.platform_user_id = :platform_user_id::uuid
  AND m.sender_role <> 'user'
  AND m.read_at IS NULL;
```

Предпочтительно в будущем: точечная кнопка «Отметить прочитанным» / синхронизация `read_at` при открытии диалога (отдельная задача).
