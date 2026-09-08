# Owner-found clinic management UI regressions

Role: WORKER. Read the AGENTS.md heading map first, then fully read §16, §17, §21, §22, §24 and the relevant
testing/migration sections for every path you touch. Read docs/ARCHITECTURE/DOCTOR_APP_UI_STYLE_GUIDE.md,
docs/_TODO/CLINIC_MANAGEMENT_WORKSPACE_2026-09-07.md and the original Schedule settings implementation.

Authority is the owner's live TEST report on 2026-09-08. Fix exactly these regressions; do not redesign blocks,
introduce a second writer, or alter tariff/composition behavior:

Источник оракула: owner live TEST 2026-09-08 — «в режиме управления клиники у меня не открываются страницы в
меню/каталог (услуги, и абонементы), вижу только филиалы» и «должно было выглядеть ОДИН В ОДИН».

1. In clinic management, clicking menu links `Услуги` and `Абонементы` changes navigation but leaves the visible
   content on `Филиалы`. The known mechanism is `ManagementBookingSections` updating `deepLinkParams.section`
   while `ScheduleSetupTab` initializes `activeSection` only once. Make the reused section renderer follow an
   external deep-link change without breaking its own subsection buttons. Acceptance is visible content, not URL.
2. Clinic management must use the exact page container, side spacing and block styles that existed in the
   `Настройки` tab of Schedule before the move. The move was composition-only: no templates/elements/styles were
   authorized to change. Remove the introduced blue borders and restore the prior side gutters/container one for
   one by reusing the existing Schedule shell/layout primitives. Compare the current management route against the
   pre-move Schedule settings rendering; do not restyle the inner booking settings components.
3. Patient portal invitation succeeds server-side but clipboard rejection shows the error toast
   `Ссылка создана, но не скопирована`. A successful invite must remain a success: retain the generated visible
   link and offer a normal explicit copy action/fallback using the existing clipboard/share pattern. Clipboard
   denial is not failure of invitation creation. Do not auto-revoke or issue a second invite.

The already committed owner correction b0eb1e45a moves the specialist/clinic transition into the common menu.
Preserve it and resolve conflicts in its favor.

WORKER DOES NOT WRITE OR MODIFY TESTS. Do not add UI/source/count/text tests. Run existing targeted behavior tests
only if already relevant, plus focused lint/typecheck. Do not run full CI. Do not deploy, push, mutate TEST/DEV
data, or touch PROD.

Commit all and only this workstream's files with explicit paths. Final report must state the root cause of each
regression, exact files, checks, commit SHA and any remaining unproved live behavior.
