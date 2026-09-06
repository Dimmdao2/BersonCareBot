# Blind kill-set — common encounter actions and start modal

Written by `auditor-live` from the owner checklist
(`docs/_TODO/DOCTOR_MOBILE_UI_OWNER_ACCEPTANCE_2026-09-04.md` §P4.4–P4.6) and the launcher brief,
**before opening any test file** (AGENTS.md §10b «Слепой список поломок составляет аудитор», §24.5).

Candidate: `f4c2d4f3a` (branch `wt/encounter-start-owner-audit-20260906`), product commit `63e3860c9`.

## Classification per AGENTS.md §24.4 («тест или взгляд»)

| # | named failure | owner ID | repeatable behavior → test / one-time structure → inspection |
|---|---|---|---|
| K1 | An active `Начать приём` entry still carries the old label `Создать визит`/`Новый визит`, or navigates straight to `/visits/new` without opening the modal first. | `ENCOUNTER-START-01`, `ENCOUNTERS-ACTION-06` | behavior (entry → modal) + inspection (labels) |
| K2 | Header actions missing on some patient tab, copied per tab, or the Karta `Приёмы: N` card survives. | `ENCOUNTERS-ACTION-01..05`, `ENCOUNTERS-BLOCK-01` | inspection (single render site) |
| K3 | Encounter page loses the patient tab row, adds a fake `Приём` tab, marks a patient tab active, or global nav stops highlighting the patients section. | `ENCOUNTER-PAGE-02A/02B/02C` | inspection (structure) + unit (nav predicate) |
| K4 | Mode selector shows anything but the three exact labels, leaks an internal key, or drops canonical `Select`/`displayLabel`. | `ENCOUNTER-START-02/03` | behavior (rendered labels) |
| K5 | A trusted appointment-detail entry loses the appointment id or preselects a different one. | `ENCOUNTER-LINK-01`, `ENCOUNTER-LINK-09` | behavior |
| K6 | Ordinary header entry auto-selects an appointment of another day or an already-linked one; a next unlinked appointment today is not selected. | `ENCOUNTER-LINK-02/03` | behavior |
| K7 | Existing-appointment mode folds the featured row into the list, allows multiple selection, has no explicit check, or passes the wrong id on `Начать приём`. | `ENCOUNTER-LINK-04/06/08` | behavior |
| K8 | Create mode uses a duplicated/simplified form or write path, lets the patient be changed, omits price/payment fields, or loses the id the manual door returned. | `ENCOUNTER-CREATE-01/02/03/08/09/10` | inspection (single door) + behavior (id plumbing) |
| K9 | Without-appointment mode renders booking fields or creates an appointment/payment side effect. | `ENCOUNTER-NOLINK-01/02`, `ENCOUNTER-MONEY-01/02` | behavior (no booking UI, no write path) |
| K10 | The full encounter page reintroduces a link selector/toggle/booking section after the modal already fixed the mode, or stops stating the mode. | `ENCOUNTER-PAGE-LINK-01/02`, `ENCOUNTER-PAGE-09` | inspection + behavior |
| K11 | History/view stack or past-visit editing regresses versus the accepted encounter-page audit. | `ENCOUNTERS-HISTORY-01..04`, `ENCOUNTERS-VIEW-01/02`, `ENCOUNTER-PAGE-23` | inspection |

Visual size/colour/spacing is owner live-review territory (`CLINICAL-GATE-03`) and is deliberately **not** in this set.
