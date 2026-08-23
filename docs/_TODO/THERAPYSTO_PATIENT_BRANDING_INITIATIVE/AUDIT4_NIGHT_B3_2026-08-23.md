# Независимый аудит слайса `B3`, круг 4 — закрывающий: матрица конфигураций хостов

**Дата:** 23.08.2026 · **Аудитор:** Claude Opus 5 / high (автор фикса — Codex `gpt-5.6-terra`/high)
**Оракул:** `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md`, пункт `B3` и `Gate B`
**Кандидат:** `594f20d3f` на `wt/night-b3-20260823` · **Дерево аудита:**
`/home/dev/dev-projects/bcb-wt-night-b3-20260823`, `HEAD` = `7ed1aa271`
**Вход:** `AUDIT3_NIGHT_B3_2026-08-23.md` (круг 3: `FAIL`, блокер `A-1`, непойманного 2)
**Круг 1:** `FAIL`, 3 блокера · **Круг 2:** `FAIL`, блокер `R-1` · **Круг 3:** `FAIL`, блокер `A-1`

## Вердикт: **PASS, FOR LAND**

**Блокирующих `0`. Неблокирующих `2`. Инъекций посажено `10`, убито `10`, не поймано `0`.
Непойманного (дефектов мимо проверок автора) — `0`.**

Блокер `A-1` закрыт по обеим своим ногам, и обе я перемерил своими руками, а не принял по отчёту.

**Нога первая — гейт защищён.** Инъекция «предохранитель всегда `false`» (та самая `I-4` круга 3, которая
тогда оставляла зелёными **все 2027 тестов вебаппа**) теперь роняет **4 теста в полном наборе вебаппа**:
`4 failed | 2041 passed | 12 skipped` из 2057. Гейт аудитории маршрутов больше нельзя выключить незаметно.

**Нога вторая — набор не привязан к однохостовому окружению.** Полный набор вебаппа с выставленным
`PATIENT_APP_ORIGIN=https://therapygo.ru` (ровно та конфигурация, которая краснила круг 3 тремя тестами):
**`433 passed | 4 skipped`, `2045 passed | 12 skipped`, `0 red`.** В день, когда владелец даст домены,
merge-gate не сломается.

Матрица конфигураций теперь задаётся ВНУТРИ теста (`vi.resetModules()` + `vi.stubEnv` + динамический импорт
`@/proxy`), а не наследуется из окружения процесса: тот же файл даёт `0 red` под **пятью** разными
ambient-конфигурациями окружения, включая доменные и прямо конфликтующие с фикстурами теста.

Продуктовый код не тронут — правка чисто тестовая, `+133/−54` в одном файле. Полный CI на холодном кэше:
**`rc=0`, `516 s`**, `HEAD` не двигался.

---

## 1. Что проверено и как

| Пункт брифа | Способ | Результат |
| --- | --- | --- |
| 1. Обе ноги блокера `A-1` своими инъекциями | **инъекции** `INJ-1`, `INJ-2` + 8 своих | 10 посажено, 10 убито — §4 |
| 2. Конфигурация после переезда на домены (`PATIENT_APP_ORIGIN` ≠ `APP_BASE_URL`) | **прогон** полного набора вебаппа | **`0 red`** — §2 |
| 3. Матрица задаётся в тесте, а не наследуется из окружения | **прогон** под 5 ambient-конфигурациями + `INJ-6`/`INJ-7` | **`0 red`** везде — §3 |
| 4. Продуктовый код не тронут | **взгляд**: diff по всей истории слайса | подтверждено — §5 |
| 5. `A-4`: имена тестов соответствуют покрытию | **взгляд**: чтение набора | закрыто — §6 |
| 6. `Gate B`: пять поверхностей через choke point | **взгляд** + `INJ-9`/`INJ-10` | 5/5 есть, одна ячейка пуста — §7 |
| 7. Полный CI по ветке через общий замок хоста | **прогон**, холодный `.next` | `rc=0`, `516 s` — §8 |

---

## 2. Конфигурация после переезда на домены — блокер `A-1`, нога вторая

Круг 3 измерил: тот же scoped-набор с `PATIENT_APP_ORIGIN=https://therapygo.ru` давал **3 red из 67**.
Повторяю тот же замер на кандидате, но не scoped-набором, а **полным набором вебаппа** — это и есть
merge-gate дня переезда:

| прогон | окружение | итог |
| --- | --- | --- |
| baseline | ambient (как в CI) | `433 passed \| 4 skipped` · `2045 passed \| 12 skipped` · **0 red** |
| **домены** | `PATIENT_APP_ORIGIN=https://therapygo.ru` | `433 passed \| 4 skipped` · `2045 passed \| 12 skipped` · **0 red** |

Оба через общий замок хоста, в одном локе (`run-tests.sh`, `371 s` и `647 s` на пакет прогонов).

**Отдельно замерена соседняя конфигурация, которой бриф не требовал, но которая наступит в тот же день:**
`APP_BASE_URL=https://therapysto.ru` + `PATIENT_APP_ORIGIN=https://therapygo.ru` — **1 red**, и он **не
из слайса `B3`**: `src/modules/auth/passkeyAuth.unit.test.ts > issues attestation-none registration bound
to the configured RP origin and verified user`. Причина видна в diff'е ассерта: тест ждёт
`rpID: '127.0.0.1'` (`passkeyAuth.unit.test.ts:77`), а получает `rpID: 'therapysto.ru'` — то есть он
захардкодил RP ID, выведенный из `APP_BASE_URL`. Атрибуция проверена, а не предположена:

- красит его **только** переопределение `APP_BASE_URL`; при `PATIENT_APP_ORIGIN` в одиночку набор зелёный
  (строка «домены» в таблице выше);
- ни сам тест, ни `modules/auth/passkeyAuth.ts` слайсом `B3` не трогались — последний коммит по обоим
  `154e4fbbc` от 04.08.2026, `PATIENT_APP_ORIGIN` там не упоминается.

Это унаследованная связанность чужого теста с `APP_BASE_URL`, не регрессия `B3`. В скоуп не завожу —
вынесено вопросом в §9.

---

## 3. Матрица задаётся в тесте, а не наследуется из окружения

Механика в кандидате: `loadProxyForSurfaceConfiguration()` (`proxy.route.test.ts:32-53`) делает
`vi.resetModules()`, затем `vi.stubEnv('APP_BASE_URL' | 'PATIENT_APP_ORIGIN', …)`, затем **динамически**
импортирует `@/proxy`, `@/config/productSurfaces`, `@/shared/lib/surface/requestSurface`; `afterEach`
снимает stub'ы и снова сбрасывает реестр модулей. Статический `proxy` наверху файла остаётся в
ambient-конфигурации и обслуживает тесты вне матрицы (CSRF, двери ролей, tenant-шов, неизвестный Host).

Проверено прогоном scoped-набора (6 файлов, базовая линия **76 passed**) под пятью окружениями:

| # | окружение | итог |
| --- | --- | --- |
| `E1` | `PATIENT_APP_ORIGIN=https://therapygo.ru` (убийца круга 3) | 6 files · **76 passed**, 0 red |
| `E2` | `APP_BASE_URL=https://therapysto.ru` + `PATIENT_APP_ORIGIN=https://therapygo.ru` (два домена) | **76 passed**, 0 red |
| `E3` | оба выставлены в ОДИН домен (общий origin, но не дефолтный) | **76 passed**, 0 red |
| `E4` | только `APP_BASE_URL=https://therapysto.ru` | **76 passed**, 0 red |
| `E5` | `APP_BASE_URL=https://patient.example.test`, `PATIENT_APP_ORIGIN=https://staff.example.test` — прямая коллизия с фикстурами теста, вывернутая наизнанку | **76 passed**, 0 red |

`E5` — намеренно злая: ambient-окружение выставлено в те самые origin'ы, которыми оперирует матрица, и
крест-накрест. Результат не сдвинулся, значит матрица не подсматривает в окружение процесса.

**Обратная проверка (важнее прогонов): stub действительно доходит до продукта, а не игнорируется.**
Если бы `vi.stubEnv` ничего не менял, обе строки матрицы схлопнулись бы в одну и тесты «distinct» либо
«shared» неизбежно покраснели бы. Это подтверждено инъекциями в сам env-шов:

- `INJ-6` — `config/env.ts` перестаёт уважать явный `PATIENT_APP_ORIGIN` → **7 red**;
- `INJ-7` — `config/env.ts` замораживает `APP_BASE_URL` на репозиторном дефолте, игнорируя `process.env`
  → **6 red**.

То есть обе ноги матрицы (общий origin и два различимых) реально ведутся через env-шов, а не имитируются.

---

## 4. Фолт-инъекции

Каждая — временная правка продуктового кода, откатанная сразу после прогона; `git status --porcelain`
по `apps/` проверялся после каждой и был пуст. Базовая линия scoped-набора (6 файлов, те же, что в круге 3)
— **76 passed**. Полный набор вебаппа — **2045 passed | 12 skipped** из 2057.

| # | Инъекция | Класс | Результат |
| --- | --- | --- | --- |
| `INJ-1` | `arePlatformSurfaceHostsDistinct()` → всегда `false` (предохранитель всегда выключен) — **требование брифа** | предикат лжёт | **убита** — 4 red scoped, **4 red в полном наборе вебаппа** |
| `INJ-2` | `arePlatformSurfaceHostsDistinct()` → всегда `true` (безусловный гейт) — **требование брифа** | предикат лжёт | **убита** — 5 red |
| `INJ-3` | В `proxy.ts` конъюнкт гейта закорочен в `false` — предикат честен, но **проводка гейта в choke point вырезана** | проводка | **убита** — 4 red |
| `INJ-4` | `canSurfaceEnterRoute`: `/manifest.webmanifest` разрешён ВСЕМ поверхностям | точечная дыра в аудитории | **убита** — 1 red |
| `INJ-5` | Резолвер отдаёт `staff` для пациентского Host | подмена поверхности | **убита** — 4 red |
| `INJ-6` | `config/env.ts`: явно заданный `PATIENT_APP_ORIGIN` молча проигрывает `APP_BASE_URL` | env-шов | **убита** — 7 red |
| `INJ-7` | `config/env.ts`: `APP_BASE_URL` заморожен на дефолте, `process.env` игнорируется | env-шов | **убита** — 6 red |
| `INJ-8` | `proxy.ts` доверяет входящему `x-bc-resolved-surface` вместо перезаписи (spoof passthrough) | доверие к клиенту | **убита** — 2 red |
| `INJ-9` | Админский Host схлопывается в `staff` | подмена поверхности | **убита** — 1 red |
| `INJ-10` | `canSurfaceEnterRoute` теряет ветку `patient_branded` — брендированный Host получает staff-дерево | аудитория брендированной поверхности | **убита** — 1 red, но см. §7 |

**Посажено 10, убито 10, не поймано 0.** Две — из брифа, восемь моих сверх обязательных.

Ключевой замер, ради которого круг 4 и существует, — `INJ-1` против ПОЛНОГО набора вебаппа:

```
круг 3:  Test Files 431 passed | 4 skipped (435)   Tests 2027 passed | 12 skipped   ← гейт мёртв, всё зелено
круг 4:  Test Files   1 failed | 432 passed | 4 skipped (437)
         Tests        4 failed | 2041 passed | 12 skipped (2057)
```

Красные — ровно четыре ячейки матрицы «чужое дерево на чужом Host»:

```
× hard-404s /app/patient/login   on the wrong staff   host when origins are distinct
× hard-404s /book                on the wrong staff   host when origins are distinct
× hard-404s /manifest.webmanifest on the wrong staff  host when origins are distinct
× hard-404s /app/doctor/login    on the wrong patient host when origins are distinct
```

---

## 5. Продуктовый код не тронут

`git diff --name-status 572dadfe5 HEAD` (принятое мной состояние круга 3 → сегодняшний `HEAD`) по
продуктовым файлам слайса: **`proxy.ts`, `requestSurface.ts`, `config/env.ts`, `config/productSurfaces.ts`,
`config/surfaceRoutes.ts` не изменялись ни одним байтом.** Единственный файл слайса в diff'е —
`apps/webapp/src/proxy.route.test.ts` (`+133/−54`, коммит `594f20d3f`).

В diff'е присутствуют изменения ДРУГИХ слайсов, пришедшие merge-коммитом `7ed1aa271` из
`feat/doctor-ui-rebuild` (web-push `doctor`→`account`, `notification-templates`, `requireRole`,
`portContextRuntime`, `requireEntitlement`). Они к `B3` отношения не имеют и через полный CI прошли (§8).

---

## 6. `A-4` — закрыто

Круг 3: три теста с «patient» в названии проверяли staff-Host, потому что константа `PATIENT_ORIGIN` стала
тождественна `STAFF_ORIGIN`. В кандидате константа `PATIENT_ORIGIN` удалена, и каждое имя теперь называет
свою конфигурацию явно:

| имя теста | что реально делает | совпадает |
| --- | --- | --- |
| `redirects an unauthenticated patient from the shared-origin portal` | config «one shared origin», staff-Host, `/app/patient/profile` → редирект на пациентский логин | да |
| `does not redirect a role login route` | staff-Host, `/app/doctor/login` (пациентская часть из имени и из тела убрана вместе) | да |
| `keeps the patient route %s reachable on one shared origin` | config «one shared origin», ассертит `surface: 'staff'` явно в теле | да |
| `hard-404s %s on the wrong %s when origins are distinct` | config «distinct», обе стороны | да |
| `resolves %s through the proxy choke point` | config «distinct», три поверхности | да |
| `stamps the resolved surface once for /app with $name` | обе конфигурации, ожидаемая поверхность выводится из конфигурации | да |
| `preserves the real URL for independent patient routing-security gates` | config «distinct», пациентский Host | да |

Имён, обещающих непокрытое, не осталось. Оставшийся top-level `STAFF_ORIGIN` (ambient-окружение) обслуживает
тесты CSRF, дверей ролей и глобального админа — они матрицу в названии не обещают.

---

## 7. `Gate B` — пять поверхностей поимённо

`Gate B` требует «host matrix tests (`staff`, `platform_admin`, `patient_default`, `patient_branded`,
unknown)». Через choke point (`proxy()`), а не через чистую функцию, резолвятся:

| поверхность | тест, который её резолвит | конфигурация |
| --- | --- | --- |
| `staff` | `resolves staff through the proxy choke point` (`/`); плюс три `keeps the patient route … on one shared origin` | distinct + shared |
| `patient_default` | `resolves patient default through the proxy choke point` (`/app/patient/login`); `stamps … with 'distinct staff and patient origins'` | distinct |
| `platform_admin` | `resolves platform admin through the proxy choke point` (`admin.staff.example.test` → `/app/doctor/login`) | distinct |
| `patient_branded` | `passes the B1/B4 tenant seam result without resolving organization data itself` (`clinic-a.therapygo.ru:8443`, tenant-шов инъектируется) | **ambient (в CI — shared)** |
| unknown | `returns hard 404 for an unknown Host without platform fallback` + `returns hard 404 for a %s tenant Host` (`duplicate`, `inactive`) | ambient |

**5 из 5 присутствуют.** `platform_admin` подтверждён не только чтением: `INJ-9` (админский Host → `staff`)
роняет ровно `resolves platform admin through the proxy choke point`.

**Чего не хватает (`B-1`, неблокирующее).** Единственная пустая ячейка матрицы —
**`patient_branded` × «два различимых origin'а»**, то есть единственная конфигурация, в которой гейт для
брендированного Host вообще срабатывает. Тест tenant-шва ездит на статическом `proxy`, то есть на
ambient-окружении, а в CI оно однохостовое → `arePlatformSurfaceHostsDistinct()` там `false` → гейт для него
выключен. Измерено `INJ-10` (у `canSurfaceEnterRoute` отобрана ветка `patient_branded`):

```
ambient по умолчанию (как в CI):  1 red  — только config/surfaceRoutes.unit.test.ts (чистая функция)
                                          proxy.route.test.ts зелёный
ambient distinct (APP_BASE_URL≠PATIENT_APP_ORIGIN):
                                  2 red  — + proxy.route.test.ts >
                                          «passes the B1/B4 tenant seam result…»
полный набор вебаппа, ambient по умолчанию:
                                  1 red из 2057
```

То есть правило аудитории для брендированной поверхности покрыто — но юнит-тестом чистой функции, а не
матрицей через choke point. Дефекта нет, инъекция поймана; это остаточный пробел покрытия, и он не
блокирующий: `patient_branded` в production сегодня не строится вообще (`NO_TENANT_SURFACE`, `proxy.ts:33`),
эта ячейка оживёт вместе с `B1`.

---

## 8. Полный CI по ветке

Только через общий замок хоста: `/home/dev/brain/host-orch/run-tests.sh "pnpm run ci"`.

**Кэш исключён из уравнения:** перед прогоном `apps/webapp/.next` **удалён целиком** (сборка автора от 08:14
с потенциально устаревшими `.next/types`). Проверено, что из этого worktree ничего не обслуживается:
`:5200` принадлежит главному дереву (`pwdx 3892273` → `/home/dev/dev-projects/BersonCareBot/apps/webapp`),
`:6300` — чужой процесс; своих серверов я не поднимал вовсе.

**Результат: `rc=0`, `516 s`** (лок держался `647 s` вместе с предшествующими прогонами в том же скрипте).
`HEAD` до прогона `7ed1aa27129de8913bba323abd107f578fd43d8b`, после — он же. Рабочее дерево до прогона
содержало ровно один неотслеживаемый файл — мой бриф `docs/_TODO/runs/briefs/AUDIT4_NIGHT_B3_2026-08-23.md`.

```json
{
  "sha": "7ed1aa27129de8913bba323abd107f578fd43d8b",
  "headAfter": "7ed1aa27129de8913bba323abd107f578fd43d8b",
  "movedDuringRun": false,
  "stepsExit": 0,
  "exitCode": 0
}
```

| шаг | итог |
| --- | --- |
| `lint` (корень + webapp, структурные гейты и их self-test'ы) | OK, **0 errors, 2 warnings** (`react-hooks/exhaustive-deps`, `@next/next/no-img-element`) |
| `typecheck` (сборка 4 пакетов + `tsc --noEmit` по 7 проектам) | OK |
| `test` (integrator) | 109 файлов / 561 тест, 2 expected-fail, 1 skipped |
| `test:scripts` | pass 36 / fail 0 |
| `test:db-principal` | pass 31 / fail 0 |
| `test:db-privileges` | pass 162 / fail 0 |
| `test:webapp` | **433 файла / 2045 тестов**, 4 файла и 12 тестов skipped |
| `test:media-worker` | 5 файлов / 16 тестов |
| `build` (integrator) + `build:webapp` | OK, «Compiled successfully in 49s» |
| `audit` (`check-saas-db-regression`, `registry-prod-audit`) | OK, уязвимостей нет |

Красных файлов нет ни одного. Устаревший `.next/types`, о котором предупреждал автор, на результат не
повлиял — прогон шёл с нуля.

---

## 9. Вопросы ведущему и владельцу (НЕ задачи)

Аудит — гейт против плана владельца, а не источник работы. Ни одна находка ниже не заводится в скоуп
аудитором (`AGENTS.md` §24.6).

1. **`B-1`** (новое, неблокирующее) — покрывать ли `patient_branded` через choke point в конфигурации
   «два различимых origin'а». Сегодня недостижимо (`NO_TENANT_SURFACE`), оживёт вместе с `B1`; правило
   аудитории при этом покрыто юнит-тестом. Инженерный вопрос ведущему, в плане владельца такого пункта нет.
2. **`B-2`** (новое, неблокирующее, ВНЕ слайса `B3`) — `passkeyAuth.unit.test.ts:77` захардкодил
   `rpID: '127.0.0.1'` и покраснеет в день, когда `APP_BASE_URL` станет настоящим доменом. К `B3` отношения
   не имеет (файл не трогался с 04.08), но наступит в тот же день, что и переезд. Стоит починить ДО
   выдачи доменов, а не в тот же час.
3. **`A-2`** круга 3 — распространять ли решение `FB-3` на `/manifest-staff.webmanifest`
   (staff-манифест сохранил необработанный throw). Бриф круга 4 вывел из скоупа; без изменений.
4. **`A-3`/`R-2`** — должен ли предохранитель быть пер-запросным; однохостовость стала конфигурацией по
   умолчанию. Бриф круга 4 вывел из скоупа; без изменений.
5. **`N-2`** (гейта единственности резолвера нет) — без изменений с круга 1.

---

## 10. Итог четырёх кругов

| | круг 1 | круг 2 | круг 3 | круг 4 (этот отчёт) |
| --- | --- | --- | --- | --- |
| Вердикт | `FAIL` | `FAIL` | `FAIL` | **`PASS`** |
| Блокеров | 3 (`F-1`…`F-3`) | 1 (`R-1`) | 1 (`A-1`) | **0** |
| Закрыто | — | `F-2`, `F-3` | `R-1`, `R-3` | **`A-1` (обе ноги), `A-4`** |
| Инъекций | 8, убито 7 | 5, убито 4 | 6, убито 5 | **10, убито 10** |
| Непойманного | 4 | 3 | 2 | **0** |

Слайс `B3` приземляется: продуктовое поведение верно на обеих конфигурациях (измерено живьём в круге 3),
и теперь его держат проверки, которые краснеют, если поведение отобрать — в любой из двух конфигураций
и независимо от окружения прогона.

---

## НЕ СДЕЛАНО

- **Живой прогон production-сборки в круге 4 не повторялся.** Продуктовый код не изменился ни на байт с
  круга 3 (§5), где обе конфигурации были измерены на живом сервере по HTTP. Повторять тот же замер на том
  же коде — трата часа без нового сигнала; круг 4 по брифу проверяет ТЕСТЫ, а не поведение.
- **`INJ-2` в круге 4 дал 5 red, а не 4, как в отчёте автора.** Расхождение объяснено, не замолчано:
  scoped-набор автора — 49 тестов, мой — 76 (те же 6 файлов, что в круге 3); лишний красный —
  `manifest.webmanifest/route.route.test.ts`, которого в наборе автора не было. Дефекта здесь нет.
- **`A-2`, `A-3`/`R-2`, `N-2` не проверялись на предмет исправления** — бриф прямо вывел их из скоупа.
- **`B-2` (passkey) не чинил** — вне слайса и вне плана владельца; вынесен вопросом.
- **PROD, TEST, БД, deploy, `push` не трогал.** Порт `5200` не занимал; своих dev-серверов не поднимал
  вовсе, поэтому гасить было нечего. `apps/webapp/.next` удалён только в СВОЁМ worktree, после проверки,
  что из него ничего не обслуживается.
- **Продуктовый код не менял.** Все 10 инъекций — временные правки, откатанные сразу; `git status
  --porcelain -- apps/` после каждой был пуст, и пуст сейчас.
