# Blind-аудит удаления standalone онлайн-анкеты

Кандидат: `e63ff54be` (`wt/remove-online-intake`). Authority — owner-коррекция в текущем разговоре: удалить
standalone онлайн-анкету полностью и все ведущие в неё ссылки без редиректа на booking; обычную онлайн-запись не
менять; исторические таблицы/данные пока сохранить.

## Классификация до чтения тестов кандидата

- R1–R6 — повторяемое достижимое поведение: проверяется существующими/добавленными поведенческими тестами и
  одноразовой fault injection.
- R7–R9 — итоговое состояние удаления/сохранения: проверяется production diff, точным поиском известных символов,
  code-search и обратными ссылками. Постоянные тесты на отсутствие файлов/строк не создаются.

## Blind kill-set

Составлен до чтения тестов кандидата.

- **R1 — patient forms:** пациент всё ещё открывает LFK- или nutrition-анкету либо получает redirect в booking.
- **R2 — patient entry points:** в patient UI остаётся кнопка/ссылка, ведущая в standalone-анкету.
- **R3 — intake API:** create/read/status/reply API остаётся достижимым и принимает/возвращает новые анкеты.
- **R4 — doctor surfaces:** очередь, tab, KPI, badge или notification всё ещё ведут врача в старую анкету.
- **R5 — relay/start parameters:** relay или start/query params всё ещё запускают/маршрутизируют standalone intake.
- **R6 — ordinary booking/messages:** удаление анкеты ломает обычную онлайн-запись, чат или сообщения.
- **R7 — tariff:** `online_intake` остаётся активной тарифной механикой/registry entry после удаления поверхности.
- **R8 — historical data:** кандидат удаляет таблицы, миграции или исторические данные intake.
- **R9 — merge/link-claim:** удаляются или ломаются исторические merge/link-claim пути, которым старые строки ещё
  нужны.

## Результат

**PASS — реальных findings нет.**

- **R1/R2 PASS:** patient LFK/nutrition pages and their entry links are deleted. The remaining
  `FormatStepClient` choice `Онлайн-приём` still resolves to the existing booking service path; the empty-program
  and program-detail consultation CTA was removed rather than redirected.
- **R3 PASS:** patient create/read routes and doctor list/detail/status/reply/stats routes are absent. Command:
  `find apps/webapp/src/app -type f \( -path '*/api/*online-intake*' -o -path '*/app/*online-intake*' \) -print`
  produced no production route files.
- **R4 PASS:** doctor communications registry has only chats/comments/broadcasts; dashboard intake loading, KPI,
  badge polling, nav badge, queue and intake notification relay are removed. The chat unread source remains.
- **R5 PASS:** the intake relay module is deleted and symbolic messenger parameters `intake_lfk` /
  `intake_nutrition` no longer resolve; booking and messages parameters retain their prior paths.
- **R6 PASS:** candidate production diff changes `DoctorSupportInbox` only in a comment; the chat loader/badge still
  calls `unreadFromUsers()`. The patient UI acceptance test proves the existing online appointment href remains.
- **R7 PASS:** `online_intake` is absent from `MECHANIC_REGISTRY` and `PROTECTED_ACTION_MAPPINGS`; legacy tariff API
  data is ignored by the commercial constructor rather than reviving the retired control. Command:
  `rg -n --glob '!docs/**' --glob '!**/*.test.*' --glob '!**/*.spec.*' --glob '!**/migrations/**' --glob '!**/meta/**' "mechanic:\\s*['\\\"]online_intake['\\\"]|['\\\"]online_intake['\\\"]\\s*:" apps/webapp/src packages apps/integrator/src || true`
  produced no production registry mapping.
- **R8 PASS:** schema definitions, relations, migrations and historical tables are preserved. Command:
  `git diff --name-only e63ff54be^..e63ff54be -- apps/webapp/db` produced no paths.
- **R9 PASS:** merge preview, package merge, channel link-claim and purge handling still reference the historical
  intake rows; none is changed by the candidate. Command:
  `git diff --name-only e63ff54be^..e63ff54be -- packages/platform-merge apps/webapp/src/infra/platformUserMergePreview.ts apps/webapp/src/infra/repos/pgChannelLinkClaim.ts apps/webapp/src/infra/platformUserFullPurge.ts`
  produced no paths.

## Проверки поведения и fault injection

- Candidate behavior:
  `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/app/app/patient/onlineIntakeRemoval.ui.test.tsx src/app/app/doctor/communications/onlineIntakeTabRemoval.unit.test.ts src/app/app/admin/commercial/CommercialConstructorClient.ui.test.tsx"`
  → exit 0, `3` files / `8` tests passed.
- Audit-added start-parameter acceptance:
  `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/modules/auth/messengerStartParamRoutes.onlineIntakeRemoval.test.ts"`
  → exit 0, `1` file / `1` test passed.
- Fault 1: temporarily restored patient link `Реабилитация онлайн`; command
  `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/app/app/patient/onlineIntakeRemoval.ui.test.tsx"`
  → expected exit 1 at the retired-link assertion.
- Fault 2: temporarily routed the retired doctor `?tab=intake` bookmark to a live non-chat tab; command
  `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/app/app/doctor/communications/onlineIntakeTabRemoval.unit.test.ts"`
  → expected exit 1 at the chats-fallback assertion.
- Fault 3: temporarily restored `intake_lfk` messenger routing; command
  `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/modules/auth/messengerStartParamRoutes.onlineIntakeRemoval.test.ts"`
  → expected exit 1 at the retired-parameter assertion.
- Final post-revert behavior run:
  `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/app/app/patient/onlineIntakeRemoval.ui.test.tsx src/app/app/doctor/communications/onlineIntakeTabRemoval.unit.test.ts src/app/app/admin/commercial/CommercialConstructorClient.ui.test.tsx src/modules/auth/messengerStartParamRoutes.onlineIntakeRemoval.test.ts"`
  → exit 0, `4` files / `9` tests passed.
- Type boundary after the deleted modules and imports:
  `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir packages/operator-db-schema build && pnpm --dir packages/db-principal build && pnpm --dir packages/platform-merge build && pnpm --dir packages/error-tracking build && pnpm --dir apps/webapp typecheck"`
  → exit 0.

All injected product faults were reverted before the final green run. Full CI, deploy, live check and merge were
intentionally not run by this audit stage.
