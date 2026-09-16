# Track A — Doctor DNA font and Settings-row LIVE DEV evidence

## Source binding

Both bounded preflights used exact integrated product SHA
`e231ad38325010e78e489ff8bb124bd63d5a3e0d`. It includes the Settings shared-row consumer commit
`bc2c5c090`.

No product code changed during either pass. Both used canonical DEV `http://127.0.0.1:5200`; all browser traffic
in the successful font pass was restricted to GET/HEAD/OPTIONS. No DB/API mutation, fixture write, external
delivery or entitlement change occurred.

## A-DNA-002 — Nunito runtime atom: PASS

External manifest:

`/home/dev/dev-projects/.lead/runs/dna-font-live/e231ad383-20260723T023020Z/manifest.md`

`dev:doctor` opened `/app/doctor` at desktop `1480x1024` and mobile `390x844`. Both navigations returned HTTP
`200` and remained on the requested route. In both viewports the computed `font-family` for
`#app-shell-doctor`, the page header, its title and a populated Today client-row primary span was:

```text
Nunito, "Nunito Fallback", Nunito, system-ui, -apple-system, "Segoe UI", sans-serif
```

`document.fonts.status` was `loaded`, `document.fonts.check("16px Nunito")` returned `true`, and the persisted
FontFaceSet evidence includes loaded Nunito faces for the rendered body/title weights. Non-GET requests, HTTP
responses `>=400`, console errors and page errors were all zero.

| Artifact                | SHA-256                                                            |
| ----------------------- | ------------------------------------------------------------------ |
| `desktop-1480x1024.png` | `33c481cd2f8e8f25e6384851ab464b2fa173f5f9c0230cbcc507cbae05119071` |
| `mobile-390x844.png`    | `d0544a20e90c5acab92b2774b7a764833ac1dd4e8b895454b041b896b9a3db9d` |
| `result.json`           | `bd586679e064b79197c2134cbf11aa42392f212b7b40cf7bd60e01accf127df4` |

This closes the exact missing runtime-font atom for A-DNA-002. It does not claim owner acceptance.

## A-DNA-003 — Settings consumer boundary: still partial

The integrated `/app/settings?tab=team` `TeamSection` member and pending-invite lists now consume
`DoctorDnaFlatListRow`; the focused Settings/page/shared-chrome gate passed **3 files / 18 tests**. That supplies
the previously missing Settings product code and contract test evidence.

The assigned GET-only live preflight used `dev:clinic-admin`. `/app/settings?tab=team` returned `307` and
redirected to `/app/settings?tab=organization` (`200`), the existing fail-closed `clinic_team` entitlement path.
Per the stop rule, no browser capture followed and no entitlement or fixture was changed. External blocker
manifest:

`/home/dev/dev-projects/.lead/runs/dna-settings-live/e231ad383-20260723T022659Z/manifest.md`

A-DNA-003 therefore remains partial until an already-entitled organization can render the real Settings member
list in an ordinary source-bound live pass. Today and Clients evidence remains valid; Account is not substituted
for Settings. No owner acceptance is claimed.
