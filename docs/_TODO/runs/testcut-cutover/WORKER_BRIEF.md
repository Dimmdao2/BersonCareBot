# #1074 — worker-check массового сноса старого тестового набора

Authority:

- `docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md`, актуальный порядок в строках 67–92, шаг 1.
- `docs/_TODO/testsuite-rewrite-list.md`, только §A — 31 live-DB файл.
- `AGENTS.md`, `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`.

Проверь текущий HEAD клона как цельный worker-stage. Это механическая стадия удаления; не создавай новый scope,
не начинай Фазу 0 и не пиши новые тесты.

Обязательная матрица:

1. Diff целевого коммита удаляет только `*.test.ts`, `*.test.tsx`, `*.spec.ts`, `*.spec.tsx` под `apps/**`.
2. Не удалены production source, scripts/harness, конфиги, migrations, e2e.
3. После удаления под `apps/**` остаются ровно файлы из `testsuite-rewrite-list.md §A`; лишних и пропавших нет.
4. Пять старых исключений (`max/client.nock`, `PatientPackageSessionsList`,
   `TreatmentProgramConstructorClient.reorder`, `booking-appointment-lifecycle/service`,
   `loadPatientDiaryWeekActivity`) удалены по актуальному owner ruling; старый осторожный keep-set не применяется.
5. `git diff --check` чист.
6. Определи минимальные проверки, необходимые до независимого аудита. Full `pnpm run ci` не запускай: его отдельно
   прогонит CI-worker через `/home/dev/brain/host-orch/run-tests.sh`.

Если находишь дефект в delete-set — исправь минимально, закоммить с `#1074`, назови SHA и проверки. Если набор
корректен — не создавай пустой коммит и не меняй файлы.

Финальный ответ: `PASS` или `FAIL`, затем по одной строке на каждый пункт 1–6 с точной командой и результатом;
отдельно перечисли изменённые файлы, проверки, остаточные риски.
