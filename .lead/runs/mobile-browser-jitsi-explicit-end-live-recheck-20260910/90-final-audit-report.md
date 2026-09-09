# Browser/PWA Jitsi explicit-end final live acceptance (#915)

The first shared-Turbopack pass on `495446474` found two reachable failures: the desktop renderer retained a
finished iframe through its local activation-session fallback, and the mobile Jitsi leave control was covered by
the shell's docked tabs. Corrections `1bf42ece9` and `d83179820` address those same observed failures; no automated
UI test was added.

## Final result on the one shared DEV Turbopack `:5200`

| Surface | Verdict | Final observable evidence |
| --- | --- | --- |
| Desktop `1440×900` | **PASS** | Ordinary doctor login and visible start returned HTTP 200 and mounted one self-hosted `meet.test.therapysto.ru` iframe. The visible Jitsi leave control and its confirmation removed the iframe and restored `Начать звонок` after 1.5 seconds; the same cleared state remained after 6.5 and 30 seconds. |
| Mobile `390×844` | **PASS** | One real Jitsi iframe survived visible internal navigation to `Клиенты`; the pulsing `Вернуться к звонку` control returned to the exact call route without replacing the iframe. The docked patient tabs measured 45 px and were included in the active-stage bottom boundary. The visible leave control became clickable, then cleared the iframe and return indicator and restored `Начать звонок`. |
| Browser media chooser | **PASS** | Visible doctor file controls emitted real Chromium file-chooser events: photo `image/*` + `capture=environment`, video `video/*` + `capture=environment`, gallery `image/*,video/*`, and unrestricted document input. |

Scoped ESLint, webapp typecheck and diff-check passed. The temporary headed browsers and virtual displays were
closed after every pass. No second Next server, synthetic Jitsi callback, direct iframe injection, fixture,
database mutation, provider send or persistent UI test was used.
