import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireEntitlementForRead } from '@/app-layer/guards/requireEntitlement';
import { requireClinicManagementApiContext } from '@/app-layer/guards/requireRole';
import { isSeatConsumingMember } from '@/modules/clinic-seats/service';

export async function GET() {
  const gate = await requireClinicManagementApiContext();
  if (!gate.ok) return gate.response;
  const entitlement = await requireEntitlementForRead(gate.ctx, 'clinic_team');
  if (!entitlement.ok) return entitlement.response;

  const deps = buildAppDeps();
  const [members, seats] = await Promise.all([
    deps.organizationMembership.listOrganizationMembers(gate.ctx.organizationId),
    deps.clinicSeats.getSeatStatus(gate.ctx.organizationId, gate.ctx.session.user.userId),
  ]);

  return NextResponse.json({
    ok: true,
    members: members.map((member) => ({
      id: member.id,
      displayName: member.displayName,
      role: member.role,
      status: member.status,
      canManageOrganization: member.role === 'owner' || member.role === 'admin',
      specialistLinked: member.specialistId !== null,
      seatConsuming: isSeatConsumingMember(member),
    })),
    seats,
  });
}
