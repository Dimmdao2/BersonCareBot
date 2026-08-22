# Ш8 — форма pre-session двери (22.08.2026)

## Исправление

В `20260822T180000_one_door_records_the_act_of_binding_a_person_to_medicine.sql`
у `app.record_collapsing_audit_event(text,uuid,uuid,text,text,text)` из `DECLARE`
вынесены все инициализаторы. Первым оператором тела остаётся
`PERFORM app.require_accepted_context(...)`; сразу после него теми же значениями
присваиваются `v_inserted_first`, `v_volume`, `v_alarm`, `v_uuid_re`,
`v_crossing_actions` и `v_volume_threshold`.

`constant` снят с `v_uuid_re`, `v_crossing_actions` и `v_volume_threshold`
осознанно: в PL/pgSQL константа требует инициализатор в `DECLARE`, который
исполняется до двери. Смысловые значения, ключ схлопывания, проверяемые ключи
`details`, UUID-форма, лимит размера, правило тревоги и порог `200` не менялись.

## Живое доказательство DEV

Команда ниже взяла кандидатное тело из миграции, установила его только внутри
`BEGIN … ROLLBACK` именованной DEV `bcb_webapp_dev`, затем выполнила
генераторный predicate над всем declared набором exact pre-session roots:

```bash
{
  printf 'BEGIN;\n'
  sed -n '/^CREATE OR REPLACE FUNCTION app\.record_collapsing_audit_event(/,/^\$function\$;/p' \
    apps/webapp/db/drizzle-migrations/20260822T180000_one_door_records_the_act_of_binding_a_person_to_medicine.sql
  node deploy/postgres/privileges/generate-cli.mjs --db bcb_webapp_dev --pre-session-gate-verify
  printf 'ROLLBACK;\n'
} | sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1
```

Результат: `BCB_PRE_SESSION_GATES_VERIFIED database=bcb_webapp_dev roots=76`.
Кандидатная Ш8-дверь больше не `bad`; постоянного изменения DEV нет.

Отдельно тот же predicate против текущего каталога DEV перечислил ровно один
нарушитель: `app.record_collapsing_audit_event(text,uuid,uuid,text,text,text)`.
Это ожидаемо: применённое тело намеренно не переприменялось (`--execute`
запрещён брифом). Других соседних нарушителей нет. Ведущему нужно выполнить
разрешённый ему `--reapply` этой миграции, после чего его обычный reconcile
увидит ту же форму.

## Поведение Ш8

```bash
RUN_IDENTITY_BOUNDARY_AUDIT_DB=1 node --test \
  deploy/postgres/privileges/identity-boundary-audit.devDbProof.test.mjs
```

Результат: `4 pass / 0 fail`. Проба использует настоящую DEV и откатывает все
DDL/DML. Её инъекции остались красными: снятие ключа схлопывания перестаёт
схлопывать повтор; снятие проверки ключей принимает имя и диагноз; снятие блока
правила тревоги пропускает аномалию; снятие стены актора принимает запись на
чужое имя.

## Статические гейты

```bash
node deploy/postgres/privileges/generate-cli.mjs --check
node deploy/postgres/privileges/generate-cli.mjs --check --port-context-only
pnpm test:db-privileges
pnpm run typecheck
```

Результат: оба `--check` побайтно зелёные; `test:db-privileges` — 241 tests,
146 pass, 95 opt-in skip, 0 fail; root `typecheck` зелёный. Перед этими
проверками в worktree выполнен `pnpm install --frozen-lockfile`, потому что
`node_modules` отсутствовал; lockfile и tracked-файлы не изменились.

`--execute`, preflight, TEST, deploy, push и full CI не запускались.
