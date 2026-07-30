# MISSION: RE-audit of the corrected integrator cleanup plan (Track D-полный, D11–D19) — read-only

This is the second pass. The first two audits (`AUDIT_TRACKD_SOL_RESULT.md` — FAIL, `AUDIT_TRACKD_OPUS_RESULT.md` —
PASS WITH FIXES) have been applied by the lead: the booking-constants item was split into «build the consumer first,
then cut» and moved after the lifecycle move; identity was split into research and a stepwise cutover; the narrow-role
gate now lists the actual end of canon writes; the one-DB-path item covers the whole `apps/integrator`; the loop
arithmetic is marked for a named recount; a new D19 requires re-checking the architecture rule after implementation.
The architecture rule itself was corrected and a target scheme was written into `apps/webapp/ARCHITECTURE.md`.

Your job: verify the corrections actually land, and hunt for what the first pass missed. Do not re-litigate what was
already fixed — check it and move on.

The owner asked for the plan to be re-checked after it was written: «план надо будет перепроверить после создания —
учесть всё что мы обсуждали и приведение к одному порту бд». Judge the plan, not the code.

## Authority

- **The plan under audit:** `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` — Track D as a whole, and the new
  section «Track D-полный», items **D11–D18**. Card #987.
- **The research it rests on:** `docs/_TODO/runs/integrator-role/SYNTHESIS.md` plus the three independent reports beside
  it (`RESEARCH_INTEGRATOR_SOL.md`, `RESEARCH_INTEGRATOR_OPUS.md`, `RESEARCH_INTEGRATOR_TERRA.md`).
- **Architecture and rules:** `apps/webapp/ARCHITECTURE.md:40-44`, `docs/ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md`,
  `.cursor/rules/clean-architecture-module-isolation.mdc` (top section — one DB access path, no raw SQL for new code),
  `.cursor/rules/plan-authoring-execution-standard.mdc`, `docs/ORCHESTRATOR_CHECKLIST.md`.

## What the owner said in this session — the plan must reflect all of it

Verify each against the plan text and report present / distorted / missing:

1. «интегратор сегодня это просто блок модулей по доставке сообщений и приему вебхуков» — the target shape.
2. «вырезай весь блок lfk-diary в интеграторе» — done, D11.
3. Ten unreachable executor branches: «просто вырезать; если что-то упадёт — посмотреть что взять из старого кода и
   перенести в вебапп».
4. Booking notification constants: the webapp ALREADY has `doctor_appointment_reminder_enabled`,
   `doctor_appointment_reminder_offsets_minutes` and notification templates; the integrator's hardcoded 24h/2h and its
   inline texts are a competing implementation — «вырезать нещадно».
5. The correct chain, in his words: создание события → итоговые настройки из базы для этого события и пациента →
   планировщик → воркер → интегратор как отправитель.
6. Identity: «надо запустить сначала сильное исследование командой» — research BEFORE the work, not after.
7. Delivery queue with retries, backoff and a dead shelf stays with the sender; no separate «worker-scheduler» module.
8. «приведение к одному порту бд» — one DB access path inside the integrator (D18), with the seven-file `directPublic`
   rewrite being the owner's own workstream.
9. The narrow DB role comes last and cannot be granted earlier.

## Questions beyond the checklist

- **Order and gating.** Does any item depend on something later in the list? Specifically: can D13/D14 land before the
  reminder items D5–D7 finish, or do they collide? Is D10 (transport teardown) still correctly last? Would D17 be
  verifiable at the moment the plan places it?
- **Invented scope.** Any item that traces to neither the owner's words nor a mechanical necessity of them is a defect —
  name it.
- **Missing risk.** What can break in production if the items are executed in the written order? Name the concrete
  scenario, not a general caution. Pay attention to: the outbox being a live failure path (not dead code), the FK from
  reminder occurrences to the integrator's own rule table, and the deploy's exact-privilege assertion.
- **Necessary and sufficient.** Owner's standing constraint «не переусложнять». Flag machinery that does not serve the
  end goal — the integrator becoming ingress + delivery with a narrow role.

## Output

`VERDICT: PASS | PASS WITH FIXES | FAIL`, the nine-line checklist matrix, numbered MUST FIX (empty is valid), the
ordering analysis, and «чего я не смог проверить».
