# Orchestration bindings — BersonCare (привязки этого репо к generic-канону)

> **Generic-мастер канона** (метод + роль-промпты) живёт в `/home/dev/orch/` (проект-агностичный shared-дом, НЕ в этом репо). Этот файл — тонкий указатель + привязки именно BersonCare. Другие репо делают свой такой файл со своими значениями.

## Мастер (читать оттуда)
- Метод: `/home/dev/orch/round3/AGENT_AUTORUN_SCHEME.v3.md` (⇄ копия в `docs/AGENT_AUTORUN_SCHEME.md`)
- Роль-промпты: `/home/dev/orch/roles/ROLE_PROMPTS_v3.md`
- Изменения/история: `/home/dev/orch/CANON_v3.1_CHANGELOG.md`

## Привязки BersonCare (значения плейсхолдеров мастера)
| Плейсхолдер | Значение для BersonCare |
|---|---|
| `{REPO_ROOT}` | `/home/dev/dev-projects/BersonCareBot` (главный worktree на `feat`) |
| `{MAIN_BRANCH}` (интеграционная) | `feat/doctor-ui-rebuild` (⛔ НЕ `main` без команды владельца) |
| `{SERVER}` | `http://127.0.0.1:5200` (один постоянный Next dev на feat) |
| `{DEV_LOGIN}` | `curl -s -c /tmp/r3.cookies -L "{SERVER}/api/auth/dev-bypass?token=dev%3Adoctor&next=/app/doctor"` (admin: `dev%3Aadmin`) |
| `{SEAL_LEDGER}` | `/home/dev/orch/round3/SEAL_LEDGER.md` (+ `verify-seals.sh`) |
| `{RUN_TESTS}` | `/home/dev/orch/run-tests.sh "<cmd>"` (flock-мьютекс, один за раз) |
| `{SCREENSHOTS}` | `{REPO_ROOT}/.claude/screenshots/<ITEM>/` (owner-facing история) |
| `{QUEUE}` / `{STATUS}` / `{ESCALATIONS}` | `/home/dev/orch/round3/{QUEUE.md, STATUS.json, ESCALATIONS.md}` |
| `{ETALON_UI}` | страница упражнений врача + `apps/webapp/src/shared/ui/doctor/*` |
| `{RULES}` | `AGENTS.md` + `.cursor/rules/*` (clean-arch, drizzle-only, no-dup) |
| `{HEARTBEAT}` | `{REPO_ROOT}/.r3-heartbeat` |

## Особенности репо
- Главный worktree — ЭКСКЛЮЗИВНО за контролёром; воркеры лупа и другие чаты — в своих изолированных worktree (см. память `shared-worktree-and-background-agents`).
- Прод: `main` = автодеплой ОТКЛЮЧЁН (ручной), Telegram-интегратор в `long_polling` для РУ-сервера. feat в main не мержим без команды владельца.
