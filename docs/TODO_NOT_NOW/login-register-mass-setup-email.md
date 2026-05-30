# Фаза 8 — Массовая рассылка setup (опционально)

**Статус:** `deferred` (scope 2026-05-19 — mass setup для старой базы; волна 2+)  
**Канон:** [MAIN PLAN.md](../LOGIN_REGISTER_NEW_LOGIC/MAIN%20PLAN.md) §10 (последний абзац)  
**Зависит от:** [PHASE_04](../LOGIN_REGISTER_NEW_LOGIC/PHASE_04_EMAIL_SETUP_FLOW.md), [фаза 7 — backfill](login-register-backfill-appointments.md)  
**Требует:** отдельное продуктовое и юридическое OK  
**Инициатива (волна 1 закрыта):** [`../LOGIN_REGISTER_NEW_LOGIC/README.md`](../LOGIN_REGISTER_NEW_LOGIC/README.md)

## Цель

Разослать setup-коды историческим пациентам с contact email и без password — **только** по явному решению. Legacy setup-link не использовать для новых массовых писем.

## Gate (все обязательны)

- [ ] Продукт: список сегментов и текст письма  
- [ ] Лимиты SMTP / согласие на нагрузку  
- [ ] Dry-run фазы 7 завершён  
- [ ] Feature flag или one-shot script с подтверждением оператора  
- [ ] Откат не требует удаления users; для кодового flow достаточно истечения TTL/cooldown, без новых persistent setup tokens  

## Definition of Done

Не применяется, пока статус `deferred`. При активации волны 2+ — отдельная запись в [`LOG.md`](../LOGIN_REGISTER_NEW_LOGIC/LOG.md) с датой и объёмом рассылки.

## Примечание

Пока фаза **отложена**, агенты **не** реализуют batch-send в рамках фаз 1–5 (live-flow).
