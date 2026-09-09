# Browser/PWA Jitsi explicit-end live recheck (#915)

Shared runtime: `http://127.0.0.1:5200`, already-running Turbopack from
`/home/dev/dev-projects/BersonCareBot/apps/webapp`, HEAD
`49544647435d92a21fc58a14d1f3c18f5744e70e`. The required correction
`5d677d378f697896e45d9f5b0852aa9dd196abf7` is an ancestor of that HEAD
(`git -C /home/dev/dev-projects/BersonCareBot merge-base --is-ancestor
5d677d378f697896e45d9f5b0852aa9dd196abf7 HEAD` exited `0`). No server,
database, product code, tests, routes, credentials, or deployment state was changed.

| Viewport | Verdict | Visible evidence |
| --- | --- | --- |
| Mobile `390×844` | BLOCKED | Ordinary doctor login and normal call start reached exactly one self-hosted Jitsi iframe. The conference surface was visible, but no Jitsi leave/end control became visibly available before the conference returned to the outer page's `Начать звонок` state; a direct callback/injection is prohibited, so this does not prove explicit-end behavior. |
| Desktop `1440×900` | FAIL | Ordinary doctor login and normal start reached exactly one self-hosted Jitsi iframe. Moving the pointer over the visible conference exposed its toolbar; the red leave control and then visible `Leave meeting` confirmation were clicked. Jitsi showed `Thank you for using Video`, but after 6.5 s and again after 30 s the outer page still contained one iframe, had no `Начать звонок` control, and had no return indicator. The active-call coordinator is stuck; the required terminal `onHangup` outcome did not occur. |

The desktop FAIL is a reachable violation of the required explicit-end consequence. A later terminal signal did not clear or duplicate-clean up the retained active state within the observed 30-second interval.

The temporary headed browser, virtual display, profile, screenshots, and logs used for this visible pass were explicitly closed and removed before reporting.
