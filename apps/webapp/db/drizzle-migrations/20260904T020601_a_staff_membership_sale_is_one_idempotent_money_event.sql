-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT (SELECT count(*) = 1 FROM pg_catalog.pg_indexes WHERE schemaname = 'public' AND indexname = 'uq_be_patient_packages_sale_idempotency') AND (SELECT count(*) = 1 FROM pg_catalog.pg_indexes WHERE schemaname = 'public' AND indexname = 'uq_patient_payment_package_idempotency') AND (SELECT count(*) = 1 FROM pg_catalog.pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_patient_payment_patient_package_id')
--
-- Owner requirement (docs/_TODO/DOCTOR_MOBILE_UI_OWNER_ACCEPTANCE_2026-09-04.md §K, MONEY-04 and
-- MONEY-11): «Наличная оплата использует существующий server-authorized cash contract», and the
-- independent audit of `c86e6a4c1` found the staff membership sale had neither an idempotency key
-- nor a uniqueness boundary — a retried POST created a second active package, each stamped with the
-- full paid amount.
--
-- Two facts the schema cannot state today, and both are money facts:
--
--   1. Which staff sale attempt a patient package came from. Without it, "did this POST already
--      run" is only answerable by guessing from org + patient + price + day, which merges two
--      genuine same-day sales of the same catalog template into one.
--   2. Which package a cash ledger row settles. `patient_payment` can already point at an
--      appointment; a membership sale has no appointment, so today its cash cannot be written into
--      the canonical ledger at all — the KPI «Наличные» and the payment timeline read
--      `patient_payment`, so a package sold «Наличными» left the cash tile unchanged.
--
-- The existing `uq_patient_payment_appointment_idempotency` cannot carry (2): its key includes
-- `appointment_id`, which is NULL for a package sale, and NULLs are distinct in a unique index, so
-- it constrains nothing for these rows. The package-scoped index below is the boundary that makes
-- the retry of a package cash write converge.
ALTER TABLE public.be_patient_packages
  ADD COLUMN sale_idempotency_key text;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
-- The sale key is issued per sale attempt by the caller and scoped to the clinic that owns the
-- package, so one clinic's key can never collide with another's. Partial: patient self-purchase and
-- every historical row carry no key and stay unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS uq_be_patient_packages_sale_idempotency
  ON public.be_patient_packages (organization_id, sale_idempotency_key)
  WHERE (sale_idempotency_key IS NOT NULL);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
-- The package this cash row settles. Nullable and ON DELETE SET NULL for the same reason
-- `appointment_id` is: removing the thing that was paid for must not erase the money that was
-- collected for it.
ALTER TABLE public.patient_payment
  ADD COLUMN patient_package_id uuid;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.patient_payment
  ADD CONSTRAINT patient_payment_patient_package_id_fkey
    FOREIGN KEY (patient_package_id) REFERENCES public.be_patient_packages(id) ON DELETE SET NULL;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
-- Read path: "what was paid for this package", newest first — same composite shape as the existing
-- per-appointment and per-patient ledger indexes.
CREATE INDEX IF NOT EXISTS idx_patient_payment_patient_package_id
  ON public.patient_payment (patient_package_id, created_at DESC);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
-- The idempotency boundary for a package cash write. Both key columns are in the partial predicate
-- so no NULL ever enters the key and the index actually binds.
CREATE UNIQUE INDEX IF NOT EXISTS uq_patient_payment_package_idempotency
  ON public.patient_payment (organization_id, patient_package_id, idempotency_key)
  WHERE (patient_package_id IS NOT NULL AND idempotency_key IS NOT NULL);
