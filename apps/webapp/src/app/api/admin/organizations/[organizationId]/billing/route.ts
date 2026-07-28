import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requirePlatformOperationsApiContext } from '@/app-layer/guards/requireRole';

const organizationIdSchema = z.string().uuid();

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  const gate = await requirePlatformOperationsApiContext();
  if (!gate.ok) return gate.response;

  const parsedOrganizationId = organizationIdSchema.safeParse((await params).organizationId);
  if (!parsedOrganizationId.success) {
    return NextResponse.json({ ok: false, error: 'invalid_organization_id' }, { status: 400 });
  }

  try {
    const billing = await buildAppDeps().saasBilling.getOrganizationBillingOverview(
      parsedOrganizationId.data,
    );
    return NextResponse.json({ ok: true, billing });
  } catch {
    return NextResponse.json({ ok: false, error: 'saas_billing_unavailable' }, { status: 500 });
  }
}
