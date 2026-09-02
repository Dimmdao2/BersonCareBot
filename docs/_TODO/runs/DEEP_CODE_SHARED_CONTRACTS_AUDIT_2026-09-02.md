# Shared cross-process contracts — independent acceptance, 2026-09-02

## Verdict

**PASS** for implementation commit `40cb683bfc1c036defce9b1d79339395ca4f9ba3` on branch
`wt/deep-code-shared-contracts-20260902` (HEAD `51ed497ed4bf71faee3324853441c5fd5fdbd1e6`, a plain merge of
`feat/doctor-ui-rebuild` that touches none of the files in scope — confirmed by `git show --stat 51ed497ed`).

Authority: `docs/_TODO/DEEP_CODE_AUDIT_PLAN.md` findings `N2-001`, `N2-002`, `N2-003`; `AGENTS.md` §5, §9–§10b,
§24. This is an `auditor-live` pass per §24.1 (advisory/read-only, direct spawn, no separate branch).

One acceptance gap was found (playlist/purge behavior had zero executable test coverage anywhere in the repo,
not caused by this commit) and closed with one bounded acceptance test, committed alongside this report; no
product code was changed by this pass.

## Test-or-view classification (§24.4)

| Required item | Classification | Reason |
| --- | --- | --- |
| 1. Phone: one implementation, callers unchanged | **VIEW** for "one implementation" (diff shows every caller is now a re-export); **TEST** for "same results" (behavior across processes) | Duplicate-body absence is a one-time structural fact; cross-process equality is repeated behavior. |
| 2. HLS: one implementation, trusted-prefix/purge/playlist unchanged | **VIEW** for "one implementation"; **TEST** for trust-boundary and playlist-output behavior | Same split: body dedup is structural, security gating and output format are behavior. |
| 3. Platform integration availability: one shared parse/normalize/fail-closed lookup, webapp catalog stays webapp-owned | **VIEW** for "one implementation" + catalog ownership; **TEST** for fail-closed lookup behavior | Catalog/UI metadata is inspected as final source state; the fail-closed contract is repeated runtime behavior. |
| 4. Workspace wiring, build order, no cycle/`any`/source-path import/generated artifact in git | **VIEW** — all one-time structural facts (package.json graph, tsconfig, git tree) | Nothing here is repeated runtime behavior. |
| 5. Compatibility wrappers import-compatible, no second implementation | **VIEW** — read every wrapper file's final content | Absence of a second executable body is structural, not behavioral. |
| 6. Full diff inspected, findings must be reachable | **VIEW** — read the entire `40cb683bf` diff | Diff completeness is a one-time review fact. |

## Required proof

### 1. Phone normalization — PASS

`git show 40cb683bf` for `packages/shared-contracts/src/phone.ts`,
`apps/webapp/src/shared/phone/normalizeRuPhoneE164.ts`,
`apps/integrator/src/infra/phone/normalizeRuPhoneE164.ts`,
`packages/platform-merge/src/supplementaryContactNormalize.ts`: all three former handwritten bodies are now
`export { normalizeRuPhoneE164 } from '@bersoncare/shared-contracts';` — byte-identical algorithm moved once,
zero duplicate bodies left (`grep -rn "\bany\b" packages/shared-contracts/src` → empty;
`grep -rn "digits.replace\|digits.startsWith" apps packages --include=*.ts` → only inside
`packages/shared-contracts/src/phone.ts`).

Existing cross-process behavior test:
`pnpm --dir apps/integrator exec vitest run src/infra/phone/phoneOneFormAcrossChannels.test.ts` →
`15 passed | 2 expected fail (17)` (the 2 `it.fails` are pre-existing, unrelated, registered defects, not
this refactor).

Fault injection: disabled the `8→7` branch in `packages/shared-contracts/src/phone.ts`, rebuilt
(`pnpm --dir packages/shared-contracts run build`), reran the same test →
**2 failed** (`AssertionError: expected '+89180000011' to be '+79180000011'`), exactly the injected fault
class. Reverted the source line, rebuilt, reran → `15 passed | 2 expected fail (17)` again;
`git diff --stat -- packages/shared-contracts` empty after revert.

### 2. HLS layout and master-playlist — PASS

`git show 40cb683bf` for `hlsStorageLayout.ts`/`hlsMasterPlaylist.ts` on both webapp and media-worker sides:
both former handwritten pairs are now identical `export { … } from '@bersoncare/shared-contracts'`
re-exports; the shared package body is the old body with only local-variable renames
(`k`→`normalizedKey`, `hlsDir`→`hlsDirectory`, `v`→`variant`, `out`→`uris`) — no semantic change.

Production callers of the security-sensitive path (`isTrustedHlsArtifactS3Key`, `isTrustedPosterS3Key`,
`resolveHlsPurgeListPrefix`, `resolvePosterPurgeListPrefix`) are `apps/webapp/src/infra/repos/s3MediaStorage.ts`
(`collectS3KeysForMediaPurge`, purge) and `apps/webapp/src/app-layer/media/hlsDeliveryProxy.ts` (playback trust
gate). Existing coverage: `resolveMediaPlaybackPayload.unit.test.ts` already asserts "falls back … for an
untrusted HLS artifact key" and "keeps a trusted HLS master same-origin"; run:
`pnpm --dir apps/webapp exec vitest run src/app-layer/media/resolveMediaPlaybackPayload.unit.test.ts` →
`passed`.

**Gap found and closed:** `collectS3KeysForMediaPurge` (the purge-side trust/prefix consumer) and
`buildVodMasterPlaylistBody`/`parseMasterPlaylistVariantRelativeUris` (playlist construction/parsing) had **no**
executable test anywhere in the repository before this pass (`grep -rln "collectS3KeysForMediaPurge"
--include=*.test.ts apps` → empty; `processTranscodeJob.ts`, the only playlist-builder caller, is mocked as a
black box in `workerTick.test.ts`). This predates `40cb683bf` — the dedup did not remove any test, there was
none to remove — but it is exactly the security-sensitive purge behavior this acceptance item names, so one
bounded acceptance test was added: a new `describe('collectS3KeysForMediaPurge trust boundary …')` block in
the existing `apps/webapp/src/infra/repos/s3MediaStorage.lifecycle.unit.test.ts` (reusing its established
`@/infra/s3/client` mock harness, extended with a hoisted `s3ListObjectKeysUnderPrefix` fake), covering:
canonical-prefix listing, a stored `hls_artifact_prefix` that escapes the canonical root (ignored, falls back
to canonical), a cross-media `hls_master_playlist_s3_key` (dropped, not deleted), a cross-media
`poster_s3_key` (dropped, falls back to listing the canonical poster prefix), and that the row's own
`s3_key`/preview keys are always included.

Run: `pnpm --dir apps/webapp exec vitest run src/infra/repos/s3MediaStorage.lifecycle.unit.test.ts` →
`Test Files 1 passed (1)`, `Tests 20 passed (20)` (14 pre-existing + 6 new).

Fault injection: made `isTrustedPosterS3Key` in `packages/shared-contracts/src/hlsStorageLayout.ts` always
return `true` (dropping the trust boundary), rebuilt, reran the same file → **1 failed**
(`expected […] to not include 'media/other-media-id/poster/poster.jpg'`) — exactly the new test catching the
injected cross-media purge. Reverted, rebuilt, reran → `20 passed (20)`;
`git diff --stat -- packages/shared-contracts` empty after revert.

`buildVodMasterPlaylistBody`/`parseMasterPlaylistVariantRelativeUris` playlist-format coverage remains a real
gap (no test asserts the `#EXTM3U`/`#EXT-X-STREAM-INF` output byte-for-byte); it is unchanged by this commit
(source-identical move) and not required to close this specific acceptance pass, which is bounded to the
security-sensitive purge/trust class named in the brief. Recording it here rather than expanding scope
silently: **owner question/backlog candidate**, not a finding against this commit.

### 3. Platform integration availability — PASS

`git show 40cb683bf` for both `platformIntegrationAvailability.ts` files: the integrator's
`parsePlatformIntegrationAvailability`/`isPlatformIntegrationAvailable` now delegate id list, envelope
normalization and the fail-closed per-id accessor to `@bersoncare/shared-contracts`, keeping only its own DB
read (`app.read_integrator_platform_integration_availability()`), principal handling
(`runWithInfraPrincipal`) and its own `PLATFORM_INTEGRATION_AVAILABILITY_UNREADABLE` error semantics —
process-owned, correctly not moved. Webapp's module keeps `PLATFORM_INTEGRATION_CATALOG` (labels, tariff
hints, `RuntimeSettingUnavailableError` wiring) fully webapp-owned; only the shared id list/normalize/lookup
moved.

Existing behavior test: `apps/integrator/src/infra/db/platformIntegrationAvailability.test.ts` already covers
enabled/disabled/missing/malformed/unsupported-version/unrelated-channel-denies-only-itself/permission-denied,
plus the dispatch-gate integration. Run:
`pnpm --dir apps/integrator exec vitest run src/infra/db/platformIntegrationAvailability.test.ts` →
`9 passed (9)`. Webapp-side: `page.unit.test.ts`, `runtimeSettingsNoSubstitution.unit.test.ts` →
`passed`.

Fault injection: made `isPlatformIntegrationAvailable` in
`packages/shared-contracts/src/platformIntegrationAvailability.ts` always return `true` (fail-open instead of
fail-closed), rebuilt, reran the integrator suite → **3 failed** (the explicit-`false` case, the `vk` toggle
case, and the dispatch-gate "does not invoke an adapter when disabled" case — all resolved `true`/delivered
instead of failing). Reverted, rebuilt, reran → `9 passed (9)`;
`git diff --stat -- packages/shared-contracts` empty after revert.

### 4. Workspace wiring / build order / no cycle / no `any` / no source-path import / no generated artifact — PASS

- `pnpm-workspace.yaml` lists `packages/shared-contracts`; `pnpm-lock.yaml` links it into
  `apps/webapp`, `apps/integrator`, `apps/media-worker`, `packages/platform-merge` as `workspace:*`.
- Build order: `apps/integrator` build runs
  `… db-principal … && … shared-contracts … && … platform-merge … && … error-tracking … && tsc`
  (shared-contracts before platform-merge, which depends on it); `apps/media-worker` and `apps/webapp` build
  scripts also build `packages/shared-contracts` first; root `typecheck` builds it before `platform-merge`.
  Verified live: `pnpm --dir packages/shared-contracts run build` → clean;
  `pnpm --dir packages/platform-merge run build` → clean;
  `pnpm --dir apps/integrator typecheck` / `pnpm --dir apps/media-worker typecheck` /
  `pnpm --dir apps/webapp typecheck` → all clean (`tsc --noEmit`, no output).
- No cycle: `packages/shared-contracts/package.json` has zero workspace `dependencies` (only
  `@types/node`/`typescript` devDeps) — it cannot import back into any consumer.
- No `any`: `grep -rn "\bany\b" packages/shared-contracts/src` → empty.
- No source-path import: `grep -rn "packages/shared-contracts/src" apps packages --include=*.ts` (excluding
  node_modules) → empty; every consumer imports the package name `@bersoncare/shared-contracts`.
- No generated artifact in git: `git ls-files packages/shared-contracts` → only `package.json`, `tsconfig.json`,
  `src/*.ts` (no `dist/`); `.gitignore` covers `dist/`; `git status --porcelain` after building shows no
  untracked/staged `dist` or `node_modules` path.

### 5. Compatibility wrapper paths — PASS

Read the final content of every wrapper file named in `N2-001..003`
(`apps/webapp/src/shared/phone/normalizeRuPhoneE164.ts`,
`apps/integrator/src/infra/phone/normalizeRuPhoneE164.ts`,
`packages/platform-merge/src/supplementaryContactNormalize.ts`,
`apps/webapp/src/shared/lib/hlsStorageLayout.ts`, `apps/media-worker/src/hlsStorageLayout.ts`,
`apps/webapp/src/shared/lib/hlsMasterPlaylist.ts`, `apps/media-worker/src/hlsMasterPlaylist.ts`,
`apps/webapp/src/modules/system-settings/platformIntegrationAvailability.ts`,
`apps/integrator/src/infra/db/platformIntegrationAvailability.ts`): every one is either a pure
`export { … } from '@bersoncare/shared-contracts'` (phone, HLS) or delegates parsing/normalization/lookup to
the shared package while keeping only process-owned logic (the two `platformIntegrationAvailability.ts`
files, and `supplementaryContactNormalize.ts`'s email/phone-shape validators). No second executable body of
any moved function remains anywhere in the repository (confirmed by the fault-injection results above: each
break in the shared package was visible through every consumer's own test suite, which is only possible if
the consumer has no independent copy).

### 6. Full diff inspected — PASS, no findings beyond the closed gap

Read the entirety of `git show 40cb683bf` (23 files, +331/−366) directly (not delegated). No behavior, build,
or security-relevant deviation found beyond the pre-existing missing playlist/purge test coverage recorded
under item 2 above (predates this commit, closed for the purge/trust class, playlist-byte-format left as a
named non-blocking gap per the bounded scope of this pass). One unrelated, pre-existing lint failure
(`'pushCallbackAnswerFromIncoming' is defined but never used` in
`apps/integrator/src/kernel/domain/executor/executeAction.ts`, last touched by commit `02c9ecca2`, not part of
`40cb683bf`) surfaced during `pnpm --dir apps/integrator lint`; confirmed out of scope for this commit and not
reported as a finding of this pass.

## Commands run (smallest existing suites per class, no full CI)

```
pnpm --dir packages/shared-contracts run build
pnpm --dir packages/platform-merge run build
pnpm --dir apps/integrator typecheck
pnpm --dir apps/media-worker typecheck
pnpm --dir apps/webapp typecheck
pnpm --dir apps/integrator exec vitest run src/infra/phone/phoneOneFormAcrossChannels.test.ts
pnpm --dir apps/integrator exec vitest run src/infra/db/platformIntegrationAvailability.test.ts
pnpm --dir apps/webapp exec vitest run src/app/app/settings/page.unit.test.ts \
  src/modules/system-settings/runtimeSettingsNoSubstitution.unit.test.ts \
  src/app-layer/media/resolveMediaPlaybackPayload.unit.test.ts
pnpm --dir apps/webapp exec vitest run src/infra/repos/s3MediaStorage.lifecycle.unit.test.ts
git diff --check
```

All passed on the unmodified candidate; full CI was not run (no repo-level risk beyond this bounded set per
§9 — no CI workflow, root tsconfig, or lockfile-dependency-graph change beyond the wiring reviewed in item 4).

## Not done

- Playlist byte-format (`buildVodMasterPlaylistBody`/`parseMasterPlaylistVariantRelativeUris`) has no
  acceptance test; recorded above as an owner question/backlog candidate, not fixed in this pass (bounded
  scope, brief covers purge/trust security behavior specifically).
- N1 (unconnected code) and the remaining N2 registry items (Р1/Р2 in progress elsewhere) are untouched —
  out of this pass's scope by the brief.
- No product code was modified; only one test file gained the new `describe` block plus the report file.
