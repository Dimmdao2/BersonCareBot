# D15b/6: критический аудит ремонта TEST reconcile-access

Дата: 21.08.2026. Роль: независимый `auditor-live`. Candidate:
`wt/d15-test-reconcile-repair-20260821`, ожидаемый SHA после синхронизации с integration —
`54f80f0e5` (перед аудитом проверить фактический `HEAD`).

## Authority

- `AGENTS.md`: маршрут, «Как решать, что делать», §1/§1b, §6, §9–§10b, §24.
- `docs/OWNER_DECISIONS.md`, позднее решение 21.08.2026 по D15: контакты каноничны только в
  `public.user_contacts`; старые contact-колонки `platform_users` удаляются, интеграторные дубли не переносятся.
- `docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/42-d15b6-canonical-contacts-cutover.md`.
- `docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/43-d15b6-test-reconcile-repair.md`.
- Инцидент TEST: миграция `20260821T040000_cut_over_canonical_contacts.sql` применилась, затем
  `reconcile-access` остановился на `column "email" of relation "platform_users" does not exist`.
- Владелец: «исправляй»; TEST/DEV разрешены, одноразовые базы и fixture-механизмы запрещены.

Перед началом снова найди более поздние owner-решения по D15/contact cutover/reconcile-access. При конфликте
остановись с точной ссылкой; старую техническую прозу плана authority не считать.

## Тест или взгляд

1. Точное соответствие `declaration.ts`, `function-census.ts`, `relation-access.ts` текущей схеме и телам функций —
   **взгляд** по diff и каноническим телам. Не писать тест на строки, файлы, количество или SQL-текст.
2. Побайтная воспроизводимость generated SQL — существующий механический `generate-cli.mjs --check`.
3. Применимость полного generated TEST privilege artifact к текущей post-D15 именованной TEST-схеме —
   **rollback-only live gate**. Это первая проверка именно упавшего deploy-контракта; она обязана быть до landing.
4. Существующий `relation-access.test.mjs` — проверка семантики least-privilege declaration. Не добавлять новые
   тесты; убедиться, что изменены только ожидания существующих двух тестов, а не создан source-pinning.

## Scope и запреты

Аудит read-only по репозиторию и rollback-only по именованной `bersoncarebot_test`. Не править продуктовый код,
не делать merge/land/push/deploy/restart/reconcile, не применять миграции, не создавать БД/фикстуры/пользователей.
Не запускать полный CI. Допустим единственный audit-artifact с результатом, если порт требует коммит; продуктовые
findings вернуть воркеру, самостоятельно не чинить.

## Обязательная проверка diff

- Все пять удалённых колонок — `phone_normalized`, `email`, `email_normalized`, `email_verified_at`,
  `patient_phone_trust_at` — отсутствуют именно в активных surface/grant-списках `public.platform_users`.
  Их законные упоминания для `public.user_contacts`, миграции и исторических evidence не считать дефектом.
- Каждая затронутая функция уже читает/пишет контакты через `public.user_contacts`; не принять простое удаление
  нужного гранта, если runtime-тело осталось на старой колонке.
- Никаких новых ролей, операций, relation grants или расширения колонок; только удаление несуществующих колонок.
- Generated DEV/TEST artifacts получены генератором и совпадают с declaration.
- Проверить весь candidate diff относительно `feat/doctor-ui-rebuild`, а не только отчёт воркера.

Минимальные статические команды на candidate SHA:

```bash
node deploy/postgres/privileges/generate-cli.mjs --check
node deploy/postgres/privileges/generate-cli.mjs --census
node --test deploy/postgres/privileges/relation-access.test.mjs
git diff --check feat/doctor-ui-rebuild...HEAD
```

## Rollback-only live gate на текущей TEST

Сначала зафиксировать без изменений:

```bash
hostname
sudo -n systemctl is-active bersoncarebot-api-test.service bersoncarebot-webapp-test.service \
  bersoncarebot-worker-test.service bersoncarebot-scheduler-test.service bersoncarebot-media-worker-test.service || true
sudo -n systemctl is-active bersoncarebot-deploy-test-lock.service || true
```

Затем применить **весь** candidate artifact в одной транзакции и намеренно оборвать её только после последней
строки. `division by zero` — ожидаемый sentinel; любой другой первый SQL error означает FAIL. Команда ничего не
коммитит:

```bash
awk '1; END { print "SELECT 1/0; -- BCB_D15B6_AUDIT_ROLLBACK_SENTINEL" }' \
  deploy/postgres/generated/privileges.bersoncarebot_test.sql | \
  sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bersoncarebot_test \
    -1 -v ON_ERROR_STOP=1 -P pager=off
```

Критерий PASS live gate одновременно:

- exit ненулевой **только** из-за финального `division by zero`;
- в логе нет более ранней ошибки, особенно про отсутствующую колонку/отношение/функцию;
- после команды нет открытой транзакции этого psql-процесса, состояние пяти TEST-сервисов и deploy-lock совпадает
  с зафиксированным до проверки; ничего не перезапускалось;
- повторные `generate --check/--census` не обязательны: live SQL не меняет checkout.

Не подменять эту проверку `EXPLAIN`, чтением SQL или запуском reconcile после landing.

## Вердикт

`PASS` только если статический diff сужает права корректно и полный generated artifact дошёл до sentinel на текущей
post-D15 TEST schema с rollback. `FAIL` содержит только реальные достижимые нарушения: сценарий, impact, exact
authority и командный evidence. Стиль, дополнительный hardening и идеи по другим этапам findings не являются.

В отчёте указать фактический SHA, точные команды/exit, до/после состояние TEST units, первый SQL error и подтвердить,
что permanent DB state не осталось. Не заканчивать ход до полного результата и, если создан audit-artifact,
закоммитить его явным путём.
