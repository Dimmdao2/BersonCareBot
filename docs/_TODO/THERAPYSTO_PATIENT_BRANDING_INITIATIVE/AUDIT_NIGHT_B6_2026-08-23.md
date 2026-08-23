# Аудит `B6` — cookies host-only и CSRF под матрицей Host

**Вердикт: PASS, FOR LAND**

Блокирующих: **0**. Неблокирующих: **9**.
Инъекций посажено **10**, убито **7**, не поймано **3** (`I3`, `I4`, `I8` — все три без
последствий для продукта, разбор ниже).

**Что проверялось:** коммит `f0d7224b2` на ветке `wt/night-b6-20260823`, клон
`/home/dev/dev-projects/bcb-wt-night-b6-20260823`, голова аудита `9f9d837cf`.
Оракул — `IMPLEMENTATION_PLAN.md`, пункт `B6` и `Gate B`.

---

## 1. Продуктовый код не тронут — сверено по всей ветке, не по коммиту

Ветка отделяется от `wt/therapysto-night-20260823` на `d2f230308`. Диф всей ветки:

```
$ git diff --stat d2f230308..HEAD
 apps/webapp/src/modules/auth/sessionCookie.unit.test.ts |  41 +++
 apps/webapp/src/proxy.route.test.ts                     | 135 +++++++++
 docs/_TODO/… (9 файлов документации)                    | 394 +++
 11 files changed, 570 insertions(+), 1 deletion(-)
```

Ни одного файла вне `*.test.ts` и `docs/`. Заявление автора «только тесты, `+176/−0`» подтверждено.

## 2. Матрица задаётся тестом, а не окружением

Дефект `B3`, о котором предупреждал бриф, здесь отсутствует. Обе новые группы берут origin'ы из
своего кода: `sessionCookie.unit.test.ts` — из литерала `SESSION_SURFACE_ORIGINS`,
`proxy.route.test.ts` — из `loadProxyForSurfaceConfiguration(PLATFORM_SURFACE_CONFIGURATIONS[1])`,
которая делает `vi.resetModules()` + `vi.stubEnv` и переимпортирует `productSurfaces`.

Замер — тот же набор под четырьмя разными ambient-окружениями, включая вырожденное, где staff и
patient сидят на одном хосте:

| `APP_BASE_URL` / `PATIENT_APP_ORIGIN` | Результат |
| --- | --- |
| ambient по умолчанию (`http://127.0.0.1:5200`) | `74 passed (74)` |
| `https://therapysto.ru` / `https://therapygo.ru` | `74 passed (74)` |
| `http://localhost:3000` / `http://localhost:3000` (общий хост) | `74 passed (74)` |
| `https://a.b.c.d` / `https://x.y.z` | `74 passed (74)` |

Набор не меняется. Заявленные автором `74/74` воспроизведены.

## 3. Инъекции: 10 посажено, 7 убито

Каждая инъекция ставилась в **продуктовый** код, прогонялся тот же scoped-набор (74 теста),
инъекция откатывалась. Дерево после прогона чистое (`git diff` пуст).

| № | Куда | Что ломали | Итог |
| --- | --- | --- | --- |
| `I1` | `sessionCookie.ts` `buildSessionCookieOptions` | `domain: '.example.test'` у session-куки | **KILLED** (3 теста) |
| `I2` | `sessionCookie.ts` `applySessionRenewalToResponse` | хост из ≥3 меток выдаёт куку на **родительский** домен — утечка сессии клиники A всем соседним клиникам | **KILLED** (3 теста) |
| `I3` | `sessionCookie.ts` | `path: '/'` → `path: '/app'` | SURVIVED |
| `I4` | `csrfOrigin.ts` `decideCsrfOrigin` | `Referer` старше `Origin` (свой `Referer` при чужом `Origin` проходит) | SURVIVED |
| `I5` | `csrfOrigin.ts` | мутация без `Origin` и без `Referer` разрешена | **KILLED** (5 тестов) |
| `I6` | `requestSurface.ts` | снята сверка `brand.organizationId === tenant.organizationId` | **KILLED** (1 тест) |
| `I7` | `requestSurface.ts` | unknown/duplicate/inactive tenant Host → откат на платформенную patient-поверхность | **KILLED** (5 тестов) |
| `I8` | `requestSurface.ts` `normalizeRequestOrigin` | запрос **без `Host` вообще** → staff-поверхность | SURVIVED |
| `I9` | `requestSurface.ts` `platformAdminHost` | `admin.<staff>` перестаёт быть поверхностью | **KILLED** (4 теста) |
| `I10` | `proxy.ts` | CSRF-гейт пропускается на `patient_branded` | **KILLED** (3 теста) |

Три инъекции из брифа, которых у автора не было, — `I2` (поддомен арендатора), `I3` (`Path`),
`I8` (запрос без `Host`). `I2` убита, то есть носитель «кука с родительского домена» перекрыт.

### Почему три выживших — не дыры

**`I3` (`Path`).** Вектор «пронести куку между поверхностями через `Path`» физически не существует:
`Path` сужает область внутри одного хоста и никогда не расширяет её на другой хост. Инъекция
выживает потому, что помощник теста моделирует только `Domain` (см. `N5`), а не потому, что
продукт что-то пропускает.

**`I4` (`Referer` старше `Origin`).** Продукт сегодня ведёт себя правильно — проверено прямым
прогоном `decideCsrfOrigin`, не рассуждением:

| Проба | Заголовки | Решение продукта |
| --- | --- | --- |
| `P1` | `Origin: null` | `reject / origin_invalid` |
| `P2` | `Origin: null` + свой `Referer` | `reject / origin_invalid` |
| `P3` | чужой `Origin` + **свой** `Referer` | `reject / origin_mismatch` |
| `P4` | только свой `Referer` | `allow / same_origin_referer` |
| `P5` | `Origin` соседнего арендатора на branded-хосте | `reject / origin_mismatch` |
| `P6` | без `Host` | `reject / request_origin_invalid` |
| `P7` | `Origin` со слэшем на конце | `reject / origin_invalid` |
| `P8` | `Referer` с чужим портом | `reject / referer_mismatch` |

`Origin` проверяется раньше `Referer` (`csrfOrigin.ts:203` против `:211`), и браузер не умеет
послать чужой `Origin` со своим `Referer`. Плюс `sec-fetch-site` — второй гейт выше по коду.
Это разрыв ПОКРЫТИЯ, не дыра.

**`I8` (без `Host`).** Продукт fail-closed. Прогон резолвера по кривым `Host`:

| `Host` | `resolveRequestSurface` |
| --- | --- |
| `null` / `''` / `'staff.example.test '` | `NULL` → 404 |
| `staff.example.test,attacker.example` | `NULL` → 404 |
| `evil@staff.example.test` | `NULL` → 404 |
| `STAFF.EXAMPLE.TEST` | `staff` (регистр нормализован) |
| `staff.example.test:443` | `staff` |
| `staff.example.test.` (точка на конце) | мимо равенства платформенных хостов → в tenant-lookup |
| `x.clinic-a.patient.example.test` | в tenant-lookup |

Тоже разрыв покрытия, не дыра. Про точку на конце — `N9`.

## 4. Полнота против `Gate B`

`Gate B` называет матрицу `staff`, `platform_admin`, `patient_default`, `patient_branded`, unknown.
Поимённо закрыто в `B6`:

| Ячейка | CSRF (чужой `Origin` / чужой `Referer` / без обоих) | Кука host-only |
| --- | --- | --- |
| `staff` | ✅ 3 теста, 403 + тело `csrf_origin_forbidden` | ✅ `staff.example.test` |
| `platform_admin` | ✅ 3 теста | ❌ **пусто** (`N3`) |
| `patient_default` | ✅ 3 теста | ✅ `patient.example.test` |
| `patient_branded` | ✅ 3 теста (через инжектированный tenant-seam) | ✅ `clinic-a.patient.example.test` |
| unknown Host | ✅ 404, без `Location`, без `Set-Cookie`, без stamped surface | — |
| cross-org (org A + бренд org B) | ✅ 404, `no-store`, без stamped surface | — |

Что в матрице `B6` **пусто**: `platform_admin` в наборе куки (`N3`); ни одной положительной
контрольной точки «свой `Origin` разрешён» на трёх из четырёх поверхностей (`N4`); `Origin: null`,
«чужой `Origin` + свой `Referer`» и ветка allow-по-`Referer` (`N1`); отсутствующий/кривой `Host`
(`N2`). Остальные пункты `Gate B` (migration dry-run, route/UI-тесты, lint+typecheck) — не скоуп
`B6`.

## 5. Неблокирующие находки

Ни одна из них не является нарушением пункта `B6`: чекбокс требует «оставить механику и добавить
regression tests для нескольких Host», и это сделано. Это дополнительное покрытие и заметки.

**`N1`. Порядок `Origin` / `Referer` не закреплён нигде в репозитории.** Инъекция `I4` пережила все
74 теста. Проверено грепом по всем `*.test.ts`: строки `same_origin_referer`, `referer_mismatch`,
`referer_invalid`, `origin_mismatch`, `source_headers_missing`, `request_origin_invalid` не
встречаются ни разу. `csrfOrigin.test.ts` (75 строк) покрывает только классы исключений
(integrator HMAC, internal bearer, payment webhook) и ни одного браузерного случая. Ветка
allow-по-`Referer` (`P4`) не исполняется ни одним тестом.

**`N2`. Отсутствующий и кривой `Host` не закреплён.** Инъекция `I8` пережила все 74. Ячейка
`unknown` в `Gate B` доказана только для корректно составленного неизвестного имени хоста.

**`N3`. `platform_admin` отсутствует в куки-половине матрицы.** `SESSION_SURFACE_ORIGINS` содержит
три origin'а из четырёх. Пара `staff.example.test` ↔ `admin.staff.example.test` — это ровно форма
«родитель/потомок», которую перекрывает кука с `Domain`; она доказана только через патиентскую пару
`patient.example.test` ↔ `clinic-a.patient.example.test`. Продукт защищён (инъекция `I2` убита),
незакрыта именно ячейка.

**`N4`. Нет положительной контрольной точки на поверхность.** Матрица `B6` утверждает только 403.
Регрессия, которая начнёт отклонять ЗАКОННУЮ same-origin мутацию на `platform_admin`,
`patient_default` или `patient_branded`, останется зелёной: единственный положительный тест
(`allows the canonical same-origin browser mutation`) существовал до `B6`, покрывает только staff и
привязан к ambient-окружению. Это отказ доступности, не дыра в безопасности, но это недостающая
половина той же матрицы.

**`N5`. Помощник `cookieHeaderForRequest` — тавтология.** После строки
`expect(setCookie).not.toMatch(/domain=/i)` и пропуска собственного origin'а помощник не может
вернуть ничего, кроме `null`. Он выглядит как модель браузерной области видимости куки, но не
доказывает ничего сверх предыдущей строки: `Path`, `Secure`, `SameSite`, `HttpOnly` он не смотрит —
что и показала выжившая инъекция `I3`.

**`N6`. Тест unknown Host частично дублирует существующий.** В том же файле, ~60 строк ниже, уже
живёт `returns hard 404 for an unknown Host without platform fallback`. Новый тест добавляет
реальную ценность (`set-cookie === null` и `location === null` при живой сессии в запросе), но
часть «404 + surface не проштампован» повторена.

**`N7`. `runs/ci-last.json` называет не тот коммит.** Артефакт от прогона автора: `sha`
`b9af33089`, `exitCode 0`, файл записан в 09:47:09; коммит `f0d7224b2` создан в 09:47:26 — через
17 секунд. То есть полный CI гонялся по НЕзакоммиченному дереву, и запись, которую `ci-record`
существует чтобы производить, не называет проверяемое состояние. По существу измеренное содержимое
совпадает с закоммиченным (в дереве были ровно эти два файла), поэтому зелёный настоящий. Закрыто
моим перепрогоном на реальной голове — раздел 6.

**`N8` (контекст, не дефект). `patient_branded` сегодня недостижим в проде.** `proxy.ts:42-45`
берёт tenant-lookup только если второй аргумент — функция; Next передаёт туда `NextFetchEvent`,
поэтому в рантайме работает `NO_TENANT_SURFACE`, и любой не-платформенный Host — жёсткий 404.
Шов `B1` к choke point ещё не подключён (`B3` в плане — `[ ]`). Значит, branded-строки матрицы
доказывают контракт резолвера, а не живое поведение. Для скоупа `B6` это правильно; записано,
чтобы зелёный не читали шире, чем он есть.

**`N9` (заметка для `B3`, не задача). `Host` с точкой на конце уходит мимо равенства платформенных
хостов.** `staff.example.test.` и `admin.staff.example.test.` не совпадают с `staffHost`/`adminHost`
и проваливаются в tenant-lookup. Сегодня это hard 404 (`NO_TENANT_SURFACE`) — fail closed. Когда
`B3`/`B4` подключат настоящий lookup, от того, срезает ли он точку, зависит (а) сможет ли
платформенный хост переразрешиться как арендатор и (б) получит ли один арендатор два написания
`publicOrigin`, которые дальше разойдутся по абсолютным ссылкам, OAuth-allowlist и `start_url`
манифеста.

**Отдельно про «cross-org попытки fail closed».** Тест `B6` закрывает чтение «lookup вернул
несогласованные данные» — сверка `brand.organizationId === tenant.organizationId`, инъекция `I6`
убита. Второе чтение — «сессию клиники A подсунули на хост клиники B» — на уровне proxy не
проверяется намеренно: proxy декодирует сессию только ради роли и портала, а план §1.2 прямо
оставляет это существующим guard'ам («Host выбирает surface, но никогда не выдаёт доступ к tenant
data»). Нарушения пункта `B6` здесь нет; отмечено, потому что для branded-поверхности этот шов не
проверен пока ни на одном слое — по причине `N8`.

## 6. Полный CI по ветке

Прогон через общий замок хоста, из этого клона.

```
$ /home/dev/brain/host-orch/run-tests.sh "pnpm run ci"
[2026-08-23T10:07:22+03:00] pid=850894 ACQUIRED test lock :: pnpm run ci
...
ci-record: прогон измерил 9f9d837cfdc0961936da16b72e2884fa28f8d01f, код возврата 0
[2026-08-23T10:17:04+03:00] pid=850894 RELEASED test lock (rc=0, 582s)

$ cat runs/ci-last.json
{
  "sha":            "9f9d837cfdc0961936da16b72e2884fa28f8d01f",
  "headAfter":      "9f9d837cfdc0961936da16b72e2884fa28f8d01f",
  "movedDuringRun": false,
  "stepsExit":      0,
  "exitCode":       0
}
```

- **`rc` = 0**, длительность **582 с**.
- `HEAD` до прогона `9f9d837cf`, после — `9f9d837cf`; `movedDuringRun: false`.
- Три vitest-проекта: `565 passed | 2 expected fail | 1 skipped (568)`,
  `2084 passed | 13 skipped (2097)`, `16 passed (16)`. Плюс lint, typecheck, SaaS DB-регрессия,
  `registry-prod-audit` — все зелёные.
- `.next` клона собран в 09:46 из этого же содержимого; продуктовые файлы после инъекций
  восстановлены побайтово (`git diff` пуст), так что сборка не протухла. `pnpm run ci` в любом
  случае гоняет свои шаги сам.
- В отличие от прогона автора (`N7`), этот измерил РЕАЛЬНУЮ голову ветки, включая слияние с
  `feat/doctor-ui-rebuild` (`9f9d837cf`), которого прогон автора не касался вовсе.

## 7. Гигиена аудита

- PROD и TEST не трогались, порт `5200` не занимался, своих dev-серверов не поднималось.
- Все 10 инъекций откачены, дерево чистое: `git diff` и `git diff --stat` пусты.
- Временные пробники (`__audit_probe.test.ts`, `__audit_probe2.test.ts`) удалены, в коммит не вошли.

---

## Не сделано

- Живая проверка в браузере не выполнялась и для `B6` не применима: `patient_branded` в рантайме
  недостижим (`N8`), а второй и третий хост матрицы (`admin.*`, `<клиника>.*`) на DEV не подняты.
  Доказательство `B6` целиком тестовое — это и есть содержание пункта плана.
- Пункты `Gate B` вне скоупа `B6` (migration dry-run DEV→TEST, targeted route/UI tests) не
  проверялись.
- Находки `N1`–`N9` НЕ исправлялись: пункта под них в плане владельца нет, а `B6` прямо запрещает
  трогать механику. Закрывать ли `N1`–`N4` дополнительными тестами — решение владельца.
