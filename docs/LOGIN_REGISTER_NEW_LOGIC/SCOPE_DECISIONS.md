# Решения по scope (2026-05-19)

**Статус:** согласовано. Канон требований остаётся [MAIN PLAN.md](MAIN%20PLAN.md); этот файл **сужает** объём реализации.

## Отложено (волна 2+, задачи сохранены)

Не входит в **текущую** реализацию; спеки в [`docs/TODO_NOT_NOW/`](../TODO_NOT_NOW/README.md) ([PHASE_07](../TODO_NOT_NOW/login-register-backfill-appointments.md), [PHASE_08](../TODO_NOT_NOW/login-register-mass-setup-email.md)); §10 [MAIN PLAN](MAIN%20PLAN.md) **не удаляется** — вернёмся после live-flow.

- **PHASE_07** — backfill старых `appointment_records` / Rubitime-истории (dry-run → apply).
- **PHASE_08** — массовая рассылка setup-code **старой** базе (только после отдельного продуктового OK; legacy setup-link не использовать для новых писем).

**PHASE_06 (2026-05-20):** merge-страховка **закрыта** — docs + регрессионный тест §7.3; merge engine **не** менялся. См. [`PHASE_06_AUDIT.md`](PHASE_06_AUDIT.md).

## Вне scope волны 1 (не делать сейчас)

- Массовая обработка **старых** Rubitime-записей.
- Массовое создание `platform_user` для исторических `appointment_records` без `platform_user_id`.
- Массовая рассылка setup-code **старой** базе клиентов.

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
| Пользователь запросил доступ (register / «отправить код») | Выпустить setup-code |
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

Фазы **07–08** отложены. **MVP волны 1 (01–06) закрыт** (2026-05-20); post-MVP hardening — [`LOG.md`](LOG.md).

## Технические следствия (из аудита)

- Починить live-path: после `booking.upsert` доставлять identity в webapp (`appointment.record.upserted` или эквивалент) — см. [AUDIT_REPORT.md](AUDIT_REPORT.md) §2.
- Убрать overwrite `display_name` в `ensureAppointmentClientTx` для существующих users.
- Новая таблица `user_email_setup_tokens` + письмо со **ссылкой** (не только OTP `code`).
