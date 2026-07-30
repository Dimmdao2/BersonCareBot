VERDICT: PASS

### 1. Миграция двери — PASS

- `0276` в `ccbe94538` побайтно совпадает с версией до `a43352274`: `git diff --exit-code a43352274^:…0276 ccbe94538:…0276` → exit 0.
- Добавлена journal-запись `idx=277`, tag `0277_organization_mechanic_access_door_local`.
- В `0277` — `CREATE OR REPLACE FUNCTION`, затем повторные `OWNER TO app_owner`, `REVOKE … PUBLIC/app_staff/app_patient`, `GRANT EXECUTE … app_staff/app_patient` и необходимые table grants.
- Все три сценария корректны:

  1. `0276` применена без двери → новый watermark `0277` создаёт её.
  2. `0276` не применена → Drizzle последовательно применяет восстановленную `0276`, затем `0277`.
  3. Дверь уже создана изменённой `0276` → функция заменяется без нового объекта; канонический TEST deploy временно выдаёт migrator membership в `app_owner`, необходимое для замены owned-функции.

- Два независимых rehearsal прошли; внутри каждого `0277` применяется дважды. Итого четыре успешных применения: `1.284s` и `1.357s`, оба exit 0.

### 2. Поведенческий PostgreSQL rehearsal — PASS

Все обязательные случаи присутствуют:

- Отсутствующий и несовпадающий principal дают `42501`, а не permissive row.
- `read_only` возвращает читаемую строку с `mutation_allowed=false`.
- `patient_card` остаётся `full_access/critical`, несмотря на сохранённый override `false`.
- `payments` и `branding` проходят `full_access → grace → read_only → disabled` через общий путь, без special-case.

Load-bearing mutation-прогоны на временных копиях `/tmp`, без изменения worktree, упали ожидаемо:

- Удалён absent-principal guard → `unprincipled lifecycle door call unexpectedly succeeded`.
- Удалён mismatch guard → `mismatched lifecycle door call unexpectedly succeeded`.
- Удалена ветка `read_only` → `read_only_read_allowed_mutation_refused_contract_failed`.
- Удалена конечная critical-ветка → `critical_mechanic_unlatchable_contract_failed`.
- Убран общий data-driven inclusion для `payments`/`branding` → `payments_branding_full_access_ladder_contract_failed`.

### 3. UI-тесты — PASS

Diff теста добавляет только недостающий `resolveMechanicAccess` и тип `OrgMechanic`; прежние assertions не ослаблены.

Fake port возвращает актуальный `MechanicAccessResolution`: `mechanic`, `state`, `policySource`, `warning`.

- Удаление clinic warning ломает `getByRole('alert')` и проверку точного текста с датой `01.08.2026`, count `4` и next state.
- Удаление visibility decision передаёт organization ID вместо `hidden` и ломает patient assertion.
- Фактический запуск: `2/2` passed.

### 4. Deploy contract — PASS

- До `a43352274`: `expected_secdef_count=110`.
- В `a43352274` и `ccbe94538`: `111`.
- В восстановленной `0276` определений двери: `0`; в `0277` ровно одна `CREATE OR REPLACE … SECURITY DEFINER`.
- Поэтому после `0277` итог — `111` как при создании двери, так и при замене уже существующей.
- Deploy проверяет точное ACL двусторонним `EXCEPT`: owner `app_owner`, обычный `EXECUTE` только `app_staff` и `app_patient`, без grant option и лишних grantee.
- Тот же exact ACL прошёл в PostgreSQL rehearsal после повторного применения миграции.
- Webapp PG contract: `3/3`; integrator direct-write contract: `3/3`.

### 5. Регрессии — PASS

- Ladder state вычисляется в одном production-месте: `app.resolve_organization_mechanic_access`; webapp-порт только отображает результат.
- Integrator допускает запись исключительно при `access?.mutation_allowed === true`; fallback или локального пересчёта нет.
- Grace warning доходит до clinic shell с датой, числом предупреждений и следующим состоянием.
- Чтения открыты в `grace` и `read_only`; mutation в `read_only` запрещена.
- Terminal state скрывает specialist navigation, patient navigation и direct URL.
- `patient_card`/`patient_app` остаются unlatchable; `payments`/`branding` не имеют отдельных SQL-ветвей.
- Поиск не нашёл numeric duration defaults или выбранного terminal state в webapp/integrator runtime. Названия допустимого множества состояний остаются в коде согласно уточнённому канону.
- Service behavior: `14/14` passed.

### 6. Scope — PASS

`ccbe94538^..ccbe94538`: 5 файлов, `403 insertions / 204 deletions`.

Изменены только:

- `0276`, новая `0277`, migration journal;
- UI regression test;
- disposable PostgreSQL rehearsal.

Billing, mock-payment routes, план и канон в diff отсутствуют. `a43352274` является предком `ccbe94538`; текущий HEAD не меняет проверенные implementation-файлы после `ccbe94538`.

### MUST FIX

Нет.

### Что остаётся лиду на живом DEV

Применить `0277` каноническим DEV/TEST migration flow, подтвердить watermark `0277`, фактические `111/111` SECURITY DEFINER, exact ACL двери и выполнить живую проверку под подписанными `app_staff`/`app_patient` principal: clinic grace-warning с датой, patient-hide в terminal и отказ integrator mutation в read-only. PROD не затрагивался.

### Команды

Запущены:

- `git show/diff/log/status` для `a43352274` и `ccbe94538`, включая byte-for-byte сравнение `0276`.
- `pnpm --dir apps/webapp run typecheck` → exit 0.
- `pnpm --dir apps/webapp run lint` → exit 0, journal sync OK.
- `pnpm --dir apps/integrator run typecheck` → exit 0.
- `pnpm --dir apps/integrator run lint` → exit 0.
- Exact Vitest:

  - `service.test.ts` → `14/14`.
  - `pgOrgEntitlements.test.ts` → `3/3`.
  - `accessLifecycleSurfaces.ui.test.tsx` → `2/2`.
  - `writeDiaryLfkDirect.test.ts` → `3/3`.

- `bash apps/webapp/scripts/check-drizzle-journal-sync.sh` → OK.
- `bash -n deploy/host/deploy-test-saas.sh` → exit 0.
- `pnpm run rehearse:e1-c5a-entitlement-closure` ×2 → PASS/PASS.
- Пять успешных expected-failure mutation runs на временных копиях.
- Full CI не запускался.

Первоначальная попытка использовать отсутствующий `/usr/bin/time` завершилась exit 127 до запуска rehearsal; успешные прогоны затем выполнены через shell builtin `time`.

### Дерево

Аудит не изменил ни одного файла и не оставил временных процессов/каталогов. Однако worktree буквально не clean: в начале и в конце присутствуют те же 10 предсуществующих tracked env-файлов, смонтированных как character devices. Staged и untracked файлов — `0`; новых изменений от аудита — `0`.