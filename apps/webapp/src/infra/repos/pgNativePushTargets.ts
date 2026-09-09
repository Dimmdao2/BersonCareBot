import { and, eq, isNull } from 'drizzle-orm';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { nativePushTargets } from '../../../db/schema/nativePushTargets';
import type { NativePushAppId, NativePushProvider, NativePushTargetLifecyclePort, NativePushTokenCipher } from '@/modules/web-push/ports';
import { nativePushHash } from '@/modules/web-push/nativePush';

export function createPgNativePushTargetsPort(cipher: NativePushTokenCipher): NativePushTargetLifecyclePort {
  const db = getDrizzle();
  return {
    async register(input: { userId: string; appId: NativePushAppId; provider: NativePushProvider; installationId: string; token: string }) {
      const installationIdHash = nativePushHash(input.installationId); const tokenHash = nativePushHash(input.token); const context = { userId: input.userId, appId: input.appId, provider: input.provider, installationIdHash }; const encrypted = cipher.encrypt(input.token, context);
      const existing = await db.select({ userId: nativePushTargets.userId }).from(nativePushTargets).where(and(eq(nativePushTargets.appId, input.appId), eq(nativePushTargets.provider, input.provider), eq(nativePushTargets.installationIdHash, installationIdHash))).limit(1);
      if (existing[0] && existing[0].userId !== input.userId) throw new Error('native_push_installation_conflict');
      await db.insert(nativePushTargets).values({ userId: input.userId, appId: input.appId, provider: input.provider, installationIdHash, tokenHash, tokenCiphertext: encrypted.ciphertext, tokenKeyId: encrypted.keyId }).onConflictDoUpdate({ target: [nativePushTargets.appId, nativePushTargets.provider, nativePushTargets.installationIdHash], set: { tokenHash, tokenCiphertext: encrypted.ciphertext, tokenKeyId: encrypted.keyId, deactivatedAt: null, updatedAt: new Date().toISOString() } });
    },
    async revoke(userId: string, appId: NativePushAppId, provider: NativePushProvider, installationId: string) { await db.update(nativePushTargets).set({ deactivatedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }).where(and(eq(nativePushTargets.userId, userId), eq(nativePushTargets.appId, appId), eq(nativePushTargets.provider, provider), eq(nativePushTargets.installationIdHash, nativePushHash(installationId)), isNull(nativePushTargets.deactivatedAt))); },
    async listActive(userId: string, appId: NativePushAppId) { const rows = await db.select().from(nativePushTargets).where(and(eq(nativePushTargets.userId, userId), eq(nativePushTargets.appId, appId), isNull(nativePushTargets.deactivatedAt))); return rows.map((r) => ({ id: r.id, appId: r.appId as NativePushAppId, provider: r.provider as NativePushProvider, token: cipher.decrypt(r.tokenCiphertext, r.tokenKeyId, { userId: r.userId, appId: r.appId as NativePushAppId, provider: r.provider as NativePushProvider, installationIdHash: r.installationIdHash }) })); },
    async deactivateById(targetId: string) { await db.update(nativePushTargets).set({ deactivatedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }).where(and(eq(nativePushTargets.id, targetId), isNull(nativePushTargets.deactivatedAt))); },
    async activeOwnerId(targetId: string): Promise<string | null> { const rows = await db.select({ userId: nativePushTargets.userId }).from(nativePushTargets).where(and(eq(nativePushTargets.id, targetId), isNull(nativePushTargets.deactivatedAt))).limit(1); return rows[0]?.userId ?? null; },
    async activeTarget(targetId: string) { const rows = await db.select({ userId: nativePushTargets.userId, appId: nativePushTargets.appId }).from(nativePushTargets).where(and(eq(nativePushTargets.id, targetId), isNull(nativePushTargets.deactivatedAt))).limit(1); return rows[0] ? { userId: rows[0].userId, appId: rows[0].appId as NativePushAppId } : null; },
    async status(userId: string, appId: NativePushAppId) { const rows = await db.select({ provider: nativePushTargets.provider, active: nativePushTargets.deactivatedAt }).from(nativePushTargets).where(and(eq(nativePushTargets.userId, userId), eq(nativePushTargets.appId, appId))); return { active: rows.some((r) => r.active === null), providers: rows.filter((r) => r.active === null).map((r) => r.provider as NativePushProvider) }; },
  };
}
