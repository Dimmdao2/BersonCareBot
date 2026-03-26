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
