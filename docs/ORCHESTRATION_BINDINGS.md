# BersonCare orchestration — операционная справка

Нормативные правила находятся только в [`AGENTS.md` §24](../AGENTS.md#24-оркестрация-субагентов). Здесь записаны
только текущие пути и команды BersonCare; при изменении поведения правится `AGENTS.md`, при изменении команды —
сам инструмент и эта справка.

## Текущие значения

| Назначение | Значение |
|---|---|
| Главный checkout | `/home/dev/dev-projects/BersonCareBot` |
| Интеграционная ветка | `feat/doctor-ui-rebuild` |
| Dev webapp | `http://127.0.0.1:5200` |
| Taskdb | `node /home/dev/brain/tools/taskdb.mjs <cmd>` |
| Code search | `node /home/dev/brain/tools/code-search.mjs "<query>" --repo bcb [-k N]` |
| Полные прогоны | `/home/dev/brain/host-orch/run-tests.sh "<cmd>"` |
| Cron | `node /home/dev/brain/tools/cronport.mjs <cmd>` |
| Audit queue | `docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md` |
| Host seal ledger | `/home/dev/brain/host-orch/round3/SEAL_LEDGER.md` |

## Stateful-агенты

Актуальный интерфейс:

```bash
tools/orch-launch.sh --help
```

Поддерживаемые операции: `worker`, `auditor-live`, `land`. Для короткоживущего automated shell используется
`ORCH_WAIT=1`. Для операции без plan-файла authority задаёт self-contained brief и `ORCH_OPS="<причина>"`.

## Dev-login для живой проверки

```bash
curl -s -c /tmp/r3.cookies -L \
  "http://127.0.0.1:5200/api/auth/dev-bypass?token=dev%3Adoctor&next=/app/doctor"
```

Для admin используется `dev%3Aadmin`. Остальные dev/host-факты находятся в
`docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md` и `docs/ARCHITECTURE/SERVER CONVENTIONS.md`.
