# High Opus plan delta audit — #1100 appointment delivery format

Audit the exact committed plan candidate at `0ae2c2ebc` before any implementation worker starts. Read the
`AGENTS.md` heading map, then full relevant §1 migration rules, §5, §§10a/10b, §12, §§16/21/22 and §24. Read
`docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md`, especially the second owner-correction dated 08.09.2026 and
UI-03..UI-07, GATE-01, Wave 2 G, Wave 3 kill-set, and the rollout rules.

Owner authority for this delta, verbatim in meaning:

- canonical appointments have an explicit understandable format `очно` / `онлайн`;
- choosing the built-in Online branch defaults the format to online, a physical branch defaults it to in-person,
  and the specialist can override it in the existing appointment details/create flow;
- Today shows one main CTA from the saved format: online -> `Начать созвон`, in-person -> `Начать приём`, with no
  extra camera on an in-person scheduled card;
- the patient card continues to expose both ordinary encounter and camera actions, so an ad-hoc call needs no
  appointment;
- branch/format never grants or revokes the video module; only tariff plus workspace composition does that;
- audio-only uses the same call with camera disabled; no separate engine.

This is a plan gate, not implementation. Use `code-search` before exact `rg`. Inspect the current committed schema,
booking-engine appointment ports/services/repository and every canonical create/update/read route that would need
the field, the Online branch representation, existing appointment create/details UI, `DoctorTodayNextAppointment`,
patient-card video action, and migration/privilege conventions. Decide whether the plan is complete, internally
consistent, minimal, and implementable without a parallel appointment model or duplicate gate.

Findings are only concrete owner-scope gaps, reachable regressions/security/data-loss risks, architecture-rule
violations, or missing acceptance needed to make the requested path work. Do not add product wishes, speculative
hardening, notification work, Jitsi infrastructure changes, or tests that freeze source/layout/text. Identify any
backward-compatible default required for existing appointments and whether the selected default can be derived
reliably from current persisted branch data. If the owner requirements are ambiguous in a way that materially
changes implementation, label it OWNER QUESTION rather than choosing a weaker variant.

Write one audit artifact at `docs/audit/video-appointment-format-plan-2026-09-08.md` with:

1. exact candidate SHA and inspected paths;
2. concise map of the existing canonical write/read/UI choke points;
3. binary verdict `PASS` or `MUST FIX`;
4. for every MUST FIX: reachable scenario, impact, exact owner/repo requirement, and the smallest plan correction;
5. explicit non-findings/recommendations kept outside implementation authority.

Do not edit the plan, production code, migrations, tests, taskdb, server state, or deploy anything. Commit only the
audit artifact using explicit staging, with a detailed `#1100` message. Run `git diff --check`. Do not finish while
any foreground command is still running. Report commit SHA and verdict.
