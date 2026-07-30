## ИТОГ

Исправления закоммичены: `af5dfa3c5` (`fix(tariffs): carry lifecycle warnings safely #1069`). Push, merge, live-миграция и перенумерация `0276` не выполнялись.

### Fix 1 — deploy-breaking migration

**Было:** миграция обращалась к удалённой `integrator.system_settings`.

**Изменено:** удалён запрещённый `UPDATE`; cleanup `7/3/21` оставлен только через каноническую [`public.system_settings`](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/db/drizzle-migrations/0276_access_lifecycle_ladder_local.sql:27). Номер `0276` сохранён.

Почему существующая организация не пострадает:

- условие `organization_id IS NULL` исключает настройки конкретных клиник;
- удаляется только вложенный `lifecyclePolicy`;
- требуется точное совпадение с историческим `7/3/21`, поэтому owner-edited значение не затрагивается;
- удаление обращения к уже несуществующему зеркалу само данные не меняет.

Проверка: `webapp lint` и `check-drizzle-journal-sync: OK`. Live SQL не запускался по запрету mission. При ручном возврате строки проверочный invariant покраснел:

```text
37:UPDATE integrator.system_settings
FAIL: removed settings mirror is referenced by the webapp migration
```

### Fix 2 — предупреждение «терпения»

**Было:** resolver вычислял warning, но guard и visibility adapter его отбрасывали.

**Изменено:**

- resolver теперь передаёт дату, количество и следующее состояние: [`service.ts`](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/service.ts:235);
- тип warning закреплён в [`types.ts`](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/types.ts:142);
- guard и visibility adapter сохраняют warning: [`requireEntitlement.ts`](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/app-layer/guards/requireEntitlement.ts:46);
- общий clinic-facing doctor layout показывает датированное предупреждение: [`layout.tsx`](/home/dev/dev-projects/bcb-wt-[redacted-token].tsx:80).

Текст использует только данные resolver и ступени канона: например, «Курсы: полный доступ до 01.08.2026. Затем — только чтение. Предупреждений: 4».

Тесты: [`service.test.ts`](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/service.test.ts:518) и [`accessLifecycleSurfaces.ui.test.tsx`](/home/dev/dev-projects/bcb-wt-[redacted-token].ui.test.tsx:160).

Ручные мутации:

- возврат guard к `{ ok: true }` → 4/17 тестов красные, включая отсутствие `read.warning`;
- удаление clinic banner → `Unable to find ... role "alert"`;
- удаление course adapter из doctor layout → ожидалось предупреждение «Курсы», пришло только «Промо».

### Fix 3 — literal hunt в integrator

Команды:

```bash
rg -n -i --glob '*.{ts,tsx,js,mjs,cjs,sql,json}' \
  '(graceDays|readOnlyDays|warningCount|terminalState|chargeAttempts|lifecyclePolicy|warningAtPercent|14[[:space:]]*(days?|дн)|80[[:space:]]*%)' \
  apps/integrator

rg -n -U --glob '*.{ts,tsx,js,mjs,cjs,sql,json}' \
  '(graceDays[^\n]{0,80}7|chargeAttempts[^\n]{0,80}3|readOnlyDays[^\n]{0,80}21|7[^\n]{0,120}3[^\n]{0,120}21)' \
  apps/integrator
```

Оба поиска чистые: копии `7/3/21`, duration/threshold/warning-count/terminal-policy literals не найдены.

Отдельный поиск terminal states обнаружил один tariff-related путь: [`writeDiaryLfkDirect.ts`](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:207) содержит fallback `access_source <> 'no_trial'` и собственную проверку `read_only`/`blocked`. По формулировке Fix 3 это зафиксировано в отчёте, но не изменено: integrator-runtime не входил в разрешённый correction scope.

### Fix 4 — три test blind spots

Цитаты из аудита и закрытие:

| Blind spot | Новое доказательство | Ручная мутация |
|---|---|---|
| «Удаление policy-колонок из SQL/repository projection: тест строит snapshot вручную и БД не касается» | Repository projection проходит до resolver в [`pgOrgEntitlements.test.ts`](/home/dev/dev-projects/bcb-wt-[redacted-token].test.ts:36) | Подмена обеих policy-проекций на пустые → тест красный: ожидалась system policy, получен `null` |
| «Удаление вызова adapter из doctor layout или patient page: тест вызывает adapter напрямую, но не рендерит реальные обе оболочки» | Реальные doctor и patient RSC-поверхности рендерятся в [`accessLifecycleSurfaces.ui.test.tsx`](/home/dev/dev-projects/bcb-wt-[redacted-token].ui.test.tsx:160) | Doctor: неверный warning; patient: вместо `hidden` появился organization UUID |
| «Hardcode/default при submit или потеря сохранения mechanic-level policy: тест только открывает редактор и проверяет подписи, не отправляет форму и не перечитывает тариф» | Полный submit→GET→reopen в [`CommercialConstructorClient.ui.test.tsx`](/home/dev/dev-projects/bcb-wt-[redacted-token].ui.test.tsx:39) | Hardcode `7/3/21` и потеря `mechanicAccessPolicies` отдельно сделали тест красным |

### Финальные проверки

- Exact Vitest: **4/4 файла, 23/23 теста**.
- `pnpm --filter webapp typecheck` — exit 0.
- `pnpm --filter webapp lint` — exit 0.
- Full CI не запускался.
- Billing, mock-payment routes, план, канон и пункт 2.6c не изменялись.
- После коммита unstaged остались только десять предсуществующих env character-device файлов.