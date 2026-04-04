# Промпты для авто-агентов (AUTH_RESTRUCTURE)

Контекст инициативы:

- Master plan: `docs/AUTH_RESTRUCTURE/MASTER_PLAN.md`
- Stage plans: `docs/AUTH_RESTRUCTURE/STAGE_*.md`
- Execution log: `docs/AUTH_RESTRUCTURE/AGENT_EXECUTION_LOG.md`

Общие правила для всех запусков:

1. Работать строго в scope указанного stage.
2. После каждой завершенной подзадачи обновлять `AGENT_EXECUTION_LOG.md`.
3. Перед закрытием stage запускать релевантные тесты и `pnpm run ci`.
4. Не менять продуктовые ограничения:
   - PIN скрыт в публичном auth-flow;
   - Yandex OAuth backend-only (без UI публикации);
   - Email как подключаемый канал в профиле.
5. Каждый запуск AUDIT обязан сохранять отчет:
   - `docs/AUTH_RESTRUCTURE/AUDIT_STAGE_<N>.md` для stage audit,
   - `docs/AUTH_RESTRUCTURE/AUDIT_GLOBAL.md` для final audit.
6. Каждый audit-файл должен содержать раздел `MANDATORY FIX INSTRUCTIONS`.
7. FIX и FINAL_FIX обязаны закрыть все `critical` и `major` из mandatory instructions.

---

## Stage 1 - EXEC

```text
Выполни Stage 1 по документам:
- docs/AUTH_RESTRUCTURE/STAGE_1_SMS_ERROR_MAPPING.md
- docs/AUTH_RESTRUCTURE/MASTER_PLAN.md

Требования:
1) Реализуй S1.T01-S1.T05.
2) Маппинг ошибок: delivery failure != invalid_phone.
3) Обнови docs/AUTH_RESTRUCTURE/AGENT_EXECUTION_LOG.md.
4) Прогони релевантные тесты и pnpm run ci.

Итог:
- S1.Txx -> done/blocked
- changed files
- checks run
- gate verdict: PASS | REWORK_REQUIRED
```

## Stage 1 - AUDIT

```text
Проведи аудит Stage 1.

Проверь:
1) Ошибки доставки маппятся в delivery_failed.
2) API message для delivery_failed корректен.
3) UI не показывает "Неверный формат номера" для service failures.
4) Есть тесты и CI evidence.

Формат:
- verdict: PASS | REWORK_REQUIRED
- findings by severity
- сохрани в docs/AUTH_RESTRUCTURE/AUDIT_STAGE_1.md
- добавь MANDATORY FIX INSTRUCTIONS
```

## Stage 1 - FIX

```text
Исправь замечания Stage 1 AUDIT.
Только Stage 1 scope.

Вход: docs/AUTH_RESTRUCTURE/AUDIT_STAGE_1.md

Обязательное:
1) Закрыть все critical и major.
2) Обновить AGENT_EXECUTION_LOG.md.
3) Повторить tests + pnpm run ci.
```

---

## Stage 2 - EXEC

```text
Выполни Stage 2 по документам:
- docs/AUTH_RESTRUCTURE/STAGE_2_INTERNATIONAL_PHONE_VALIDATION.md
- docs/AUTH_RESTRUCTURE/MASTER_PLAN.md

Сделай:
1) Реализуй S2.T01-S2.T08.
2) Поле телефона: международное + inline validation.
3) API валидирует E.164.
4) Обнови AGENT_EXECUTION_LOG.md.
5) Прогони релевантные тесты + pnpm run ci.
```

## Stage 2 - AUDIT

```text
Проведи аудит Stage 2.

Проверь:
1) InternationalPhoneInput включен в AuthFlowV2.
2) Невалидный номер не уходит на backend.
3) API-роуты используют isValidPhoneE164.
4) Тесты покрывают +1 +44 +49 +380 +7.
5) CI evidence присутствует.

Сохрани в docs/AUTH_RESTRUCTURE/AUDIT_STAGE_2.md
Добавь MANDATORY FIX INSTRUCTIONS.
```

## Stage 2 - FIX

```text
Исправь замечания Stage 2 AUDIT.
Scope только Stage 2.
Вход: docs/AUTH_RESTRUCTURE/AUDIT_STAGE_2.md
Обнови AGENT_EXECUTION_LOG.md, повтори tests + pnpm run ci.
```

---

## Stage 3 - EXEC

```text
Выполни Stage 3 по документам:
- docs/AUTH_RESTRUCTURE/STAGE_3_TELEGRAM_LOGIN_WIDGET.md
- docs/AUTH_RESTRUCTURE/MASTER_PLAN.md

Сделай:
1) Реализуй S3.T01-S3.T08.
2) Telegram Login Widget как primary action в web login.
3) Проверка подписи и auth_date TTL на backend.
4) Не показывай widget в Mini App host.
5) Обнови AGENT_EXECUTION_LOG.md.
6) Прогони tests + pnpm run ci.
```

## Stage 3 - AUDIT

```text
Проведи аудит Stage 3.

Проверь:
1) Подпись Telegram Login Widget валидируется корректно.
2) session создается после успешного callback.
3) AuthFlowV2 показывает Telegram как primary.
4) Mini App host корректно исключает widget.
5) CI evidence подтвержден.

Сохрани в docs/AUTH_RESTRUCTURE/AUDIT_STAGE_3.md
Добавь MANDATORY FIX INSTRUCTIONS.
```

## Stage 3 - FIX

```text
Исправь замечания Stage 3 AUDIT.
Scope только Stage 3.
Вход: docs/AUTH_RESTRUCTURE/AUDIT_STAGE_3.md
Обнови AGENT_EXECUTION_LOG.md, повтори tests + pnpm run ci.
```

---

## Stage 4 - EXEC

```text
Выполни Stage 4 по документам:
- docs/AUTH_RESTRUCTURE/STAGE_4_AUTH_METHODS_BY_PHONE_TYPE.md
- docs/AUTH_RESTRUCTURE/MASTER_PLAN.md

Сделай:
1) Реализуй S4.T01-S4.T05.
2) SMS только для РФ номеров.
3) Email/OAuth не показывать в публичном login UI.
4) API guard sms_ru_only.
5) Обнови AGENT_EXECUTION_LOG.md.
6) Прогони tests + pnpm run ci.
```

## Stage 4 - AUDIT

```text
Проведи аудит Stage 4.

Проверь:
1) +49 номер -> sms false.
2) sms channel + non-RU -> sms_ru_only.
3) +7 сценарий работает.
4) Публичный UI не показывает Email/OAuth.
5) CI evidence присутствует.

Сохрани в docs/AUTH_RESTRUCTURE/AUDIT_STAGE_4.md
Добавь MANDATORY FIX INSTRUCTIONS.
```

## Stage 4 - FIX

```text
Исправь замечания Stage 4 AUDIT.
Scope только Stage 4.
Вход: docs/AUTH_RESTRUCTURE/AUDIT_STAGE_4.md
Обнови AGENT_EXECUTION_LOG.md, повтори tests + pnpm run ci.
```

---

## Stage 5 - EXEC

```text
Выполни Stage 5 по документам:
- docs/AUTH_RESTRUCTURE/STAGE_5_HIDE_PIN_PUBLIC_AUTH_FLOW.md
- docs/AUTH_RESTRUCTURE/MASTER_PLAN.md

Сделай:
1) Реализуй S5.T01-S5.T04.
2) Убери set_pin из публичного flow.
3) После успешного login делай редирект сразу.
4) Не удаляй backend PIN возможности вне публичного login.
5) Обнови AGENT_EXECUTION_LOG.md.
6) Прогони tests + pnpm run ci.
```

## Stage 5 - AUDIT

```text
Проведи аудит Stage 5.

Проверь:
1) set_pin отсутствует в публичном auth-flow.
2) SMS/Telegram login -> immediate redirect.
3) Нет скрытой зависимости от PinInput в login.
4) CI evidence подтвержден.

Сохрани в docs/AUTH_RESTRUCTURE/AUDIT_STAGE_5.md
Добавь MANDATORY FIX INSTRUCTIONS.
```

## Stage 5 - FIX

```text
Исправь замечания Stage 5 AUDIT.
Scope только Stage 5.
Вход: docs/AUTH_RESTRUCTURE/AUDIT_STAGE_5.md
Обнови AGENT_EXECUTION_LOG.md, повтори tests + pnpm run ci.
```

---

## Stage 6 - EXEC

```text
Выполни Stage 6 по документам:
- docs/AUTH_RESTRUCTURE/STAGE_6_BOT_REQUEST_CONTACT_AND_ONBOARDING.md
- docs/AUTH_RESTRUCTURE/MASTER_PLAN.md

Сделай:
1) Реализуй S6.T01-S6.T06.
2) /start без номера -> приветствие -> сразу request_contact.
3) После привязки onboarding не повторяется.
4) Max: аналогичный flow или документированный fallback.
5) Обнови AGENT_EXECUTION_LOG.md.
6) Прогони tests + pnpm run ci.
```

## Stage 6 - AUDIT

```text
Проведи аудит Stage 6.

Проверь:
1) Канонический текст и эмодзи (👋 ✅ ❗) соблюдены.
2) request_contact идет сразу после приветствия.
3) Повторный /start после линка номера не запускает onboarding заново.
4) Проекция номера в webapp работает.
5) CI evidence присутствует.

Сохрани в docs/AUTH_RESTRUCTURE/AUDIT_STAGE_6.md
Добавь MANDATORY FIX INSTRUCTIONS.
```

## Stage 6 - FIX

```text
Исправь замечания Stage 6 AUDIT.
Scope только Stage 6.
Вход: docs/AUTH_RESTRUCTURE/AUDIT_STAGE_6.md
Обнови AGENT_EXECUTION_LOG.md, повтори tests + pnpm run ci.
```

---

## Stage 7 - EXEC

```text
Выполни Stage 7 по документам:
- docs/AUTH_RESTRUCTURE/STAGE_7_YANDEX_OAUTH_BACKEND_ONLY.md
- docs/AUTH_RESTRUCTURE/MASTER_PLAN.md

Сделай:
1) Реализуй S7.T01-S7.T06.
2) OAuth flow backend-ready.
3) UI-кнопку OAuth в публичном login не добавлять.
4) Конфиг через system_settings, не через env.
5) Обнови AGENT_EXECUTION_LOG.md.
6) Прогони tests + pnpm run ci.
```

## Stage 7 - AUDIT

```text
Проведи аудит Stage 7.

Проверь:
1) oauth/callback end-to-end работает.
2) merge по email не создает дублей.
3) OAuth не опубликован в публичном login UI.
4) system_settings ключи подтверждены.
5) CI evidence подтвержден.

Сохрани в docs/AUTH_RESTRUCTURE/AUDIT_STAGE_7.md
Добавь MANDATORY FIX INSTRUCTIONS.
```

## Stage 7 - FIX

```text
Исправь замечания Stage 7 AUDIT.
Scope только Stage 7.
Вход: docs/AUTH_RESTRUCTURE/AUDIT_STAGE_7.md
Обнови AGENT_EXECUTION_LOG.md, повтори tests + pnpm run ci.
```

---

## Stage 8 - EXEC

```text
Выполни Stage 8 по документам:
- docs/AUTH_RESTRUCTURE/STAGE_8_CLEANUP_AND_DOCS.md
- docs/AUTH_RESTRUCTURE/MASTER_PLAN.md

Сделай:
1) Реализуй S8.T01-S8.T07.
2) Обнови auth/docs/config docs.
3) Проверь SMS operational logging.
4) Сформируй residual risks для global audit.
5) Обнови AGENT_EXECUTION_LOG.md.
6) Прогони tests + pnpm run ci.
```

## Stage 8 - AUDIT

```text
Проведи аудит Stage 8.

Проверь:
1) Legacy элементы auth убраны.
2) Документация соответствует фактическому поведению.
3) Ограничения (PIN hidden, OAuth backend-only, Email profile-only) задокументированы.
4) CI evidence присутствует.

Сохрани в docs/AUTH_RESTRUCTURE/AUDIT_STAGE_8.md
Добавь MANDATORY FIX INSTRUCTIONS.
```

## Stage 8 - FIX

```text
Исправь замечания Stage 8 AUDIT.
Scope только Stage 8.
Вход: docs/AUTH_RESTRUCTURE/AUDIT_STAGE_8.md
Обнови AGENT_EXECUTION_LOG.md, повтори tests + pnpm run ci.
```

---

## FINAL_AUDIT (глобальный)

```text
Проведи итоговый аудит всей инициативы AUTH_RESTRUCTURE (Stages 1-8).

Документы:
- docs/AUTH_RESTRUCTURE/MASTER_PLAN.md
- docs/AUTH_RESTRUCTURE/STAGE_*.md
- docs/AUTH_RESTRUCTURE/AUDIT_STAGE_*.md
- docs/AUTH_RESTRUCTURE/AGENT_EXECUTION_LOG.md

Проверь:
1) Все stage gates закрыты или имеют явный остаточный риск.
2) Product constraints соблюдены:
   - PIN hidden in public flow,
   - OAuth backend-only,
   - Email profile-only.
3) Документация синхронизирована с реальным кодом.
4) CI evidence есть для финального состояния.
5) Нет открытых critical/major без плана исправления.

Формат:
- verdict: PASS | REWORK_REQUIRED
- findings by severity
- global residual risks
- сохрани в docs/AUTH_RESTRUCTURE/AUDIT_GLOBAL.md
- добавь MANDATORY FIX INSTRUCTIONS
```

## FINAL_FIX (глобальный)

```text
Исправь замечания из итогового аудита.

Вход:
- docs/AUTH_RESTRUCTURE/AUDIT_GLOBAL.md

Правила:
1) Закрыть все critical и major из MANDATORY FIX INSTRUCTIONS.
2) Не делать несогласованные продуктовые изменения.
3) Обновить docs/AUTH_RESTRUCTURE/AGENT_EXECUTION_LOG.md.
4) Повторить релевантные тесты и pnpm run ci.

Итог:
- закрытые пункты mandatory fixes
- changed files
- checks run
- final verdict: PASS | REWORK_REQUIRED
```
