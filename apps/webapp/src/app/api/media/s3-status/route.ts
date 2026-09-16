import { NextResponse } from 'next/server';
import { env, isS3MediaEnabled } from '@/config/env';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';

/** Authenticated CMS capability: whether direct-to-S3 multipart is available. */
export async function GET() {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  return NextResponse.json({
    ok: true as const,
    s3Multipart: isS3MediaEnabled(env),
  });
}
