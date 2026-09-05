# Blind kill-set — prepayment settings fix (candidate 8278288f0)

Written from authority only (owner live report + brief), BEFORE reading the diff's tests.
Form: "given X -> system wrongly does/returns Y".

## Behavior A — staff doctor saves a prepayment policy

- K1. Doctor (staff principal) submits the policy -> mutation runs under an organization/tenant_service
  principal whose relation capability is not declared for the webapp port -> capability error -> HTTP 500,
  nothing persisted.
- K2. Save "succeeds" but row is written/updated under the wrong organization scope -> another clinic's
  policy is overwritten, or read-back for the doctor's own clinic returns empty.
- K3. Save returns 200 but GET of the same settings returns a different policy than the one submitted
  (write and read use different principals/scopes) -> doctor sees his change disappear.
- K10. The 500 is "fixed" by granting webapp/tenant_service access to be_prepayment_policies (or widening
  any role/capability) -> access surface broadened, forbidden by the tenant_service seam decision.
- K11. Switching the mutation to the staff principal breaks the non-staff caller of the same code path
  (public booking / patient-side read or write of the policy) -> that path now 500s or returns empty.
- K12. A principal without staff rights in that org (patient, other clinic's staff) reaches the save route
  and writes the policy -> cross-tenant write.

## Behavior B — money at the UI boundary (rubles) vs storage (integer minor units)

- K4. Doctor enters 500 (rubles); backend stores 500 -> amountMinor = 500 -> patient charged 5 rubles
  (100x under-charge).
- K5. A value already in minor units is multiplied again -> 500 rubles stored as 5 000 000 -> 100x
  over-charge.
- K6. Stored 50000 minor units is rendered into the form field verbatim -> doctor sees "50000" where he
  typed "500"; re-saving that screen then stores 5 000 000 (K5 by round-trip).
- K7. Fractional input ("500.50" / "500,50") -> non-integer or NaN amountMinor persisted -> DB write error
  or silently wrong charge.
- K8. Empty / non-numeric amount while prepayment is enabled -> NaN/0 persisted -> patient charged 0 or
  checkout crashes.
- K9. Prepayment turned off -> a stale non-zero amount stays effective and is still charged.

Kill-set is a question, not a task list (§10a): an uncaught fault becomes a report fact unless it passes
the stage-2 filter (expensive AND silent).
