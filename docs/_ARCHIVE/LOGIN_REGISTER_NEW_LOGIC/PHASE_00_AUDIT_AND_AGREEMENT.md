# Фаза 0 — аудит и согласование

**Статус:** `done` (аудит + scope согласован 2026-05-19)  
**Канон:** [MAIN PLAN.md](MAIN%20PLAN.md) §8, §12  
**Следующий этап:** [PHASE_01](PHASE_01_RUBITIME_PLATFORM_USER.md), [PHASE_02](PHASE_02_CONTACT_EMAIL_POLICY.md) (после gate)

## Цель

Зафиксировать текущее поведение и согласовать объём реализации **без** большого diff до подписания плана.

## Scope

### В scope

- Проход по [`CODE_AUDIT_MAP.md`](CODE_AUDIT_MAP.md)
- Краткий implementation outline: файлы, миграции, новые API, тесты
- Обновление [`LOG.md`](LOG.md) с выводами аудита

### Вне scope

- Продуктовый код (кроме правок docs)
- Prod SQL / backfill
- Массовая рассылка писем

## Definition of Done

- [x] Заполнены выходы аудита в `CODE_AUDIT_MAP.md` / [`LOG.md`](LOG.md) / [`AUDIT_REPORT.md`](AUDIT_REPORT.md)
- [x] Scope согласован — [`SCOPE_DECISIONS.md`](SCOPE_DECISIONS.md): MVP **01 + 02→03→04→05**; 06–08 **deferred** (задачи по старой базе сохранены)
- [x] Подтверждена таблица `user_email_setup_tokens` (поля из MAIN PLAN §9)
- [x] Список новых endpoint (черновик):
  - `POST /api/auth/email-setup/validate` (или GET по token)
  - `POST /api/auth/email-setup/complete`
  - `POST /api/auth/email-setup/resend`
  - `POST /api/auth/email-password/lookup` (опционально — состояние email)
- [x] Обновлён [`ROADMAP.md`](ROADMAP.md)

## Локальные проверки

- [ ] `rg` по якорям из `CODE_AUDIT_MAP.md` — пути существуют
- [ ] Сверка с [`PLATFORM_IDENTITY_SCENARIOS_AND_CODE_MAP.md`](../ARCHITECTURE/PLATFORM_IDENTITY_SCENARIOS_AND_CODE_MAP.md)

## Gate

**Закрыт (2026-05-19).** Можно начинать PHASE_01 и PHASE_02. Backfill/mass mail не делать.
