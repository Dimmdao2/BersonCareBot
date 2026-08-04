# Т1 — system access governs every nested mechanic

Rules: `AGENTS.md` — Маршрут, CORE rules, «Как решать, что делать» (measure first, do not multiply entities),
§5, §10/§10a/§10b, §21 (UI copy), §24. Language: internal work is English.

Authority: `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md` — item **Т1**, dictated by the owner
2026-08-03 after looking at the live screen.

Источник оракула: тот же план, Т1 — «это не логично и избыточно… Доступ к системе определяет работу всех
вложенных механик (я думаю так и работает вся индустрия) — это логично и снижает нагрузку вычислений доступа».

## What the owner is objecting to

Today the settings «как работает доступ по завершении периода» and «уведомления по триггерам» are duplicated **on
every single mechanic**, next to the same settings on system access. His ruling: system access defines the
behavior, a mechanic inherits it; a mechanic keeps its own setting only where it genuinely cannot inherit — and
then that must be visible as an exception, not as the default shape.

## Work

1. **Measure first.** Enumerate every place these two settings exist today — the data model, the API, the admin
   screen — and for each mechanic say whether anything ever set it to something different from system access. A
   setting nobody ever diverged is dead weight; a setting someone did diverge is the candidate exception. Put the
   numbers in your report.
2. **Make inheritance the default.** A mechanic with no own value follows system access — at the point where
   access is computed, not by copying values into rows. The owner's second argument matters here: this should
   also *reduce* the work of computing access, so do not implement inheritance as N extra lookups per mechanic.
3. **Keep a real exception path only if step 1 found one.** If it did, the screen must show it as an override,
   with what it overrides and what the inherited value is. If step 1 found none, say so and do not build an
   override mechanism nobody uses.
4. **The trial/registration confusion from Т4 belongs here.** Two selects on adjacent tabs look like alternatives
   while one silently wins: an active trial rule takes precedence and the registration-tariff setting is not read
   at all. The behavior is correct — the screen lies. Make the precedence visible where the person chooses.

## Boundaries

- Т3 (a separate tab for mailings with a real editor) is a **separate slice** — do not start it.
- Do not change the trial/discount model landed in `0346`, the notification conditions, or payment capture.
- Migration if needed: temporary number in the clone; the final one is assigned at land by the lead.
- **PROD (`135.106.162.170`) is untouchable.** No deploy, no push.

## Done means

- Behavioral tests: a mechanic with no own value follows system access; changing system access changes it; an
  override (if one exists) still wins and is labelled as an override.
- The measurement from step 1 is in the report, with the count of mechanics that ever diverged.
- The trial-vs-registration precedence is visible on the screen.
- Typecheck, scoped ESLint, `git diff --check` clean; one commit on your branch.
