-- Stage 4: cancellation/reschedule policies + append-only history

CREATE TABLE IF NOT EXISTS be_cancellation_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES be_organizations(id) ON DELETE CASCADE,
  scope_level text NOT NULL,
  scope_entity_id uuid,
  title text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  free_cancel_hours_before integer NOT NULL DEFAULT 72,
  cancellation_allowed boolean NOT NULL DEFAULT true,
  late_cancellation_behavior text NOT NULL DEFAULT 'manual_review',
  refund_prepayment_on_late text NOT NULL DEFAULT 'manual',
  charge_package_session_on_late boolean NOT NULL DEFAULT false,
  requires_staff_confirmation boolean NOT NULL DEFAULT false,
  notify_patient boolean NOT NULL DEFAULT true,
  notify_staff boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT be_cancel_policies_scope_check CHECK (
    scope_level = ANY (ARRAY['organization'::text, 'specialist'::text, 'service'::text, 'product'::text])
  ),
  CONSTRAINT be_cancel_policies_late_behavior_check CHECK (
    late_cancellation_behavior = ANY (ARRAY[
      'penalty'::text, 'manual_review'::text, 'charge_package'::text,
      'retain_prepayment'::text, 'refund_prepayment'::text
    ])
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_be_cancel_policies_scope
  ON be_cancellation_policies (organization_id, scope_level, COALESCE(scope_entity_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX IF NOT EXISTS idx_be_cancel_policies_org ON be_cancellation_policies (organization_id);

CREATE TABLE IF NOT EXISTS be_reschedule_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES be_organizations(id) ON DELETE CASCADE,
  scope_level text NOT NULL,
  scope_entity_id uuid,
  title text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  self_reschedule_hours_before integer NOT NULL DEFAULT 48,
  max_self_reschedules integer NOT NULL DEFAULT 1,
  allow_different_branch boolean NOT NULL DEFAULT false,
  allow_different_city boolean NOT NULL DEFAULT false,
  allow_different_specialist boolean NOT NULL DEFAULT false,
  allow_different_service boolean NOT NULL DEFAULT false,
  limit_exceeded_behavior text NOT NULL DEFAULT 'manual_request',
  requires_staff_confirmation boolean NOT NULL DEFAULT false,
  notify_patient boolean NOT NULL DEFAULT true,
  notify_staff boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT be_reschedule_policies_scope_check CHECK (
    scope_level = ANY (ARRAY['organization'::text, 'specialist'::text, 'service'::text, 'product'::text])
  ),
  CONSTRAINT be_reschedule_policies_limit_check CHECK (
    limit_exceeded_behavior = ANY (ARRAY['manual_request'::text, 'deny'::text])
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_be_reschedule_policies_scope
  ON be_reschedule_policies (organization_id, scope_level, COALESCE(scope_entity_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX IF NOT EXISTS idx_be_reschedule_policies_org ON be_reschedule_policies (organization_id);

CREATE TABLE IF NOT EXISTS be_appointment_reschedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES be_organizations(id) ON DELETE CASCADE,
  appointment_id uuid NOT NULL REFERENCES be_appointments(id) ON DELETE CASCADE,
  from_start_at timestamptz NOT NULL,
  from_end_at timestamptz NOT NULL,
  to_start_at timestamptz NOT NULL,
  to_end_at timestamptz NOT NULL,
  actor_type text NOT NULL,
  actor_id uuid REFERENCES platform_users(id) ON DELETE SET NULL,
  was_in_free_reschedule_window boolean NOT NULL,
  free_cancellation_available_at_reschedule boolean NOT NULL,
  free_cancellation_available_after boolean NOT NULL,
  applied_policy_id uuid REFERENCES be_reschedule_policies(id) ON DELETE SET NULL,
  applied_policy_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text,
  staff_comment text,
  notifications_sent jsonb NOT NULL DEFAULT '{}'::jsonb,
  manual_override boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT be_appt_reschedules_actor_check CHECK (
    actor_type = ANY (ARRAY['patient'::text, 'specialist'::text, 'admin'::text, 'system'::text])
  )
);

CREATE INDEX IF NOT EXISTS idx_be_appt_reschedules_appt ON be_appointment_reschedules (appointment_id, created_at DESC);

CREATE TABLE IF NOT EXISTS be_appointment_cancellations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES be_organizations(id) ON DELETE CASCADE,
  appointment_id uuid NOT NULL REFERENCES be_appointments(id) ON DELETE CASCADE,
  actor_type text NOT NULL,
  actor_id uuid REFERENCES platform_users(id) ON DELETE SET NULL,
  cancellation_type text NOT NULL,
  reason text,
  was_free boolean NOT NULL,
  was_penalized boolean NOT NULL,
  package_session_charged boolean NOT NULL,
  prepayment_retained boolean NOT NULL,
  prepayment_refunded boolean NOT NULL,
  staff_comment text,
  notifications_sent jsonb NOT NULL DEFAULT '{}'::jsonb,
  manual_override boolean NOT NULL DEFAULT false,
  applied_policy_id uuid REFERENCES be_cancellation_policies(id) ON DELETE SET NULL,
  applied_policy_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT be_appt_cancellations_actor_check CHECK (
    actor_type = ANY (ARRAY['patient'::text, 'specialist'::text, 'admin'::text, 'system'::text])
  ),
  CONSTRAINT be_appt_cancellations_type_check CHECK (
    cancellation_type = ANY (ARRAY[
      'free'::text, 'penalized'::text, 'package_charged'::text, 'no_package_charge'::text,
      'retain_prepayment'::text, 'refund_prepayment'::text, 'custom'::text
    ])
  )
);

CREATE INDEX IF NOT EXISTS idx_be_appt_cancellations_appt ON be_appointment_cancellations (appointment_id, created_at DESC);

-- Default org-level policies for seeded tenant
INSERT INTO be_cancellation_policies (
  organization_id, scope_level, scope_entity_id, title,
  free_cancel_hours_before, cancellation_allowed, late_cancellation_behavior
)
SELECT
  o.id,
  'organization',
  o.id,
  'По умолчанию (клиника)',
  72,
  true,
  'manual_review'
FROM be_organizations o
WHERE o.id = 'a0000000-0000-4000-8000-000000000001'::uuid
  AND NOT EXISTS (
    SELECT 1 FROM be_cancellation_policies p
    WHERE p.organization_id = o.id AND p.scope_level = 'organization' AND p.scope_entity_id = o.id
  );

INSERT INTO be_reschedule_policies (
  organization_id, scope_level, scope_entity_id, title,
  self_reschedule_hours_before, max_self_reschedules
)
SELECT
  o.id,
  'organization',
  o.id,
  'По умолчанию (клиника)',
  48,
  1
FROM be_organizations o
WHERE o.id = 'a0000000-0000-4000-8000-000000000001'::uuid
  AND NOT EXISTS (
    SELECT 1 FROM be_reschedule_policies p
    WHERE p.organization_id = o.id AND p.scope_level = 'organization' AND p.scope_entity_id = o.id
  );
