/**
 * DELETE /api/doctor/clients/:userId/supplementary-contacts/:contactId
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { PlatformUserContactValidationError } from '@/modules/platform-user-contacts/types';

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ userId: string; contactId: string }> },
) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { userId, contactId } = await context.params;
  if (
    !z.string().uuid().safeParse(userId).success ||
    !z.string().uuid().safeParse(contactId).success
  ) {
    return NextResponse.json({ ok: false, error: 'invalid_params' }, { status: 400 });
  }

  const deps = buildAppDeps();
  const identity = await deps.doctorClientsPort.getClientIdentityForOrganization(
    userId,
    gate.ctx.organizationId,
    gate.ctx,
  );
  if (!identity) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  try {
    const deleted = await withDoctorWorkspacePrincipal(gate.ctx, () =>
      deps.platformUserContacts.deleteStaffManagedContact({
        id: contactId,
        platformUserId: userId,
      }),
    );
    if (!deleted) {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof PlatformUserContactValidationError && e.code === 'delete_not_allowed') {
      return NextResponse.json({ ok: false, error: 'delete_not_allowed' }, { status: 403 });
    }
    throw e;
  }
}
