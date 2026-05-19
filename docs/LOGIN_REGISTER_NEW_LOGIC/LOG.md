# Login / Register — журнал

Хронология по этапам [`ROADMAP.md`](ROADMAP.md). Факты prod (без секретов) — кратко; детали реализации — в коммитах и `PHASE_*`.

## 2026-05-19 — Старт инициативы

- Создана папка `docs/LOGIN_REGISTER_NEW_LOGIC/`: мастер-постановка [`MAIN PLAN.md`](MAIN%20PLAN.md), `README`, `ROADMAP`, `PHASE_00`…`PHASE_08`, [`CODE_AUDIT_MAP.md`](CODE_AUDIT_MAP.md).
- Зафиксирован продуктовый тупик (чат): бот-аккаунт + email от врача → `duplicate_email` при регистрации, forgot без `user_password_credentials` / `email_verified_at`, UI forgot всегда «успех».
- На prod проверка: `POST /api/bersoncare/send-email` **200** при отдельной попытке — SMTP/integrator живы; сценарий forgot для contact-only аккаунта в journal не виден (ожидаемо).

## Шаблон записи при закрытии этапа

```markdown
## YYYY-MM-DD — PHASE_N …

- Сделано: …
- Проверки: …
- Решения: …
- Не делали: …
```
