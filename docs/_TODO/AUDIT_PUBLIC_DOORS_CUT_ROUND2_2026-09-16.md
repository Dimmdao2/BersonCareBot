FAIL — 3 MUST FIX

# Независимый адверсарный аудит — коррекция вырезания дверей, круг 2

Проверен точный candidate `2069dae5e7bde614ba5c5d32b1b26dd19abdaa86` в ветке
`wt/public-doors-cut` поверх уже проверенных `954476148`, `9e916f238`, `faa25ae6a` и audit-artifact
`77ba5e565`. Оракул — `docs/_TODO/PUBLIC_DOORS_CENSUS_2026-09-16.md`, прежде всего дословное
решение владельца в строках 3–6: «это все потенциальные уязвимости - резать нещадно. Все такое
должно браться только из системы без внешних дверей».

Прод, TEST и DEV-БД не трогались. Полный CI не запускался. Все fault-injection правки production-кода
и временные route-файлы удалены до создания этого отчёта.

## Классификация до проверки

| Пункт | Природа | Доказательство |
| --- | --- | --- |
| Census не занижает молча | повторяемое поведение инструмента | собственные формы `route.ts`, запуск census и изолированная silent-pass инъекция |
| Числа плана верны | факт о committed-дереве | собственный `git ls-tree` + независимый проход по содержимому каждого route-файла |
| Описание выбора DB-роли истинно и защищено | факт о системе + security-critical повторяемое поведение | взгляд по полному wiring обоих путей + две отдельные fault injection |
| Мёртвые постановки сняты | качество разового действия | точный `rg` по активным docs/планам/исходникам |

## MUST FIX 1 — census всё ещё пропускает открытый метод молча, если рядом узнан другой метод

**Оракул:** `PUBLIC_DOORS_CENSUS_2026-09-16.md:13-17` обещает брать каждый `route.ts` и находить
дверь; строки 25–27 требуют ронять перепись при любом нераспознанном route-файле. Требование брифа:
форма, которая проходит молча, — `MUST FIX`.

Проверены шесть собственных форм обработчика:

| Форма | Результат census |
| --- | --- |
| `export { GET as default } from './handler'` | `НЕРАСПОЗНАННЫЙ`, fail closed; default-only не создаёт именованный Next `GET`, безопасный исход |
| `export * from './handler'` | `НЕРАСПОЗНАННЫЙ`, fail closed |
| `const handler = …; export { handler as GET }` | `НЕРАСПОЗНАННЫЙ`, fail closed |
| `export const GET = wrap(…)` | узнан как открытый `GET` |
| `export const { GET } = handlers` | `НЕРАСПОЗНАННЫЙ`, fail closed |
| локальный alias `GET` + обычный экспорт закрытого `POST` в одном route-файле | **прошёл молча** |

Последняя форма была такой:

```ts
const openHandler = async () => new Response('ok');
export { openHandler as GET };

export const POST = async () => {
  await requireAuthenticatedApiSession();
  return new Response('ok');
};
```

Изолированная проверка через обязательный host-lock:

```text
$ /home/dev/brain/host-orch/run-tests.sh "node tools/census-open-routes.mjs | sed -n '1,8p'; test \${PIPESTATUS[0]} -eq 0"
route-файлов всего: 480
маршрутов без двери в файле: 46
...
rc=0
```

До инъекции было 479/46. Добавленный route-файл увеличил только общее число до 480: он не попал ни
в открытые, ни в `НЕРАСПОЗНАННЫЕ`, и процесс завершился `0`. Причина в
`tools/census-open-routes.mjs:17-24`: один узнанный `POST` делает файл распознанным, а один guard-call
в любом месте файла закрывает файл целиком; экспортированный alias `GET` не учитывается вообще.

Достижимый сценарий: разработчик добавляет открытый alias/re-export/`HEAD` рядом с уже закрытым
обычным методом. Census сообщает полный успех и не показывает новую внешнюю дверь. Нужен учёт
каждого экспортированного HTTP-метода (лучше через TypeScript AST/реальный module export graph) и
привязка guard к пути конкретного обработчика; неизвестный отдельный method-export обязан fail closed,
даже когда другой метод того же файла распознан.

## Числа — PASS

**Оракул:** `PUBLIC_DOORS_CENSUS_2026-09-16.md:22-30` утверждает `483/50` на `8d5bb8c08` и
`479/46/0` на HEAD.

Числа получены не скриптом автора, а перечислением committed tree и отдельным чтением каждого файла:

```bash
for ref in 8d5bb8c08 HEAD; do
  total=$(git ls-tree -r --name-only "$ref" -- apps/webapp/src/app/api | rg '/route\.ts$' | wc -l)
  without_door=0
  while IFS= read -r route; do
    if ! git show "$ref:$route" | rg -q '\b(require[A-Z][A-Za-z0-9_]*|with[A-Z][A-Za-z0-9_]*(Access|Principal|Session|Context)|verifyInternalJobBearer|verifyIntegratorSignature|getCurrentSession|getOptionalPatientSession|assert[A-Z][A-Za-z0-9_]*)\s*\('; then
      without_door=$((without_door + 1))
    fi
  done < <(git ls-tree -r --name-only "$ref" -- apps/webapp/src/app/api | rg '/route\.ts$')
  printf '%s route_files=%s without_door=%s\n' "$ref" "$total" "$without_door"
done
```

```text
8d5bb8c08 route_files=483 without_door=50
HEAD route_files=479 without_door=46
```

Независимый контроль неизвестных форм на текущем committed tree:

```bash
unrecognized=0
while IFS= read -r route; do
  if ! git show "HEAD:$route" | rg -q 'export[[:space:]]+(async[[:space:]]+)?(function|const)[[:space:]]+(GET|POST|PUT|PATCH|DELETE)\b|export[[:space:]]*\{[^}]*\b(GET|POST|PUT|PATCH|DELETE)\b[^}]*\}[[:space:]]*(from[[:space:]]+[^;]+)?'; then
    printf '%s\n' "$route"
    unrecognized=$((unrecognized + 1))
  fi
done < <(git ls-tree -r --name-only HEAD -- apps/webapp/src/app/api | rg '/route\.ts$')
printf 'HEAD independently_unrecognized=%s\n' "$unrecognized"
```

```text
HEAD independently_unrecognized=0
```

Записанные числа сходятся. MUST FIX по этому пункту нет.

## MUST FIX 2 — новое объяснение DB-ролей верно по коду, но оба настоящих пути не держит ни один тест

**Оракул:** `PUBLIC_DOORS_CENSUS_2026-09-16.md:95-101` называет два настоящих пути и прямо говорит,
что проверять надо их: bootstrap-корень `app.resolve_public_organization_by_slug(text)` под
`app_pre_session` и infra-source `ondemand-tls:custom-domain` с корнем
`app.custom_domain_ask_is_authorized(text)` под `app_worker`. Бриф требует сломать каждый путь и
получить красное именованное утверждение; отсутствие такого доказательства — `MUST FIX`.

Взгляд подтверждает описание:

- поддомен платформы: `onDemandTlsAskRequest.ts:44-48` ставит bootstrap principal,
  `onDemandTlsAuthorization.ts:73-77` зовёт clinic directory,
  `pgClinicDirectory.ts:83-90` передаёт named root
  `app.resolve_public_organization_by_slug(text)`, а `declaration.ts:26426-26428` задаёт
  `targetRole: app_pre_session`;
- собственный домен: `onDemandTlsAuthorization.ts:80-86` входит в infra-source
  `ondemand-tls:custom-domain`, `pgCustomDomainBinding.ts:194-201` передаёт named root
  `app.custom_domain_ask_is_authorized(text)`, а `declaration.ts:26442-26445` задаёт
  `targetRole: app_worker` / `contextClass: service`.

Но тесты проверяют только подставные `clinicDirectory`/`customDomainBinding` и отдельно синтетические
descriptor-ы port-context. Фактическое wiring repo → named root ими не исполняется.

Инъекция 1: в `pgClinicDirectory.ts:86` named-root identity временно заменён на
`app.custom_domain_ask_is_authorized(text)` (то есть bootstrap-путь выбирал несовместимый `app_worker`,
пока SQL продолжал звать bootstrap-функцию). Прогон:

```text
$ /home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest --run \
  src/app/api/public/domains/ask/route.route.test.ts \
  src/app-layer/surface/onDemandTlsAuthorization.unit.test.ts \
  src/modules/clinic-directory/patientSubdomainOrganization.unit.test.ts \
  src/proxy.productionTenantLookup.route.test.ts \
  src/infra/db/portContextRuntime.test.ts"
Test Files  5 passed (5)
Tests      41 passed (41)
```

Инъекция 2: в `pgCustomDomainBinding.ts:197` named-root identity временно заменён на
`app.resolve_public_organization_by_slug(text)` (infra custom-domain путь выбирал несовместимый
`app_pre_session`, пока SQL продолжал звать worker-функцию). Прогон:

```text
$ /home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest --run \
  src/app/api/public/domains/ask/route.route.test.ts \
  src/app-layer/surface/onDemandTlsAuthorization.unit.test.ts \
  src/modules/custom-domain-binding/service.unit.test.ts \
  src/proxy.productionTenantLookup.route.test.ts \
  src/infra/db/portContextRuntime.test.ts"
Test Files  5 passed (5)
Tests      41 passed (41)
```

Непойманных named fault: **2 из 2**. В бою обе поломки превращают Caddy ask из честного `403/200` в
ошибку выбора capability/роли и `500`, то есть сертификат для клиники не выпускается.

Тест, который удержит объяснение: opt-in `*.devDbProof.test.ts` на именованной DEV-БД, вызывающий
реальный публичный `GET /api/public/domains/ask` без mock `buildAppDeps` двумя гарантированно
отсутствующими именами — `<uuid>.<platform-base>` и `<uuid>.invalid` — и ожидающий конечный `403`,
а не `500`. Первый запрос обязан пройти реальный `pgClinicDirectory` named root под bootstrap,
второй — реальный `pgCustomDomainBinding` named root после infra-переключения. При каждой из двух
инъекций этот один end-to-end DB proof обязан краснеть. Проверка остаётся read-only, opt-in и идёт
только через host-lock по контракту §10b.

## MUST FIX 3 — активный план по-прежнему ставит работу над удалённым route-файлом

**Оракул:** `PUBLIC_DOORS_CENSUS_2026-09-16.md:75-81` фиксирует снятие
`references/[categoryCode]`; строки 117–118 требуют удалить все упоминания, потому что мёртвая ссылка
в активном плане ставит работу над несуществующим кодом.

Точный поиск выполнен по `docs`, `.cursor`, `apps`, `packages`, `deploy`, исключая архивы:

```bash
rg -n -F \
  -e '/api/references/' \
  -e 'api/references/[categoryCode]' \
  -e '/api/booking/public/catalog/cities' \
  -e '/api/booking/public/catalog/services' \
  -e '/api/internal/domains/ask' \
  docs .cursor apps packages deploy \
  --glob '!docs/archive/**' --glob '!.cursor/plans/archive/**' \
  --glob '!**/node_modules/**' --glob '!**/.next/**'
```

Большинство совпадений — корректная фиксация удаления, закрытый вопрос либо старые research/proposal
без открытого исполнения. Но `docs/_TODO/REFERENCE_CATALOG_OWNERSHIP_2026-09-16.md:30-34` содержит
активный `[ ] Р3`: снять исключение «в обоих местах», включая уже удалённый
`apps/webapp/src/app/api/references/[categoryCode]/route.ts:5`.

Это ровно находка круга 1, которая в commit message `2069dae5e` объявлена исправленной, но сам файл
этим коммитом вообще не изменён (`git diff 77ba5e565..2069dae5e --
docs/_TODO/REFERENCE_CATALOG_OWNERSHIP_2026-09-16.md` пуст; последний коммит файла — `b770272ad`).
Р3 должен оставить только реально существующую SQL-функцию и один требуемый путь её изменения; работа
над route-файлом и формулировка «в обоих местах» должны быть сняты.

## Финальная проверка восстановленного candidate

После отката всех инъекций:

```text
$ /home/dev/brain/host-orch/run-tests.sh "set -o pipefail; node tools/census-open-routes.mjs | sed -n '1,3p'; pnpm --dir apps/webapp exec vitest --run <6 перечисленных целевых файлов>"
route-файлов всего: 479
маршрутов без двери в файле: 46
Test Files  6 passed (6)
Tests      43 passed (43)

$ pnpm --dir apps/webapp exec tsc --noEmit
rc=0
```

Зелёный baseline не снимает MUST FIX: первая инъекция доказывает silent-pass самого census, две
следующие — отсутствие тестовой защиты реального DB-role wiring, а точный `rg` показывает
неисправленную активную постановку.
