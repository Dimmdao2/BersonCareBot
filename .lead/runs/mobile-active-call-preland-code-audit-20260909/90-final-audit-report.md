# #915 active browser call — pre-land code acceptance

## Subject and boundary

- Exact product correction: `6cbcc8cbb6c471d52aee669c9024cd62ca089301` (`fix(webapp): keep mobile call chrome reachable #915`).
- The checked product paths are unchanged at this audit head. This exact command produced no output:

  ```bash
  git diff --name-only 6cbcc8cbb..HEAD -- apps/webapp/src/app/app/patient/PatientClientLayout.tsx apps/webapp/src/shared/ui/doctor/shell/DoctorBottomNav.tsx apps/webapp/src/shared/ui/doctor/shell/DoctorHeader.tsx apps/webapp/src/shared/ui/doctor/shell/DoctorWorkspaceShell.tsx apps/webapp/src/shared/ui/video/ActiveCallCoordinator.tsx
  ```
- This is code/build acceptance only. No Next listener, shared Turbopack `:5200`, DEV/TEST call, UI automation, product code, test, plan, or taskdb was changed.

## Test or view classification (before reading tests)

| Required property | Method |
| --- | --- |
| The active mobile iframe leaves the measured header and bottom navigation reachable; desktop does not gain a floating control | View/build inspection of the exact shell geometry and responsive guards. This is not a stable UI-test contract. |
| Internal navigation retains one call/session; the off-route indicator returns to its exact URL; normal starts cannot replace it | Production-boundary inspection. Existing coordinator UI test is not run: this brief prohibits automated UI tests. |
| Only a renderer terminal action clears state and invokes the terminal callback once | Production-boundary inspection. Existing coordinator UI test is not run. |
| No second coordinator, Jitsi renderer, route-owned call state, or cross-zone UI path | Exact production search and diff inspection. |

No new test is justified or saved: the brief excludes UI automation and this correction changes only shell-owned presentation geometry. The retained coordinator UI test was inspected only after the classification and is not acceptance evidence here.

## Verdict: PASS

| Requirement | Result | Evidence |
| --- | --- | --- |
| Mobile active iframe does not cover shell chrome | PASS (code/build) | Patient supplies the existing measured `--patient-header-bar-height` / `--patient-bottom-nav-height`; doctor now measures its mobile header and bottom navigation with the existing `useReportShellChromeHeight` seam. The active stage is bounded between those variables instead of `inset-0`. |
| Desktop unchanged | PASS (inspection) | `ActiveCallCoordinator` still renders only for `activeCall && isMobile`; patient/doctor indicators still return `null` outside mobile. Doctor header/bottom navigation remain `md:hidden`; the correction adds no desktop control. |
| Route change retains one conference and offers exact return | PASS (production-boundary inspection) | The unchanged shell-level coordinator owns `activeCall` above route children, retains `session` and `returnUrl`, and renders the same `VideoMeetingStage` compactly off-route while the zone-specific indicator pushes `activeCall.returnUrl`. No route unmount calls terminal cleanup. |
| Second start remains blocked; terminal stays explicit and once-only | PASS (production-boundary inspection) | The unchanged `activate` refuses when `activeRef.current` exists; `completeFromRenderer` alone clears state and is guarded by `terminalRef` before running `onTerminal`. The correction does not change either path. |
| One provider-neutral path | PASS (exact diff/search inspection) | The correction adds only optional `activeRouteClassName` to the existing `ActiveCallCoordinator`; it retains one `VideoMeetingStage` and no new coordinator, Jitsi renderer, meeting page, persistence store, or patient/doctor cross-import. Guest `/live` remains standalone. |

## Commands and results

- `git diff --check 6cbcc8cbb^ 6cbcc8cbb` — PASS.
- `pnpm --dir apps/webapp typecheck` — PASS.
- `pnpm --dir apps/webapp exec eslint src/app/app/patient/PatientClientLayout.tsx src/shared/ui/doctor/shell/DoctorBottomNav.tsx src/shared/ui/doctor/shell/DoctorHeader.tsx src/shared/ui/doctor/shell/DoctorWorkspaceShell.tsx src/shared/ui/video/ActiveCallCoordinator.tsx` — PASS.
- `pnpm --dir apps/webapp exec next build` — PASS. It repeated one existing Turbopack tracing warning in untouched `src/infra/repos/mediaPreviewWorker.ts:210`; exit code was `0`.
- `pnpm --dir apps/webapp exec next build --no-lint` — stopped before building because this Next version has no `--no-lint` option; the succeeding canonical build command above is the build evidence.
- The exact five-path `git diff` command above had no output; `git status --short` before this report was empty.

## Remaining gate

The post-land ordinary live call route remains intentionally unclaimed: it must be checked on the single shared DEV server after landing. This is not a code/build blocker for `6cbcc8cbb`.

убито 0 / непойманных 0 — no behavioral fault injection or UI test is permitted in this pre-land code/build pass.
