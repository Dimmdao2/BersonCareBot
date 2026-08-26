# Worker brief — identity / messenger login cleanup

Перед действием прочитать `AGENTS.md` (карта, §0, §1 migrations, §5, §10a/10b, §24), `docs/OWNER_DECISIONS.md:250-283`, `apps/webapp/src/modules/auth/auth.md` и активный `apps/webapp/INTEGRATOR_CONTRACT.md`.

Authority — owner: «бот подтверждает телефон, но не создаёт учётную запись»; webapp владеет постоянной записью контакта/аккаунта и merge; generic ingress ничего не создаёт. Общий и брендированный боты оба поддерживают phone bind/login.

Исходный audit: `docs/_TODO/runs/integrator-cleanup/DOMAIN_ACCESS_AUDIT_IDENTITY_2026-08-26.md`; сводка: `DOMAIN_ACCESS_AUDIT_SYNTHESIS_2026-08-26.md`.

## Цельный scope

1. Исправить patient messenger login на переходной single-Host TEST-схеме, не меняя домены и не открывая messenger login на staff/admin surface. Использовать route audience/уже существующий surface parameter; не заводить второй resolver.
2. Полностью удалить runtime `user.phone.link` и `app.integrator_bind_bootstrap_channel_phone(...)`: contracts/schemas/executor/write port/direct-public repo, capabilities/declaration/generated artifacts, старые активные docs. Не возвращать integrator право писать contact/merge другим именем.
3. Удалить ставший без caller `read_integrator_auth_channel_setting(...)` и осиротевший integrator policy path, если полный caller census подтверждает ноль живых потребителей.
4. Добавить только необходимые поведенческие tests: single-Host patient messenger route uses patient policy; complete path не вызывает `user.phone.link`; generic ingress не создаёт identity. Обновить существующие тесты по новой семантике, не сохранять legacy ради старых assertions.
5. Если нужны DROP/CREATE changes — forward timestamp migration и declaration/generated artifacts по §1. Миграция не выдаёт права.

## Проверка и готовность

- Targeted webapp/integrator tests по затронутым модулям.
- `generate-cli.mjs --check`, port-context check и migration lint/candidate preflight, если применимо.
- Письменно разобрать права каждой миграции по §1.
- Не запускать full CI, не deploy, не применять миграции живой DEV/TEST.
- Закоммитить весь task-scope явными pathspec; не push.

Источник оракула: `docs/OWNER_DECISIONS.md` — «бот подтверждает телефон, но не создаёт учётную запись» и «webapp владеет постоянной записью контакта/аккаунта и решением о merge».
