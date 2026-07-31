# D30 Ш0 — отчёт: закрытие находок аудита 2–6 и правка ложного утверждения плана

(run: worker-d30-step0-fix)

**Authority:** `docs/_TODO/runs/integrator-cleanup/D30_STEP0_AUDIT.md` (вердикт «доработать», шесть находок) +
бриф `D30_STEP0_FIX_BRIEF.md`. Продуктовый код (кроме гейта и его тестов) не менялся — проверено `git status`
в конце прогона (раздел «Границы соблюдены» ниже).

Каждая находка ниже: что сделано → файл → внесённая поломка + красный вывод + подтверждение отката →
прогон гейта/затронутых модулей командой и выводом.

---

## Находка 3 — гейт слеп к переопределению `Restart=always` ниже по файлу

**Было:** `hasRestartOnFailure` проверял `Restart=on-failure` **наличием** (`/^Restart=on-failure\s*$/m.test`).
systemd резолвит повторную директиву последним вхождением — строка `Restart=always` ниже давала фактический
`always`, а гейт оставался зелёным.

**Стало (`deploySystemdSchedulerUnitGate.ts`):** новая `lastDirectiveValue(content, key)` возвращает значение
**последнего** совпадения `^key=(.*)$`, а не факт присутствия. `hasRestartOnFailure` заменён на прямую проверку
`lastDirectiveValue(content, 'Restart') === 'on-failure'` с сообщением, которое показывает фактическое
последнее значение.

**Самотест** (`deploySystemdSchedulerUnitGate.test.ts`): `catches Restart=always overriding Restart=on-failure
from a later line` — фикстура = чистый unit + добавленная в конец строка `Restart=always`.

**Поломка внесена и подтверждена красным** — временно откачен сам фикс (`git stash` на файл гейта, оставив
новый тест) и прогнан тест против **старого** кода:

```
❯ src/infra/runtime/scheduler/deploySystemdSchedulerUnitGate.test.ts (10 tests | 3 failed)
 FAIL … catches Restart=always overriding Restart=on-failure from a later line …
AssertionError: expected [] to deep equally contain ObjectContaining{…}
- Expected: { "file": "bersoncarebot-scheduler-prod.service", "reason": StringContaining "\"always\"" }
+ Received: []
```

**Откат подтверждён:** `git stash pop` вернул фикс; `git status` после — рабочее дерево совпадает с
состоянием до эксперимента (никаких посторонних файлов), тест снова зелёный (см. общий прогон ниже).

---

## Находка 5 — `RestartSec=5` не пинится

**Было:** гейт вообще не проверял `RestartSec`. Комментарий `main.ts:56` объявляет `RestartSec=5` частью
дизайна leader-election («проигравший перезапускается каждые 5с»), но удаление строки давало бы дефолт
systemd (100мс) — жёсткий цикл перезапуска — незамеченным.

**Стало:** та же `lastDirectiveValue` проверяет `RestartSec` против пинованного значения `PINNED_RESTART_SEC =
'5'` — и на отсутствие директивы, и на переопределение другим числом ниже по файлу.

**Самотест:** `catches a dropped RestartSec=5 pin` — две ветки: (а) строка `RestartSec=5` удалена, (б) строка
`RestartSec=100` дописана в конец (переопределение).

**Поломка внесена и подтверждена красным** (тот же эксперимент со stash, что и находка 3, один прогон
покрывает обе находки):

```
FAIL … catches a dropped RestartSec=5 pin (systemd default of 100ms is a hot-restart loop) …
AssertionError: expected [] to deep equally contain ObjectContaining{…}
- Expected: { "file": "bersoncarebot-scheduler-prod.service", "reason": StringContaining "RestartSec=" }
+ Received: []
```

**Откат подтверждён** тем же `git stash pop`, что и находка 3.

---

## Находка 4 — второй unit той же среды под другим суффиксом проходит незамеченным

**Было:** `environmentOf` брал суффикс из имени файла регуляркой и клал в корзину как есть. `-prod.service` и
`-prod2.service` попадали в **разные** однотонные корзины → нарушение "больше одного unit на среду" не
срабатывало ни разу.

**Стало:** `environmentOf` возвращает **известное** имя среды только если суффикс входит в `KNOWN_ENVIRONMENTS =
['prod', 'test']` (ровно два значения, реально встречающиеся в `deploy/systemd/*.service` сегодня — см. ниже).
Файл с суффиксом вне этого набора получает собственное нарушение «unit file name's environment suffix is not
one of the known environments» и не участвует в подсчёте дублей (иначе повторил бы старую дыру в обратную
сторону — молча создал бы вторую корзину).

Известные среды подтверждены реальным листингом `deploy/systemd/*.service`: `prod` (5 файлов) и `test` (1 файл,
`bersoncarebot-media-worker-test.service`) — не выдумано, а взято из репозитория.

**Самотест:** `catches a second unit of the same environment landing under an unrecognized suffix instead of
the duplicate bucket` — второй фикстурный unit назван `bersoncarebot-scheduler-prod2.service`; тест проверяет
и что нарушение появилось, и что старое «expected exactly 1» **не** сработало (это и была бы тихая
регрессия — два независимых зелёных вместо одного красного).

**Поломка внесена и подтверждена красным** (тот же stash-эксперимент):

```
FAIL … catches a second unit of the same environment landing under an unrecognized suffix … 
AssertionError: expected [] to deep equally contain ObjectContaining{…}
- Expected: { "file": "bersoncarebot-scheduler-prod2.service", "reason": StringContaining "known environments" }
+ Received: []
```

**Откат подтверждён** тем же `git stash pop`.

---

## Прогон гейта и типов после находок 3–5

```
$ cd apps/integrator && npx vitest --run deploySystemdSchedulerUnitGate
 Test Files  1 passed (1)
      Tests  10 passed (10)
```

Первая попытка провалила `pnpm --dir apps/integrator typecheck` (`TS2532: Object is possibly 'undefined'` на
`match[1].trim()` в `lastDirectiveValue`) — поправлено на `(match[1] ?? '').trim()` (группа `(.*)` всегда что-то
матчит, но TS не может это вывести без `noUncheckedIndexedAccess`-safe кода). После правки:

```
$ pnpm --dir apps/integrator typecheck
> tsc --noEmit
(exit 0, без вывода)
```

Полный набор тестов интегратора (phase-level — модуль общий для нескольких находок, гейт входит в `pnpm test`):

```
$ pnpm --dir apps/integrator test
 Test Files  16 passed | 3 skipped (19)
      Tests  100 passed | 9 skipped (109)
```

(3 skipped test-файла/9 skipped тестов — существующие opt-in/dev-DB сценарии, не относятся к этому прогону.)

---

## Находка 2 — `check:d30-*` не гоняет ни один CI job

**Было:** `check:d30-scheduler-lock-concurrency` и `check:d30-outgoing-delivery-claim-concurrency` существовали
только как алиасы в `apps/integrator/package.json:30-31`. Грep по `.github/workflows/`, корневому
`package.json`, `deploy/` и `*.sh` их не находил — по канону
`.cursor/rules/test-execution-policy.md` §«Канон» п.4 скрипт/alias без реально запускающего CI job защитой не
считается.

**Стало:** новый job `d30-scheduler-concurrency` в `.github/workflows/ci.yml`, по точному прецеденту
`u6b-organization-slug-invariants` (`ci.yml:124-132` до правки) — тот же приём `apt-get install postgresql-16`
+ прямой запуск скрипта:

```yaml
d30-scheduler-concurrency:
  name: D30 scheduler/outgoing-delivery concurrency proofs
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v5
    - uses: ./.github/actions/setup-pnpm
    - run: sudo apt-get update && sudo apt-get install --yes postgresql-16
    - run: pnpm --dir apps/integrator run check:d30-scheduler-lock-concurrency
    - run: pnpm --dir apps/integrator run check:d30-outgoing-delivery-claim-concurrency
    - uses: ./.github/actions/cancel-on-failure
```

**Проверка синтаксиса** (PyYAML, т.к. `js-yaml` не установлен в этом воркспейсе):

```
$ python3 -c "import yaml; ...; print(', '.join(yaml.safe_load(open('.github/workflows/ci.yml'))['jobs'].keys()))"
lint, typecheck, test-integrator, test-webapp-core, test-webapp-behavior, build-integrator, build-webapp,
audit, saas-rls-conformance, u6b-organization-slug-invariants, d30-scheduler-concurrency
```

**Оба скрипта реально прогнаны локально** (то же PostgreSQL 16, что использует `d30DisposablePostgres.ts` —
`/usr/lib/postgresql/16/bin`, присутствует в этом окружении), чтобы доказать, что job, добавленный в CI,
действительно зелёный, а не просто синтаксически корректен:

```
$ pnpm --dir apps/integrator run check:d30-scheduler-lock-concurrency
[piece 1] PASS: second concurrent acquire got null, post-release acquire succeeded
[piece 2] PASS: assertStillHeld() threw SchedulerLockLostError after connection loss, lock was re-acquirable
check-d30-scheduler-lock-concurrency: PASS

$ pnpm --dir apps/integrator run check:d30-outgoing-delivery-claim-concurrency
[piece 4a] PASS: two concurrent claims on one due row, exactly one won
[piece 4b] PASS: repeated enqueue with the same event_id did not create a second row
check-d30-outgoing-delivery-claim-concurrency: PASS
```

(Оба вывода включают `ERROR`/`WARN` строки логгера о симулированном обрыве соединения и об отсутствующей
опциональной таблице `outgoing_delivery_reclaim_config` — это ожидаемый шум существующих скриптов, не
регрессия; `outgoing_delivery_reclaim_config` вне области этого прогона.)

**Красный прогон / откат для этой находки не применялся** — здесь нечего "ломать и чинить": находка про
отсутствие CI-проводки, а не про логику. Доказательство — сам факт, что до этого прогона grep не находил
`check:d30` ни в одном workflow, а теперь находит; и что оба скрипта реально проходят под тем же приёмом,
что использует workflow (apt `postgresql-16` + прямой вызов).

---

## Находка 6 — составной чекбокс Ш0 расщеплён

`D30_SCHEDULER_REVERSAL_PLAN.md`, шаг Ш0: один чекбокс на пять работ заменён на подпункты Ш0.1–Ш0.6, каждый
со своим статусом и ссылкой на коммит:

- **Ш0.1** `schedulerDecisionGuard` (условие 1, раздел 2a) — отмечен **не сделано** (файл не существует —
  проверено `find`).
- **Ш0.2** тест захвата замка двумя экземплярами — **сделано**, `c3922ef85`.
- **Ш0.3** проверка владения замком в тике + выход при потере — **сделано**, `c3922ef85`.
- **Ш0.4** тест конкурентного `claim` одной строки — **сделано**, `c3922ef85`.
- **Ш0.5** гейт unit-файлов + решение `process.exit(1)`/`Restart=on-failure` — база `c3922ef85`, ужесточение
  находок 3–5 — этот прогон (см. выше).
- **Ш0.6** (добавлено этим прогоном) — CI-проводка `check:d30-*` (находка 2).

Ш0 в целом остаётся открытым чекбоксом верхнего уровня, пока не закрыт Ш0.1 — родительский пункт больше не
отмечается «сделано» одной галочкой, пока подпункт открыт.

---

## Находка 1 — ложное утверждение риска (только правка плана, код не тронут)

**Было** (строка риска «Потеря замка при обрыве соединения»): «второй рубеж — `SKIP LOCKED` + уникальный
`event_id`, который делает двойную отправку невозможной **даже при двух лидерах**» — без уточнения канала.

**Проблема:** это верно только для messenger-каналов (telegram/max), где `event_id` детерминированный и идёт
через очередь с `ON CONFLICT DO NOTHING`. Push и email идут **не через очередь**, а прямым HTTP-запросом
вебаппа в интегратор (`notify-channels/route.ts`): идемпотентность там — «посмотреть кэш (:84) → отправить
(:100) → записать кэш (:122)». Два одновременных запроса (что случится, если планировщик и cron оба живы после
переезда Ш4/Ш5) оба промахиваются мимо проверки на :84 и оба отправляют.

**Правка (только `D30_SCHEDULER_REVERSAL_PLAN.md`, код доставки не менялся):**

1. Строка риска переформулирована: второй рубеж закрывает риск **для messenger-каналов**, явно указано, что
   push/email не закрыты.
2. Добавлена отдельная строка риска «Двойная отправка web-push/email при двух живых лидерах» с точной
   трассировкой (`notify-channels/route.ts:84,100,122`) и названным чинящим приёмом — атомарный `INSERT ...
   ON CONFLICT DO NOTHING RETURNING` **до** работы, по образцу `idempotencyKeys.ts:37-53`
   (`createPostgresIdempotencyPort().tryAcquire`) — вместо текущего «посмотреть → сделать → записать».
3. Шаг **Ш4.0** добавлен как предпосылка к Ш4 (web-push) с явной пометкой: **только запись**, исполнение —
   отдельная работа, т.к. трогает продовый путь доставки. Отмечено, что тот же пробел действует и для Ш5
   (email/сводка оператора).

**Код `notify-channels/route.ts` не менялся** — подтверждено: этот файл отсутствует в `git status` в конце
прогона.

---

## Границы соблюдены

```
$ git status --porcelain | grep -v '\.env\.example\|empty.local-migration'
 M .github/workflows/ci.yml
 M apps/integrator/src/infra/runtime/scheduler/deploySystemdSchedulerUnitGate.test.ts
 M apps/integrator/src/infra/runtime/scheduler/deploySystemdSchedulerUnitGate.ts
 M docs/_TODO/runs/integrator-cleanup/D30_SCHEDULER_REVERSAL_PLAN.md
```

(Прочие `.env.example`/`deploy/env/*` изменения в рабочем дереве — предсуществующие, не тронуты этим прогоном.)
Кроме гейта, его теста и CI-workflow, продуктовый код не менялся. Ни одного файла в
`apps/webapp/src/app/api/integrator/patient-reminders/notify-channels/route.ts` или в
`apps/integrator/src/infra/db/repos/idempotencyKeys.ts`.

---

## Развилки (владельцу)

1. **`KNOWN_ENVIRONMENTS = ['prod', 'test']`** — набор известных сред взят из реального листинга
   `deploy/systemd/*.service` (5×`prod`, 1×`test`), а не выдуман. Если владелец планирует legit
   `staging`/`dev` unit планировщика — на нём гейт сработает как «неизвестная среда», пока имя явно не
   добавлено в этот список. Это осознанное поведение (аудит прямо просит «неизвестный суффикс — нарушение, а
   не новая среда»), но требует ручного шага при следующей реальной среде — фиксирую, чтобы не удивлял.
2. **Ш4.0/находка 1 — атомарный claim для push/email** записана как шаг плана, но не назначена ни на один
   существующий Ш-шаг явно кроме предпосылки к Ш4. Нужно ли заводить её отдельным треком/ID до начала Ш3
   (первого шага, где cron и планировщик оба реально пишут в один and тот же путь) — решение владельца, не
   принимал сам, чтобы не сузить задачу мимо брифа («шаг только записать»).

## Чего не смог

- Не прогонял добавленный CI job `d30-scheduler-concurrency` через реальный GitHub Actions — воркер работает
  локально, без доступа к Actions runner для этого репозитория. Компенсация: оба скрипта, которые job
  вызывает, реально прогнаны локально тем же способом (apt `postgresql-16` + прямой `pnpm --dir apps/integrator
  run check:d30-*`), и YAML синтаксически провалидирован. Полная уверенность в зелёном Actions-прогоне — только
  после реального push/PR.
- Не проверял находку 1 находкой в проде/dev — правка только текстовая (по прямому указанию брифа), рантайм-
  доказательство пробела в `notify-channels/route.ts` взято из чтения кода (:84/:100/:122), а не из живого
  прогона двух конкурентных запросов; это совпадает с тем, что сделал и сам аудитор (у него тоже «код,
  предсказание», без прогона).
