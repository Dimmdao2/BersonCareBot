-- Trusted patient phone activation (PLATFORM_IDENTITY_ACCESS / Phase A).
-- Tier "patient" for role=client requires patient_phone_trust_at IS NOT NULL when phone_normalized is set.
-- Backfill: existing rows with phone are treated as already trusted (legacy compat, SPEC §12).

ALTER TABLE platform_users
  ADD COLUMN IF NOT EXISTS patient_phone_trust_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN platform_users.patient_phone_trust_at IS
  'Set only via trusted writers (OTP, integrator projections, OAuth-verified phone). Used for client patient-tier; not implied by phone_normalized alone.';

UPDATE platform_users
SET patient_phone_trust_at = COALESCE(updated_at, created_at)
WHERE phone_normalized IS NOT NULL
  AND trim(phone_normalized) <> ''
  AND patient_phone_trust_at IS NULL;
