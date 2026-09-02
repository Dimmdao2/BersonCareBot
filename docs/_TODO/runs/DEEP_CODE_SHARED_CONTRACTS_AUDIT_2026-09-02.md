# Shared cross-process contracts — independent acceptance, 2026-09-02

Candidate: implementation `40cb683bf`, current candidate merge `51ed497ed`.

Authority: `docs/_TODO/DEEP_CODE_AUDIT_PLAN.md`, `N2-001`, `N2-002`, `N2-003`.

## Verdict

**PASS.** Phone normalization, HLS storage/playlist rules and platform-integration availability now
each have one executable implementation in `@bersoncare/shared-contracts`. Existing webapp,
integrator, media-worker and platform-merge paths are compatibility re-exports/adapters, not second
implementations. UI catalog metadata, S3/FFmpeg adapters and database reads remain process-owned.

The package is a normal workspace dependency, builds before consumers, has strict TypeScript, and
does not commit `dist` or `node_modules`.

## Independent fault proof

The auditor prepared the kill-set before reading existing tests and injected one fault per behavior
class:

- changing the shared HLS trust rule made the media-purge acceptance test red; after revert the
  expanded lifecycle file passed 20/20;
- changing the shared phone normalization made the existing cross-channel identity test red;
- changing integration availability to fail open made three existing delivery/availability tests red.

All temporary shared-package mutations were reverted. The only permanent audit addition is the HLS
purge trust-boundary coverage in `s3MediaStorage.lifecycle.unit.test.ts`.

## Final checks

- shared package build: PASS;
- integrator phone + integration-availability: 2 files, 24 passed, 2 pre-existing expected failures;
- webapp S3 lifecycle/trust boundary: 1 file, 20 passed;
- media-worker: 8 files, 21 passed;
- integrator, media-worker and webapp typechecks: PASS;
- scoped lint from the independent pass and `git diff --check`: PASS.

No database, service, deploy or full CI action was performed.
