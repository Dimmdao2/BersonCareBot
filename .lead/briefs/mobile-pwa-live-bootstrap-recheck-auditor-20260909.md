# Тест или взгляд — #915 final named-DEV PWA bootstrap recheck

Repeat the one-time HTTP/HTML/manifest inspection from
`.lead/briefs/mobile-pwa-live-acceptance-confirmation-auditor-20260909.md` after the audited native-push stack and
its missing-keyring bootstrap correction are landed. The previous confirmation reached the real Next bootstrap and
was blocked by `native_push_token_keyring_unavailable`; this recheck proves that exact reachable blocker is gone and
completes the still-open M1-04/M7-03 PWA-metadata slice. Product code and tests are read-only.

Read the AGENTS.md heading map and complete §1/§1a/§1b, §7, §9–§12 and §24; read
`docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`, especially candidate ports §3b, the complete active plan M1/M7,
both prior PWA live reports, and the accepted native-push audit report. Do not infer success from unit tests or
direct builder calls.

Use `/home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev` without reading or printing its contents. Confirm
only existence/permissions, expose it to the candidate process through a temporary gitignored
`apps/webapp/.env.dev` symlink, and remove the symlink during cleanup. Do not copy, print, grep, parse, report or
commit any env value.

Start the candidate directly on one free port 5210–5219 with an explicit readiness timeout, never shared 5200 and
never a wrapper that kills other processes. Do not migrate or write the database. Through real HTTP with explicit
Host headers prove:

1. ordinary Next bootstrap no longer throws `native_push_token_keyring_unavailable` when the native keyring is
   absent; a redacted/non-secret runtime error may be named, but logs are not retained;
2. default Therapy Go HTML metadata and manifest contain the accepted identity, install scope/start URL and icons;
3. Therapysto HTML metadata and staff manifest contain the accepted identity and staff start URL;
4. platform-admin remains excluded from both PWA identities;
5. discover the actually published branded-patient host through existing runtime/resolver behavior and prove that
   it preserves its clinic identity/icon set instead of inheriting Therapy Go;
6. patient/staff install URLs and compatible doctor redirect work and no `/setup` surface was introduced.

Record exact Host/path/status/Location/content type and the observed non-secret metadata/manifest fields. Stop only
the owned process group and prove ports 5210–5219 are clean. Create only
`.lead/runs/mobile-pwa-live-bootstrap-recheck-20260909/90-final-audit-report.md` with exact candidate SHA, binary
point verdicts and `убито 0 / непойманных 0` for this one-time view. Explicitly leave browser file fallback and
iframe Jitsi open for the later integrated M7-03 pass. Do not retain logs, env links, cookies, screenshots,
credentials or build artifacts. Run `git diff --check`, explicitly stage only the report, commit with `#915`, do
not push, and do not finish while the server or a foreground command is running.
