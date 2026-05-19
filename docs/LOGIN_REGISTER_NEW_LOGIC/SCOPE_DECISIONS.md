# Решения по scope (2026-05-19)

**Статус:** согласовано. Канон требований остаётся [MAIN PLAN.md](MAIN%20PLAN.md); этот файл **сужает** объём реализации.

## Отложено (волна 2+, задачи сохранены)

Не входит в **текущую** реализацию; планы в [PHASE_07](PHASE_07_BACKFILL_APPOINTMENTS.md), [PHASE_08](PHASE_08_MASS_SETUP_EMAIL.md) и §10 [MAIN PLAN](MAIN%20PLAN.md) **не удаляются** — вернёмся после live-flow.

- **PHASE_07** — backfill старых `appointment_records` / Rubitime-истории (dry-run → apply).
- **PHASE_08** — массовая рассылка setup-link **старой** базе (только после отдельного продуктового OK).
- **PHASE_06** — merge hardening; существующий ручной merge **не ломать**.

## Вне scope волны 1 (не делать сейчас)

- Массовая обработка **старых** Rubitime-записей.
- Массовое создание `platform_user` для исторических `appointment_records` без `platform_user_id`.
- Массовая рассылка setup-link **старой** базе клиентов.

## В scope — только live-flow

Новые и текущие действия (webhook, post-create, врач сохранил email, пользователь на экране входа).

### 1. Новые Rubitime events

| Правило | Требование |
|---------|------------|
| Поиск | Сначала **телефон**, затем **email** |
| `appointment_records.platform_user_id` | Заполняется на live-path |
| Существующий user | **Имя не трогать** |
| Новый user | Имя из Rubitime |
| Телефон | Из Rubitime — **trusted** (`patient_phone_trust_at`) |
| Email | **Unverified** contact |

### 2. Email от врача / Rubitime (live)

- Contact / unverified; без auto `user_password_credentials`.
- Setup-link при **новом/актуальном** действии (запись Rubitime, врач изменил email, resend по запросу).
- **Не** слать setup всем, у кого email уже лежит в БД с прошлых месяцев.

### 3. Register / login (live)

| Ситуация | Поведение |
|----------|-----------|
| Email свободен | Обычная регистрация |
| Email у contact-only user, нет password | **Не** `duplicate_email` → `existing_account_needs_email_setup` / setup-required |
| Пользователь запросил доступ (register / «отправить ссылку») | Выпустить setup-link |
| После setup | Подтвердить email + создать пароль + сессия |

### 4. Forgot (live)

- Reset / OTP-forgot — только **`email_verified_at` + `user_password_credentials`**.
- Contact-only → **setup access**, не neutral-тупик без письма (внешний ответ может оставаться generic anti-enumeration — см. PHASE_05).

## Порядок реализации (MVP)

```text
PHASE_01 (Rubitime live)  ──┐
PHASE_02 (contact email)  ──┼──► PHASE_03 → PHASE_04 → PHASE_05
                            │
         (параллельно 01+02 после 00)
```

Фазы **06–08** отложены; в MVP только **01–05** (после 00).

## Технические следствия (из аудита)

- Починить live-path: после `booking.upsert` доставлять identity в webapp (`appointment.record.upserted` или эквивалент) — см. [AUDIT_REPORT.md](AUDIT_REPORT.md) §2.
- Убрать overwrite `display_name` в `ensureAppointmentClientTx` для существующих users.
- Новая таблица `user_email_setup_tokens` + письмо со **ссылкой** (не только OTP `code`).
