# Blind kill-set — canonical appointment delivery format

Authority read before test inspection: `docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md`, UI-04, UI-06, Flow G and Wave 3 / §6; owner rule: extend the single `manual-reschedule` door with a format parameter, without a second endpoint.

This list was written before reading any existing test files.

| Class | Named injected fault | Required observable oracle |
| --- | --- | --- |
| Create/default/backfill | A built-in Online branch, a branchless online patient booking, or an explicit `online` override persists as `in_person`; or legacy online data remains nullable/defaults incorrectly. | Canonical format is exactly `online` for online sources/override, `in_person` for physical/default sources; migrated column is non-null with `in_person` default. |
| Edit semantics | A format-only `manual-reschedule` request increments reschedule state or emits cancellation/reschedule/payment/reminder side effects; conversely a time edit stops preserving old reschedule semantics. | Format-only edit changes only format; real time change retains the established reschedule behaviour. |
| Projection/permissions | Staff projection derives `booking_type` from a second hard-coded source rather than canonical format, or a changed SECURITY DEFINER / staff write surface is absent from the privileges declaration. | Staff booking projection exposes booking type derived from canonical format; generated privilege declaration covers changed relation surfaces without migration grants. |
| Today CTA | An effective-video online appointment with a linked patient account renders/follows the ordinary visit path rather than starting the call; fallback/off cases mutate the stored format or expose camera CTA for in-person. | CTA choice follows effective video capability and stored format; fallback is safe and non-mutating. |
| Independence | Branch/format changes server-side video access, removes the patient-card ad-hoc camera entry, or UI infers Online from a label rather than server-provided built-in-location data. | Video entitlement and ad-hoc camera entry remain independent; UI consumes server-derived built-in Online flag. |
