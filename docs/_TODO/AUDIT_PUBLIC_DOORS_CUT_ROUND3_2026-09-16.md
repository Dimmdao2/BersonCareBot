PASS — 0 MUST FIX

# Независимый адверсарный аудит — перепись дверей по обработчикам и роли БД, круг 3

Проверен executable/test candidate `8c124c389f069e80c473a84986a867a44bbcf5dc` в ветке
`wt/public-doors-cut`. На момент повторной проверки HEAD был `7c8ca2549`: поверх candidate лежали
только прежний audit-artifact `90e5a2100` и исправление чисел активного плана `7c8ca2549`.

Точная проверка предмета:

```text
$ git diff --exit-code 8c124c389..HEAD -- tools/census-open-routes.mjs tools/lib/next-route-handlers.mjs apps/webapp/src/app/api/public/domains/ask/onDemandTlsDbRoles.devDbProof.test.ts
candidate executable/test files unchanged after 8c124c389: YES
```

Оракул: решение владельца `docs/_TODO/API_DOORS_BY_AREA_2026-09-16.md:3-4`; обязательная полная
перепись и fail-closed неизвестных форм —
`docs/_TODO/PUBLIC_DOORS_CENSUS_2026-09-16.md:13-17,22-33`; два реальных DB-role пути — строки
`88-104`. Исправленная строка плана теперь согласована с деревом: `40 + 6 = 46`.

Прод и TEST не трогались, миграции не применялись, второй Next-сервер не поднимался, полный CI не
запускался. Живой proof только читал именованную DEV `bcb_webapp_dev`.

## Классификация до проверки

| Пункт | Природа | Доказательство |
| --- | --- | --- |
| Вердикт по обработчику | повторяемое поведение инструмента | собственные route-формы |
| Числа | факт о committed tree | независимый TypeScript Program/TypeChecker-пересчёт |
| Выбор DB-роли | security-critical повторяемое поведение | opt-in DEV proof и две named-root инъекции |
| Один chokepoint | качество решения | code-search, точный поиск и чтение соседних AST-гейтов |

## 1. Вердикт по обработчику — PASS

**Оракул:** `PUBLIC_DOORS_CENSUS_2026-09-16.md:13-17,22-27` требует брать каждый `route.ts` и
отказывать на неизвестной форме; `API_DOORS_BY_AREA_2026-09-16.md:13-17` требует считать дверь у
конкретного обработчика, включая открытый метод рядом с закрытым.

Собственный временный тест импортировал публичную границу `tools/lib/next-route-handlers.mjs`, но
использовал только придуманные аудитором формы и expected. Тест удалён после прогона.

```text
$ /home/dev/brain/host-orch/run-tests.sh "node tools/.audit-round3-recheck-route-forms.mjs && node tools/.audit-round3-recheck-independent-census.mjs"
open GET beside guarded POST: RECOGNIZED: GET:open,POST:guarded
door inside an invoked nested function: RECOGNIZED: PATCH:guarded
two methods share one access wrapper: RECOGNIZED: DELETE:guarded,PUT:guarded
local alias export: RECOGNIZED: OPTIONS:guarded
relative named re-export: RECOGNIZED: HEAD:guarded
destructured export: UNRECOGNIZED_FAIL_CLOSED: GET: destructured handler export is not traceable; GET: local export 'GET' is unresolved
route-form audit: PASS; silent passes: 0
```

Итог по обязательным формам: пять разрешимых форм распознаны по handler, деструктурированный export
попал в issues и остановил доверие к переписи; молча прошедших форм — `0`.

## 2. Независимый пересчёт — PASS

**Оракул:** `PUBLIC_DOORS_CENSUS_2026-09-16.md:28-33` утверждает `479` route-файлов, `46`
обработчиков без двери, `0` нераспознанных и breakdown `40/6`; brief добавляет `596` обработчиков.

Пересчёт не запускал `tools/census-open-routes.mjs` и не импортировал
`tools/lib/next-route-handlers.mjs`. Временный скрипт отдельно перечислил дерево через
`fs.readdirSync`, построил TypeScript `Program/TypeChecker`, получил module exports, разрешил
aliases/re-exports через symbols и искал двери только в handler и достижимых локальных функциях его
модуля. Скрипт удалён после прогона.

```text
$ /home/dev/brain/host-orch/run-tests.sh "node tools/.audit-round3-recheck-route-forms.mjs && node tools/.audit-round3-recheck-independent-census.mjs"
independent route files: 479
independent HTTP handlers: 596
independent handlers without door: 46
independent marked open handlers: 40
independent unmarked open handlers: 6
independent unresolved files/methods: 0
independent multi-method route files: 93
independent files with at least one open handler: 46
independent files with multiple open handlers: 0
independent mixed open/guarded files: 0
```

Почему `46` не выросло при переходе от файла к handler: для текущего дерева это ожидаемо. У каждого
из `46` открытых handlers свой отдельный файл; среди `93` многометодных файлов нет смешанного
open/guarded файла и нет файла с двумя открытыми handlers. Это не доказательство ненужности нового
разбора: собственная форма `GET:open` + `POST:guarded` показывает, что следующий такой файл будет
разделён, а не ошибочно закрыт дверью соседнего метода.

Прежний MUST FIX по невозможному breakdown закрыт коммитом `7c8ca2549`: активный план теперь говорит
`40/6`, что совпало с независимым пересчётом.

## 3. Живое доказательство двух DB-ролей — PASS

**Оракул:** `PUBLIC_DOORS_CENSUS_2026-09-16.md:88-104` называет два настоящих пути:
`app.resolve_public_organization_by_slug(text)` под `app_pre_session` и
`app.custom_domain_ask_is_authorized(text)` под `app_worker`.

Взгляд подтвердил wiring: platform-subdomain идёт через
`onDemandTlsAuthorization.ts:73-77` → `pgClinicDirectory.ts:84-89`; custom-domain переключается на
infra в `onDemandTlsAuthorization.ts:80-86` → `pgCustomDomainBinding.ts:194-200`. Декларация ролей —
`deploy/postgres/privileges/declaration.ts:26426-26428,26442-26445`.

Baseline и повтор после восстановления инъекций:

```text
$ /home/dev/brain/host-orch/run-tests.sh "USE_REAL_DATABASE=1 RUN_ON_DEMAND_TLS_DB_ROLE_PROOF=1 pnpm --dir apps/webapp exec vitest --run src/app/api/public/domains/ask/onDemandTlsDbRoles.devDbProof.test.ts"
Test Files  1 passed (1)
Tests       2 passed (2)
```

Инъекция 1: в `pgClinicDirectory.ts` named root заменён с
`app.resolve_public_organization_by_slug(text)` на `app.custom_domain_ask_is_authorized(text)`, SQL
оставлен прежним. Та же команда через host-lock покраснела только на bootstrap-сценарии:

```text
bootstrap platform-subdomain root returns the public absence verdict instead of a DB-role failure
AssertionError: expected 500 to be 403
Test Files  1 failed (1)
Tests       1 failed | 1 passed (2)
clinic-root fault expected-red rc=1
```

Инъекция 2: в `pgCustomDomainBinding.ts` named root заменён с
`app.custom_domain_ask_is_authorized(text)` на `app.resolve_public_organization_by_slug(text)`, SQL
оставлен прежним. Та же команда покраснела только на custom-domain сценарии:

```text
infra custom-domain root returns the public absence verdict instead of a DB-role failure
AssertionError: expected 500 to be 403
Test Files  1 failed (1)
Tests       1 failed | 1 passed (2)
custom-domain-root fault expected-red rc=1
```

Обе инъекции восстановлены; `git diff --exit-code --` по двум repo-файлам вернул `0` до финального
зелёного прогона.

Opt-in и database-name gate проверены отдельно:

```text
$ /home/dev/brain/host-orch/run-tests.sh 'env -u USE_REAL_DATABASE -u RUN_ON_DEMAND_TLS_DB_ROLE_PROOF pnpm --dir apps/webapp exec vitest --run src/app/api/public/domains/ask/onDemandTlsDbRoles.devDbProof.test.ts && set +e; USE_REAL_DATABASE=1 RUN_ON_DEMAND_TLS_DB_ROLE_PROOF=1 DATABASE_URL_STAFF=postgresql://dummy:dummy@127.0.0.1/not_allowed DATABASE_URL_PATIENT=postgresql://dummy:dummy@127.0.0.1/not_allowed DATABASE_URL_GLOBAL_ADMIN=postgresql://dummy:dummy@127.0.0.1/not_allowed pnpm --dir apps/webapp exec vitest --run src/app/api/public/domains/ask/onDemandTlsDbRoles.devDbProof.test.ts; audit_rc=$?; echo "database-name assertion expected-red rc=$audit_rc"; test "$audit_rc" -ne 0'
Test Files  1 skipped (1)
Tests       2 skipped (2)
Error: refusing to use database 'not_allowed' from DATABASE_URL_STAFF: only named DEV/TEST are allowed
database-name assertion expected-red rc=1
```

Тест opt-in по двум флагам (`onDemandTlsDbRoles.devDbProof.test.ts:16-17,35`) и до импорта route
проверяет имя базы во всех трёх URL (`:19-33`). Он read-only: вызывает только публичный `GET` с
гарантированно отсутствующими случайными именами (`:58-79`); оба реальных repo-пути выполняют только
`SELECT` (`pgClinicDirectory.ts:84-90`, `pgCustomDomainBinding.ts:194-201`), fixtures/DML нет.

Независимый oracle — конечный HTTP-ответ публичной двери: отсутствующее имя обязано дать
`403 not_authorized`, а неверный named root превращает ответ в `500`. Пользовательское последствие —
Caddy не может выпустить сертификат для клиники при сломанном role/capability wiring.

## 4. Единственный chokepoint — PASS

**Оракул:** `AGENTS.md` §5 «Один общий проход»: второй независимый способ той же чувствительной
проверки нарушает правило.

После lexical code-search выполнен точный поиск:

```text
$ node /home/dev/brain/tools/code-search.mjs "TypeScript AST resolve Next route HTTP handler exports aliases re-exports destructured route census" --repo bcb -k 30
$ rg -n "analyzeNextRouteFile|handlerCandidateBodies|handlerContainsCall|NEXT_HTTP_METHODS|getExportsOfModule|destructured handler export|no exported Next HTTP method" tools scripts apps/webapp/scripts apps/webapp/src --glob '*.mjs' --glob '*.ts' --glob '!**/*.test.*' --glob '!**/node_modules/**' --glob '!**/.next/**'
```

Единственная машинка разрешения HTTP methods/alias/re-export graph —
`tools/lib/next-route-handlers.mjs`; `tools/census-open-routes.mjs` только потребляет её. Просмотрены
соседние AST-гейты, найденные поиском: `check-media-upload-door.mjs` проверяет storage/intake seams,
`check-no-new-raw-sql.mjs` — query aliases, `check-queue-port-boundary.mjs` — raw queue re-exports.
Они не перечисляют Next HTTP handlers и не дублируют этот разбор.

## Findings

MUST FIX: **0**. Все восемь обязательных fault-классов пойманы: шесть route-форм и два DB-role пути;
непойманных — **0 из 8**.

Временные аудитные скрипты, обе инъекции и непрочитанная копия `apps/webapp/.env.dev` удалены.
