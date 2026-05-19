# Фаза 0 — аудит и согласование

**Статус:** `done` (аудит кода); gate на реализацию — **открыт** до продуктового согласования  
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
- [ ] Согласован порядок: MVP (фазы 2–5) vs параллельная фаза 1 — **предложение в AUDIT §10**
- [x] Подтверждена таблица `user_email_setup_tokens` (поля из MAIN PLAN §9)
- [x] Список новых endpoint (черновик):
  - `POST /api/auth/email-setup/validate` (или GET по token)
  - `POST /api/auth/email-setup/complete`
  - `POST /api/auth/email-setup/resend`
  - `POST /api/auth/email-password/lookup` (опционально — состояние email)
- [ ] Обновлён [`ROADMAP.md`](ROADMAP.md) при изменении scope — после ответов на вопросы согласования

## Локальные проверки

- [ ] `rg` по якорям из `CODE_AUDIT_MAP.md` — пути существуют
- [ ] Сверка с [`PLATFORM_IDENTITY_SCENARIOS_AND_CODE_MAP.md`](../ARCHITECTURE/PLATFORM_IDENTITY_SCENARIOS_AND_CODE_MAP.md)

## Gate

**Не начинать фазу 1+**, пока владелец продукта не подтвердил MVP и отсутствие массовых писем в фазе 7 без отдельного OK.
