/**
 * GET/POST /api/doctor/clients/:userId/supplementary-contacts — доп. контакты для карточки врача.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  requireDoctorWorkspaceApiContext,
  type DoctorWorkspaceAccessContext,
} from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { toDoctorSupplementaryContacts } from '@/modules/platform-user-contacts/bookingContactUpsert';
import {
  PLATFORM_USER_CONTACT_TYPES,
  PlatformUserContactValidationError,
} from '@/modules/platform-user-contacts/types';

const postBodySchema = z.object({
  contactType: z.enum(PLATFORM_USER_CONTACT_TYPES),
  value: z.string().min(1).max(500),
});

function contactSourceForSession(session: DoctorWorkspaceAccessContext['session']) {
  return session.user.role === 'admin' ? ('admin' as const) : ('doctor' as const);
}

export async function GET(_request: Request, context: { params: Promise<{ userId: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { userId } = await context.params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_user' }, { status: 400 });
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

  const rows = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    deps.platformUserContacts.listForPlatformUser(userId),
  );
  const contacts = toDoctorSupplementaryContacts(rows, {
    phone: identity.phone,
    email: identity.email ?? null,
  });
  return NextResponse.json({ ok: true, contacts });
}

export async function POST(request: Request, context: { params: Promise<{ userId: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;
  const { session } = gate.ctx;

  const { userId } = await context.params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_user' }, { status: 400 });
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = postBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
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
    const contact = await withDoctorWorkspacePrincipal(gate.ctx, () =>
      deps.platformUserContacts.upsertIfNotIdentityDuplicate(
        {
          platformUserId: userId,
          contactType: parsed.data.contactType,
          value: parsed.data.value,
          source: contactSourceForSession(session),
        },
        { phone: identity.phone, email: identity.email ?? null },
      ),
    );
    return NextResponse.json({
      ok: true,
      contact: {
        id: contact.id,
        contactType: contact.contactType,
        value: contact.value,
        source: contact.source,
      },
    });
  } catch (e) {
    if (e instanceof PlatformUserContactValidationError) {
      return NextResponse.json({ ok: false, error: e.code }, { status: 400 });
    }
    throw e;
  }
}
