# Wave 3 — финальный closeout (raw SQL tail ↓ / Drizzle + Zod / legacy cutover)

**Статус:** planning (2026-06-05)  
**Предшественник:** Wave 2 этапы 1–8 **completed**  
**Решения до старта:** [wave3_DECISIONS.md](./wave3_DECISIONS.md)

## Цель Wave 3

1. Закрыть **integrator P1+** (`db.query` хвосты) и **media-worker IX**.
2. Убрать необъяснённый **`pool.query` / `client.query`** в webapp runtime (Class **A**), либо перевести в Class **B/C** с ADR.
3. Убрать потребность в регулярном `migrate:legacy` для webapp (legacy только аварийный путь).
4. Синхронизировать **RAW_SQL_INVENTORY**, **DRIZZLE_TRANSITION_PLAN**, **LOG**; закрыть инициативу или явный backlog с причинами.
5. Для переносимых DB-участков в фазах 09–15: обязательный слой валидации через **Zod**.
6. До Drizzle-миграции хвостов integrator убрать/перенести дубли, которые после unified DB должны жить в `public`.

## Зафиксированные решения до старта

- Webapp scope: **полный closeout** runtime-файлов `apps/webapp/src` (без тестов), не top-N.
- `messengerPhoneHttpBindExecute.ts`: мигрируем в фазе 15 (Drizzle executor + Zod), не оставляем permanent C.
- media-worker: **без** shared schema package; только minimal executor в фазе 10.
- Staging smoke из `LOG.md` L182: обязательный gate перед closeout; без него Wave 3 остаётся blocked.
- `rubitimeApiThrottle`: throttle-row read/update переводим на Drizzle session на том же client (Class B).
- Google Calendar SQL: полностью в фазе 09.
- PR policy: **1 PR = 1 фаза** (исключение: `00+09`).
- Добавлена фаза 16: legacy migrations cutover + policy cleanup.
- Добавлена фаза 08: integrator schema reduction до P1+ Drizzle-работ.

## Фазы (порядок исполнения)

| # | Файл плана | Размер | Область | PR |
|---|------------|--------|---------|-----|
| 00 | [wave3_phase_00_baseline_adr.plan.md](./wave3_phase_00_baseline_adr.plan.md) | S | Baseline `rg`, Class A/B/C, ADR permanent zones | docs |
| 08 | [wave3_phase_08_integrator_schema_reduction.plan.md](./wave3_phase_08_integrator_schema_reduction.plan.md) | L | Убрать/перенести дубли integrator после unified DB | 1 |
| 09 | [wave3_phase_09_integrator_p1plus.plan.md](./wave3_phase_09_integrator_p1plus.plan.md) | M | Integrator: 20 prod-файлов `db.query` + throttle row | 1 |
| 10 | [wave3_phase_10_media_worker_ix.plan.md](./wave3_phase_10_media_worker_ix.plan.md) | M | media-worker: processTranscode*, settings reads; claim pg | 1 |
| 11 | [wave3_phase_11_webapp_app_layer_auth.plan.md](./wave3_phase_11_webapp_app_layer_auth.plan.md) | S | app-layer health/media; auth TX tail; мелкие outliers | 1 |
| 12 | [wave3_phase_12_webapp_intake_purge_identity.plan.md](./wave3_phase_12_webapp_intake_purge_identity.plan.md) | L | intake, purge, identity, phone bind, merge preview | 1 |
| 13 | [wave3_phase_13_webapp_booking_doctor.plan.md](./wave3_phase_13_webapp_booking_doctor.plan.md) | L | booking catalog, appointments, doctor clients/analytics | 1 |
| 14 | [wave3_phase_14_webapp_comms_projection.plan.md](./wave3_phase_14_webapp_comms_projection.plan.md) | L | support comms, user projection, admin audit | 1 |
| 15 | [wave3_phase_15_webapp_long_tail.plan.md](./wave3_phase_15_webapp_long_tail.plan.md) | M | references, settings, symptom diary, treatment tail, integrator push, routes | 1 |
| 16 | [wave3_phase_16_legacy_cutover.plan.md](./wave3_phase_16_legacy_cutover.plan.md) | M | webapp legacy migration dependency cutover (`migrate:legacy`) | 1 |
| 17 | [wave3_phase_17_closeout.plan.md](./wave3_phase_17_closeout.plan.md) | S | docs sync, staging smoke gate, full CI, archive | 1 |

**Итого:** ~8 code PR + 1 docs baseline + 1 closeout (или baseline+09 в одном PR по согласованию).

## Gate-контракт (как Wave 2)

1. Перед кодом: `rg` из phase-plan → сверка с RAW_SQL → запись в LOG.
2. Scope: только слой из плана; webapp `modules/*` без нового infra import.
3. Escape hatch: claim/advisory/dynamic SQL → Class B (`execute(sql)`) + тест семантики.
4. После: targeted tests + `rg` на остатки; не закрывать todo без проверки.
5. Отмена: `status: cancelled` + причина, не «потом».
6. Для всех DB-модулей, затронутых фазой: добавить/обновить Zod validation для JSON/input boundary.

## Зависимости фаз

- `00` — обязательный старт (docs baseline + ADR).
- `08` — обязательный перед `09`: сначала reduce/delete/move, потом Drizzle хвостов.
- `09` и `10` можно делать параллельно только после `08`.
- `11` стартует после зелёного `09`.
- `12` → `13` → `14` → `15` идут последовательно (убывающий риск/шум `rg`).
- `16` стартует после `15` и закрывает legacy-cutover.
- `17` — только после `00..16`, staging smoke gate и финального `pnpm run ci`.

## Связь с DRIZZLE_TRANSITION_PLAN фазами IX–X

| Старый номер | Wave 3 |
|--------------|--------|
| IX media-worker | Фаза **10** |
| X webapp + scripts | Фазы **11–15** + integrator scripts Class C в **00/17** |
