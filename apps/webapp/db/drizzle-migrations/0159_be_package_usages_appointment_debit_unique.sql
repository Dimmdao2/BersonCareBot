-- 0159: prevent repeat debits for one booking appointment.
-- One appointment may have reserve/release/refund ledger rows, but only one debit row:
-- consume, penalty, or manual_adjust. This extends the older consume-only guard so repeated
-- late-cancel penalty or manual adjustment paths cannot reduce the package balance twice.

CREATE UNIQUE INDEX IF NOT EXISTS idx_be_package_usages_appointment_debit_unique
  ON be_package_usages (appointment_id)
  WHERE appointment_id IS NOT NULL
    AND usage_kind = ANY (ARRAY['consume'::text, 'penalty'::text, 'manual_adjust'::text]);
