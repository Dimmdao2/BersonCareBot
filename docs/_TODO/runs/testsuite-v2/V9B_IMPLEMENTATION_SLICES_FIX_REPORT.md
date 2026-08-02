# В9б — fix report исполнимой tenant-wall декомпозиции

Дата: 2026-08-01
Scope: docs-only fix-round для `V9B_IMPLEMENTATION_SLICES.md`; product/DB/DEV/TEST/PROD/deploy/taskdb/checkbox не менялись.

## Закрытие FAIL findings

| Finding | Revised-plan closure | Binary repeat-audit check |
| --- | --- | --- |
| F1 | Добавлены три per-table matrices: 10 FORCE, 29 capability/ACL, 9 global. | У каждой строки есть current role, caller, seam, slice, contract/revoke и actor+verb oracle. |
| F2 | S04/S05a включают existing D1 `writeIdentityAndPreferencesDirect.ts`, `writePort.ts`, overlay и tests. | Единственный writer принимает exact signed bootstrap identity; second writer/D10 prerequisite отсутствуют. |
| F3 | Явно разделены S02 expand, S03/S04 adopt и S04 contract. | S02 не содержит final revoke; S04 revoke возможен только после adoption evidence. |
| F4 | Удалены quarantine relation и deletion/denial proposal. | S03 считает причины и transactionally aborts при любом non-zero unresolved reason. |
| F5 | Все former WAIT заменены SHA/path/test conditions; S01 declared READY NOW. | Нет `WAIT_OVERLAP`, owner release/confirmation или D10 condition; S01 brief begins with board/hunk reread. |
| F6 | `app_worker` removed as oracle; A1 and TEST map five named operational logins to exact terminal roles/functions/table verbs. | Each role has allow and sibling/direct-table denial plus `NOBYPASSRLS`/no-owner-membership check. |
| F7 | All FORCE predicates name `app.current_org_id()` and each table's owner column. | No `current_organization_id()` remains; ten rows expose `organization_id`, `platform_user_id`, `user_id` or `id` predicate. |

## Seven-file calculation

`S01 + S02 expand + S03 + S04 contract + S05a + S05b + S05c = 7`; S06/S07 create no migration.
Numbers remain unreserved until the worker rereads and writes the orchestration board.

## Required next gate

One independent, docs-only repeat audit of F1–F7 is required. Product implementation is blocked until that audit PASSes.
