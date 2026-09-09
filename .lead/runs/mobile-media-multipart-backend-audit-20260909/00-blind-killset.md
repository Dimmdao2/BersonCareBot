# Blind behavioral kill-set — M5-04/M5-05 shared multipart backend

Scope: exact committed server/common candidate only. Product code is read-only.

1. Patient, specialist, restricted staff, cross-org and wrong-instance callers cannot begin, read, complete, or abort a multipart session outside the exact existing surface guard; ownership is never accepted from request data.
2. Each begin door selects only its fixed policy and existing pending creator. Caller bucket, storage, key, policy, or org is rejected or ignored before the storage port; `proxy` cannot become multipart.
3. Exact positive size is required before init, part count and limits stay bounded, and object metadata binds media id, owner, expected size, and fixed policy; mismatch or tamper fails before finalization.
4. `cms`, program submission, patient file, and individual-exercise completion invoke their existing semantic finalizers. Program video enqueues once; patient-file quota/ready transition happens once; individual exercise is not accidentally revalidated as `cms`.
5. Complete replay is idempotent with the same observable result and no second quota, transition, or enqueue. Partial, missing, wrong-size, or wrong-ETag upload does not become ready.
6. Abort/failure terminates the right session/upload. Patient-file abort removes the current pending linked record rather than leaving it legacy-visible; no unrelated media/session is affected.
7. Existing browser single/proxy and CMS multipart behavior remains unchanged. Part-url, complete, and abort still use one lifecycle/lock path; no second native upload route or storage-argument bypasses `mediaUploadAdapter`.
8. Patient DB rights are no broader than required session operations and current-user RLS; no patient media DELETE, cross-user read, migration-local grant, or schema change is introduced.
