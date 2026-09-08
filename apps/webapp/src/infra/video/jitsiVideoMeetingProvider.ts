import { SignJWT } from 'jose';
import type { VideoMeetingProvider } from '@/modules/video-meetings/ports';

type SettingsReader = {
  getSetting(key: 'jitsi_public_url' | 'jitsi_jwt_issuer' | 'jitsi_jwt_application_id' | 'jitsi_jwt_signing_secret', scope: 'admin', options?: { organizationId?: string | null }): Promise<{ valueJson: unknown } | null>;
};

function stringValue(valueJson: unknown): string | null {
  if (!valueJson || typeof valueJson !== 'object' || Array.isArray(valueJson)) return null;
  const value = (valueJson as Record<string, unknown>).value;
  return typeof value === 'string' && value.trim() !== '' && value !== 'absent' ? value.trim() : null;
}

async function config(settings: SettingsReader) {
  const [urlRow, issuerRow, appIdRow, secretRow] = await Promise.all([
    settings.getSetting('jitsi_public_url', 'admin', { organizationId: null }),
    settings.getSetting('jitsi_jwt_issuer', 'admin', { organizationId: null }),
    settings.getSetting('jitsi_jwt_application_id', 'admin', { organizationId: null }),
    settings.getSetting('jitsi_jwt_signing_secret', 'admin', { organizationId: null }),
  ]);
  const publicUrl = stringValue(urlRow?.valueJson);
  const issuer = stringValue(issuerRow?.valueJson);
  const appId = stringValue(appIdRow?.valueJson);
  const secret = stringValue(secretRow?.valueJson);
  if (!publicUrl || !issuer || !appId || !secret) return null;
  try {
    const origin = new URL(publicUrl);
    if (origin.protocol !== 'https:') return null;
    return { publicUrl: origin.toString().replace(/\/$/, ''), issuer, appId, secret };
  } catch {
    return null;
  }
}

/** The only Jitsi-aware adapter. Its opaque material is the provider-neutral service output. */
export function createJitsiVideoMeetingProvider(settings: SettingsReader): VideoMeetingProvider {
  return {
    async health() {
      return (await config(settings)) ? { ok: true as const } : { ok: false as const, reason: 'provider_unconfigured' as const };
    },
    async issueJoinMaterial({ meeting, role, subject }) {
      const configured = await config(settings);
      if (!configured) throw new Error('jitsi_provider_unconfigured');
      const expiresAt = new Date(Math.min(Date.now() + 10 * 60 * 1000, Date.parse(meeting.expiresAt)));
      const capability = await new SignJWT({
        context: { user: { id: subject, moderator: role === 'specialist' } },
        room: meeting.providerRoomRef,
      })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setIssuer(configured.issuer)
        // Jitsi's JWT contract reserves `sub` for the configured application id; the actual
        // app subject remains in the provider-specific `context.user.id` claim above.
        .setAudience('jitsi')
        .setSubject(configured.appId)
        .setIssuedAt()
        .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
        .sign(new TextEncoder().encode(configured.secret));
      return { provider: 'jitsi' as const, conferenceUrl: configured.publicUrl, capability, expiresAt: expiresAt.toISOString() };
    },
  };
}
