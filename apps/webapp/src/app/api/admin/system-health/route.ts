import { NextResponse } from 'next/server';
import { requirePlatformOperationsApiContext } from '@/app-layer/guards/requireRole';
import { collectAdminSystemHealthData } from '@/app-layer/health/collectAdminSystemHealthData';
import { requireAdminModeSession } from '@/modules/auth/requireAdminMode';

export async function GET() {
  const gate = await requireAdminModeSession();
  if (!gate.ok) return gate.response;
  const platformGate = await requirePlatformOperationsApiContext();
  if (!platformGate.ok) return platformGate.response;

  const response = await collectAdminSystemHealthData();
  return NextResponse.json(response);
}
