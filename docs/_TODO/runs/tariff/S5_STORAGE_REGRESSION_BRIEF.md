# Регресс от этапа 5 (объём файлов) — папка создаётся до проверки предела (run: worker-tariff-storage-fix)

**План (authority):** `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md`, §5a, этап 5, пункт 5.4.

**Правила репозитория, обязательные к прочтению до правки:**
`.cursor/rules/tests-check-behaviour-not-circumstances.mdc`, `.cursor/rules/webapp-tests-lean-no-bloat.mdc`,
`.cursor/rules/clean-architecture-module-isolation.mdc`.

## Что сломано — установлено мной бисекцией, это НЕ посторонняя поломка

Коммит `882472453` (предел объёма файлов) убрал из `apps/webapp/src/app/api/doctor/patients/[userId]/files/route.ts`
предпроверку `resolveFileStorageLimit` и перенёс проверку внутрь `createFile`. Побочный эффект: теперь
**папка пациента в медиатеке создаётся РАНЬШЕ проверки предела**:

```ts
const patientFolder = await withDoctorWorkspacePrincipal(gate.ctx, () =>
  pgEnsureClientPatientFolder(patientUserId),   // ← выполняется всегда
);
...
file = await ... createFile({ ..., folderId: patientFolder.id });  // ← предел проверяется только здесь
```

**Доказательство бисекцией:** на `882472453~1` набор `tariffMechanics` зелёный (31/31); на текущей голове ветки
падает `refuses file metadata creation visibly when the assigned tariff has no file limit` с
`TypeError: Cannot read properties of undefined (reading 'id')` в `files/route.ts:162`.

Предыдущий прогон (`worker-d13a-staff-paths`) назвал это падение «pre-existing, unrelated» — **это неверно**,
падение появилось именно от работы по объёму. Не повторяй эту оценку, проверь сам.

Последствие в бою, а не только в тесте: при исчерпанном пределе (и при тарифе без предела файлов) клиника
всё равно получает созданную папку в медиатеке — побочный эффект от отказанной операции.

## Что сделать

Вернуть отказ ДО побочных эффектов, **не потеряв атомарность**:

- атомарная проверка внутри пишущей транзакции (`assertStockQuotaAvailable`) остаётся — она защищает от гонки,
  доказательство `check-storage-quota-race.mjs` должно остаться зелёным;
- перед созданием папки должен стоять отказ, если предела нет или он исчерпан, — как было до `882472453`;
- отказ видимый (403 с понятным кодом), не тихий.

## Приёмка

- `pnpm --filter webapp exec vitest run tariffMechanics` — 31/31 зелёные;
- тест: при исчерпанном пределе папка пациента НЕ создаётся (проверить отсутствие побочного эффекта, а не
  только код ответа);
- `node apps/webapp/scripts/check-storage-quota-race.mjs` остаётся зелёным и краснеет при снятии решающей
  строки — приложить дословный вывод;
- `pnpm --filter webapp lint` и `typecheck` зелёные;
- галочки плана не ставить, push и merge не делать.
