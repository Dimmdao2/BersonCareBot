# Ч7-з — независимый аудит удаления обязательной 2FA (#1082)

Тест или взгляд: **смешанный этап** — удаление глобального ключа/читателей и форма migration проверяются взглядом и census; добровольный TOTP и вход персонала проверяются поведением.

## Authority

- `AGENTS.md` §1 «Миграции», §5, §10a–§10b, §24.
- `docs/_TODO/SINGLE_ENTRY_CLEANUP_2026-08-01.md`, Ч7-з.
- Product candidate `22a7a1acb` на `wt/2fa-enforcement-current`.
- Owner requirement: удалить только платформенное принуждение персонала к 2FA; добровольный TOTP, проверка уже заведённого фактора, recovery и merge-security не ослаблять.

Источник оракула: `docs/_TODO/SINGLE_ENTRY_CLEANUP_2026-08-01.md`, строка Ч7-з, и прямое решение владельца, записанное в board у исходного `92388d1df`.

## Kill-set до чтения тестов

1. Staff без заведённого фактора после password login попадает в свой кабинет, а не в обязательную настройку TOTP.
2. Глобального переключателя `auth_2fa_enabled` нет в UI, platform settings API, registry/runtime и production readers.
3. Staff с уже заведённым фактором без подтверждения в текущей сессии по-прежнему не проходит doctor workspace.
4. Recovery/recovery-confirmation по-прежнему ограничивает остальные staff surfaces и допускает завершение собственного recovery в account.
5. TOTP start/status/verify и merge-защита существуют и не ослаблены этим diff.
6. `0303` удаляет только legacy key из двух settings-таблиц; journal продолжает принятые `0300`–`0302` и не занимает чужой номер.

## Метод и verdict

- Сначала составить собственный kill-set, затем inspect diff/callers/back-references; `code-search` перед широким grep.
- Поведенческие тесты можно дополнить только если существующие не ловят обязательный сценарий; fault injection — один раз на независимый класс.
- Аудитор не исправляет product. Временные mutations откатывает. Может коммитить только acceptance tests и `DROP_2FA_ENFORCEMENT_AUDIT_REPORT.md`.
- DEV/TEST/PROD, DDL и применение migration запрещены.
- PASS только если обязательное принуждение исчезло, а добровольная/уже активированная 2FA не стала слабее.

