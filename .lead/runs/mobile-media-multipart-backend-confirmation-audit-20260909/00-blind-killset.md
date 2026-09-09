# #915 M5-04 confirmation audit — blind kill-set

Written before opening the retained route/repository tests for the corrected surface.

1. A patient can abort only their own pending `patient-program-submission` session before object completion. Server-owned session binding, rather than request policy or object HEAD, authorizes it; foreign, stale and wrong-purpose sessions cannot be aborted.
2. Doctor abort of a pending `patient_file` removes its linked `patient_files` row atomically with the media/session lifecycle. No null-media legacy-list ghost survives; other policies are untouched and a transaction failure has no half-applied result.
3. Patient completion of a session with no received object (`receivedAt IS NULL`) returns typed `session_expired` with HTTP 405; foreign and lifecycle-conflict cases retain their public outcomes.
4. Program-submission multipart presign failure compensates using the media id actually created by the pending creator; scope/shadowing cannot turn cleanup into a skipped no-op.
5. Tenant binding comes from the installed principal/session and repository predicates. Inspect creation, compensation and sweep transaction boundaries; only a reachable permanent or user-visible orphan is a finding.
6. The existing upload-door acceptance fixture's 415-versus-409 expectation remains valid unless the active M5 public contract expressly makes its input a different class of error.

## Planned independent faults

- Replace received-object inspection with absence for patient abort and completion.
- Exercise the `patient_file` abort branch with a linked pending record, then an injected transaction failure at its terminal mutation.
- Force program-submission presign after pending-media creation to fail and observe compensating cleanup against that exact identity.
