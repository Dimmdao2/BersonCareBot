FAIL — 1 MUST FIX

# Независимый адверсарный аудит — перепись дверей по обработчикам и роли БД, круг 3

Проверен точный candidate `8c124c389f069e80c473a84986a867a44bbcf5dc` в ветке
`wt/public-doors-cut` поверх проверенных `954476148`, `9e916f238`, `faa25ae6a` и `2069dae5e`.
Оракул — дословное решение владельца в
`docs/_TODO/API_DOORS_BY_AREA_2026-09-16.md:3-4` и план переписи
`docs/_TODO/PUBLIC_DOORS_CENSUS_2026-09-16.md:13-36,85-101`.

Прод и TEST не трогались, миграции не применялись, второй Next-сервер не поднимался, полный CI не
запускался. Живой proof выполнял только чтение именованной DEV `bcb_webapp_dev`. Временная копия
`apps/webapp/.env.dev`, две fault-injection и два временных аудитных скрипта удалены.

## Классификация до проверки

| Пункт | Природа | Доказательство |
| --- | --- | --- |
| Вердикт по обработчику | повторяемое поведение инструмента | собственные формы route-файлов |
| Числа | факт о committed-дереве | независимый TypeScript Program/TypeChecker-пересчёт, не скрипт автора |
| Выбор DB-роли | security-critical повторяемое поведение | живой opt-in DEV proof и две свои инъекции named root |
| Единственный chokepoint | качество решения | чтение diff и поиск второй независимой машинки |

## 1. Вердикт по обработчику — PASS

**Оракул:** `PUBLIC_DOORS_CENSUS_2026-09-16.md:13-17` требует брать каждый `route.ts`, а строки
22–27 запрещают молча пропускать неизвестную форму. `API_DOORS_BY_AREA_2026-09-16.md:13-17`
требует считать дверь у конкретного обработчика, включая случай открытого метода рядом с закрытым.

Собственный временный тест импортировал только публичные функции
`tools/lib/next-route-handlers.mjs`; формы и expected составлены аудитором:

| Своя форма | Результат |
| --- | --- |
| открытый `GET` alias рядом с закрытым `POST` | узнаны оба: `GET:open`, `POST:guarded` |
| обработчик вызывает локальную вложенную функцию с дверью | узнан: `GET:guarded` |
| два метода переданы в общую `withClinicAccess(...)` | узнаны: `GET:guarded`, `POST:guarded` |
| локальный `export { handler as GET }` | узнан: `GET:guarded` |
| относительный `export { handler as GET } from './handler'` | узнан: `GET:guarded` |
| `export const { GET } = makeHandlers()` | `UNRECOGNIZED_FAIL_CLOSED` |

Команда и результат:

```text
$ /home/dev/brain/host-orch/run-tests.sh "node tools/.audit-round3-route-forms.mjs && node tools/.audit-round3-independent-census.mjs"
open method beside guarded method: RECOGNIZED GET:open,POST:guarded
door in nested local function reached by handler: RECOGNIZED GET:guarded
door supplied by common access wrapper: RECOGNIZED GET:guarded,POST:guarded
local alias export: RECOGNIZED GET:guarded
relative named re-export: RECOGNIZED GET:guarded
destructured handler export: UNRECOGNIZED_FAIL_CLOSED
round3 route forms: PASS; silent passes: 0
independent route files: 479
independent HTTP handlers: 596
independent handlers without door: 9
independent unresolved files/methods: 0
```

`tools/lib/next-route-handlers.mjs:165-227` выделяет каждый HTTP-export и возвращает issue при
неразрешённой форме; `tools/census-open-routes.mjs:126-143` считает и проверяет каждый полученный
handler отдельно. Форм, прошедших молча, нет.

Число `9` из первого черновика независимого пересчёта отклонено, а не использовано: TypeChecker
следовал из handler в импортированные модули и ошибочно считал найденную там дверь дверью самого
handler. Это противоречило оракулу «без двери в своём теле». Доказательный прогон ниже ограничен
конкретным handler и достижимыми локальными функциями того же модуля.

## 2. Независимый пересчёт — основные четыре числа PASS, breakdown FAIL

**Оракул:** `PUBLIC_DOORS_CENSUS_2026-09-16.md:28` утверждает `479` route-файлов, `46` без двери и
`0` нераспознанных; brief добавляет `596` обработчиков.

Пересчёт не запускал `tools/census-open-routes.mjs` и не импортировал
`tools/lib/next-route-handlers.mjs`. Временный скрипт независимо:

- рекурсивно перечислил `route.ts` через `fs.readdirSync`;
- получил фактические module exports через TypeScript `Program`/`TypeChecker`;
- разрешил alias/re-export через symbols;
- искал дверь только в AST конкретного handler и достижимых локальных функциях того же модуля;
- считал неразрешённый handler отдельной ошибкой.

Команда и полный числовой вывод:

```text
$ /home/dev/brain/host-orch/run-tests.sh "node tools/.audit-round3-independent-census.mjs"
independent route files: 479
independent HTTP handlers: 596
independent handlers without door: 46
independent unresolved files/methods: 0
independent multi-method route files: 93
independent files with at least one open handler: 46
independent files with multiple open handlers: 0
independent mixed open/guarded files: 0
```

Почему переход от файла к handler не увеличил `46`: это ожидаемо для текущего дерева, а не
подозрительное совпадение. Каждый из 46 открытых handlers — единственный открытый handler своего
файла; среди 93 многометодных файлов нет ни одного смешанного open/guarded файла и нет файла с двумя
открытыми handlers. Старый file-level алгоритм был опасен не потому, что текущее дерево обязательно
содержало ещё одну дыру, а потому, что не мог обнаружить её при следующем изменении; собственная форма
`GET:open` + `POST:guarded` теперь доказывает именно эту защиту.

Но активный план содержит ещё один числовой breakdown, и он неверен даже арифметически:
`PUBLIC_DOORS_CENSUS_2026-09-16.md:28-30` одновременно говорит `46` открытых и `44` помеченных +
`5` непомеченных (`49`). Отдельный пересчёт по той же границе handler подтвердил фактическое
распределение `40 + 6 = 46`:

```text
$ /home/dev/brain/host-orch/run-tests.sh 'open=0; marked=0; unmarked=0; while IFS= read -r f; do if ! rg -q "\\b(require[A-Z][A-Za-z0-9_]*|with[A-Z][A-Za-z0-9_]*(Access|Principal|Session|Context)|verifyInternalJobBearer|verifyIntegratorSignature|getCurrentSession|getOptionalPatientSession|assert[A-Z][A-Za-z0-9_]*)\\s*\\(" "$f"; then open=$((open+1)); if rg -q "stampBootstrapPrincipal\\s*\\(" "$f"; then marked=$((marked+1)); else unmarked=$((unmarked+1)); fi; fi; done < <(find apps/webapp/src/app/api -name route.ts -type f | sort); printf "independent open files=%s marked=%s unmarked=%s sum=%s\\n" "$open" "$marked" "$unmarked" "$((marked+unmarked))"'
independent open files=46 marked=40 unmarked=6 sum=46
```

Шесть непомеченных route-файлов этой командой:

```text
apps/webapp/src/app/api/brand/app-icon/[mediaId]/[variant]/route.ts
apps/webapp/src/app/api/health/route.ts
apps/webapp/src/app/api/media/s3-status/route.ts
apps/webapp/src/app/api/public/domains/ask/route.ts
apps/webapp/src/app/api/public/domains/probe/route.ts
apps/webapp/src/app/api/version/route.ts
```

Новый шестой относительно D4 — `public/domains/ask`: `stampBootstrapPrincipal` находится в
импортированном `handleOnDemandTlsAskRequest`, а экспортированный route-handler — локальная функция,
которая его вызывает. Текущий анализ намеренно не следует внутрь импортированных helpers
(`next-route-handlers.mjs:244-247`), поэтому census считает этот handler непомеченным. Сам адрес
разобран в D5, но активная итоговая строка переписи всё равно ложна и не совпадает с её машинной
границей.

## 3. Живое доказательство двух DB-ролей — PASS

**Оракул:** `PUBLIC_DOORS_CENSUS_2026-09-16.md:95-101` называет два настоящих пути:
`app.resolve_public_organization_by_slug(text)` под `app_pre_session` и
`app.custom_domain_ask_is_authorized(text)` под `app_worker`.

Взгляд подтверждает wiring: platform-subdomain ветка находится в
`onDemandTlsAuthorization.ts:73-77`, root — `pgClinicDirectory.ts:84-89`, декларация роли —
`declaration.ts:26426-26428`; custom-domain ветка переключается на infra в
`onDemandTlsAuthorization.ts:80-86`, root — `pgCustomDomainBinding.ts:194-200`, декларация роли —
`declaration.ts:26442-26445`.

Зелёный baseline на именованной DEV:

```text
$ /home/dev/brain/host-orch/run-tests.sh "node tools/.audit-round3-independent-census.mjs && USE_REAL_DATABASE=1 RUN_ON_DEMAND_TLS_DB_ROLE_PROOF=1 pnpm --dir apps/webapp exec vitest --run src/app/api/public/domains/ask/onDemandTlsDbRoles.devDbProof.test.ts"
Test Files  1 passed (1)
Tests       2 passed (2)
```

Своя инъекция 1: в `pgClinicDirectory.ts` named root
`app.resolve_public_organization_by_slug(text)` заменён на
`app.custom_domain_ask_is_authorized(text)`, SQL-вызов оставлен прежним. Та же живая команда через
host-lock покраснела ровно на bootstrap-сценарии:

```text
bootstrap platform-subdomain root returns the public absence verdict instead of a DB-role failure
AssertionError: expected 500 to be 403
Test Files  1 failed (1)
Tests       1 failed | 1 passed (2)
expected-failure rc=1
```

Своя инъекция 2: в `pgCustomDomainBinding.ts` named root
`app.custom_domain_ask_is_authorized(text)` заменён на
`app.resolve_public_organization_by_slug(text)`, SQL-вызов оставлен прежним. Тот же proof покраснел
ровно на custom-domain сценарии:

```text
infra custom-domain root returns the public absence verdict instead of a DB-role failure
AssertionError: expected 500 to be 403
Test Files  1 failed (1)
Tests       1 failed | 1 passed (2)
expected-failure rc=1
```

После восстановления обеих строк:

```text
$ /home/dev/brain/host-orch/run-tests.sh 'USE_REAL_DATABASE=1 RUN_ON_DEMAND_TLS_DB_ROLE_PROOF=1 pnpm --dir apps/webapp exec vitest --run src/app/api/public/domains/ask/onDemandTlsDbRoles.devDbProof.test.ts && env -u USE_REAL_DATABASE -u RUN_ON_DEMAND_TLS_DB_ROLE_PROOF pnpm --dir apps/webapp exec vitest --run src/app/api/public/domains/ask/onDemandTlsDbRoles.devDbProof.test.ts'
Test Files  1 passed (1)
Tests       2 passed (2)
Test Files  1 skipped (1)
Tests       2 skipped (2)
```

Тест opt-in по двум флагам (`onDemandTlsDbRoles.devDbProof.test.ts:16-17,35`), перед импортом route
ассертит имя базы во всех трёх role-specific URL (`:19-33`) и без флагов целиком пропускается.
Он read-only: два сценария вызывают публичный GET с гарантированно отсутствующим именем (`:58-79`),
а оба реальных repo-пути исполняют только `SELECT` (`pgClinicDirectory.ts:84-90`,
`pgCustomDomainBinding.ts:194-201`); fixtures, DML и очистки нет.

Независимый oracle — внешний итог публичной двери: отсутствующее имя отвечает
`403 not_authorized`, а неверный named root превращает его в `500`. Дорогая молчаливая поломка — Caddy
не выпускает сертификат клинике при ошибке role/capability wiring. Тест не пинит внутренний DTO:
обе инъекции покраснили конечный HTTP-результат.

## 4. Один chokepoint разбора — PASS

**Оракул:** `AGENTS.md` §5 «Один общий проход»: второй способ той же чувствительной проверки нарушает
правило даже при совпадающем результате.

Выполнены lexical code-search и точный поиск AST-признаков:

```text
$ node /home/dev/brain/tools/code-search.mjs "generic resolver exported Next HTTP route handler alias re-export destructured export AST" --repo bcb -k 30
$ rg -n "getExportsOfModule|isExportDeclaration|ExportDeclaration|NEXT_HTTP_METHODS|HTTP_METHODS|handlerCandidateBodies|analyzeNextRouteFile|export \\* cannot prove|destructured handler export" tools scripts apps/webapp/scripts apps/webapp/src --glob '*.mjs' --glob '*.ts' --glob '!**/*.test.*' --glob '!**/node_modules/**' --glob '!**/.next/**'
```

Единственная общая машинка разрешения HTTP handler/export graph —
`tools/lib/next-route-handlers.mjs`; её потребитель — `tools/census-open-routes.mjs`.
`apps/webapp/scripts/check-media-upload-door.mjs` тоже использует TypeScript AST, но проверяет другой
предмет: прямой доступ route к media storage/state primitives и исполнимую media intake door; он не
перечисляет HTTP methods и не разрешает handler alias/re-export graph. Второй независимой копии
разбора обработчиков в committed tree нет.

## MUST FIX findings

### MUST FIX 1 — активная перепись сообщает невозможный и устаревший breakdown открытых handlers

**Оракул:** `PUBLIC_DOORS_CENSUS_2026-09-16.md:28-30` — итоговая перепись должна быть замером, а не
оценкой; brief требует собственного пересчёта и объявляет расхождение MUST FIX.

Записано `46` открытых handlers, затем `44` помеченных и `5` непомеченных. Это одновременно не
сходится арифметически (`49 ≠ 46`) и расходится с independent tree result `40/6`. Достижимое
последствие: владелец получает ложную security-перепись и считает, что непомеченных публичных дверей
пять, хотя текущая handler-boundary census показывает шестую — `public/domains/ask`. Нужно либо
исправить активный breakdown на `40/6` и явно объяснить границу метки D5, либо научить единственный
parser доказывать marker через импортированный handler и затем записать повторно измеренные числа.

Остальные fault injection пойманы: непойманных **0 из 8** (шесть форм route-файлов и два DB-role
пути).
