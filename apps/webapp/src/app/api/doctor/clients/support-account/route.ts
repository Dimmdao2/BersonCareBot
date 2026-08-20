import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { requirePlatformOperationsApiContext } from '@/app-layer/guards/requireRole';
import { platformUsers, userChannelBindings, userContacts } from '../../../../../../db/schema/schema';

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

/** D26 §5.8: global support can revoke a contact/binding and block or unblock either account. */
export async function POST(request: Request) {
  const gate = await requirePlatformOperationsApiContext();
  if (!gate.ok) return gate.response;
  const parsed = commandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const command = parsed.data;
  const db = getDrizzle();
  if (command.action === 'revoke_contact') {
    await db
      .delete(userContacts)
      .where(
        and(
          eq(userContacts.platformUserId, command.userId),
          eq(userContacts.contactKind, command.contactKind),
          eq(userContacts.valueNormalized, command.valueNormalized),
        ),
      );
  } else if (command.action === 'revoke_channel_binding') {
    await db
      .delete(userChannelBindings)
      .where(
        and(
          eq(userChannelBindings.userId, command.userId),
          eq(userChannelBindings.channelCode, command.channelCode),
          eq(userChannelBindings.externalId, command.externalId),
        ),
      );
  } else {
    await db
      .update(platformUsers)
      .set({
        isBlocked: command.blocked,
        blockedAt: command.blocked ? new Date().toISOString() : null,
        blockedReason: command.blocked ? (command.reason ?? 'support') : null,
        blockedBy: command.blocked ? gate.session.user.userId : null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(platformUsers.id, command.userId));
  }
  return NextResponse.json({ ok: true });
}
