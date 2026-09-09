# Worker brief — #915 NativeJitsi PiP and explicit-end lifecycle

## Authority and scope

- Work only in `/home/dev/dev-projects/bcb-wt-mobile-web-native-jitsi-20260909` on
  `wt/mobile-web-native-jitsi-20260909`; continue the existing accumulated candidate and retained red oracle.
- Before every action obey the heading-map gate and read the relevant `AGENTS.md` §5, §9–§10b, §12, §16–§17
  and §24, plus `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md` §1.8/M4/M7, both committed NativeJitsi
  audit reports, the retained web/Java acceptance tests and the complete accumulated product diff.
- Product code and contract documentation only. Do not edit/add tests, audit artifacts, plans, taskdb, audit queue,
  DB, deploy, unrelated UI or any of the three product callers. Do not push.

## Exact owner outcome

Implement the lifecycle as one coherent correction:

1. Leaving the web page/call screen or backgrounding the Android app never ends an active native conference.
   It continues in Android Picture-in-Picture/floating mode. React unmount/session cleanup removes only the
   current JS listener; it must not call native hangup, cancel a conference that already started, or synthesize
   the existing web `onHangup` callback.
2. A conference ends only after the user explicitly taps the native Jitsi «Завершить звонок» control. Its genuine
   terminal event invokes the existing provider-neutral callback once, so the specialist returns to the unchanged
   notes/encounter flow. Do not create a mobile notes page or a second video page.
3. Starting a genuinely different consultation is the only replacement case. Serialize replacement safely and
   make terminal ownership unambiguous: a late `CONFERENCE_TERMINATED`/`READY_TO_CLOSE` from A must never be tagged
   as or delivered to B. The retained red Java oracle from `93d954360` must become green without weakening it.
4. Preserve browser/PWA iframe fallback, trusted-origin/input validation, the exact authorized endpoint/room/token,
   three unchanged callers, retry/error diagnostics, no secret logging and no new server renderer value. An old
   installed shell or malformed native response must fail safely without automatically terminating a conference.

Use the pinned Jitsi Android SDK's supported PiP integration rather than an invented overlay. Verify the exact API
against the pinned `13.1.1` artifact and official Jitsi Android SDK documentation: PiP feature flag plus the SDK's
Activity/delegate lifecycle. If the stock `JitsiMeetActivity` cannot satisfy back-to-underlying-WebView behavior,
extend/subclass the existing native Activity integration narrowly; do not replace it with a second React Native/UI
implementation. Prefer extending the existing `NativeJitsi` seam over adding another plugin or product branch.

## Validation and delivery

- Do not write or modify tests. Run the retained web NativeJitsi suites and all four existing
  `NativeJitsiPluginTest` flavor variants through the documented Gradle wrapper/host lock; run scoped ESLint,
  webapp typecheck and `git diff --check`.
- Inspect the final Android manifest/merged Activity contract and explain exactly how leaving/backgrounding reaches
  PiP, how only explicit Jitsi termination reaches web hangup, and how late A events cannot own B.
- Commit only explicit product/contract paths with `#915`, why/evidence/M4/not-done. End with SHA and exact commands
  and results; physical-device PiP remains for independent/device acceptance and must not be claimed here.
