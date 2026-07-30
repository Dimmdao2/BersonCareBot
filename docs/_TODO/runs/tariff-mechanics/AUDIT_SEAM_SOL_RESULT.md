VERDICT: FAIL

### По вопросам

1. **PASS — одна production-реализация вычисляет ladder state.** Канонический алгоритм находится только в [`app.resolve_organization_mechanic_access`](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/db/drizzle-migrations/0276_access_lifecycle_ladder_local.sql:148). Webapp делегирует ему через [PG-порт](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:248); integrator вызывает ту же функцию [перед записью](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:167). Старые `resolveMechanicAccessFromSnapshot`, `terminalResolutionState` и ladder-арифметика TypeScript удалены.

   Искал определения/вызовы `resolve_organization_mechanic_access`, старые символы резолвера, `DAY_MS`, `graceDays/readOnlyDays/terminalState`, SQL `CREATE FUNCTION`, overlays и rehearsal scripts. Найдено одно определение и два production-caller’а. `pgOrgEntitlements.resolveAccess()` по-прежнему считает legacy commercial/trial state, но не итоговый mechanic ladder state. In-memory порт возвращает фиксированный test/build результат, а не вычисляет политику.

2. **PASS — дверь fail-closed.** Функция до чтения FORCE-RLS таблиц требует `app.current_org_id()` и выбрасывает `42501` при отсутствии или несовпадении principal ([строки 168–175](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/db/drizzle-migrations/0276_access_lifecycle_ladder_local.sql:168)). Private PostgreSQL rehearsal подтвердил unprincipled refusal под FORCE RLS. Mismatch следует из безусловного сравнения до `RETURN QUERY`.

   Integrator разрешает запись только при `access?.mutation_allowed === true`; `false`, пустая строка и ошибка не ведут к INSERT. Локального пересчёта или permissive fallback нет. Webapp при пустой строке также бросает `organization_mechanic_access_denied`.

3. **PASS на repository/private-DB contract; live TEST не запускался.** Delta добавляет ровно одну `SECURITY DEFINER` функцию: `expected_secdef_count 110 → 111` ([deploy assertion](/home/dev/dev-projects/bcb-wt-tariff/deploy/host/deploy-test-saas.sh:1529)). Exact ACL проверяется двусторонним `EXCEPT`: owner `app_owner`, обычный `EXECUTE` только `app_staff` и `app_patient`; любое лишнее/пропавшее право валит deploy ([строки 1546–1585](/home/dev/dev-projects/bcb-wt-tariff/deploy/host/deploy-test-saas.sh:1546)). Private rehearsal exact-ACL прошёл. Webapp contract — 3/3, integrator contract — 3/3.

4. **FAIL — буквальный критерий “нет state-name literals” не выполнен.** Длительности берутся из JSONB, а terminal выбирается через `policy ->> 'terminalState'`; `7/3/21` — только точный шаблон удаления исторического seed. Но сама SQL-функция жёстко содержит `full_access`, `grace`, `read_only`, `disabled`, `unconfigured` и список состояний, разрешающих mutation. Webapp также фиксирует перечень terminal states.

   Запущенная команда:

```bash
rg -n --pcre2 "(['\"])(?:no_trial|read_only|full_access|unconfigured|grace|disabled|blocked)\1|graceDays|readOnlyDays|terminalState" \
  [redacted-token].ts \
  apps/webapp/src/modules/org-entitlements/service.ts \
  [redacted-token].ts \
  [redacted-token].ts \
  apps/webapp/db/drizzle-migrations/0276_access_lifecycle_ladder_local.sql
```

   Существенный output:

```text
inMemoryOrgEntitlements.ts:6: state: 'full_access'
0276...sql:34: {"graceDays":7,"chargeAttempts":3,"readOnlyDays":21}
0276...sql:265: THEN 'full_access'
0276...sql:267: THEN 'disabled'
0276...sql:276: THEN 'grace'
0276...sql:282: THEN 'read_only'
0276...sql:283: policy ->> 'terminalState'
0276...sql:316: ARRAY['full_access', 'grace']
pgOrgEntitlements.ts:136: lifecycle: 'grace'
pgOrgEntitlements.ts:147: ... 'blocked' ? 'blocked' : 'read_only'
service.ts:68: ['full_access', 'read_only', 'disabled']
```

   В integrator-файле совпадений нет. Worker’s “Output: пустой” получен потому, что он искал только integrator.

5. **FAIL — обязательный stage-2 UI regression contract красный.** Service behavior test подтвердил reads в `read_only`, deny/hide в terminal и передачу grace warning — 14/14. SQL статически сохраняет критичные `patient_card`/`patient_app` как `full_access`; `payments` и `branding` не имеют special-case и идут общей веткой.

   Но [`accessLifecycleSurfaces.ui.test.tsx`](/home/dev/dev-projects/bcb-wt-[redacted-token].ui.test.tsx:116) не обновлён под обязательный метод порта:

```text
Test Files  1 failed (1)
Tests       2 failed (2)
TypeError: port.resolveMechanicAccess is not a function
```

   Поэтому реальные clinic-warning и patient-hide контракты сейчас не проходят. Кроме того, private PostgreSQL rehearsal проверяет только `grace` и terminal `disabled`; `read_only`, mismatched principal, critical mechanics и фактические вызовы `payments`/`branding` в нём не доказаны.

6. **PASS в штатном Drizzle-контракте.** `0276` не переименована; journal sync — OK; commit меняет существующий файл без renumber. Migration forward-only, а overlay успешно применён дважды rehearsal’ом. Исторический cleanup ограничен `organization_id IS NULL` и точным JSON-сравнением, поэтому изменённое владельцем значение и org-scoped строки не затрагиваются ([строки 26–34](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/db/drizzle-migrations/0276_access_lifecycle_ladder_local.sql:26)). Сам numbered SQL не рассчитан на ручной повтор вне migration ledger.

7. **PASS по scope коммита.** `a43352274^..a43352274`: 11 файлов, `473 insertions / 382 deletions`. Billing, mock-payment routes, plan и canon отсутствуют в diff; после `a43352274` application/deploy-код также не менялся.

### MUST FIX

1. Обновить stage-2 UI fake-порт, реализовав `resolveMechanicAccess`, и вернуть оба UI-теста в зелёное состояние.

2. Выполнить буквальный data-driven контракт: убрать из SQL/runtime выбранный кодом каталог state-name/terminal решений либо согласовать более узкое требование. Сейчас новое состояние требует code change и migration.

3. Дополнить private PostgreSQL rehearsal поведенческими случаями mismatched principal, `read_only`, critical-unlatchable и отсутствия special-case для `payments`/`branding`. Сейчас удаление соответствующих SQL-ветвей не обязательно покраснит действующие тесты.

### Запуски

- Webapp typecheck: exit 0.
- Webapp lint + migration/journal checks: exit 0, `check-drizzle-journal-sync: OK`.
- Webapp Vitest: service 14/14; PG port 3/3; UI surfaces 0/2, fail.
- Integrator typecheck/lint: exit 0.
- Integrator Vitest: 3/3.
- `bash -n deploy/host/deploy-test-saas.sh`: exit 0.
- Private PostgreSQL rehearsal: `PASS`.
- Full CI не запускался.

**Lead на live DEV/TEST:** после исправлений остаётся применить migration/closure и подтвердить фактические `111/111`, exact ACL и реальные clinic/patient surfaces под подписанными principal.

**Дерево:** аудит не создал ни одного нового изменения, но буквально clean оно не было ни в начале, ни в конце: `git status` показывает те же 10 предсуществующих env-файлов, смонтированных как character devices. Я их не менял из-за запрета на file changes.