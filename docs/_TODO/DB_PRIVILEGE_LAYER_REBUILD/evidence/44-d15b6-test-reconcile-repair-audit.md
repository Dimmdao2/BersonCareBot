# D15b/6 TEST reconcile-access repair — independent critical audit

Дата: 21.08.2026. Роль: `auditor-live`. Вердикт: **PASS**.

Candidate: `fcae8ab9c5ce6e113f5dac94629abe416b5d2ee7` на ветке
`wt/d15-test-reconcile-repair-20260821`. Ожидаемый после первой синхронизации `54f80f0e5`
оказался предком фактического HEAD; финальный merge с integration добавил audit brief, но не менял
product repair. Base полного candidate diff:
`feat/doctor-ui-rebuild = 5662a9f57c23b0d0b4dae6b1c98d698d8b40aeb6`.

## Authority gate

Точный поиск выполнен по `docs/OWNER_DECISIONS*.md`, `docs/OWNER_RULINGS*.md`,
`docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD`, `docs/INITIATIVES.md` и
`docs/CURRENT_AUTHORITY_MAP.md`, перед ним — lexical `code-search` по D15/contact
cutover/reconcile-access. Более позднего конфликтующего решения нет. Действующая запись
`docs/OWNER_DECISIONS.md` от 21.08 требует оставить `public.user_contacts` единственным источником
phone/email, перевести на него читателей/писателей и удалить дублирующие contact-колонки
`platform_users`. Более поздняя запись того же дня запрещает fixtures и прямо допускает
rollback-only probe без постоянных сущностей.

## Diff и канонические тела

Проверен весь `git diff feat/doctor-ui-rebuild...HEAD`, а не отчёт воркера.

- В активных surface/grant-объектах `declaration.ts`, `function-census.ts` и
  `relation-access.ts` для `public.platform_users` отсутствуют ровно
  `phone_normalized`, `email`, `email_normalized`, `email_verified_at`,
  `patient_phone_trust_at`. Одноразовый импорт runtime-объектов declaration/census/access вернул
  `forbiddenHits: []`; законные упоминания в `public.user_contacts`, forward migration и evidence
  не классифицировались как дефект.
- Текущая Drizzle-схема `apps/webapp/db/schema/schema.ts` не содержит этих колонок в
  `platformUsers`; `userContacts` содержит canonical `value_normalized`, `confirmed_at` и primary
  marker.
- Для каждой затронутой function identity тело восстановлено из generated schema-B snapshot с
  overlay активных timestamp-forward migrations. У каждой функции найдено обращение к
  `public.user_contacts`, physical legacy reference не найден; сравнение executable relation
  operations с declaration вернуло `exactSurfaceGaps: []`. Прямые пути
  `pgUserProjection#getProfileEmailFields` и `pgUserByPhone#loadSessionIdentityUser` также читают
  email/phone из `user_contacts`.
- Семантическое сравнение generated DEV/TEST SQL с base не обнаружило новых ролей, операций,
  relation surfaces или расширений колонок. Все изменения grant/surface относятся только к
  `public.platform_users` и являются подмножеством прежних колонок.
- В `relation-access.test.mjs` изменены только expected-column arrays двух существующих тестов;
  новый тест, чтение исходника/SQL или source-pinning не добавлены.

## Статические gates

```text
node deploy/postgres/privileges/generate-cli.mjs --check
  exit 0; DEV/TEST privilege и allowlist artifacts совпадают с генератором побайтно

node deploy/postgres/privileges/generate-cli.mjs --census
  exit 0; bcb_webapp_dev и bersoncarebot_test: 217 ACTIVE relations across 3247 source files

node --test deploy/postgres/privileges/relation-access.test.mjs
  exit 0; tests 41, pass 41, fail 0

git diff --check feat/doctor-ui-rebuild...HEAD
  exit 0
```

Полный CI не запускался по прямому запрету brief.

## Rollback-only live gate — `bersoncarebot_test`

Перед gate команда

```bash
hostname
sudo -n systemctl is-active bersoncarebot-api-test.service bersoncarebot-webapp-test.service \
  bersoncarebot-worker-test.service bersoncarebot-scheduler-test.service \
  bersoncarebot-media-worker-test.service || true
sudo -n systemctl is-active bersoncarebot-deploy-test-lock.service || true
```

вернула:

```text
localhost
api-test: failed
webapp-test: failed
worker-test: inactive
scheduler-test: inactive
media-worker-test: inactive
deploy-test-lock: inactive
```

Полный candidate artifact применён одной транзакцией с финальным rollback sentinel:

```bash
awk '1; END { print "SELECT 1/0; -- BCB_D15B6_AUDIT_ROLLBACK_SENTINEL" }' \
  deploy/postgres/generated/privileges.bersoncarebot_test.sql | \
  sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bersoncarebot_test \
    -1 -v ON_ERROR_STOP=1 -P pager=off
```

Результат: `psql exit 3`. Полный лог проверен командой
`rg -n 'ERROR:|FATAL:|PANIC:' /tmp/bcb-d15b6-audit.0i45GE.log`: единственное совпадение —
`8456:ERROR: division by zero`. Перед sentinel выполнены последние `REVOKE`/`GRANT`; более ранней
ошибки о колонке, relation или function нет.

После gate та же команда `hostname`/`systemctl is-active` вернула побайтно то же состояние шести
units. Sentinel оборвал транзакцию, `psql` завершился; дополнительная read-only проверка

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bersoncarebot_test \
  -v ON_ERROR_STOP=1 -P pager=off -Atc \
  "SELECT count(*) FROM pg_catalog.pg_stat_activity WHERE datname = current_database() AND application_name = 'psql' AND state = 'idle in transaction';"
```

вернула `0`. Открытой транзакции candidate psql нет, сервисы и deploy-lock не менялись и не
перезапускались; благодаря `psql -1` и ожидаемой SQL-ошибке permanent DB state не осталось.

## Вердикт

**PASS.** Repair корректно сужает declaration/access metadata под post-D15 schema, generated SQL
воспроизводим, а полный TEST privilege artifact дошёл до финального rollback sentinel на текущей
именованной post-D15 TEST schema. Product findings отсутствуют.
