FAIL — 3 MUST FIX

# Независимый адверсарный аудит — вырезание четырёх открытых адресов

Проверен candidate `954476148..faa25ae6a` в ветке `wt/public-doors-cut` против оракула
`docs/_TODO/PUBLIC_DOORS_CENSUS_2026-09-16.md`. Прод, TEST и DEV-БД не трогались; новых тестов под
отсутствие файлов не создано; полный CI не запускался.

## Классификация до проверки

| Требование | Доказательство |
| --- | --- |
| У снятых адресов не было вызывающих | поиск: code-search/codeq, точный `rg`, чтение `/book/embed.js` и его RSC/client-пути |
| Оставшееся поведение не сломано | существующие тесты + `tsc --noEmit` |
| Caddy ask отвечает и выбирает допустимую роль | существующие route/authorization/port-context тесты, чтение principal/declaration, fault injection |
| Нет мёртвых ссылок | взгляд + точный `rg` |
| Census не пропускает двери | прогон на исходном SHA и HEAD + чтение 7 закрытых и 4 открытых маршрутов |

## MUST FIX 1 — census молча пропускает route с реэкспортом и исходные числа неверны

**Оракул:** `PUBLIC_DOORS_CENSUS_2026-09-16.md:11-29` утверждает, что инструмент берёт каждый
`route.ts`, а замер на `8d5bb8c08` дал 482 маршрута и 49 без двери. Требование брифа: пропуск шаблона,
из-за которого число врёт, — `MUST FIX`.

Факты:

```text
$ git ls-tree -r --name-only 8d5bb8c08 -- apps/webapp/src/app/api | rg '/route\.ts$' | wc -l
483

$ (архив 8d5bb8c08) node tools/census-open-routes.mjs
маршрутов без двери в файле: 49
```

На том же архиве отдельная проверка файлов, для которых регулярка `methods` не нашла ни одного
экспортированного HTTP-метода, дала ровно один путь:

```text
apps/webapp/src/app/api/public/domains/ask/route.ts
```

На `8d5bb8c08` этот файл содержал `export { GET } from '@/app/api/internal/domains/ask/route'`.
Регулярка census распознаёт только `export function GET` и `export const GET`, поэтому публичная дверь
исчезла и из общего числа, и из списка открытых. Фактическая поверхность на исходном SHA была 483
route-файла и 50 адресов без двери в собственном файле, а не 482/49. Это не теоретический формат:
пропущен один из двух адресов самой проверяемой D5-двери.

На HEAD реэкспорт заменён функцией, поэтому текущий прогон даёт 479 route-файлов, 46 без двери и 0
нераспознанных route-файлов. Но инструмент по-прежнему молча `continue` для следующего реэкспорта;
security-census снова занизит число без ошибки. Нужен fail-closed учёт каждого `route.ts` (или корректный
разбор реэкспортов) и исправление записанного baseline.

## MUST FIX 2 — D5 приписывает выбор DB-роли строке, которая на роль не влияет

**Оракул:** `PUBLIC_DOORS_CENSUS_2026-09-16.md:78-86` и
`app-layer/surface/onDemandTlsAskRequest.ts:11-13` утверждают, что сохранённая строка
`api/internal/domains/ask:GET` через `WEBAPP_LOCKED_INFRA_CRON_SOURCES` выбирает пул/роль и её
переименование меняет роль в бою. Бриф требует переименовать строку, показать красный тест и откатить.

Инъекция выполнена: в `onDemandTlsAskRequest.ts:37` временно поставлено
`api/public/domains/ask:GET`, затем под общим host-lock запущено:

```text
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest --run \
  src/app/api/public/domains/ask/route.route.test.ts \
  src/app-layer/surface/onDemandTlsAuthorization.unit.test.ts \
  src/infra/db/portContextRuntime.test.ts \
  src/modules/db-retention/journalRetention.contract.test.ts"

Test Files  4 passed (4)
Tests      33 passed (33)
```

Ни один тест не покраснел. Инъекция полностью откатена; `git diff` production-файла пуст.

Причина подтверждена чтением реального пути:

- `bootstrapPrincipal.ts:7-10`: `stampBootstrapPrincipal` ставит principal kind `bootstrap`, не
  `infra`; `WEBAPP_LOCKED_INFRA_CRON_SOURCES` применяется только к `infra`.
- `portContextRuntime.ts:330-341`: при named-root operation capability выбирается по
  `functionIdentity`; source используется только для infra без operation.
- поддомен платформы идёт bootstrap-корнем `app.resolve_public_organization_by_slug(text)` под
  `app_pre_session`;
- собственный домен в `onDemandTlsAuthorization.ts:80-85` отдельно переключается на infra-source
  `ondemand-tls:custom-domain`, а named root `app.custom_domain_ask_is_authorized(text)` объявлен в
  `declaration.ts:26442-26445` как `contextClass: service`, `targetRole: app_worker`.

Итоговое поведение на текущем коде зелёное, но security-critical объяснение и заявленное
fault-injection доказательство ложны. Активный oracle и комментарий должны описывать настоящий выбор
двух ролей, а проверка должна краснеть от поломки реального principal/named-root пути, не от переименования
не влияющего на него source. Иначе запись D5 сообщает о защите, которой 11 названных тестов не доказывают.

## MUST FIX 3 — активные планы ставят работу над уже удалённым маршрутом

**Оракул:** `PUBLIC_DOORS_CENSUS_2026-09-16.md:102-103`: удаление выполняется со всеми упоминаниями;
мёртвая ссылка в активном плане — работа над несуществующим кодом.

Точный поиск:

```text
rg -n -F '/api/references/' docs .cursor apps/webapp/src --glob '*.md' --glob '*.plan.md'
```

нашёл, помимо корректной фиксации удаления и архива, две активные постановки:

- `docs/_TODO/REFERENCE_CATALOG_OWNERSHIP_2026-09-16.md:30-34`, открытый пункт Р3: снять blacklist
  «в обоих местах», включая удалённый `apps/webapp/src/app/api/references/[categoryCode]/route.ts`;
- `docs/_TODO/AUTH_DOORS_FIX_2026-09-16.md:141-146`: активный owner-question всё ещё ждёт решения о
  переделке blacklist того же удалённого маршрута.

Следующий исполнитель по этим документам получит работу над несуществующей дверью. Пункт Р3 должен
остаться только про реально существующую SQL-функцию (если владелец всё ещё требует эту работу), а
вопрос в auth-плане должен быть закрыт фактом удаления, не оставлен ожидающим.

Старые research/proposal-документы по custom-domain также содержат исторический
`/api/internal/domains/ask`; отдельно `MUST FIX` им не выставлен: действующие runbook, server canon и
`deploy/caddy/*` уже указывают `/api/public/domains/ask`, а старые тексты не ставят текущий этап этого
candidate.

## Поиск вызывающих и мёртвого кода

Сначала выполнен lexical `code-search` по каждому из четырёх путей, символу
`listPublicBaselineItemsByCategoryCode`, SQL-функции и обработчику; индекс был старее candidate и честно
показал удалённые файлы, поэтому решающим доказательством стал точный поиск по текущему worktree:

```text
rg -n -F \
  -e '/api/references/' \
  -e '/api/booking/public/catalog/cities' \
  -e '/api/booking/public/catalog/services' \
  -e '/api/internal/domains/ask' \
  apps/webapp apps/integrator packages deploy \
  --glob '!**/*.md' --glob '!**/*.test.*' --glob '!**/*.spec.*' \
  --glob '!**/node_modules/**' --glob '!**/.next/**'
```

Результат: для трёх снятых consumer-адресов — 0; у internal ask остались только намеренная строка
principal/source и её registry/declaration-записи, разобранные в MUST FIX 2. Отдельный поиск в email-
шаблонах, Caddy/nginx/config/deploy не нашёл ни одного снятого consumer-адреса.

Дополнительно выполнены три `codeq --semantic` запроса по анонимному справочнику, embed-каталогам и
Caddy ask; локальный semantic-index сообщил `coverage=0%` и деградировал до lexical, новых consumer-ов
не показал. Этот нулевой semantic coverage не использовался как доказательство пустого результата.

`/book/embed.js` прочитан вместе с `/book`, `PublicFormatStepClient`, server-side
`publicOrganizationBooking` и глубокими `/book/service`, `/book/slot`, `/book/confirm`: embed строит
только URL/iframe на `/book`; каталоги читаются server-side через ports и новые снятые HTTP-адреса не
вызываются. Integrator, packages, почтовые шаблоны, Caddy и nginx их также не вызывают.

```text
rg -n -F -e 'listPublicBaselineItemsByCategoryCode' -e 'get_public_reference_baseline' \
  apps/webapp apps/integrator packages deploy
```

`listPublicBaselineItemsByCategoryCode` — 0. `app.get_public_reference_baseline(text)` остаётся только
в SQL/privilege артефактах, включая каноническую `deploy/postgres/privileges/declaration.ts`; это прямо
разрешено D1 (`PUBLIC_DOORS_CENSUS_2026-09-16.md:73-74`) до отдельной миграции. Новых/изменённых
миграций в candidate нет, поэтому DB preflight неприменим.

## Проверка census на текущем дереве

```text
$ node tools/census-open-routes.mjs
маршрутов без двери в файле: 46

$ find apps/webapp/src/app/api -name 'route.ts' | wc -l
479

$ <проверка route.ts, не распознанных регуляркой methods>
0
```

С чтением кода подтверждены 7 маршрутов, которые census считает закрытыми:

1. `api/menu` — `requireAuthenticatedApiSession` до данных.
2. `api/booking/public/form-fields` — slug/branch/service resolver +
   `withExplicitOrganizationPrincipal` до org-данных.
3. `api/internal/media-hls-proxy-errors/retention` — `verifyInternalJobBearer` до infra-principal.
4. `api/integrator/reminders/dispatch` — `verifyIntegratorSignature` до dispatch.
5. `api/admin/settings` — `getCurrentSession` и role/capability gates.
6. `api/integrator/delivery-targets` — `assertIntegratorGetRequest` до org-principal и чтения.
7. `api/doctor/references/[categoryCode]` — `requireDoctorWorkspaceApiContext` до справочника.

С чтением подтверждены 4 маршрута, которые census считает открытыми: `auth/check-phone` (bootstrap,
до входа), `health` (public health + infra DB probe), `public/domains/ask` (публичный Caddy ask) и
`public/support` (bootstrap + rate limit). У них действительно нет auth-door; публичность соответствует
их продуктовой роли. Кроме пропуска реэкспорта из MUST FIX 1 нового ложного closed/open шаблона на этих
11 образцах не найдено.

## Проверки на финальном candidate

```text
$ pnpm --dir apps/webapp exec tsc --noEmit
rc=0

$ /home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest --run \
    src/app/api/public/domains/ask/route.route.test.ts \
    src/app-layer/surface/onDemandTlsAuthorization.unit.test.ts \
    src/infra/db/portContextRuntime.test.ts \
    src/modules/db-retention/journalRetention.contract.test.ts && pnpm test:db-principal"
webapp: 4 files / 33 tests passed
db-principal: 31 tests passed

$ git diff --check 954476148^..faa25ae6a
rc=0
```

Полный CI не запускался по прямому запрету брифа. Все временные production-изменения откатены до
создания этого audit-artifact.
