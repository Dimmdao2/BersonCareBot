# Blind kill-set — TherapyGo one-word correction audit

Candidate: `bc221c4a2` (`fix(mobile): spell TherapyGo as one word #915`).

Authority read before test inspection: `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md` M1/M2/M7, including the owner clarification dated 2026-09-09: the product name is one word with a capital `G`.

1. The default patient identity and patient PWA manifest resolve to exactly `TherapyGo`; no active default path emits `Therapy Go`.
2. The TherapyGo TEST and production APKs expose label/title `TherapyGo`; the two Therapysto variants remain `Therapysto`.
3. A clinic-branded patient surface retains its configured name and icons and is not replaced by the default; platform-admin remains non-installable.
4. Application/package IDs, flavor names, routes, hosts, `therapygo` push-surface values, asset filenames, and deep-link ownership are unchanged.

Classification: items 1–3 contain repeatable public behavior and require existing behavior tests plus one fault injection per independent class. Item 4 is a one-time exact-diff/resource inspection.
