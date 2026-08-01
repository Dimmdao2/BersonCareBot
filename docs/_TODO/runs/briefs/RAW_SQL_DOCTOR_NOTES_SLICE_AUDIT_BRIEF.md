# Независимый аудит doctor notes raw-SQL slice (#1082)

**Тест или взгляд:** это разовая transport-конверсия одного repository method; проверять итоговый diff/AST и
targeted compile/lint. Permanent test, DB proof или новый harness не создавать.

Прочитать `AGENTS.md` §5/§10a/§24. Authority:
`docs/_TODO/runs/briefs/RAW_SQL_DOCTOR_NOTES_SLICE_BRIEF.md`, candidate `ebdbde9eb` и accepted census
`300772f3d`.

PASS только если:

1. Diff ограничен `pgDoctorNotes.ts` и evidence report; port/schema/callers/другие методы не менялись.
2. `listForUser` обязательно фильтрует `userId`, условно фильтрует `organizationId` только когда он передан и
   сохраняет `createdAt DESC`.
3. Результат проходит через существующий `mapRow`; типы/контракт `DoctorNotesPort` не изменены.
4. В product-файле больше нет `runWebappPgText`, `webappSqlFromPgText`, `$1..$n` или `sql.raw`; используется
   существующий Drizzle schema/query path.
5. Лично зелёные `git diff --check`, scoped eslint, webapp typecheck и `node scripts/check-no-new-raw-sql.mjs`.

Записать короткий report с exact commands и PASS/FAIL по пяти пунктам; коммитить только report. Product не
исправлять, DB/DEV/TEST/PROD/taskdb/plan checkbox не трогать, не пушить.
