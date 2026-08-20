# Аудит единой глобальной политики неоплаты — 20.08.2026

Authority: команда владельца 20.08.2026, `docs/OWNER_DECISIONS.md` T1/T10/T13 и
`docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md` T10/T13/4b.

Проверяемый diff: `492a0e45e..7b27c9fa8`.

## Слепой kill-set

Составлен до чтения diff и тестов автора.

1. Глобальный outcome неоплаты обязан победить разные тарифные `system_access_policy`; иначе две клиники при
   одной глобальной настройке получают разный доступ.
2. `read_only` обязан оставить чтение и запретить запись через общую mutation-дверь: как минимум
   `POST /api/doctor/clients` и один уже подключённый mutation-route; иначе неоплатившая клиника продолжает
   менять данные через забытый путь.
3. `blocked` обязан одинаково закрыть кабинет и вложенную механику; иначе часть системы остаётся доступна после
   глобальной блокировки.
4. Legacy `mechanic_access_policies` и сохранённые backend `downgradePolicies` не должны менять outcome неоплаты;
   иначе удалённые из UI ручки продолжают скрыто переопределять глобальную настройку.
5. Commercial-constructor не должен показывать или отправлять downgrade controls; backend downgrade lifecycle
   может сохраниться, но пользователь не должен иметь второй активной ручки на этом экране.
6. Смена глобальной настройки не должна ретроактивно сокращать уже заработанный rung/history; иначе изменение
   конфигурации отбирает уже обещанное время доступа.
7. SQL-двери кабинета/механики и TypeScript mutation guard обязаны совпадать по состояниям
   `active/grace/read_only/blocked`; иначе один и тот же пользователь получает разные решения на разных путях.
8. Fault injection: возврат тарифного override и снятие общего mutation denial должны красить соответствующий
   целевой тест; после отката тесты снова зелёные.

## Результат

Вердикт: **MUST FIX**.

### Findings

1. **MUST FIX — commercial-constructor падает при открытии.** Worker удалил объявление
   `OVERRIDABLE_MECHANICS` вместе с downgrade editor, но оставил его исполняемое использование в селекторе
   исключения организации (`CommercialConstructorClient.tsx:1184`). Достижимый сценарий: глобальный администратор
   открывает страницу тарифов; React получает `ReferenceError`, дерево страницы пустое, верхнюю глобальную настройку
   сохранить нельзя. Целевой UI-тест падает: 1 failed, 1 unhandled error, 11 skipped.

2. **MUST FIX — forward migration не проходит обязательный migration-order gate.** В
   `20260820T175432_paid_period_global_access_authority.sql:1-5` owner-marker стоит после описания и
   `BCB-MIGRATION-VERIFY`, а parser требует его в начале statement. Достижимый сценарий: migration preflight/CI
   останавливается до применения исправления; обе SQL-двери остаются со старым тарифным override. Команда
   `bash apps/webapp/scripts/check-drizzle-migration-order.sh` завершилась exit 1 с
   `statement has no valid BCB-MIGRATION-OWNER or BCB-MIGRATION-BACKFILL header`.

3. **MUST FIX — глобальный вариант «Перейти на другой тариф» всё ещё не является итоговым решением и расходится
   с TypeScript.** `resolveCommercialAccess` возвращает для него `lifecycle: active` и целевой tariff
   (`commercialAccessComputation.ts:54-62`). Миграция добавляет приоритет только для `read_only`/`blocked`
   (`20260820T175432…sql:17-19,44-48`). Поэтому обе SQL-двери после выбора целевого тарифа продолжают старый
   `system_access_policy`: при истёкшем anchor возвращают `grace`/`read_only`/terminal
   (`schema-pre.sql:18374-18395,18620-18646`) вместо активного доступа выбранного глобальной настройкой тарифа.
   Достижимый сценарий: global admin выбирает «Другой тариф», но клиника попадает в локальную лестницу этого тарифа;
   исход снова зависит от тарифной настройки, а TS/admin projection показывает `active`.

4. **MUST FIX — смена глобальной политики сокращает уже заработанный rung задним числом.** Обе старые SQL-двери
   сохраняют историю только из `admin_audit_log.action = 'saas_tariff_update'`
   (`schema-pre.sql:18321-18330,18540-18551`). Global update действительно журналируется отдельным action
   `saas_paid_period_policy_update` (`pgPlatformEntitlements.ts:791-798`), но новая миграция его не читает и ставит
   текущий global `read_only`/`blocked` перед историческим расписанием. Достижимый сценарий: клиника уже находится в
   заработанном grace/read-only после окончания периода; администратор меняет global outcome на более жёсткий —
   следующий запрос немедленно возвращает `disabled`, вопреки §2.10 и обязательному пункту 6 kill-set.

### Что прошло

- `pnpm --dir apps/webapp exec vitest run --project=route src/app/api/doctor/clients/route.route.test.ts src/app-layer/guards/requireEntitlementReadOnlyRefusesWrites.test.ts` — раннер выбрал 1 файл, 4/4 passed.
- `pnpm --dir apps/webapp exec vitest run --project=fast src/infra/repos/trialAccessComputation.test.ts src/app-layer/guards/requireEntitlementReadOnlyRefusesWrites.test.ts src/app-layer/guards/cabinetAccessLadder.test.ts` — 3 файла, 47/47 passed.
- `pnpm --dir apps/webapp exec vitest run --project=unit src/app-layer/entitlements/protectedActionRegistryCoverage.unit.test.ts` — 1 файл, 8/8 passed.
- Добавленный acceptance-test сохранения скрытого backend downgrade lifecycle:
  `pnpm --dir apps/webapp exec vitest run --project=fast src/modules/org-entitlements/service.test.ts -t "preserves the stored downgrade lifecycle"` — 1/1 passed, 66 skipped.
- `node scripts/check-migration-privileges.mjs` — OK, 14 migration files, exit 0.

### Красные проверки

- `pnpm --dir apps/webapp exec vitest run --project=ui src/app/app/admin/commercial/CommercialConstructorClient.ui.test.tsx -t "shows only the system access ladder form" --reporter=verbose` — 1 failed, 1 error, 11 skipped, exit 1 (`ReferenceError: OVERRIDABLE_MECHANICS is not defined`).
- `bash apps/webapp/scripts/check-drizzle-migration-order.sh` — exit 1: owner-marker не начинает statement.

### Fault injection

- Удалён вызов cabinet-wide guard из `POST /api/doctor/clients` → route suite: 3 failed / 1 passed; read-only и
  blocked стали HTTP 200. После отката: 4/4 passed.
- Снята ветка `cabinet.state === 'read_only'` в общем `requireEntitlementForMutation` → route suite:
  1 failed / 3 passed; read-only стал HTTP 200. После отката: 4/4 passed.
- Скрытый `downgradePolicies` принудительно заменён `{}` при update → новый acceptance-test: 1 failed / 66 skipped;
  после отката: 1 passed / 66 skipped.
- Возврат тарифного override для global `tariff` outcome не был пойман существующими тестами: pure TS suite остаётся
  зелёной, а SQL-двери не вызываются. Это 1 непойманный класс из blind kill-set и finding №3; fixer должен оставить
  живой/публичный oracle обеих SQL-дверей, а не тест текста SQL.
- Сокращение заработанного rung сменой global policy также не имеет поведенческого oracle; это второй непойманный
  класс и finding №4.

Full CI, lint и typecheck не запускались по brief. PROD/TEST и текущая `feat` не затрагивались.
