# Track A — UI-4 Clients LIVE DEV evidence

- Run: `/root/ui4_live_acceptance`
- Owner checklist: `docs/_TODO/DOCTOR_UI_REWORK_2026-07-20/PLAN.md`, UI-4
- External manifest: [`manifest.md`](/home/dev/dev-projects/.lead/runs/ui4-live-acceptance/7ec8ecedd-20260722T2310Z/manifest.md)

## Source binding

The serialized pass started with exact product SHA
`7ec8ecedd2d9c7d1a1b367ea4fc42dcbb5b46ed9` on canonical DEV
`http://127.0.0.1:5200`, authenticated as `dev:doctor`.

During the pass root advanced to docs-only commit
`44017f58b2cca89f35280e0eb8032011cc07d13d`. The following command produced no output, so the served UI-4 source
remained byte-identical to the requested product SHA:

```bash
git diff --name-status 7ec8ecedd..44017f58b -- \
  apps/webapp/src/app/app/doctor/patients \
  apps/webapp/src/shared/ui/doctor \
  apps/webapp/src/app/styles \
  apps/webapp/src/infra/repos/pgDoctorClients.ts \
  apps/webapp/src/modules/doctor-clients/ports.ts
```

Focused source hashes:

- `PatientPreviewPane.tsx`: `e2e75bcd962b50e023f3a1ee95c7d8b21b9368f2e04982bfa30da283b5430dc1`;
- `PatientsPageClient.tsx`: `23d0087c8efc1be2f5f0df59767fd3b15c5855d6aba8415ed62e545316ca2456`.

## LIVE results

- Route and auth returned HTTP 200; three patient rows rendered. No HTTP response `>=400`, console error or page
  error occurred. Chromium emitted five non-failing unused-preloaded-font warnings.
- Unselected and selected preview surfaces had computed border widths `0/0/0/0`, radius `0px`, transparent
  background and `box-shadow:none`.
- A real pointer click at 97.9% of the first row width set `aria-pressed=true`. The details API returned 200 and
  the selected preview showed patient name, phone, visit count, last appointment, app status and
  `Открыть карточку`.
- Focusing the second row and pressing `Enter` retained focus on the row `BUTTON`, set `aria-pressed=true` and
  changed the preview to that patient.
- Following the actual `Открыть карточку` link rendered `#doctor-patient-card-header=1`, `К клиентам=1`, retained
  the sidebar `Клиенты=1`, and removed `#doctor-patients-list`, proving the full-workspace UI-5a transition.
- The naturally available zero-result `С программой` segment set `aria-pressed=true`, changed the URL to
  `?segments=with_program`, rendered the zero-result list and exposed five separate `После фильтров: 0` markers
  with filter icon/value.
- Pointer-hover and keyboard-focus PNGs visibly show the delayed one-line tooltip
  `Все клиенты этой организации.`; keyboard focus remained on `doctor-patients-segment-all`.
- Mobile `390x844` rendered the list mode. The corrected frameless preview contract was evaluated only against the
  desktop split evidence.

## PNG evidence

All binaries remain outside the repository under
`/home/dev/dev-projects/.lead/runs/ui4-live-acceptance/7ec8ecedd-20260722T2310Z/`.

| Evidence | External file | SHA-256 |
|---|---|---|
| Desktop unselected preview | [`desktop-unselected.png`](/home/dev/dev-projects/.lead/runs/ui4-live-acceptance/7ec8ecedd-20260722T2310Z/desktop-unselected.png) | `a302b5b556920db8c5c9ca75a1a26b5290e2cd415f12d451b015dccd3a94dcc8` |
| Desktop selected preview, pointer | [`desktop-selected-pointer.png`](/home/dev/dev-projects/.lead/runs/ui4-live-acceptance/7ec8ecedd-20260722T2310Z/desktop-selected-pointer.png) | `f9e298faef098b3a70fdc7d3298878efe93edf5ffdfc42150cd985262037e540` |
| Desktop selected preview, keyboard | [`desktop-selected-keyboard.png`](/home/dev/dev-projects/.lead/runs/ui4-live-acceptance/7ec8ecedd-20260722T2310Z/desktop-selected-keyboard.png) | `5fdbaef00f84bf790bb080429cacaaff7ba1de48fd913ebfd3e0880f96a3d9fd` |
| Filtered KPI | [`desktop-filtered-kpi.png`](/home/dev/dev-projects/.lead/runs/ui4-live-acceptance/7ec8ecedd-20260722T2310Z/desktop-filtered-kpi.png) | `20a0964a49c5465c48a3d4950612366123d65e66dcbbcb8b0740d763526b96b4` |
| Tooltip hover | [`desktop-tooltip-hover.png`](/home/dev/dev-projects/.lead/runs/ui4-live-acceptance/7ec8ecedd-20260722T2310Z/desktop-tooltip-hover.png) | `02fedfdf1722d17bbd96634983656b3acd2865572f0b1173742db980c28bfd71` |
| Tooltip focus | [`desktop-tooltip-focus.png`](/home/dev/dev-projects/.lead/runs/ui4-live-acceptance/7ec8ecedd-20260722T2310Z/desktop-tooltip-focus.png) | `c7a914107f00a8c20f6904f6087c4f9cad157a24357a4344a3118085b1d4fc57` |
| Full-workspace card | [`desktop-full-workspace-card.png`](/home/dev/dev-projects/.lead/runs/ui4-live-acceptance/7ec8ecedd-20260722T2310Z/desktop-full-workspace-card.png) | `be5f1a38eec17306f038f0fd4c6d9d3b21c8aa2b7555dfeb33524e4c24a857a1` |
| Mobile list | [`mobile-list.png`](/home/dev/dev-projects/.lead/runs/ui4-live-acceptance/7ec8ecedd-20260722T2310Z/mobile-list.png) | `606067f197630bc8cab5367c7866d3c2577c63433ccdef53b8ebe8c878ca41d6` |

## NOT DONE

- All three existing DEV fixture rows rendered empty membership / program-or-supervision / future-appointment
  status slots. Representative populated row icons therefore still lack LIVE evidence; no DB setup was invented.
- Owner PNG acceptance remains open and is not claimed by this evidence pass.
