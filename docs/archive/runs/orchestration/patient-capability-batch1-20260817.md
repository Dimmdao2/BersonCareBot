# Patient capability conversion — batch 1 (2026-08-17)

Status: **partial PASS / continuation required**. This batch removes direct patient writes for the self/content/telemetry slice; it is not the final zero-DML gate and has not been applied to named DEV.

## Converted

- Material ratings now use an exact current-patient root with the real program instance/item context; the global `material_ratings_enabled=false` state is enforced in the database boundary.
- Rating feedback, daily-warmup presentation/view, playback diagnostics/first-resolve and diary snapshots use exact current-patient roots deriving patient and organization from the attested context.
- Patient notification topic and topic-channel writes use current-org configured topic membership; the shared topic-channel repository retains its staff path.
- Practice completion INSERT and exact feeling update roots are present. Direct practice UPDATE remains temporarily because the live warmup-feeling path also mutates symptom tables and must move atomically in the symptom batch.
- Canonical declaration, generated privilege artifacts and runtime capability catalogs were regenerated together.

## Measured boundary change

- Before this batch: `rg '^GRANT .*\b(INSERT|UPDATE|DELETE|TRUNCATE)\b.* TO "app_patient";' deploy/postgres/generated/privileges.bcb_webapp_dev.sql | wc -l` = **50** write-bearing grant lines across **29** tables.
- After this batch: the same command = **36** lines; extracting table names with `sed -E 's/.*ON TABLE "public"\."([^"]+)".*/\1/' | sort -u | wc -l` = **20** tables.

## Validation

- `pnpm --dir apps/webapp typecheck` — PASS.
- `node --test deploy/postgres/privileges/relation-access.test.mjs deploy/postgres/privileges/port-context-catalog.test.mjs` — PASS, 54/54.
- Focused Vitest command covering patient notification matrix, warmup navigation, exercise completion/display/service, FIO greeting and chart wrapper — PASS, 7 files / 14 tests.
- `node deploy/postgres/privileges/generate-cli.mjs --check` — PASS.
- `node deploy/postgres/privileges/generate-cli.mjs --all --port-context-only --check` — PASS.
- `git diff --check` — PASS.

## Remaining gate

The remaining 36 direct-write lines / 20 tables are the treatment-program, reminders, support-chat, symptoms, channel/web-push preferences and platform-user mute clusters. Final acceptance remains exact zero for the expanded write-bearing regex plus named DEV behavior/fault-kill checks.
