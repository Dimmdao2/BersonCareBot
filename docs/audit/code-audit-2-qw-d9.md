# Code Audit 2 — QW-D9 (adversarial / ДОЁБЩИК)
agentId: audit2-qw-d9
Commits: 9d48c048, d26080f9
Date: 2026-06-19
Branch audited: auto/qw-d9 (HEAD = d26080f9), baseline feat/doctor-ui-rebuild

## EXECUTIVE FINDING — THE FEATURE IS NOT PRESENT ON THE BRANCH

The QW-D9 deliverable does **not exist at branch HEAD**. The two commits cancel each
other out at the code level:

- `9d48c048` ("feat: add 360p rendition + delete original source") added the entire
  feature to `processTranscodeJob.ts` (import of `DeleteObjectCommand`, regex token,
  `dir360`, `vf360`, `run360`, master-playlist 360p entry, `available_qualities_json`
  360p entry, and the best-effort `DeleteObjectCommand` block). It also bundled in two
  UNRELATED audit docs (`code-audit-1-sch-r-05.md`, `code-audit-2-sch-r-05.md`).
- `d26080f9` (claimed scope: "update stale JSDoc — one line") actually **REVERTED ALL
  53 lines** of the feature back out of `processTranscodeJob.ts`, in addition to the
  1-line doc edit it advertised.

Hard proof:

```
$ git diff feat/doctor-ui-rebuild..auto/qw-d9 -- apps/media-worker/src/processTranscodeJob.ts
(EMPTY — file is byte-for-byte identical to the pre-QW-D9 baseline)

$ git rev-parse auto/qw-d9:apps/media-worker/src/processTranscodeJob.ts
e09d668e...                               # branch HEAD blob
$ git rev-parse 9d48c048:apps/media-worker/src/processTranscodeJob.ts
9acde35a...                               # blob WITH the feature
$ git rev-parse feat/doctor-ui-rebuild:apps/media-worker/src/processTranscodeJob.ts
e09d668e...                               # baseline == HEAD
```

At HEAD, `processTranscodeJob.ts` still says, in its own JSDoc:
`* End-to-end transcode (FFmpeg + S3). Source MP4 at \`s3_key\` is never deleted. Never throws.`
— i.e. the 360p rendition and the source deletion are gone. Only 720p + 480p remain.

This poisons nearly every clause below: the thing being audited is absent.

---

## Clause C1 — 360p rendition correctness
FAIL — feature absent at HEAD. `git show auto/qw-d9:.../processTranscodeJob.ts | grep 360`
returns nothing. No `vf360`, no `run360`, no 400k/64k call. (The args were correct in the
reverted `9d48c048` blob — `scale=640:-2,format=yuv420p`, 400k/64k — but that blob is not
on the branch HEAD, so the deliverable does not exist.)

## Clause C2 — Master playlist 360p entry
FAIL — `buildVodMasterPlaylistBody([...])` at HEAD lists only 720p and 480p. No
`{ uri: "360p/index.m3u8", bandwidth: 450_000, width: 640, height: 360 }` entry. The
ordering question is moot because the entry is gone.

## Clause C3 — available_qualities_json updated
FAIL — the `qualitiesJson` array at HEAD contains only the 720p and 480p objects. No 360p
label/height/path/bandwidth entry. DB will never advertise a 360p quality.

## Clause C4 — Original source deletion
FAIL (worst clause) — there is NO `DeleteObjectCommand` block at HEAD. The import was
removed by `d26080f9`. The source MP4 is never deleted — exactly the behavior the task
was supposed to change. (Even in the reverted `9d48c048` blob the deletion was ordered
after `markJobDone` and wrapped in try/catch, which would have been acceptable — but none
of it survives on the branch.)

## Clause C5 — JSDoc fix correctness
FAIL — and this is an INVERSION of the audit-1 FAIL, not a fix.
`hlsStorageLayout.ts` line 6 at HEAD now reads:
`* Source: ... — deleted best-effort after successful transcode (see processTranscodeJob.ts).`
But `processTranscodeJob.ts` at HEAD does the opposite — it deletes nothing and its own
JSDoc says "is never deleted." So the two source files now CONTRADICT each other, and the
hlsStorageLayout doc actively lies about behavior that does not exist. Audit-1's FAIL
("doc says never removed but code now deletes") has been replaced by the mirror-image lie
("doc says deleted but code never deletes"). Net: still a false JSDoc, now pointing at a
non-existent implementation via "(see processTranscodeJob.ts)".

## Clause C6 — No regression to existing renditions
PASS (trivially) — 720p/1080p... actually 720p/480p renditions are unchanged because the
whole file is unchanged from baseline. No regression, but only because nothing was added.

## Clause C7 — TypeScript correctness
N/A / PASS-by-default — the HEAD file is identical to the previously-compiling baseline,
so it compiles. This says nothing good about QW-D9; it compiles precisely because the
feature is absent. (The reverted `9d48c048` blob would also have compiled — the import and
usage were consistent — but it is not on the branch.)

## Clause C8 — Idempotency on retry
N/A — no deletion exists, so the NoSuchKey-on-retry concern does not arise. The item it
was meant to test is gone.

## Clause C9 — Temp directory cleanup
N/A — `dir360` does not exist at HEAD. (Note: had it existed, it lived under `hlsDir` /
`tmpRoot`, which is cleaned in `finally { await rm(tmpRoot, { recursive: true, force: true }) }`,
so cleanup would have been fine. Moot.)

## Clause C10 — Import correctness
FAIL — `DeleteObjectCommand` is NOT imported at HEAD (the import line was removed by
`d26080f9`). `@aws-sdk/client-s3` is otherwise used (`S3Client` type import), so the import
would have resolved, but it is absent on the branch.

---

## Additional adversarial findings (beyond the clause list)

- **Scope-violating commit**: `d26080f9` is labelled a 1-line JSDoc fix but performed a
  53-line feature revert. A reviewer trusting the commit message would merge a feature
  deletion believing it to be a doc touch-up. This is exactly the kind of change that
  slips through.
- **Unrelated files bundled**: `9d48c048` also committed `docs/audit/code-audit-1-sch-r-05.md`
  and `docs/audit/code-audit-2-sch-r-05.md`, which belong to a different item (SCH-R-05),
  not QW-D9.
- **Cross-file contract broken**: `hlsStorageLayout.ts` documents a sync-with-webapp
  contract (`check:hls-helpers-sync`). Its JSDoc now describes deletion behavior that the
  sibling implementation file denies — an internally inconsistent, shippable lie.

## OVERALL: FAIL

QW-D9 does not deliver anything on `auto/qw-d9`. The 360p rendition and the original-source
deletion — the two headline deliverables — are entirely absent from the branch HEAD because
the second commit (`d26080f9`) silently reverted the first commit's (`9d48c048`)
implementation while masquerading as a one-line JSDoc fix. The only surviving change is a
now-FALSE JSDoc in `hlsStorageLayout.ts` claiming the source is "deleted best-effort,"
directly contradicted by `processTranscodeJob.ts` which still states "is never deleted."

This is not a borderline pass. The deliverable is missing and the repo is left in a
contradictory, misleading documentation state. DO NOT MERGE. The feature commit
`9d48c048`'s code must be restored (without the stray SCH-R-05 audit files), or the
`hlsStorageLayout.ts` JSDoc must be reverted to match reality.
