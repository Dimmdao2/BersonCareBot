# Rubitime retirement — архив

**Статус:** Rubitime выведено из эксплуатации 2026-07-27.
**Решение владельца 2026-07-29:** «Rubitime у нас больше нет — убирать в архив явно».

Эта папка — только исторический след завершённого перехода. Ни один находящийся здесь plan, runbook, SQL/JS
one-shot или operator packet не является текущим entrypoint и не должен запускаться как часть DEV, TEST или PROD
runtime. Текущая запись работает через provider-neutral canonical booking.

## Безопасность

- Текущая машина `151.241.228.122` — только DEV/RELAY/TEST.
- PROD находится только на `135.106.162.170` (`adelaide`).
- Архивные команды с `*.prod`, `/opt/projects/bersoncarebot` или `bersoncarebot-*-prod.service` не выполнять.
- Текущий канон среды и операций: [`SERVER CONVENTIONS.md`](../../ARCHITECTURE/SERVER%20CONVENTIONS.md).

## Состав

- [`ARCHITECTURE/`](ARCHITECTURE/) — историческое устройство Rubitime pipeline.
- [`REPORTS/`](REPORTS/) — закрытые отчёты и отменённый API2 backlog.
- [`PLANS/`](PLANS/) — закрытые IDE-планы.
- [`SAAS_FOUNDATION/`](SAAS_FOUNDATION/) — retirement-планы R1–R7, proof, manifests и archive-only one-shot scripts.
- [`HISTORICAL/`](HISTORICAL/) — отменённые Rubitime-dependent планы из прежнего backlog.
- [`RUBITIME_CSV_BACKFILL.md`](RUBITIME_CSV_BACKFILL.md) и
  [`RUBITIME_R1_FRESH_PROD_DUMP_AGENT_README.md`](RUBITIME_R1_FRESH_PROD_DUMP_AGENT_README.md) — исторические
  fresh-copy материалы.
- [`TRACK_C_R5_R7_EVIDENCE_MATRIX.md`](TRACK_C_R5_R7_EVIDENCE_MATRIX.md) — промежуточная evidence matrix старого
  retirement-прохода.

Упоминания Rubitime в старых журналах и исходном коде могут сохраняться как provenance или схема миграции.
Они не означают наличие действующей интеграции.

Все файлы в `SAAS_FOUNDATION/scripts/` лишены executable-bit и содержат безусловный fail-closed guard до
исторической логики. Их исходный текст сохранён только как provenance; `node`, `bash` и package scripts не должны
использовать эту папку как источник entrypoint.
