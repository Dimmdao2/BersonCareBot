ИТОГ: lifecycle door вынесена в отдельный Drizzle-порт и закоммичена как `2bf56b79f`; push/merge не выполнялись.

- Порт: [organizationMechanicLifecycleDoor.ts](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:71). Проверяет organization principal, возвращает `ladderState` и `mutationAllowed`, отсутствующий/невалидный/ошибочный ответ закрывает доступ.
- Diary вызывает порт только в [writeDiaryLfkDirect.ts](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:172). Остальная логика и SQL дневника не менялись.
- Drizzle table DSL не моделирует параметризованные set-returning PostgreSQL functions. Поэтому используется официальный параметризованный `sql` fragment через transaction-scoped `.execute()` — без fallback в `DbPort.query`.

Поисковое доказательство:

```text
organizationMechanicLifecycleDoor.ts:93  getIntegratorDrizzleSession(db).execute(
organizationMechanicLifecycleDoor.ts:96  FROM app.resolve_organization_mechanic_access(
PASS: no db.query/txDb.query door call in owned implementation files
```

Ручные mutation-результаты:

- Terminal → принудительный `mutationAllowed: true`: тест упал, `expected false / received true`.
- `grace` → принудительный `mutationAllowed: false`: тест упал, `expected true / received false`.
- Удалён principal-gate: тест упал — promise разрешился `{ ladderState: "grace", mutationAllowed: true }` вместо отказа.

Финальные проверки:

- Новый port-test: 5/5.
- Существующий diary-test: 3/3.
- Integrator typecheck/lint: PASS.
- Webapp typecheck: PASS.
- Disposable private PostgreSQL rehearsal: `E1/C5A ... PASS`.
- Full CI не запускался.
- Остальные `directPublic`, миграции, план и канон не тронуты. Существовавшие env-изменения остались незастейдженными.