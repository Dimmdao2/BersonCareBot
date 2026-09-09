# Тест или взгляд — #915 PWA named-DEV confirmation

Repeat only the one-time HTTP/HTML/manifest live inspection from
`.lead/briefs/mobile-pwa-live-acceptance-auditor-20260909.md` on the same landed PWA product. The first pass
`f98bf53d6` correctly proved process cleanup but stopped before readiness because its isolated clone had no DEV
env. This is an execution-environment correction, not a second product audit and not authority for product fixes.

Read the AGENTS.md heading map and complete §1/§1a/§1b, §7, §9–§12 and §24; read
`docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`, especially candidate ports §3b, the complete active plan M1/M7,
the original brief and its BLOCKED report. Product code and tests are read-only.

Use the canonical named-DEV webapp env at
`/home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev` without reading or printing its contents. Confirm only
existence/permissions, then expose it to the candidate Next process by a temporary gitignored symlink at
`apps/webapp/.env.dev`; remove that symlink during cleanup. This process use of the canonical DEV configuration is
required and is not secret inspection. Do not copy, print, grep, parse, report or commit any env value.

Start the candidate directly on one free port 5210–5219 with an explicit readiness timeout, never shared 5200 and
never a wrapper that kills other processes. Do not migrate or write the database. Through real HTTP with explicit
Host headers prove the same five points from the original brief: default Therapy Go metadata/manifest, Therapysto
metadata/staff manifest, platform-admin PWA exclusion, the actually published branded-patient host preserving its
clinic identity/icons, and the patient/staff install URLs plus compatible doctor redirect without `/setup`.
Discover the branded host through existing runtime/resolver behavior; do not assume `app.bersoncare.ru` merely
because it appears in a map.

Stop only the owned process group and prove ports 5210–5219 are clean. Create only
`.lead/runs/mobile-pwa-live-acceptance-confirmation-20260909/90-final-audit-report.md` with exact candidate SHA,
commands/Host/status/observed fields for each point, binary verdicts and `убито 0 / непойманных 0` for this
one-time view. Explicitly leave browser file fallback and iframe Jitsi open for the later integrated M7-03 pass.
Do not retain logs, env links, cookies, screenshots or credentials. Run `git diff --check`, explicitly stage only
the report, commit with `#915`, and do not push or finish while the server/foreground command is running.
