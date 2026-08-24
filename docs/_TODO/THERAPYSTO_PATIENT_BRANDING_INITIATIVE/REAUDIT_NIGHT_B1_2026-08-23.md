# Повторный аудит B1/B1a/B2, круг 2 — 23.08.2026

Проверяемый фикс: `beae913b4` на `wt/night-b1-20260823`. Оракул: `IMPLEMENTATION_PLAN.md`, пункт `B1a`.
Аудит выполнен на `wt/reaudit-b1-20260823`; проверяемый коммит является ancestor текущего HEAD, а релевантные
product/test/migration blobs после него не менялись.

## Вердикт: PASS

### Блокирующее

Нет.

### Неблокирующие findings

Нет.

Обязательная новая fault-инъекция поймана тестом; численный итог и точная команда приведены в разделе
«Fault injection». Фикс закрывает блокирующую находку круга 1: чисто цифровая метка больше не проходит прямую
запись в БД.

## Тест круга 1 не ослаблен

Построчное сравнение выполнено точной командой:

```bash
git diff 72bca1699:deploy/postgres/privileges/clinic-domain-write-constraints.devDbProof.test.mjs \
  beae913b4:deploy/postgres/privileges/clinic-domain-write-constraints.devDbProof.test.mjs
```

Единственное изменение в numeric-кейсе — ожидаемое имя сработавшего ограничения:
`organization_slug_claims_slug_reserved_check` заменено на
`organization_slug_claims_slug_numeric_check`. Вход `123`, прямой `INSERT`, требование получить
`check_violation`, проверка `numeric_slug_rejected` и финальный `assert.equal` сохранены. Между `beae913b4` и
текущим HEAD файл теста не менялся:

```bash
git diff --exit-code \
  beae913b4:deploy/postgres/privileges/clinic-domain-write-constraints.devDbProof.test.mjs \
  HEAD:deploy/postgres/privileges/clinic-domain-write-constraints.devDbProof.test.mjs
# exit 0
```

## Прямые записи в именованную DEV

Один rollback-only DB proof обходит приложение и независимо пытается записать служебную метку `www`, цифровую
метку `123` и уже занятый другой организацией `org_custom_domain_hostname`:

```bash
RUN_CLINIC_DOMAIN_WRITE_CONSTRAINTS_DB=1 node --test \
  deploy/postgres/privileges/clinic-domain-write-constraints.devDbProof.test.mjs
# tests 3; pass 3; fail 0
```

Фактически сработали соответственно `organization_slug_claims_slug_reserved_check`,
`organization_slug_claims_slug_numeric_check` и `system_settings_org_custom_domain_hostname_uidx`. Каждая проба
завершилась `ROLLBACK`; persistent fixture не создавался.

Catalog probe выполнен read-only транзакцией:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev \
  -v ON_ERROR_STOP=1 -A -F '|' -c "BEGIN READ ONLY; SELECT c.conname, c.convalidated,
  pg_get_constraintdef(c.oid), pg_get_userbyid(t.relowner) AS table_owner FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid WHERE c.conrelid =
  'public.organization_slug_claims'::regclass AND c.conname IN
  ('organization_slug_claims_slug_reserved_check','organization_slug_claims_slug_numeric_check')
  ORDER BY c.conname; SELECT indexrelid::regclass::text, indisunique, indisvalid FROM pg_index
  WHERE indexrelid = 'public.system_settings_org_custom_domain_hostname_uidx'::regclass; ROLLBACK;"
```

Результат: оба CHECK имеют `convalidated=t`, таблица принадлежит `app_object_owner`; hostname index имеет
`indisunique=t` и `indisvalid=t`.

## Fault injection

В numeric-тест временно, сразу после его `BEGIN`, добавлено:

```sql
ALTER TABLE public.organization_slug_claims
  DROP CONSTRAINT organization_slug_claims_slug_numeric_check;
```

Затем выполнена та же команда DB proof:

```bash
RUN_CLINIC_DOMAIN_WRITE_CONSTRAINTS_DB=1 node --test \
  deploy/postgres/privileges/clinic-domain-write-constraints.devDbProof.test.mjs
# tests 3; pass 2; fail 1
# failure: all-numeric reserved slug write unexpectedly succeeded
```

То есть новая поломка поймана именно numeric acceptance-кейсом; соседние service-label и hostname кейсы остались
зелёными. Ошибка `psql` закрыла соединение и откатила транзакционный `DROP CONSTRAINT`. Временная строка удалена,
`git diff --exit-code -- deploy/postgres/privileges/clinic-domain-write-constraints.devDbProof.test.mjs` вернул
`exit 0`, после чего штатный DB proof повторно дал `tests 3; pass 3; fail 0`. Catalog probe выше подтвердил
восстановленное ограничение.

Итог kill-set круга 2 по этой команде: убита `1` инъекция, непойманного `0`.

## Правило и отсутствие нового пути

Application policy не менялась фиксом: в `organizationSlug.ts` остаётся один числовой предикат
`const ALL_DIGITS = /^[0-9]+$/`, и `validateOrganizationSlugCandidate` использует его в единственном месте.
Новая миграция зеркалит тот же класс в DB boundary через `CHECK (slug !~ '^[0-9]+$')`; второго application-
списка, второго application-regex или нового валидатора фикс не добавил. Список служебных меток остаётся в
предшествующем `organization_slug_claims_slug_reserved_check`; numeric migration его не копирует.

Точный diff фикса:

```bash
git diff-tree --no-commit-id --name-status -r beae913b4
# A apps/webapp/db/drizzle-migrations/20260823T011000_reject_numeric_organization_slug_claims.sql
# M deploy/postgres/privileges/clinic-domain-write-constraints.devDbProof.test.mjs
# A docs/REPORTS/CLINIC_DOMAIN_WRITE_CONSTRAINTS_FIX_2026-08-23.md
# M docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md
```

Hard 404 adapter, `ClinicDirectoryService` seam и B2 migration не менялись:

```bash
git diff --exit-code \
  beae913b4^:apps/webapp/src/modules/clinic-directory/patientSubdomainOrganization.ts \
  beae913b4:apps/webapp/src/modules/clinic-directory/patientSubdomainOrganization.ts
git diff --exit-code \
  beae913b4^:apps/webapp/src/modules/clinic-directory/service.ts \
  beae913b4:apps/webapp/src/modules/clinic-directory/service.ts
git diff --exit-code \
  beae913b4^:apps/webapp/db/drizzle-migrations/20260823T010000_patient_subdomain_slug_and_custom_domain_uniqueness.sql \
  beae913b4:apps/webapp/db/drizzle-migrations/20260823T010000_patient_subdomain_slug_and_custom_domain_uniqueness.sql
# все exit 0
```

Hostname write-boundary дополнительно повторно подтверждён зелёным DB-кейсом выше; более широкий повтор инъекций
круга 1 не нужен, поскольку фикс эти поверхности не затронул.

Заявленные B1 unit tests повторены точной командой:

```bash
pnpm --dir apps/webapp exec vitest run \
  src/modules/clinic-directory/patientSubdomainOrganization.unit.test.ts \
  src/modules/clinic-directory/selfRenameAllowance.unit.test.ts \
  src/modules/clinic-directory/reservedNamespace.test.ts
# Test Files 3 passed (3); Tests 18 passed (18)
```

## Гранты и deploy-контракт миграции

Миграция изменяет только `public.organization_slug_claims`: добавляет CHECK под statement-owner
`app_object_owner`. Новых таблиц, функций, сигнатур и runtime-доступов нет; тело не читает и не пишет другие
отношения. Владельцу таблицы достаточно собственного `ALTER`; новой строки в privilege declaration не требуется.
В diff нет `GRANT`, `REVOKE`, role DDL или изменений `deploy/postgres/privileges/declaration.ts`.

Проверено командами:

```bash
node scripts/check-migration-privileges.mjs
# check-migration-privileges: OK (55 migration files)

node scripts/check-migration-privileges.mjs --self-test
# check-migration-privileges: self-test OK (7 red fixtures, 1 green fixture)

git show --check --oneline beae913b4
# beae913b4 fix(branding): reject numeric clinic slug writes
```

## OWNER QUESTION — не finding и не задача

OWNER QUESTION круга 1 остаётся без изменения scope: план не определяет, входят ли в «и т.п.» метки `mx`, `ns`,
`webmail`, `mta-sts`. В список ничего не добавлялось.

Полный CI не запускался: фикс ограничен одним CHECK, acceptance-ожиданием и документацией; focused DB,
fault-injection, B1 unit и migration privilege gates покрывают затронутый риск. TEST и PROD не затрагивались.
