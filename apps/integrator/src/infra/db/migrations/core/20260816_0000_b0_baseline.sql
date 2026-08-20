-- BCB-INTEGRATOR-LEDGER-BASELINE: B0
-- B0 is the accepted live DEV schema as of 2026-08-16. The integrator migration adapter resets its
-- own protected ledger after this harmless statement, then inserts this file as the sole marker.
SELECT 1;
