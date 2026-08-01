# В9б — повторный docs-аудит исполнимой tenant-wall декомпозиции (#1081)

Тест или взгляд: **разовая security/deploy inspection** — проверить закрытие прежних F1–F7 и исполнимость порядка; product-тесты и DB здесь не создаются.

## Authority

- `AGENTS.md` §5, §10a, §24.
- `docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md`, В9б.
- Первичный FAIL `a0426b51f`, `V9B_IMPLEMENTATION_SLICES_AUDIT_REPORT.md`.
- Fix candidate `e2187503d`, revised `V9B_IMPLEMENTATION_SLICES.md` и fix-report.

Источник оракула: В9б требует, чтобы tenant data была недостижима без принципала, через `FORCE RLS` либо узкую capability; TEST доказательство выполняется реальными `app_*_login`, не owner-exempt ролью.

## Девять бинарных gates

1. Матрицы содержат ровно 10 FORCE + 29 capability/ACL + 9 global строк и по каждой: current role, caller, seam, slice, adoption/revoke condition, actor+verb oracle.
2. Existing D1 writer и `writePort.ts` включены; второго writer и D10 prerequisite нет.
3. Порядок expand → adopt → contract не отзывает прямой доступ до перехода callers.
4. Backfill aborts при любой unresolved reason; quarantine relation и удаление patient rows отсутствуют.
5. Нет owner/WAIT gate; S01 READY NOW с проверяемым branch/SHA/path условием.
6. A1/TEST используют exact существующие login/terminal roles; generic `app_worker` не является oracle.
7. FORCE policies используют существующий `app.current_org_id()` и точную owner-column каждой таблицы.
8. Семь migration-файлов реально разложены по S01/S02/S03/S04/S05a/S05b/S05c; S06/S07 migration не создают.
9. First-worker S01 не удаляет canonical `be_*`, `patient_bookings`/`appointment_records` и не начинает product до этой проверки.

## Ограничения и verdict

- Product, migration, DB/DEV/TEST/PROD/deploy, taskdb/checkbox и push запрещены.
- Аудитор может добавить только `V9B_IMPLEMENTATION_SLICES_REAUDIT_REPORT.md`; revised plan не исправляет.
- PASS только если 9/9; иначе named FAIL и один bounded fix-round.

