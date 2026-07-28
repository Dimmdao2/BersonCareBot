/**
 * Authoritative current clinic-seat usage.  Keep this expression shared with the invite
 * capacity check: active specialists consume seats, as do live pending doctor invites and
 * accepted doctor invites awaiting specialist provisioning. `excludedPendingInviteEmail` is
 * used only while replacing a pending invite for that same email.
 */
export const CLINIC_SEAT_USAGE_SQL = `
  (
    (SELECT COUNT(*) FROM be_organization_members m
     WHERE m.organization_id = $1 AND m.status = 'active' AND m.specialist_id IS NOT NULL)
    +
    (SELECT COUNT(*) FROM organization_member_invites i
     WHERE i.organization_id = $1 AND i.status = 'pending' AND i.expires_at > now()
       AND i.invited_role = 'doctor' AND ($2::text IS NULL OR i.invited_email <> $2))
    +
    (SELECT COUNT(*) FROM organization_member_invites i
     JOIN be_organization_members m ON m.id = i.accepted_membership_id
     WHERE i.organization_id = $1 AND i.status = 'accepted' AND i.invited_role = 'doctor'
       AND m.status = 'active' AND m.specialist_id IS NULL)
  )::int
`;
