# DEV apply — migration 0341 (confirming channel provenance)

Rules: `AGENTS.md` — Маршрут, CORE rules, §1 «Миграции», §6 (host PostgreSQL), §9, §24.
Language: internal work is English.

Authority: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` item **D27**; the accepted audit line for
`c65d911a3` / `58e4cf096` in `docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md`.

## State

`0341_user_phone_history_confirming_channel_local.sql` landed on `feat/doctor-ui-rebuild` (merge `dea19e48c`). The
independent audit already read it: nullable column with a CHECK, no new grants, journal consistent, written only on
the real confirmation paths. It has **not** been applied to DEV.

## Work

1. `bash deploy/host/migrate-dev.sh --preflight` — record the output.
2. `bash deploy/host/migrate-dev.sh --execute` — record the output, the journal index and `when` value.
3. Verify against reality, not the runner's word: the column exists on `user_phone_history`, is nullable, carries
   its CHECK, and no unexpected grant appeared. Report the exact queries and their results.
4. If preflight or execute fails, capture the exact error and stop. Do not grant privileges by hand, do not edit
   the migration, do not touch TEST or PROD.

## Boundaries

- DEV only. **PROD (`135.106.162.170`) is untouchable.** TEST is being used by another run right now — do not
  deploy or migrate it.
- No product code change. No push.

## Done means

Evidence appended to the D27 note in `WORK_ORDER.md` (one short paragraph: applied, journal idx/when, the verified
column facts), committed on your branch. Final line of the report: applied, yes or no.
