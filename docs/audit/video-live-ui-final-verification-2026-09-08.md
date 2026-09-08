# Final live verification — #1100 video live UI

Candidate: `e08326702c25c43aa514723ab7460b29618a6fe4` on
`wt/video-live-ui-correction-20260908`.

Authority: `docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md` — VM-06, VM-10, VM-11,
VM-12, UI-08, UI-09, UI-10. This is a one-time live/runtime pass; no tests,
production code, configuration, plan, taskdb, or audit queue were changed.

## Verdict: **BLOCKED**

The exact candidate cannot render the doctor live stage in the supplied named
DEV environment. A normal authenticated doctor session, using a patient returned
by that doctor's own canonical client list, receives the application's `404
Страница не найдена` view at the live route on both desktop and mobile. Therefore
there is no reachable Play action in this environment from which to observe the
Jitsi iframe, toolbar, media acquisition, retry path, or rendered controls.

This is not a PASS and the unexercised items are not inferred from source. The
route has two explicit `notFound()` exits: first
`requireWorkspaceModuleForPage(shell.workspaceModules.video_meetings)`, then the
organization client-identity check. The authenticated settings page's `Рабочее
пространство` renders nine module labels but not `Видеовстречи`; that is consistent
with `video_meetings` being unavailable for this DEV doctor workspace, but the
runtime did not expose which of the two fail-closed page checks took the 404 path.
Changing that workspace/tariff state is outside this verifier's scope.

## Environment and commands

```bash
git branch --show-current && git rev-parse HEAD
# wt/video-live-ui-correction-20260908
# e08326702c25c43aa514723ab7460b29618a6fe4

cd apps/webapp
pnpm migrate
# [migrate] DATABASE_URL is not set

set -a; source /home/dev/dev-projects/BersonCareBot/.env.cutover.dev; set +a
pnpm migrate
# [migrate] failure migration=unknown idx=unknown reason=permission_denied sqlstate=28P01

pnpm install --offline --frozen-lockfile --ignore-scripts
# Lockfile is up to date; already up to date

pnpm -r --filter './packages/**' --if-present run build
# PASS: db-principal, error-tracking, operator-db-schema, shared-contracts,
# platform-merge

cd apps/webapp
set -a; source /home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev; set +a
npx next dev -H 127.0.0.1 -p 5214
```

The first isolated-server request was:

```bash
curl -sS -o /tmp/bcb-live-5214-me.out -w 'http=%{http_code} bytes=%{size_download}\n' \
  --max-time 60 http://127.0.0.1:5214/api/me
# http=401 bytes=35
```

This is the expected unauthenticated response. The server was stopped after the
browser pass. The failed migration did not report applying a migration; its
credentials were not printed or inspected.

## Live browser evidence

Playwright already installed outside the repository and system Chromium were used
with a temporary context and `--use-fake-ui-for-media-stream` plus
`--use-fake-device-for-media-stream`. The standard email/password flow was used
for the registered DEV doctor account; no auth bypass, fixture, cookie, or
credential export was used.

The browser recorded:

```text
POST /api/auth/email-password/login -> 200
GET /app/doctor/patients -> 200
```

The chosen patient was the visible first result, `Берсон Дмитрий`, at
`/app/doctor/patients/1c312a64-fab8-4b75-b24e-88a1d6ebe4e0`. Its ordinary patient
card rendered successfully (name, card tabs, visit history, programme), proving
the normal doctor session and client-list journey were live.

Desktop (1440x1000) and mobile emulation (390x844) then opened:

```text
/app/doctor/patients/1c312a64-fab8-4b75-b24e-88a1d6ebe4e0/live
```

Observed on both viewports:

```text
transport response: 200
rendered body: 404 / Страница не найдена / На главную
iframe count: 0
"Начать звонок" button count: 0
Jitsi / meet / external_api requests: []
```

Consequences for the required live proof:

| Requirement | Result |
| --- | --- |
| UI-09 canonical desktop/mobile card navigation | **BLOCKED** — the live page itself renders 404 before its shared shell can be seen. |
| UI-08 pre-Play stage height, centred Play, no iframe/external API/media, clickable shell | **BLOCKED** — no stage or shell exists on this route. The zero iframe/Jitsi-request result belongs to the 404 page, not to an accepted pre-Play stage. |
| UI-08 one Play, one adapter, responsive page | **BLOCKED** — Play is absent. |
| UI-10 desktop/mobile stage height, lower toolbar, one local self-view | **BLOCKED** — no Jitsi stage can mount. |
| VM-06 rendered controls, branding/subject, self-view route | **BLOCKED** — no Jitsi frame can be inspected. |
| VM-11 forbidden rendered surfaces/hotkeys | **BLOCKED** — no Jitsi frame can be inspected. |
| VM-10 forced `external_api.js` failure, visible `Повторить`, retry without reload | **BLOCKED** — request interception is installed tooling, but the 404 prevents any script request or Play click to intercept. |
| VM-12 join/error/end diagnostic runtime wiring | **BLOCKED** — no call can start. |

Browser `pageerror` capture for this route was empty. The isolated Next log did
contain one `unhandledRejection: RangeError: Maximum call stack size exceeded` in
the course of an earlier live-route request; no browser error or reproducible
user-facing cause was available, so it is recorded here rather than promoted to a
candidate finding.

## Pinned-Jitsi census (source/runtime fact, not a substitute for the blocked view)

```bash
curl -sS -o /tmp/bcb-live-external_api.js -w 'external_api http=%{http_code} bytes=%{size_download}\n' \
  --max-time 20 https://meet.test.bersoncare.ru/external_api.js
# external_api http=200 bytes=98477

curl -sS -o /tmp/bcb-live-app.bundle.min.js -w 'app_bundle http=%{http_code} bytes=%{size_download}\n' \
  --max-time 45 https://meet.test.bersoncare.ru/libs/app.bundle.min.js
# app_bundle http=200 bytes=3579605

rg -o 'errorOccurred|conferenceError|videoConferenceJoined|readyToClose' /tmp/bcb-live-external_api.js | sort | uniq -c
# 1 errorOccurred
# 1 readyToClose
# 1 videoConferenceJoined

rg -o 'disableSelfViewSettings|hide-self-view|self.view|selfView' /tmp/bcb-live-app.bundle.min.js | sort | uniq -c
# 3 disableSelfViewSettings
# 2 hide-self-view
# 3 self view
# 2 self-view
# 4 selfView
```

The candidate adapter listens to the observed `videoConferenceJoined`,
`errorOccurred`, and `readyToClose` event names. Deploy configuration exposes
`settings` and `SETTINGS_SECTIONS = ['devices', 'more']`, and explicitly sets
`config.disableSelfViewSettings = false`. Thus the supported potential route for
hide/show self-view is Settings > More; this pass did **not** demand a toolbar
allowlist string and cannot claim the UI is reachable until the live stage is
enabled.

The adapter source does carry the intended full-height chain (`layout="full-height"`,
`main`/stage `flex-1 min-h-0`, Jitsi target `h-full w-full`), but that structural
fact cannot accept UI-10. A real desktop/mobile render remains required after the
workspace route is made reachable.

## Residual device acceptance

Even after the route blocker is resolved, actual iPhone/macOS camera choice,
mobile flip availability, and PiP are device-specific owner acceptance items.
They were not substituted with headless Chromium evidence here.
