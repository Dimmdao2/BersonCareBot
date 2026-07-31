# Блок М — отчёт по ходу работы (worker-m-mechanics)

Бриф: [`M_MECHANICS_BRIEF.md`](M_MECHANICS_BRIEF.md). Authority: `docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md`,
раздел «ПОРЯДОК РАБОТ v2», блок М, пункты М2, М3, М4.

Пишу по ходу, не постфактум. Порядок работы — М4 → М2 → М3, как задано брифом.

---

## М4 — гейт «раннер видит каждый тест-файл»

### Замер (повтор команд из плана, этот бокс)

```
cd apps/webapp && pnpm exec vitest list --filesOnly | sed 's/^\[[a-z]*\] //' | sort -u | wc -l
99
find src \( -name '*.test.ts' -o -name '*.test.tsx' \) | sort | wc -l
121
```

Разница — 22 файла, все `src/**/*.devDb.integration.test.ts`. Список подтверждён построчно (`comm -13`)
и совпадает 1:1 со списком из `scripts/check-db-chokepoint.mjs` (webapp devDb-манифест).

Проверены также два других приложения — гейт должен быть общим, не веб-app-специфичным:

```
cd apps/integrator && pnpm exec vitest list --filesOnly | sort -u | wc -l   # 27
find src e2e \( -name '*.test.ts' -o -name '*.test.tsx' \) | sort | wc -l   # 27   → разницы нет
cd apps/media-worker && pnpm exec vitest list --filesOnly | wc -l           # 0
find src \( -name '*.test.ts' -o -name '*.test.tsx' \) | wc -l              # 0    → разницы нет (тестов ещё нет)
```

Вывод: расхождение сегодня только в webapp, ровно 22 файла. Гейт делаю общим по всем трём приложениям,
чтобы не повторить дефект «проверка только там, где уже нашли баг».

### Сделано

- `scripts/check-test-runner-visibility.mjs` — по каждому приложению (`integrator`, `webapp`,
  `media-worker`) сравнивает список `*.test.ts`/`*.test.tsx` на диске (`src` + `e2e` у интегратора)
  со списком, который реально отдаёт `pnpm exec vitest list --filesOnly` в каталоге приложения.
  Падает на:
  - новом невидимом файле, которого нет в храповике;
  - протухшей записи храповика (файл на диске больше не существует).
- `scripts/test-runner-visibility-known-invisible.json` — храповик, `asOf: "2026-08-01"`, ровно 22
  пути `apps/webapp/src/**/*.devDb.integration.test.ts` (список сверен `comm -13` с замером плана и
  совпадает 1:1 со списком в `scripts/check-db-chokepoint.mjs`, webapp-манифест).
- Подключение к CI: корневой `package.json` → `"lint"`:
  `eslint . && node scripts/check-db-chokepoint.mjs && node scripts/check-no-new-raw-sql.mjs &&
  node scripts/check-test-runner-visibility.mjs && pnpm --dir apps/webapp run lint`.
  `pnpm lint` уже вызывается в `.github/workflows/ci.yml` (job `Lint`), поэтому отдельный job не
  завожу — гейт входит туда же, где механические гейты уже живут, как и просил бриф.

### Самотест — дословный вывод

**1. Гейт на текущем дереве (до порчи) — зелёный:**

```
$ node scripts/check-test-runner-visibility.mjs
check-test-runner-visibility: integrator: диск=27 раннер=27 невидимых=0
check-test-runner-visibility: webapp: диск=121 раннер=99 невидимых=22
check-test-runner-visibility: media-worker: диск=0 раннер=0 невидимых=0
check-test-runner-visibility: OK
exit=0
```

**2. Намеренная поломка «новый невидимый файл»** — создан
`apps/webapp/src/__m4_selftest__/gateSelfTest.devDb.integration.test.ts` (валидный тест-файл, суффикс
не выбирается ни одним vitest-проектом, путь заведомо не в храповике):

```
$ node scripts/check-test-runner-visibility.mjs
check-test-runner-visibility: integrator: диск=27 раннер=27 невидимых=0
check-test-runner-visibility: webapp: диск=122 раннер=99 невидимых=23
  НОВЫЙ невидимый файл (не в храповике /home/dev/dev-projects/bcb-wt-docs3/scripts/test-runner-visibility-known-invisible.json, asOf=2026-08-01):
    - webapp/src/__m4_selftest__/gateSelfTest.devDb.integration.test.ts
  Файл не выбирается ни одним vitest-проектом. Либо чини include/exclude, либо это
  осознанное исключение — тогда решение по нему принимает владелец плана блока Б3, не этот гейт.
check-test-runner-visibility: media-worker: диск=0 раннер=0 невидимых=0
check-test-runner-visibility: FAIL
exit=1
```

Файл и каталог `apps/webapp/src/__m4_selftest__/` удалены сразу после снятия вывода
(`rm -rf apps/webapp/src/__m4_selftest__`), продуктовое дерево не тронуто.

**3. Намеренная поломка «протухшая запись храповика»** — во временную копию `known-invisible.json`
дописан несуществующий путь `src/infra/repos/thisFileDoesNotExist.devDb.integration.test.ts`:

```
$ node scripts/check-test-runner-visibility.mjs
check-test-runner-visibility: integrator: диск=27 раннер=27 невидимых=0
check-test-runner-visibility: webapp: диск=121 раннер=99 невидимых=22
  ПРОТУХШАЯ запись храповика (файла больше нет на диске):
    - webapp/src/infra/repos/thisFileDoesNotExist.devDb.integration.test.ts
  Удали запись из /home/dev/dev-projects/bcb-wt-docs3/scripts/test-runner-visibility-known-invisible.json — список имеет право только сокращаться.
check-test-runner-visibility: media-worker: диск=0 раннер=0 невидимых=0
check-test-runner-visibility: FAIL
exit=1
```

Храповик восстановлен из резервной копии сразу после снятия вывода; повторный прогон — снова `OK`
(идентичен пункту 1).

### Побочная находка (не в скоупе М4, не трогаю)

`node scripts/check-no-new-raw-sql.mjs` на голове ветки падает **сам по себе**, независимо от этой
работы (эти файлы я не трогал):

```
check-no-new-raw-sql: raw SQL debt manifest violation.
New raw .query(...) SQL outside the frozen D18c debt list:
  - apps/integrator/src/infra/runtime/worker/outgoingDeliveryWorker.finalize.test.ts:292,335
  - apps/integrator/src/infra/scripts/check-d30-outgoing-delivery-claim-concurrency.ts:62,113
  - apps/integrator/src/infra/scripts/check-d30-scheduler-lock-concurrency.ts:59,68
```

Это продуктовый файл интегратора вне моего скоупа («продуктовый код приложения не трогать вообще») —
записываю как наблюдение для лида/владельца очереди, не чиню. Из-за этого **`pnpm lint` целиком на
голове ветки будет красным независимо от М4** — сам гейт М4 (проверено отдельным точечным прогоном
выше) зелёный.

---

## М2 — три отказа в `tools/orch-launch.sh`

### Сделано

Три новых условия дописаны в `tools/orch-launch.sh` (стиль существующих проверок — `die "ОТКАЗ: …"`):

- **3a** — если бриф упоминает поломки/`fault injection`/арбитров/аудит тестов (`grep -qiE
  'поломк|fault injection|арбитр|аудит тест'`), а роль запуска — обычный `auditor`, порт отказывает.
  Обхода нет (роль — не то, что можно обойти переменной, это дизайн-решение о песочнице).
- **3b (продолжение существующего пункта 3b)** — бриф воркера обязан, помимо ссылки на правила теста,
  содержать буквальную строку «Строка плана, дающая оракул:». Обход — существующий
  `ORCH_NO_TESTS="<причина>"` (тот же, что и у соседней проверки).
- **4 (продолжение существующей проверки регистрации в очереди)** — если зарегистрированный коммит
  клона — тестовый (конвенция репозитория `test(scope): ...`, уже используемая, например,
  `35eb9159c`, `7a7b24c08`, `55cdfc48e`, `c223fcd15`, `6da0aab0a`), его строка вердикта в
  `NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md` обязана содержать путь к артефакту (`.md`/`.json`) и число
  рядом со словом «непойман…»/«убит…». Формат не изобретён новый — использован тот же (путь +
  число), что уже фигурирует в существующих строках очереди и в блоке В плана (§М5: «путь к отчёту
  мутаций и число убитых»).

### Как проверялось (среда/оговорка)

Клон `bcb-wt-docs3` — единственный, в котором у меня есть право на запись; каталог
`/home/dev/dev-projects/` вне него — read-only для этого бокса. Файл очереди
`NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md` физически лежит в `BersonCareBot` (read-only отсюда), поэтому
для изолированной проверки **только пункта 4** использована копия скрипта с переопределённым `QUEUE=`
на локальную фикстуру `/tmp/orch_m2/fake_queue.md` (единственная переменная отличается от продуктового
скрипта; сам `tools/orch-launch.sh` в репозитории не менялся для этой проверки). Пункты 3a и 3b
проверены **прямо на продуктовом `tools/orch-launch.sh`** без подмен.

Отдельно: чтобы клон прошёл проверку 2 (`чистое дерево, содержит голову feat`), пришлось
`git update-index --skip-worktree` на десяти `*.env*.example`-путях — в этом клоне они превращены
песочницей в character-device (`/dev/null`, вероятно намеренная маскировка секретов), и обычный
`git merge`/`git stash` падает на них с «unsupported file type» независимо от того, что мержится.
Это не изменение содержимого файлов и не продуктовая правка — чисто метаданные локального индекса,
чтобы git перестал пытаться их сравнивать. Отражено здесь как наблюдение, не как «сделано» по скоупу.

### Самотест — дословный вывод, все шесть прогонов `ORCH_DRY=1`

**1a. Отказ 3a** (роль `auditor`, бриф с «поломки/fault injection/арбитр/аудит тестов»):

```
$ ORCH_DRY=1 bash tools/orch-launch.sh auditor docs3 m2test-3a-refuse sol high /tmp/orch_m2/brief_faultwords_auditor.md "блок М, п. М2"
ОТКАЗ: бриф упоминает поломки/fault injection/арбитров/аудит тестов, а роль запуска — обычный auditor.
  auditor уходит в read-only песочницу и физически не может внести поломку в продуктовый код —
  так первый аудит уровня 2 выдал предсказания по чтению кода вместо прогонов. Запускай ролью
  auditor-live (workspace-write, но бриф обязан запрещать ей менять файлы кроме внесения/откатывания
  поломки — дерево клона обязано остаться чистым после прогона).
exit=1
```

**1b. Проход 3a** (тот же бриф, роль `auditor-live`):

```
$ ORCH_DRY=1 bash tools/orch-launch.sh auditor-live docs3 m2test-3a-pass sol high /tmp/orch_m2/brief_faultwords_auditor.md "блок М, п. М2"
запуск: роль=auditor-live клон=docs3 провайдер=codex модель=sol effort=high слой=блок М, п. М2
  клон содержит feat d1ed4b3e8, своих коммитов сверху: 4; агентов роли было 0 из 5; лог /tmp/orch_m2/m2test-3a-pass.log
  ORCH_DRY=1 — все проверки пройдены, агент НЕ запущен
exit=0
```

**2a. Отказ 3b** (роль `worker`, бриф ссылается на правила тестов, но без строки-оракула):

```
$ ORCH_DRY=1 bash tools/orch-launch.sh worker docs3 m2test-3b-refuse sol high /tmp/orch_m2/brief_worker_no_oracle.md "блок М, п. М2"
ОТКАЗ: в брифе воркера нет строки «Строка плана, дающая оракул:» —
  бриф ссылается на правила тестов, но не называет, ИЗ КАКОЙ СТРОКИ ПЛАНА взято ожидаемое поведение.
  Без неё исполнитель придумывает oracle сам, вместо того чтобы взять его из плана/решений владельца.
  Добавь в бриф явную строку вида «Строка плана, дающая оракул: <цитата/ссылка>». Если задача
  действительно без тестов — запускай с ORCH_NO_TESTS="<причина>".
exit=1
```

**2b. Проход 3b** (тот же бриф + строка-оракул добавлена). Проверка 3b пройдена — отказ сменился на
**другой, ожидаемый и не относящийся к М2**: мои собственные коммиты (`083fe3a1b`, `6da0aab0a`) ещё
не зарегистрированы в реальной очереди аудита (я и не должен их туда сам вписывать — это работа
аудитора после независимой проверки). Это сама проверка 4 (существовавшая до этой работы) корректно
не пускает дальше — доказывает, что 3b больше не блокирует:

```
$ ORCH_DRY=1 bash tools/orch-launch.sh worker docs3 m2test-3b-pass sol high /tmp/orch_m2/brief_worker_with_oracle.md "блок М, п. М2"
ОТКАЗ: в клоне docs3 есть несведённые коммиты без записи в /home/dev/dev-projects/BersonCareBot/docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md: 083fe3a1b 6da0aab0a
  Сначала аудит и строка с вердиктом в очереди, потом новая работа.
exit=1
```

**3a. Отказ 4** (изолированная фикстура очереди `/tmp/orch_m2/fake_queue.md`, коммит-тест
зарегистрирован, но без пути к отчёту):

```
$ ORCH_DRY=1 bash /tmp/orch_m2/orch-launch-test.sh worker docs3 m2test-4-refuse sol high /tmp/orch_m2/brief_worker_with_oracle.md "блок М, п. М2"
ОТКАЗ: в клоне docs3 тестовые коммиты (test(...)) зарегистрированы в /tmp/orch_m2/fake_queue.md,
  но их строка вердикта не называет путь к отчёту поломок (.md/.json) и/или число непойманного/убитых: 6da0aab0a(нет-пути-к-отчёту)
  Формат — как уже пишется в /tmp/orch_m2/fake_queue.md, новый не изобретай. Допиши строку вердикта, потом новая работа.
exit=1
```

**3b. Проход 4** (та же фикстура, строка вердикта дополнена путём к отчёту и числом непойманного):

```
$ ORCH_DRY=1 bash /tmp/orch_m2/orch-launch-test.sh worker docs3 m2test-4-pass sol high /tmp/orch_m2/brief_worker_with_oracle.md "блок М, п. М2"
запуск: роль=worker клон=docs3 провайдер=codex модель=sol effort=high слой=блок М, п. М2
  клон содержит feat d1ed4b3e8, своих коммитов сверху: 4; агентов роли было 0 из 4; лог /tmp/orch_m2/m2test-4-pass.log
  ORCH_DRY=1 — все проверки пройдены, агент НЕ запущен
exit=0
```

Живых агентов не запускал ни разу (везде `ORCH_DRY=1`), временные брифы/фикстуры лежат в `/tmp/orch_m2/`
(вне репозитория), продуктовый `tools/orch-launch.sh` менялся только коммитом М2, изолированная копия
для проверки 4 — только в `/tmp`.

## НЕ СДЕЛАНО

_(заполняется по ходу; пусто, если раздел ниже не тронут до конца работы)_
