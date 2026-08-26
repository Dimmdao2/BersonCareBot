import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requirePlatformOperationsApiContext } from '@/app-layer/guards/requireRole';

const accountId = z.string().uuid();
const commandSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('revoke_contact'),
    userId: accountId,
    contactKind: z.enum(['phone', 'email']),
    valueNormalized: z.string().trim().min(1),
  }),
  z.object({
    action: z.literal('revoke_channel_binding'),
    userId: accountId,
    channelCode: z.enum(['telegram', 'max', 'vk']),
    externalId: z.string().trim().min(1),
  }),
  z.object({
    action: z.literal('set_blocked'),
    userId: accountId,
    blocked: z.boolean(),
    reason: z.string().trim().min(1).max(500).optional(),
  }),
]);

/**
 * D26 §5.8: global support can revoke a contact/binding and block or unblock either account.
 *
 * Track D synthesis 26.08: this used to run `getDrizzle()` DML directly at route level (AGENTS.md §5
 * violation) under the `app_platform_settings` principal, which holds no column grant on these three
 * tables — every call 42501'd, and `set_blocked` never bumped `session_epoch` even once the grant gap
 * was closed. One named door now handles all four action variants; see
 * `app.platform_support_account_action` (migration `20260826T140000_…`).
 */
export async function POST(request: Request) {
  const gate = await requirePlatformOperationsApiContext();
  if (!gate.ok) return gate.response;
  const parsed = commandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const command = parsed.data;
  const deps = buildAppDeps();
  if (command.action === 'revoke_contact') {
    await deps.doctorClientsPort.applyPlatformSupportAccountAction({
      action: 'revoke_contact',
      userId: command.userId,
      contactKind: command.contactKind,
      valueNormalized: command.valueNormalized,
    });
  } else if (command.action === 'revoke_channel_binding') {
    await deps.doctorClientsPort.applyPlatformSupportAccountAction({
      action: 'revoke_channel_binding',
      userId: command.userId,
      channelCode: command.channelCode,
      externalId: command.externalId,
    });
  } else {
    await deps.doctorClientsPort.applyPlatformSupportAccountAction({
      action: 'set_blocked',
      userId: command.userId,
      blocked: command.blocked,
      reason: command.blocked ? (command.reason ?? 'support') : null,
      actorId: gate.session.user.userId,
    });
  }
  return NextResponse.json({ ok: true });
}
