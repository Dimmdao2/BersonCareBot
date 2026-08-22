# Снятие устаревшей сигнатуры двери публичной записи — 22.08.2026

## Результат

Добавлена forward-миграция
`apps/webapp/db/drizzle-migrations/20260822T210000_drop_stale_public_booking_enrollment_signature.sql`.
Она от `app_seam_public_booking_owner` выполняет только:

```sql
DROP FUNCTION IF EXISTS app.enroll_current_patient_in_public_booking_clinic(uuid);
```

Грантов, декларационных прав и двухпараметрической двери миграция не меняет. Её probe требует,
чтобы `app.enroll_current_patient_in_public_booking_clinic(uuid)` отсутствовала, а
`app.enroll_current_patient_in_public_booking_clinic(uuid,text)` существовала.

## Перепись однопараметрического вызова

Пустой результат получен следующими тремя поисками:

```bash
rg -n --glob '*.{ts,tsx,js,mjs,cjs}' --glob '!**/*.test.*' --glob '!**/*.spec.*' --glob '!node_modules/**' 'enroll_current_patient_in_public_booking_clinic\\([^,()]+\\)' apps packages deploy
rg -n --glob '*.{test,spec}.{ts,tsx,js,mjs,cjs}' --glob '!node_modules/**' 'enroll_current_patient_in_public_booking_clinic\\([^,()]+\\)' .
rg -n -i --glob '*.sql' '(SELECT|PERFORM)[[:space:]]+app\\.enroll_current_patient_in_public_booking_clinic\\([^,()]+\\)' apps deploy
```

До точных поисков выполнен индексный поиск:

```bash
node /home/dev/brain/tools/code-search.mjs 'enroll_current_patient_in_public_booking_clinic' --repo bcb -k 50
```

Единственные старые однопараметрические упоминания — историческое создание и внутренний
`regprocedure` в `20260819T170216_a_public_visitor_becomes_a_client_when_identified.sql`, его
комментарий и ранний (до создания) `DROP` в
`20260819T163536_a_failed_public_booking_must_not_leave_a_client.sql`. Ни одно не является
достижимым вызовом. Runtime-код и tests используют форму `(uuid,text)`.

## Другие расхождения этого класса

Новых находок нет. После новой forward-миграции выполнен статический сопоставитель всех объектов,
которые активная migration-цепочка ещё ожидает, с `declaration.portContext.functions`:

```bash
node --experimental-strip-types --input-type=module -
```

Он импортирует `collectExpectedObjects(readMigrationFolder(...))` из
`deploy/postgres/privileges/migration-order.mjs` и печатает каждый ожидаемый function identity,
которого нет в declaration. Результат после этой миграции:

```text
expected_but_undeclared_functions=0
```

До добавления этой миграции единственным результатом был
`app.enroll_current_patient_in_public_booking_clinic(uuid)` из
`20260819T170216_a_public_visitor_becomes_a_client_when_identified`; значит иных случаев
«создано миграцией → не объявлено → reconcile снял → позднего DROP нет» в function-срезе не найдено.

## Проверки

```bash
node deploy/postgres/privileges/generate-cli.mjs --db bcb_webapp_dev --check
node deploy/postgres/privileges/generate-cli.mjs --db bcb_webapp_dev --check --port-context-only
```

Обе проверки зелёные: обычные privileges/allowlist и port-context capability artifacts совпадают
с declaration побайтно.

```bash
bash apps/webapp/scripts/check-drizzle-migration-order.sh
node --test deploy/postgres/privileges/migration-order.test.mjs deploy/postgres/privileges/migrate-local.test.mjs deploy/postgres/privileges/function-census.test.mjs
pnpm run typecheck
git diff --check
```

`check-drizzle-migration-order.sh` зелёный; targeted suites: 71 passed, 0 failed; typecheck завершился
зелёным. `--execute`, DEV/TEST, deploy, push и full CI не запускались.
