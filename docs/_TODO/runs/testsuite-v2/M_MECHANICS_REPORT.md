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

## НЕ СДЕЛАНО

_(заполняется по ходу; пусто, если раздел ниже не тронут до конца работы)_
