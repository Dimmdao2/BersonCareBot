Все три sensitivity-проверки действительно покраснели. Финальный фикс закоммичен: `92c4d237f`. Push/merge и full CI не выполнялись.

### Что было красным

`pnpm --filter webapp typecheck`:

- `TS2339`: `getById` отсутствовал в локальном типе `contentPages`.
- `TS2339`: `message` отсутствовал в одной ветке union в `actions.ts:74` и `actions.ts:104`.

Route-test:

```text
TypeError: Cannot read properties of undefined (reading 'ok')
at [redacted-token].ts:205:12
```

Причиной была неверная тестовая фикстура: цель называлась `daily-warmups`, но CMS lookup возвращал `null`, поэтому она не классифицировалась как warmups. Production guard не отсутствовал.

### Что изменено

- [patientWarmupReminderMutationGuard.ts:23](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/app-[redacted-token].ts:23) — добавлен точный контракт `getById` через `Pick<ContentPagesPort, 'getById'>`.
- [actions.ts:74](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:74) и [actions.ts:112](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:112) — union сужается через `'message' in warmupEntitlement`, без cast и без расширения результата gate.
- [tariffMechanics.route.test.ts:468](/home/dev/dev-projects/bcb-wt-[redacted-token].route.test.ts:468) — фикстура теперь честно возвращает `systemParentCode: 'warmups'`.

### Финальные проверки

- `pnpm --filter webapp typecheck` — exit 0.
- `pnpm --filter webapp lint` — exit 0.
- `tariffMechanics.route.test.ts` — 19/19.
- `readMaterialization.test.ts` — 3/3.
- Остальные affected-файлы — 5 файлов, 19/19.

Первый reproducer с `pnpm --dir apps/webapp test -- ...` из-за forwarding package-script выбрал 49 файлов; повторные и доказательные прогоны выполнялись точным `vitest run <file>`.

### Sensitivity checks

1. Lazy diary materialization

Временно заменил условие в [loadPatientDiaryWeekWellbeing.ts:113](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:113) на безусловную материализацию.

Точное падение:

```text
TypeError: Cannot read properties of undefined (reading 'find')
at symptomTypeRefId [redacted-token].ts:94:22
```

После восстановления: 3/3 green.

2. Doctor PATCH дневника ЛФК

Удалил блок `requireEntitlementForMutation(..., 'patient_diaries')` из [route.ts:41](/home/dev/dev-projects/bcb-wt-[redacted-token]/[userId]/lfk-complex-exercises/[exerciseRowId]/route.ts:41).

Точное падение:

```text
AssertionError: expected 200 to be 403 // Object.is equality

- Expected
+ Received

- 403
+ 200
```

После восстановления: 19/19 green.

3. Patient-home writes для `daily_warmup`

Временно превратил [[redacted-token]](/home/dev/dev-projects/bcb-wt-[redacted-token]-home/actions.ts:130) в no-op.

Основное падение:

```text
AssertionError: expected { ok: true } to match object { ok: false, …(1) }

- Expected
+ Received

{
- "error": StringContaining "этот раздел не входит в ваш тариф",
- "ok": false,
+ "ok": true,
}
```

Также из-за сдвига очереди mocked entitlement появился второй красный assertion:

```text
Expected error:
"Невозможно изменить контент разминок: этот раздел не входит в ваш тариф..."

Received:
"entitlement_required"
```

После восстановления: 19/19 green.

В рабочем дереве остались только десять предсуществующих env character-device modifications; они не тронуты и в коммит не вошли.