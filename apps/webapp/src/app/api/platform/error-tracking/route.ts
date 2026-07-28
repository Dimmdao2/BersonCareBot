import { NextResponse } from 'next/server';
import { z } from 'zod';

import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requirePlatformOperationsApiContext } from '@/app-layer/guards/requireRole';
import {
  normalizeErrorTrackingDsn,
  parseStoredBoolean,
  parseStoredString,
} from '@/modules/system-settings/errorTrackingConfig';

const putSchema = z.object({
  enabled: z.boolean(),
  dsn: z.string().max(2_048),
});

export async function GET() {
  const gate = await requirePlatformOperationsApiContext();
  if (!gate.ok) return gate.response;
  const settings = await buildAppDeps().systemSettings.listSettingsByScope('admin', {
    organizationId: null,
  });
  const enabled = parseStoredBoolean(
    settings.find((row) => row.key === 'error_tracking_enabled')?.valueJson,
  );
  const dsn = parseStoredString(
    settings.find((row) => row.key === 'error_tracking_dsn')?.valueJson,
  );
  return NextResponse.json({ ok: true, config: { enabled, hasStoredDsn: dsn.length > 0 } });
}

export async function PUT(request: Request) {
  const gate = await requirePlatformOperationsApiContext();
  if (!gate.ok) return gate.response;
  const parsed = putSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }
  const dsn = normalizeErrorTrackingDsn(parsed.data.dsn);
  if (parsed.data.enabled && dsn === null) {
    return NextResponse.json({ ok: false, error: 'invalid_dsn' }, { status: 400 });
  }
  const normalizedDsn = parsed.data.enabled ? dsn! : '';
  await buildAppDeps().systemSettings.persistErrorTrackingConfig(
    { enabled: parsed.data.enabled, dsn: normalizedDsn },
    gate.session.user.userId,
  );
  return NextResponse.json({
    ok: true,
    config: { enabled: parsed.data.enabled, hasStoredDsn: normalizedDsn.length > 0 },
  });
}
