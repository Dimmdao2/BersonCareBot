/** Global patient merge preview is intentionally unavailable in U1. */
import { NextResponse } from 'next/server';
import { requireAdminApiContext } from '@/app-layer/guards/requireRole';

export async function GET() {
  const adminGate = await requireAdminApiContext();
  if (!adminGate.ok) return adminGate.response;
  return NextResponse.json({ ok: false, error: 'not_available' }, { status: 404 });
}
