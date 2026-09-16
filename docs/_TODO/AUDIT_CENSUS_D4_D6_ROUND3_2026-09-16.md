FAIL — MUST FIX: 2

# Независимый адверсарный аудит D4/D6, круг 3 — идентификатор сборки

Кандидат: `74c4986e419d5b38063c12d47aaa9b47a0ed04d2` (`wt/census-d4-d6`). Scope: только
`apps/webapp/src/app/api/version/route.ts` и
`apps/webapp/src/app/api/version/version.route.test.ts`; принятые кругами 1–2 области не переоткрывались.

Источник оракула: `docs/_TODO/PUBLIC_DOORS_CENSUS_2026-09-16.md:3-6` — owner-строки «это все потенциальные
уязвимости — резать нещадно» и «всё такое должно браться только из системы без внешних дверей»; для теста —
`AGENTS.md` §10a, обязательная «Линейка владельца (15.09)».

## MUST FIX 1 — host env-ветка снова отдаёт анониму точный operational timestamp

**Оракул:** owner-строки `PUBLIC_DOORS_CENSUS_2026-09-16.md:3-6`; требование брифа 1 «Ответ никогда не несёт
момент старта» и требование 6 «Утечка не вернулась другим путём».

**Достижимый сценарий:** `route.ts:23-25` без преобразования возвращает `BUILD_ID`. Оба названных в брифе host
build-path формируют его как `<short-git-sha>-<date +%s>`:

- `deploy/host/build-webapp.sh:7-14`;
- `deploy/host/deploy-webapp-prod.sh:100-113`.

Они записывают это значение в `.runtime-build-id`, а production unit действительно загружает этот файл через
`EnvironmentFile` (`deploy/systemd/bersoncarebot-webapp-prod.service:12-17`). Поэтому это не мёртвый build-time
export: при таком host-build route видит переменную в процессе и ставит её выше Next `BUILD_ID` файла.

**Impact:** анонимный `GET /api/version` получает точный Unix-момент начала host-сборки и короткий git SHA.
Точный момент *последующего* рестарта той же сборки из этого вычислить нельзя: идентификатор не меняется при
рестарте. Но при первой выкладке он даёт точный operational timestamp сборки и близкую границу первого запуска —
тот же класс публичной телеметрии, ради которого из route убирался `Date.now()`. Приоритет env-ветки вернул
утечку другим источником.

**Что требуется:** публичный идентификатор должен быть непрозрачным и одинаковым на сборку; Unix epoch и git SHA
не должны проходить в `/api/version`. Product fix в этом аудите не делался (§24.6).

## MUST FIX 2 — тест пинит `node:fs/readFileSync`, а не только конечное поведение

**Оракул:** `AGENTS.md` §10a, «Линейка владельца (15.09)»: тест, который приходится править при честной правке
кода, держит форму реализации и вреден; на выходе цепочки должен быть ожидаемый результат. Требование брифа 5
прямо требует считать такой тест `MUST FIX`.

Тест доходит до публичного `GET` и читает итоговый JSON — это правильная граница. Но setup на
`version.route.test.ts:45-56` заменяет конкретно `node:fs.readFileSync` и затем требует, чтобы ответ был равен
литералу собственной заглушки `one-and-the-same-build`. Это уже знание внутреннего способа добыть id.

Целевая честная мутация заменила синхронное чтение на эквивалентное `await readFile` из `node:fs/promises`, не
меняя порядок источников, путь файла или HTTP-выход. Оба чтения получили реальный стабильный Next id
`bqhJbvWu18xUIt9Wp-DzL`, но тест покраснел только потому, что его `node:fs` mock перестал перехватывать
реализацию:

```text
expected 'bqhJbvWu18xUIt9Wp-DzL' to be 'one-and-the-same-build'
version.route.test.ts:55
```

Команда, давшая `1 failed / 2 passed` после этой мутации:

```bash
/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-kpi-filters && pnpm --dir apps/webapp exec vitest run src/app/api/version/version.route.test.ts --project route"
```

То есть тест имеет зубы, но краснеет от честной смены внутреннего API файловой системы при сохранённом конечном
результате. Его нужно переписать или удалить по §10a; новый постоянный тест аудит не добавлял.

## Проверки без находок

### Docker/standalone и два процесса

Dockerfile выполняет Next build и sync (`deploy/docker/Dockerfile:42-45`), затем переносит **всё** дерево
`/app` в runtime image (`:77-84`). Compose ставит ровно ожидаемый cwd
`/app/apps/webapp/.next/standalone/apps/webapp` и запускает `node server.js`
(`deploy/docker/docker-compose.yml:70-82`). Поэтому `join(process.cwd(), '.next', 'BUILD_ID')` разрешается в файл
внутри образа, а не во внешний build-каталог.

Свой осмотр standalone-среза:

```bash
for p in apps/webapp/.next/BUILD_ID apps/webapp/.next/standalone/apps/webapp/.next/BUILD_ID; do stat -c '%n type=%F mode=%a size=%s' "$p"; done
cmp -s apps/webapp/.next/BUILD_ID apps/webapp/.next/standalone/apps/webapp/.next/BUILD_ID
(cd apps/webapp/.next/standalone/apps/webapp && node -e "const fs=require('node:fs'); const path=require('node:path'); const p=path.join(process.cwd(),'.next','BUILD_ID'); console.log(process.cwd(),p,fs.existsSync(p),fs.readFileSync(p,'utf8').trim())")
```

Результат: оба файла — regular, mode `664`, size `21`; `cmp` вернул `0`; cwd разрешил
`.next/BUILD_ID`, файл существовал и читался.

Два отдельных процесса без обеих env-переменных прочитали один id:

```bash
/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-kpi-filters/apps/webapp/.next/standalone/apps/webapp; env -u BUILD_ID -u NEXT_PUBLIC_BUILD_ID node -e 'const {readFileSync}=require(\"node:fs\"); const {join}=require(\"node:path\"); console.log(JSON.stringify({pid:process.pid,cwd:process.cwd(),buildId:readFileSync(join(process.cwd(),\".next\",\"BUILD_ID\"),\"utf8\").trim()}))' & env -u BUILD_ID -u NEXT_PUBLIC_BUILD_ID node -e 'const {readFileSync}=require(\"node:fs\"); const {join}=require(\"node:path\"); console.log(JSON.stringify({pid:process.pid,cwd:process.cwd(),buildId:readFileSync(join(process.cwd(),\".next\",\"BUILD_ID\"),\"utf8\").trim()}))' & wait"
```

Результат: PID `967322` и `967323`, одинаковые cwd и build id `bqhJbvWu18xUIt9Wp-DzL`.

### Host wiring

`build-webapp.sh` и `deploy-webapp-prod.sh` не только пишут `.runtime-build-id`: unit читает его как optional
`EnvironmentFile`, поэтому в этих путях работает первая ветка route. Полный legacy host deploy
`deploy/host/deploy-prod.sh:155-174` runtime-файл не пишет; после удаления старой `.next` он собирает Next и
синхронизирует standalone. Для него работает вторая ветка — `.next/BUILD_ID`. Это стабильно на сборку и совпадает
между процессами.

### Стоимость синхронного чтения

Замер выполнен после `10000` прогревочных чтений; измерено `200000` чтений:

```bash
/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-kpi-filters && node -e 'const {readFileSync}=require(\"node:fs\"); const {join}=require(\"node:path\"); const p=join(process.cwd(),\"apps/webapp/.next/standalone/apps/webapp/.next/BUILD_ID\"); for(let i=0;i<10000;i++) readFileSync(p,\"utf8\").trim(); const n=200000; const t=process.hrtime.bigint(); for(let i=0;i<n;i++) readFileSync(p,\"utf8\").trim(); const ns=Number(process.hrtime.bigint()-t); console.log(JSON.stringify({iterations:n,totalMs:ns/1e6,meanUs:ns/n/1e3,readsPerSecond:n/(ns/1e9)}));'"
```

Результат: `1379.069221 ms` суммарно, `6.895346105 µs` на чтение, `145025.35` чтений/с. Watcher делает запрос
раз в `60000 ms` на видимой вкладке (`reloadConstants.ts:17`), поэтому измеренная стоимость не заметна; модульный
кэш не нужен и `MUST FIX` здесь нет.

### Ветка отказа и пустое значение

- пустые/whitespace env и файл отбрасываются;
- любая ошибка чтения попадает в process UUID;
- UUID непустой, поэтому сам route пустой `buildId` не отдаёт;
- если бы пустое значение всё же пришло, `BuildVersionWatcher.tsx:70-76` не делает reload, а сбрасывает backoff и
  продолжает цикл.

`catch {}` теряет диагностику, но в проверенном Docker-layout файл находится в read-only image, а в host-layout
его создаёт та же завершившаяся Next-сборка до рестарта. Достижимого отдельного молчаливого production-сценария
в этом scope не доказано, поэтому это не finding.

### Поля, заголовки и fault injection

Свой прогон реального handler показал единственное поле тела `buildId`; route-level headers —
`cache-control: no-store, no-cache, must-revalidate, proxy-revalidate` и
`content-type: application/json`; `startedAt` и другие поля отсутствуют. Команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-kpi-filters && pnpm --dir apps/webapp exec vitest run src/app/api/version/version.route.test.ts --project route --reporter verbose"
```

Она дала `1 passed` файл / `3 passed` теста и напечатала четыре вызова handler с теми же двумя заголовками и
единственным полем. Сам opaque Next id не позволяет вычислить рестарт. Host env id позволяет прочитать точное
время сборки — это `MUST FIX 1` выше.

Собственные мутации (все временные изменения production/test-кода возвращены):

| Поломка | Покрасневшее утверждение |
|---|---|
| env-ветка возвращает `String(Date.now())` | `prefers the identifier the deploy declared` (`1 failed / 2 passed`) |
| file-ветка возвращает `String(Date.now())` | тесты про timestamp и одинаковую сборку (`2 failed / 1 passed`) |
| fallback возвращает ISO-время при временно убранном локальном `.next/BUILD_ID` | тест про timestamp (`1 failed / 2 passed`) |
| file-ветка возвращает новый `randomUUID()` | тест одинаковой сборки (`1 failed / 2 passed`) |
| честная замена `readFileSync` → `await readFile` | ложный red на literal mock (`1 failed / 2 passed`) — `MUST FIX 2` |

Для каждой строки запускалась одна команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-kpi-filters && pnpm --dir apps/webapp exec vitest run src/app/api/version/version.route.test.ts --project route"
```

После возврата всех мутаций та же команда: `1 passed` файл, `3 passed` теста.

## ВОПРОСЫ ВЛАДЕЛЬЦУ

Нет. Обе находки имеют прямую опору в owner-оракуле и обязательном тестовом каноне.

## Ограничения

PROD и TEST не трогались; второй Next-сервер не поднимался; миграции и полный CI не запускались; новых постоянных
тестов нет.
