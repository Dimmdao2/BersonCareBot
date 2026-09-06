# Blind kill-set — clinical encounter page, SHA 67d73b0e2
Written BEFORE reading production diff or any *.test.* file.
Authority: docs/_TODO/DOCTOR_MOBILE_UI_OWNER_ACCEPTANCE_2026-09-04.md P4.4-P4.6.
Classification per AGENTS.md §24.4: "look" = one-off action / changeable UI form;
"test" = repeatable behaviour with expensive+silent failure (money, data, linkage, access).

| ID | look / test | named fault (input -> wrong output) |
|---|---|---|
| ENCOUNTERS-01 | look | N counts calendar appointments, not visits -> "Приёмы: 3" for 1 visit + 2 bookings. Block rendered outside the disease->life slot. |
| ENCOUNTERS-02 | test (count math) + look (placement) | 2 primary visits -> summary prints "первичных: 1" (boolean-collapsed). Previous-visit date = oldest instead of newest. Date not clickable. |
| ENCOUNTERS-03 | look | actions missing or not in the shared doctor action panel. |
| ENCOUNTERS-04 | look | history modal replaces the patient card instead of stacking; opening a row unmounts karta. |
| ENCOUNTERS-05 | look | view became a full page, or create/edit still opens a nested long form; more than one reachable create/edit destination. |
| ENCOUNTER-PAGE-01 | look | page drops patient context; date/time/branch/specialist missing; unlinked visit shows neither the link nor an explicit "no link". |
| ENCOUNTER-PAGE-02 | test | a SECOND visit entity/endpoint/repository appears; or one of жалобы/динамика/осмотр/манипуляции/результаты/рекомендации is not persisted by the existing visit contract. |
| ENCOUNTER-PAGE-03 | look | symptom/diagnosis uses a new local form; after save the page shows stale data until navigation. |
| ENCOUNTER-PAGE-04 | look + test | past-dated visit refused for edit by a date guard; saved edit updates the page but not the karta. |
| ENCOUNTER-APPOINTMENT-01 | test | prebound appointmentId is re-offered in a selector, or dropped on save -> visit created unlinked. |
| ENCOUNTER-APPOINTMENT-02 | test | already-linked appointment offered again in the picker; or no "continue without" branch. |
| ENCOUNTER-APPOINTMENT-03 | test | checkbox defaults OFF; or OFF still creates an appointment. |
| ENCOUNTER-APPOINTMENT-04 | test | new simplified appointment write-path instead of the manual booking door; canonical fields (date/time/branch/service/duration/price) missing; created appointment not linked to the new visit. |
| ENCOUNTER-APPOINTMENT-05 | test (server+DB) + look (dialog) | decorative dialog: Cancel still writes visit and/or appointment; Confirm cannot actually create the overlap because the service conflict check or the PostgreSQL exclusion constraint still rejects -> user sees an error, zero rows. |
| ENCOUNTER-APPOINTMENT-06 | test | OFF-path writes a finance/payment row; ON-path bypasses snapshot/price/payment contracts. |
| ARCH-1 | look | second visit API/entity/repository added. |
| ARCH-2 | test | appointment creation duplicates the manual door instead of reusing/parameterising it; returned appointment id not used for the link. |
| ARCH-3 | test | visit saved with a lost or fabricated appointment id. |
| ARCH-4 | look | nested second page shell, raw Dialog, parallel form/date/select primitives, double scroll owner, local hex/radius/typography. |
| ARCH-5 | look | orphaned old inline create/edit files left behind, or deleted while still imported (build break). |
| ARCH-6 | look (owner-reported defect) | mobile: tapping the visible top strip above the topmost drawer dismisses the LOWER layer too, or adds a second scrim. |
