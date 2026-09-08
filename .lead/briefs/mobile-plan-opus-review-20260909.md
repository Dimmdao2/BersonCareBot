# Opus documentation worker — strengthen #915 execution plan

You are the independent plan reviewer requested by the owner. This is a documentation-only worker pass, not a
product implementation or test pass.

## Mandatory reading before action

1. Run `grep -n "^## \|^### " AGENTS.md`, then read the full relevant sections: the global decision method,
   §1 taskdb/checklist discipline, §2–§5 integration and one-chokepoint architecture, §9–§12 tests/audit/plan,
   §15–§22 UI/media rules, and §24 orchestration.
2. Read `README.md`, `docs/README.md`, `docs/CURRENT_AUTHORITY_MAP.md`, `docs/ORCHESTRATION_BINDINGS.md`,
   `/home/dev/brain/docs/MODEL_TIERS.md` and the full authority plan below.
3. Read the archived former direction under `docs/archive/2026-09-native-mobile-local-bundle-retirement/` only to
   identify reusable constraints; never revive its local-bundle/mobile-SPA architecture.
4. Inspect actual current code before making plan assertions: PWA manifests/metadata/setup, video render seam,
   media upload entrypoints, notification target/delivery infrastructure, system settings, current workspace/tooling.
   Use code-search first, exact rg second.

## Authority and exact scope

Authority: `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md`, all M0–M7 requirements. Owner decision is
recorded verbatim in §1; especially: “Это тонкие Capacitor-обёртки над действующим Next.js. Webapp, SSR/RSC,
серверная авторизация, страницы и бизнес-правила не копируются и не переносятся в отдельный mobile frontend.”

Editable scope: only `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md`.
Forbidden: product code, tests, taskdb, provider/network/DB actions, PROD/TEST deploy, archive history, other plans.

## Task

Review the plan as a skeptical execution architect and strengthen it in one coherent pass:

- verify each checkbox is atomic, externally observable and can receive the right evidence;
- remove invented work or duplicate paths and add only missing work required for the owner's stated result;
- make the bridge/origin/navigation/auth boundary safe for a remote Next.js WebView without silently reverting to a
  local mobile SPA;
- make the two-app/two-PWA identity split and non-removal of admin/clinic assets unambiguous;
- make Universal Push client + server + token lifecycle extend the existing notification chokepoint and DB-backed
  settings rather than create a parallel provider path;
- make Jitsi integration reuse `VideoMeetingStage` and respect the still-active #1100 file boundary;
- make CameraX/system picker/native streaming upload reuse presign/confirm and one media-source seam;
- verify stage dependency order and parallel file scopes are realistically non-overlapping;
- distinguish repository-completable evidence from external RuStore/signing/physical-device/PROD gates;
- explicitly ask at every new function/wrapper/gate boundary whether the existing chokepoint can be parameterized,
  per AGENTS.md §5 “Один общий проход”.

Do not write tests: this is plan documentation, and no stable product behavior is being implemented in this pass.
Run `git diff --check`, reread the final plan, commit only the plan with a `#915` message, and report commit SHA plus
the material changes and any true owner blocker. Do not finish with uncommitted changes.
