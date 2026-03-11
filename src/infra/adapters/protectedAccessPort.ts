import { createHash, createHmac, randomUUID } from 'node:crypto';
import type { DbWritePort, IssuedContentAccess, ProtectedAccessPort } from '../../kernel/contracts/index.js';
import { env } from '../../config/env.js';

function normalizeBaseUrl(value: string): string | null {
  const trimmed = value.trim().replace(/\/+$/, '');
  return trimmed.length > 0 ? trimmed : null;
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function createProtectedAccessPort(input: {
  writePort: DbWritePort;
}): ProtectedAccessPort {
  return {
    async issueAccess(params): Promise<IssuedContentAccess | null> {
      const baseUrl = normalizeBaseUrl(env.CONTENT_SERVICE_BASE_URL);
      const secret = env.CONTENT_ACCESS_HMAC_SECRET.trim();
      if (!baseUrl || !secret) return null;

      const grantId = randomUUID();
      const expiresAt = new Date(Date.now() + params.ttlSeconds * 1000).toISOString();
      const claims = {
        grantId,
        userId: params.userId,
        contentId: params.contentId,
        purpose: params.purpose,
        expiresAt,
      };
      const payload = base64UrlEncode(JSON.stringify(claims));
      const signature = createHmac('sha256', secret).update(payload).digest('base64url');
      const token = `${payload}.${signature}`;

      await input.writePort.writeDb({
        type: 'content.access.grant.create',
        params: {
          id: grantId,
          userId: params.userId,
          contentId: params.contentId,
          purpose: params.purpose,
          expiresAt,
          tokenHash: sha256(token),
          metaJson: {
            transport: 'signed-url',
          },
        },
      });

      return {
        grantId,
        expiresAt,
        url: `${baseUrl}/protected/${encodeURIComponent(params.contentId)}?token=${encodeURIComponent(token)}`,
      };
    },
  };
}
