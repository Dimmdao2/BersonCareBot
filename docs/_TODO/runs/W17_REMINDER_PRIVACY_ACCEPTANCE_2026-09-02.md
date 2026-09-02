# W17 reminder privacy acceptance — 2026-09-02

## Authority

- `docs/OWNER_DECISIONS.md`, NTF-01: medical data never leaves the application; the external notification may state that something appeared; appointment messages and broadcasts remain complete.
- `docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md`, W17: arbitrary medical text from a custom reminder must not reach an external messenger.
- Auditor brief: the boundary covers Telegram, MAX, VK, email, and web push; system lesson/warm-up copy remains complete.

## Blind kill-set

Recorded before reading production diff or existing tests.

1. **Arbitrary user reminder leaks:** a user-authored medical or otherwise arbitrary reminder title/text is emitted verbatim to Telegram, MAX, VK, email, or web push.
2. **Safe signal becomes unusable:** after private reminder content is removed, the external notification no longer contains both a neutral fact and a working application link.
3. **Booking or broadcast is over-redacted:** an appointment message or broadcast loses its complete allowed content because reminder privacy is applied too broadly.
4. **System lesson/warm-up copy is over-redacted:** system-authored lesson or warm-up reminder copy is replaced by the neutral privacy signal.
5. **Provenance is inferred from optional copy fields:** permitted system/doctor-generated content is redacted merely because `customTitle`/`customText` is present, or an arbitrary user reminder escapes because those fields are absent; the decision must follow the reminder's content provenance/type.

## Result

**PASS.** Candidate `wt/w17-reminder-copy-20260902` at `195b55011` (product commit
`2f5287671`) satisfies NTF-01/W17 on the inspected public materialization boundary.
No reachable product defect was found. Product code was not changed by this audit.

## Diff and creation-trace review

- The product diff centralizes private-reminder copy in
  `buildCustomReminderPushCopy()` and applies the same neutral title/body before
  materializing Telegram, MAX, VK, email, and web-push envelopes. Each envelope
  keeps the application URL; VK uses the URL in its inline keyboard.
- The patient create route does not accept `linkedObjectType: 'custom'` for new
  reminders. For supported object reminders it writes `customTitle: null` and
  `customText: null`.
- The reminder service requires a title for legacy `custom` reminders and rejects
  `customTitle`/`customText` on non-custom reminders. Updates likewise expose those
  fields only for a `custom` target.
- The materialization snapshot returns the persisted `linkedObjectType` and custom
  fields unchanged. Published lesson/warm-up titles are resolved separately as
  linked content.
- Therefore the candidate's `hasPatientEnteredText` predicate is equivalent to
  legacy user-custom provenance on every sanctioned creation/update path inspected.
  The wider-field concern in K5 is not reachable: no system or doctor-generated
  writer uses `customTitle`/`customText`. A hypothetical malformed row is not an
  owner-authorized product finding under the audit policy.
- Appointment lifecycle and broadcast copy use separate public builders and retain
  their full allowed content. System warm-up and doctor-generated lesson copy stay
  on the non-private branch.

Trace discovery began with these indexed searches before exact-file inspection:

```text
node /home/dev/brain/tools/code-search.mjs "reminder rule creation linkedObjectType custom customTitle customText provenance patient system doctor" --repo bcb -k 20
node /home/dev/brain/tools/code-search.mjs "materializePatientReminderDeliveries caller builds deliveries reminder scheduler" --repo bcb -k 20
node /home/dev/brain/tools/code-search.mjs "patient creates custom reminder create rule route linkedObjectType customTitle customText" --repo bcb -k 20
node /home/dev/brain/tools/code-search.mjs "read_patient_reminder_materialization_snapshot displayTitle customTitle linkedTitle jsonb_build_object" --repo bcb -k 20
node /home/dev/brain/tools/code-search.mjs "appointment broadcast full notification copy web push tests broadcastTitle appointment reminder" --repo bcb -k 20
```

## Acceptance coverage

The existing materializer test used an unreachable mixed-provenance fixture
(`content_section` plus custom fields) and asserted the pre-W17 leaked copy. It was
replaced with the cheapest public-boundary acceptance case and adjacent allowed-copy
checks:

| ID | Kill-set outcome | Evidence | Status |
| --- | --- | --- | --- |
| K1 | User title/text never leaves through any of the five channels | One custom-rule materialization asserts all five channel envelopes omit two private sentinels | KILLED |
| K2 | Neutral fact and working application link remain | Every external envelope must contain a neutral reminder signal and the exact application URL | KILLED |
| K3 | Appointment and broadcast remain complete | Exact public copy from both builders is asserted | KILLED |
| K4 | System lesson/warm-up remains complete | Canonical warm-up and linked doctor-generated lesson titles are asserted | KILLED |
| K5 | Privacy classification follows reachable provenance | Create/update/snapshot traces prove custom fields are exclusive to legacy user-custom rules | RESOLVED |

Unhandled independent classes are **0**. Measurement command (run against this
table):

```text
awk -F'|' '/^\| K[0-9]+ / && NF == 6 && $5 !~ /KILLED|RESOLVED/ { n++ } END { print n+0 }' docs/_TODO/runs/W17_REMINDER_PRIVACY_ACCEPTANCE_2026-09-02.md
# 0
```

## Fault injection

Each mutation below was temporary, the same targeted Vitest command was run in the
foreground, and the mutation was fully reverted before the next one.

| Class | Temporary production fault | Expected red result |
| --- | --- | --- |
| K1 | Feed `customTitle`/`customText` back into the external title/body | `1 failed, 7 passed`; the five-channel privacy test reports the private sentinel in the envelope |
| K2 | Replace the materialized application base URL with `https://broken.invalid` | `1 failed, 7 passed`; the exact working-link assertion fails |
| K3 appointment | Replace appointment-created body with a neutral generic body | `1 failed, 7 passed`; the complete appointment-copy assertion fails |
| K3 broadcast | Replace broadcast body with a neutral generic body | `1 failed, 7 passed`; the complete broadcast-copy assertion fails |
| K4 | Apply neutral private-reminder copy unconditionally to all reminder rules | `4 failed, 4 passed`; warm-up, resolved linked title, and doctor lesson assertions fail |
| K5 | No distinct reachable branch exists to mutate | Structurally resolved by creation/update/snapshot trace; manufacturing an invalid mixed-provenance row would test an unsanctioned state |

Product restoration check:

```text
git diff -- apps/webapp/src/modules/reminders/materializePatientReminderDeliveries.ts apps/webapp/src/modules/web-push/pushNotificationCopy.ts
# no output
```

## Commands and results

Baseline after `195b55011`, before acceptance-test repair:

```text
pnpm --dir apps/webapp exec vitest run src/modules/reminders/materializePatientReminderDeliveries.unit.test.ts
# Test Files  1 failed (1)
# Tests       2 failed | 4 passed (6)
```

Final targeted acceptance run after every temporary fault was restored:

```text
pnpm --dir apps/webapp exec vitest run src/modules/reminders/materializePatientReminderDeliveries.unit.test.ts
# Test Files  1 passed (1)
# Tests       8 passed (8)
```

Webapp typecheck was not run: this audit changed only a Vitest file and documentation;
the targeted runner successfully transformed and imported the changed TypeScript.
Full CI was outside this bounded audit and had no additional uncovered integration
risk after the public-boundary fault injections.
