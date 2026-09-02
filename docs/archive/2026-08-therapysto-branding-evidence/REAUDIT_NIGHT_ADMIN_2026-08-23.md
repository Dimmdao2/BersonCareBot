# Повторный аудит слайса «админская поверхность», круг 2

Проверяемый коммит: `95224044fc6d2a462dd7f6894476246514bddfa8`
(`wt/night-admin-20260823`). Все продуктовые проверки выполнены на detached exact SHA; отчёт записан уже после
возврата на `wt/reaudit-admin-20260823`.

Authority: `IMPLEMENTATION_PLAN.md`, `TPB-16`: «Реализация расширяет перечисленные choke points и не создаёт
параллельных getters/resolvers/stores. Доказательство: dependency/architecture audit по diff»; owner-решение
§1.2c: «`admin/` — удалить».

## Вердикт

**PASS — FOR LAND.** Обе блокирующие находки круга 1 закрыты. Блокирующих и неблокирующих audit findings нет.

Поведенческий kill-set: **убито 1 / не поймано 0**. Временная инъекция восстановлена; продуктовый diff аудитора
пуст. PROD, TEST, deploy и живой nginx не тронуты.

## Классификация gate

| Пункт | Метод | Результат |
| --- | --- | --- |
| Фактический `metadata` export не возвращает PWA админке | тест + отличающаяся fault injection | **PASS** |
| Удаление корневого `admin/` и отсутствие живых ссылок | взгляд: diff, `code-search`, exact `rg`, workspace install | **PASS** |
| Webapp production build | одноразовый build-check под общим host-lock | **PASS с предсуществующей bootstrap-оговоркой** |
| `TPB-16`, отсутствие второго getter/resolver/store | dependency/architecture audit по exact diff | **PASS** |
| Остаток nginx на DEV-хосте | read-only host inspection | **PASS как операторский остаток, не active runtime** |

## Блокирующие находки

Нет.

## Неблокирующие находки

Нет.

## 1. Тест фактического metadata export

Исходное состояние:

```bash
pnpm --dir apps/webapp exec vitest run src/app/app/admin/layout.unit.test.ts
```

Результат: `1 passed`.

Своя инъекция отличалась от фиксерской: layout не переключался на `staffPwaLayoutMetadata`. Вместо этого общий
`platformAdminLayoutMetadata` был временно сделан installable напрямую:

- `manifest: '/manifest-admin.webmanifest'`;
- непустой `appleWebApp` с `capable: true`.

Та же команда вернула `1 failed`, `FAULT_INJECTION_TEST_EXIT=1`; покраснело утверждение фактического export:
ожидались `manifest: null` и `appleWebApp: null`, получены введённые PWA-значения. После точного отката та же
команда снова дала `1 passed`, а проверка

```bash
git diff --exit-code -- apps/webapp/src/shared/lib/surface/surfaceLayoutMetadata.ts \
  apps/webapp/src/app/app/admin/layout.unit.test.ts
```

завершилась с exit `0`.

Итог named fault: «общий platform-admin metadata снова объявляет манифест и Apple PWA» → тест красный.
**Убито 1 / не поймано 0.**

## 2. Удаление `admin/`, ссылки и workspace

Удалённые файлы перемерены самостоятельно:

```bash
git diff --diff-filter=D --name-only 95224044f^..95224044f -- admin/ | wc -l
```

Результат: `10`. Итоговое дерево:

```bash
git ls-files 'admin/**' | wc -l
```

Результат: `0`; каталога `admin` на exact SHA нет.

Сначала выполнены два независимых lexical-запроса:

```bash
node /home/dev/brain/tools/code-search.mjs \
  "standalone admin directory build admin legacy nginx route 8080" --repo bcb -k 30
node /home/dev/brain/tools/code-search.mjs \
  "admin dist node_modules workspace package build admin" --repo bcb -k 30
```

Затем executable/config поверхность проверена точным поиском:

```bash
rg -n 'build:admin|cd[[:space:]]+admin|admin/(dist|node_modules|src)|admin\.bersonservices\.ru|127\.0\.0\.1:8080|location[[:space:]]+/admin' \
  package.json pnpm-workspace.yaml .gitignore eslint.config.mjs .github deploy scripts tools \
  --glob '!*.md' --glob '!*.txt' --glob '!*.log'
```

Результат: ни одного совпадения. Поиск по активным docs дополнительно оставил только:

- owner-требование удалить каталог в `IMPLEMENTATION_PLAN.md`;
- честное описание уже выполненного удаления в `SCOPE_REVIEW_STAGE_A_2026-08-22.md`;
- исторические census/evidence-строки, не являющиеся caller/config.

Оба активных host-runbook больше не содержат legacy `/admin/ → :8080`. Нового executable пути вместо удалённого
не появилось.

Workspace после удаления проверен командой:

```bash
pnpm install --frozen-lockfile
```

Результат: exit `0`, `Scope: all 8 workspace projects`, lockfile принят без изменения. Значит удаление отдельного
каталога не сломало pnpm workspace/install.

## 3. Самостоятельная сборка exact SHA

После fresh install первый locked запуск

```bash
/home/dev/brain/host-orch/run-tests.sh \
  "env -u SESSION_COOKIE_SECRET pnpm run build:webapp"
```

завершился exit `1`: внутренние workspace packages ещё не имели `dist`, а root `build:webapp` строит только
`error-tracking`. Последовательное появление ошибок `@bersoncare/db-principal`, затем
`@bersoncare/operator-db-schema` и `@bersoncare/platform-merge` подтверждает уже известный bootstrap-gap, а не
регрессию admin diff: `95224044f` не меняет package dependency/build wiring.

После явной сборки существующих prerequisites:

```bash
pnpm --dir packages/db-principal run build
pnpm --dir packages/operator-db-schema run build
pnpm --dir packages/platform-merge run build
```

тот же locked build завершился exit `0` и сгенерировал `409/409` страниц. Собственный идентификатор:

```bash
cat apps/webapp/.next/BUILD_ID
```

Результат: `E58zpXb68yqtc9ou43uPO`.

Standalone доказан не по выводу автора:

```bash
test -f apps/webapp/.next/standalone/apps/webapp/server.js
```

Результат: exit `0`; размер, измеренный
`stat -c 'STANDALONE_BYTES=%s' apps/webapp/.next/standalone/apps/webapp/server.js`, — `8393` байта.

Оговорка не является finding этого слайса: clean-workspace bootstrap-gap существовал до fix, был уже назван
кругом 1 и не изменён target diff. Сам Next build после штатных repo prerequisites зелёный.

## 4. Dependency/architecture audit по `TPB-16`

Exact diff содержит только удаление legacy Vite-приложения, правку существующего теста, снятие config/runbook
ссылок и синхронизацию scope-review. Проверка production TypeScript:

```bash
git diff --name-only 95224044f^..95224044f -- 'apps/**/src/**' \
  ':(exclude)**/*.test.ts' ':(exclude)**/*.test.tsx' \
  ':(exclude)**/*.spec.ts' ':(exclude)**/*.spec.tsx' | wc -l
```

Результат: `0`. Проверка новых файлов:

```bash
git diff --diff-filter=A --name-only 95224044f^..95224044f | wc -l
```

Результат: `0`. Новый getter, resolver, store, DI seam или параллельный request path физически не добавлен;
существующий `platformAdminLayoutMetadata` и export layout только теперь проверяются через реальный consumer.
`TPB-16` выполнен.

## 5. Операторский остаток на `151.241.228.122`

Host identity подтверждён read-only:

```bash
ip -4 -o addr show scope global | awk '{print $2, $4}'
```

Вывод содержит `ens1 151.241.228.122/24`.

Среди всех symlink в `/etc/nginx/sites-enabled` число ссылок, чья каноническая цель равна
`/etc/nginx/sites-available/tgcarebot.conf`, измерено как `ENABLED_LINK_COUNT=0`. Слушатель:

```bash
ss -ltnH '( sport = :8080 )' | wc -l
```

Результат: `0`.

С формулировкой фикса согласен: это stale `sites-available` остаток для будущего операторского удаления, а не
активный nginx/runtime путь. По указанию brief содержимое файла повторно не читалось, symlink не менялись, nginx
не тестировался и не reload/restart. PROD `135.106.162.170` не проверялся.

## Ограничения прогона

- Полный `pnpm run ci` не запускался: diff требует targeted test, dependency-взгляд, install и самостоятельный
  build, которые выполнены; непокрытого repo-level риска от audit-only docs нет.
- TEST/PROD, БД, deploy и порт `5200` не тронуты.
- Постоянных тестов не добавлено: нужный поведенческий тест уже существует и прошёл собственную инъекцию.
- Временная продуктовая инъекция откачена до записи отчёта.
