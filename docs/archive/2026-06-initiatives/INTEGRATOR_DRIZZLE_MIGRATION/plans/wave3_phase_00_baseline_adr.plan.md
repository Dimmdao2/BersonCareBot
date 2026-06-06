---
name: Wave3 Phase00 Baseline ADR
overview: Зафиксировать baseline raw SQL (Class A/B/C), ADR permanent zones, решения из wave3_DECISIONS — без доменного кода.
status: completed
isProject: false
todos:
  - id: w3-p00-rg-baseline
    content: "rg baseline: integrator db.query, webapp pool/client.query, media-worker, packages — counts в LOG."
    status: completed
  - id: w3-p00-raw-sql-class
    content: "RAW_SQL_INVENTORY: колонка/секция Class A|B|C; дата снимка 2026-06-05+."
    status: completed
  - id: w3-p00-adr-permanent
    content: "LOG §Wave3: ADR platform-merge, booking-rubitime-sync, claim, migrate, projectionHealthCore."
    status: completed
  - id: w3-p00-scope-confirm
    content: "Записать в LOG зафиксированные решения: полный webapp scope + messengerPhoneHttpBindExecute мигрируется в phase15 + staging smoke обязателен в phase17."
    status: completed
  - id: w3-p00-index
    content: "plans/README.md + DRIZZLE_TRANSITION_PLAN ссылка на wave3_INDEX + phase08 schema reduction + phase16 legacy cutover."
    status: completed
---

# Wave 3 — фаза 00: baseline и ADR

## Размер

**S** (документация + `rg`; без миграции доменного SQL).

## Definition of Done

- [x] Таблица baseline в [LOG.md](../../../../INTEGRATOR_DRIZZLE_MIGRATION/LOG.md) §Wave 3 baseline (counts по зонам).
- [x] [RAW_SQL_INVENTORY.md](../../../../INTEGRATOR_DRIZZLE_MIGRATION/RAW_SQL_INVENTORY.md) обновлён: Class A/B/C, integrator google-calendar в P1+, `integratorPushOutbox` (db.query).
- [x] [wave3_DECISIONS.md](./wave3_DECISIONS.md) — все 10 вопросов и owner decisions зафиксированы в LOG; phase16 отмечена как conditional cutover.
- [x] Permanent zones не требуют повторного обсуждения в фазах 09–15.
- [x] Добавлен policy-блок Drizzle+Zod для всех DB-границ в фазах 09–15.

## Scope

**Разрешено:** `docs/INTEGRATOR_DRIZZLE_MIGRATION/**`, `plans/README.md`.

**Вне scope:** правки `apps/*`, `packages/*` (кроме опечаток в комментариях если критично).

## Команды baseline (copy-paste)

```bash
# Integrator prod db.query (exclude migrate + scripts)
rg -l 'await db\.query' apps/integrator/src --glob '*.ts' | rg -v 'migrate\.ts|/scripts/'

# Webapp prod pool/client
rg -l 'pool\.query|client\.query' apps/webapp/src --glob '*.ts' | rg -v '\.test\.ts|integration\.test'

# Webapp db.query on Pool (integrator push)
rg -l '\.query\(' apps/webapp/src/infra/integrator-push --glob '*.ts'

# Media-worker
rg -c 'pool\.query|client\.query' apps/media-worker/src --glob '*.ts'

# Permanent packages
rg -c '\.query\(' packages/platform-merge/src --glob '*.ts'
rg -c '\.query\(' packages/booking-rubitime-sync/src --glob '*.ts'
```

## Ожидаемые цифры (2026-06-05, для сверки)

| Зона | Метрика |
|------|---------|
| Integrator P1+ files | **20** prod-файлов с `await db.query` |
| Webapp | **78** prod-файлов `pool\|client.query` |
| media-worker | claim **8** + process* **18** + settings **2** |
| platform-merge | **~92** query() |

## ADR permanent (текст для LOG)

- **platform-merge:** merge engine; Drizzle builder rewrite = out of scope.
- **booking-rubitime-sync:** `SqlExecutor` + pg text; canonical Rubitime fields unchanged.
- **claim (integrator + media-worker):** `SKIP LOCKED` on dedicated pg session.
- **projectionHealthCore:** parameterized aggregates; CLI/HTTP parity > builder.
- **migrate.ts / one-off scripts:** pg ledger transport.

## Закрытие (2026-06-05)

- Baseline `rg` выполнен; факт **85** `.query(` в platform-merge (не ~92) — уточнено в RAW_SQL и LOG.
- DoR для фазы 09 выполнен — см. [LOG.md](../../../../INTEGRATOR_DRIZZLE_MIGRATION/LOG.md) § «Wave 3 — фаза 00».

## Stop conditions

- Нет baseline Class A/B/C в RAW_SQL или нет ADR в LOG → не начинать фазу 09.
