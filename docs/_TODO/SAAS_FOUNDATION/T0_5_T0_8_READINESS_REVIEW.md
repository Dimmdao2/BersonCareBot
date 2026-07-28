# T0.5-T0.8 readiness review

Date: 2026-07-10

Taskdb: `#640`

Purpose: affirm the downstream T0.5-T0.8 readiness constraints after the T0.4 integrator trunk closure. This review does not execute T0.5-T0.8 runtime changes, migrations, RLS role flips, table drops, or external-channel calls.

## Readiness markers

| Marker                                                             | Readiness result                                                                                                                                                                                                                                                                                                                                            | Source                                                              |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| System settings mirror removal is not assumed.                     | Ready with constraint. P0.11 storage/read/write/UI work made `system_settings` org-aware while preserving global rows and mirror lockstep; current runtime reads still use canonical accessor paths and documented global-only readers where no org context exists. Do not remove `integrator.system_settings` mirror paths as part of T0.5-T0.8 readiness. | `P0_11_SYSTEM_SETTINGS_ORG_CHECKLIST.md`; `T0_DB_ACCESS_SURFACE.md` |
| Reminder bot dispatch is not assumed public-only.                  | Ready with constraint. T0.4 reminder writers and scheduler/worker paths now derive/copy org context, but integrator reminder dispatch state remains live and must not be dropped or bypassed by assuming webapp/public-only dispatch.                                                                                                                       | `T0_4_ENTRYPOINT_ORG_CONTEXT_MAP.md`; `T0_DB_ACCESS_SURFACE.md`     |
| Rubitime legacy paths are not assumed removed.                     | Ready with constraint. Legacy Rubitime/appointment projections remain live compatibility state. Canonical booking cutover and multi-org Rubitime ingress are later gates, not implicit T0.4/T0.5 cleanup.                                                                                                                                                   | `T0_4_RUBITIME_APPOINTMENT_ORG_AUDIT.md`; `T0_DB_ACCESS_SURFACE.md` |
| `integrator.contacts` fallback is not assumed removed.             | Ready with constraint. Contacts fallback writes are org-stamped, but the `integrator_linked_phone_source=public_only` cutover and fallback removal still require a clean exception audit and owner-gated execution.                                                                                                                                         | `T0_TENANT_CONTEXT_CUTOVER_CHECKLIST.md`; `T0_DB_ACCESS_SURFACE.md` |
| Queue/retention cleanup is not treated as business-data migration. | Ready with constraint. Queue/outbox/idempotency rows remain technical state. Retention/scrub work is operational cleanup and must not be folded into SCOPED business-data migration or table-drop work without its own plan.                                                                                                                                | `T0_DB_ACCESS_SURFACE.md`; `P0_8_CODE_FACTS.md`                     |

## Execution boundary

- No RLS/runtime role flip was performed.
- No schema migration was added.
- No dev/prod/test application DB was read or written.
- No Telegram, MAX, Rubitime, Google Calendar, SMS, email, S3, or queue replay was triggered.
- No `main`, `test`, or `dimmdao` push was performed.

## Next gated work

- Rubitime multi-organization ingress and canonical read-source cutover.
- `integrator.contacts` `public_only` switch and fallback-removal exception audit.
- Queue/outbox retention and payload cleanup policy.
- Actual T0 role/context enforcement flip only after the documented staging/prod-parity gates.
