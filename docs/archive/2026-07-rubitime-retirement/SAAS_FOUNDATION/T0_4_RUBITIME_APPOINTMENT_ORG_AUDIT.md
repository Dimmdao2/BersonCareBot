# T0.4 Rubitime / Appointment Organization Audit

> **АРХИВ:** Rubitime выведено из эксплуатации 2026-07-27. Материал сохранён только как историческое доказательство; не использовать как текущий план или runbook.

Date: 2026-07-10
Taskdb: `#639`

## Verdict

Rubitime/appointment T0.4 is not a simple `organization_id` writer-stamp slice.

Current state:

- `integrator.rubitime_records` and `integrator.rubitime_events` are live legacy adapter/projection state and have no `organization_id` column in the current Drizzle descriptors.
- `public.appointment_records` is a deprecated but live legacy projection and has no `organization_id` column in the current Drizzle descriptor.
- Canonical booking data is already written through `public.be_appointments`, `public.be_external_entity_mappings`, and appointment history/event tables with explicit `organizationId`.
- Webapp Rubitime canonical projection APIs accept `organizationId` as an explicit input and project legacy rows into canonical booking rows under that organization.

Therefore, T0.4 should not silently add org writes to the legacy projection tables. A safe cutover requires the existing owner-gated booking read-source work:

- prove canonical booking parity;
- flip `booking_slots_read_source=canonical`;
- flip `booking_doctor_appointments_read_source=canonical`;
- decide whether Rubitime remains an external mirror or becomes historical archive;
- only then migrate/archive/drop legacy Rubitime/appointment projections.

## Runtime Contract

### Integrator `booking.upsert`

`apps/integrator/src/infra/db/writePort.ts` still writes `public.appointment_records` and `public.patient_bookings` compatibility projections and fans out `appointment.record.upserted`.

This path remains legacy-compatible and intentionally does not invent tenant ownership for `appointment_records`.

### Webapp canonical projection

`apps/webapp/src/modules/booking-appointment-sync/service.ts` requires `RubitimeInboundEventInput.organizationId` and passes it into `upsertCanonicalFromRubitimeRecord`.

`apps/webapp/src/infra/repos/pgBookingRubitimeBridge.ts` writes canonical booking rows using `params.organizationId`, including:

- `be_appointments.organization_id`;
- `be_external_entity_mappings.organization_id`;
- Rubitime projection history/event rows.

The bulk projection helpers `projectAppointmentRecords(organizationId)` and `projectRubitimeRecords(organizationId)` intentionally take an owner-supplied organization and project legacy unscoped rows into canonical scoped rows.

## Remaining T0.4 Risk

Rubitime webhook/event ingress currently resolves the organization through the current default organization path before canonical projection. That is acceptable for the current single-organization compatibility mode, but it is not enough evidence for multi-organization runtime readiness.

The remaining work belongs to the T0.4 entrypoint-to-org map:

- document Rubitime webhook/M2M entrypoints;
- decide whether Rubitime payload/config can carry organization context directly;
- otherwise keep the path blocked behind explicit single-org/default-org compatibility until canonical read-source cutover.

## Guard

Source guard: `docs/_TODO/SAAS_FOUNDATION/scripts/check-t0-4-rubitime-appointment-org-audit.mjs`.

The guard locks the current audit facts:

- legacy appointment/Rubitime descriptors remain unscoped;
- canonical projection requires/passes `organizationId`;
- `pgBookingRubitimeBridge` writes canonical booking rows with `params.organizationId`;
- inbound event handling still uses default-org context, so the entrypoint map must remain open.
