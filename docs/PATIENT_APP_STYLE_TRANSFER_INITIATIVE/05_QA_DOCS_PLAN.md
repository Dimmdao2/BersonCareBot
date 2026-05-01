# Phase 5 — QA, Docs, Global Audit Prep

## Goal

Close style transfer with route matrix review, docs sync, and global audit preparation.

## Scope

Allowed:

- tests/checks for changed patient style files;
- docs/log/audit cleanup;
- tiny style-only cleanup in changed files if needed;
- `docs/README.md` active initiative link.

Forbidden:

- no new page restyling beyond cleanup;
- no content/copy changes;
- no business logic changes;
- no broad refactor.

## Checklist

- [ ] Verify all phase audits exist.
- [ ] Verify all mandatory findings are closed.
- [ ] Review `CHECKLISTS.md` route matrix and mark deferred routes explicitly.
- [ ] Confirm product/content gaps are logged as deferred.
- [ ] Confirm no old broad "redesign" language remains in this initiative.
- [ ] Confirm no home-specific geometry is imported into unrelated pages.
- [ ] Confirm no doctor/admin files were intentionally changed.
- [ ] Update `docs/README.md`.
- [ ] Prepare for `GLOBAL_AUDIT.md`.

## Visual QA

For each changed route group, sample:

- [ ] 390px mobile.
- [ ] 768px tablet.
- [ ] 1280px desktop.
- [ ] empty/one-item state if available.
- [ ] error/loading/disabled state if available.

If screenshots are captured, record paths in `LOG.md`. Screenshots are optional unless user asks.

## Checks

Recommended final checks before global audit:

```bash
pnpm --dir apps/webapp typecheck
pnpm --dir apps/webapp lint
```

Plus targeted tests from phases that changed code.

Do not run root `pnpm run ci` unless user asks or this is immediately before push.

## Acceptance

- Docs are consistent.
- `LOG.md` describes final scope.
- Global audit prompt can run without ambiguity.
- No style-only boundary violations are knowingly left undocumented.
