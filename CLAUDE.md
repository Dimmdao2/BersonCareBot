# CLAUDE.md — авто-загружается КАЖДЫМ агентом в этом репозитории.

## Единый источник правил

Единственный канонический текст правил агентов — **[`AGENTS.md`](AGENTS.md)** (корень репозитория; Cursor
использует `.cursor/rules/000-start-here.mdc` — зеркало того же маршрута). Прочитай там раздел «Маршрут» и свои
разделы по маске путей; читать файл целиком не требуется. Правила не пересказываются здесь и нигде вне
`AGENTS.md` — чтобы не было рассинхрона между копиями.

## Оркестрация и автономная работа

- Чек-лист оркестратора (перечитывать после каждого сжатия контекста): `docs/ORCHESTRATOR_CHECKLIST.md`.
- Практический канон оркестрации этого репозитория: `docs/ORCHESTRATION_BINDINGS.md` (общий метод —
  `docs/AGENT_AUTORUN_SCHEME.md`; при конфликте побеждает `ORCHESTRATION_BINDINGS.md`).
- Агентов запускать только через `tools/orch-launch.sh` — гейт отказывает механически, если условия не выполнены.
- Луп/автономный агент: роль дополняет, не дублирует, правила `AGENTS.md` — регламент прогона
  `/home/dev/dev-projects/.lead/PIPELINE.md`, порядок работ `/home/dev/dev-projects/.lead/PLAN.md`, журнал
  `/home/dev/dev-projects/.lead/LEDGER.md`. Аудитор обязан проверять соблюдение правил `AGENTS.md` (изоляция,
  no raw SQL, dev/prod, ветки/деплой), а не только «работает ли».

## Куда смотреть по теме

Архитектура: `docs/ARCHITECTURE/SERVER CONVENTIONS.md`, `ARCHITECTURE.md`, `apps/webapp/ARCHITECTURE.md`.
Dev/тестирование: `docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`. Деплой/прод: `deploy/HOST_DEPLOY_README.md`.
