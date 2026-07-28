import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { doctorRouteRedirectResponse } from '@/middleware/doctorRouteRedirects';

function req(path: string, headers?: Record<string, string>) {
  return new NextRequest(new URL(path, 'http://localhost'), headers ? { headers } : undefined);
}

describe('doctorRouteRedirectResponse — 308 redirects (old → new URLs)', () => {
  // ── Schedule legacy → /schedule?tab=cal|setup ─────────────────────────────

  it('redirects /app/doctor/calendar to schedule?tab=cal', () => {
    const res = doctorRouteRedirectResponse(req('/app/doctor/calendar'));
    expect(res?.status).toBe(308);
    expect(res?.headers.get('location')).toBe('http://localhost/app/doctor/schedule?tab=cal');
  });

  it('redirects /app/doctor/appointments to schedule?tab=cal', () => {
    const res = doctorRouteRedirectResponse(req('/app/doctor/appointments'));
    expect(res?.status).toBe(308);
    expect(res?.headers.get('location')).toBe('http://localhost/app/doctor/schedule?tab=cal');
  });

  it.each(['future', 'past'])(
    'redirects legacy /app/doctor/appointments?view=%s to the canonical calendar',
    (view) => {
      const res = doctorRouteRedirectResponse(req(`/app/doctor/appointments?view=${view}`));
      expect(res?.status).toBe(308);
      expect(res?.headers.get('location')).toBe('http://localhost/app/doctor/schedule?tab=cal');
    },
  );

  it('redirects /app/doctor/system-health directly to /app/admin/system-health (owner ruling 2026-07-26: final home, one hop)', () => {
    const res = doctorRouteRedirectResponse(req('/app/doctor/system-health'));
    expect(res?.status).toBe(308);
    expect(res?.headers.get('location')).toBe('http://localhost/app/admin/system-health');
  });

  it('redirects /app/doctor/health-archive directly to /app/admin/health-archive', () => {
    const res = doctorRouteRedirectResponse(req('/app/doctor/health-archive'));
    expect(res?.status).toBe(308);
    expect(res?.headers.get('location')).toBe('http://localhost/app/admin/health-archive');
  });

  it('redirects /app/doctor/audit-log directly to /app/admin/audit-log', () => {
    const res = doctorRouteRedirectResponse(req('/app/doctor/audit-log'));
    expect(res?.status).toBe(308);
    expect(res?.headers.get('location')).toBe('http://localhost/app/admin/audit-log');
  });

  it('redirects /app/doctor/commercial directly to /app/admin/commercial', () => {
    const res = doctorRouteRedirectResponse(req('/app/doctor/commercial'));
    expect(res?.status).toBe(308);
    expect(res?.headers.get('location')).toBe('http://localhost/app/admin/commercial');
  });

  it('redirects the whole admin/* subtree directly to the flattened /app/admin/* URLs (PLAT-01…09 slice 4 + owner ruling 2026-07-26 final home)', () => {
    const cases: ReadonlyArray<[string, string]> = [
      ['/app/doctor/admin/app-settings', '/app/admin/app-settings'],
      ['/app/doctor/admin/auth', '/app/admin/auth'],
      ['/app/doctor/admin/booking', '/app/admin/booking'],
      ['/app/doctor/admin/booking/catalog', '/app/admin/booking/catalog'],
      ['/app/doctor/admin/booking/form-public', '/app/admin/booking/form-public'],
      ['/app/doctor/admin/booking/payments', '/app/admin/booking/payments'],
      ['/app/doctor/admin/integrations', '/app/admin/integrations'],
      ['/app/doctor/admin/technical', '/app/admin/technical'],
    ];
    for (const [from, to] of cases) {
      const res = doctorRouteRedirectResponse(req(from));
      expect(res?.status, from).toBe(308);
      expect(res?.headers.get('location'), from).toBe(`http://localhost${to}`);
    }
  });

  it('used to deliberately NOT redirect /app/doctor/admin/booking — now safe, since the page moved (see comment above the entry in doctorRouteRedirects.ts)', () => {
    // Historical regression guard, updated for the 2026-07-26 admin rename. The base path used to
    // be excluded from this legacy map, which runs before any session is resolved, because the
    // global-admin page still lived at this exact URL (via the (global-admin) route group) and a
    // blanket 308 would have swallowed it for the one caller it was real for. The page has since
    // physically moved (now to /app/admin/booking), so nothing serves the old URL for anyone and
    // the redirect above is correct, not a regression of the original incident.
    const res = doctorRouteRedirectResponse(req('/app/doctor/admin/booking'));
    expect(res?.status).toBe(308);
    expect(res?.headers.get('location')).toBe('http://localhost/app/admin/booking');
  });

  it('redirects the retired /app/platform/* URLs to /app/admin/* (owner may still have them open/bookmarked from today)', () => {
    const cases: ReadonlyArray<[string, string]> = [
      ['/app/platform/system-health', '/app/admin/system-health'],
      ['/app/platform/health-archive', '/app/admin/health-archive'],
      ['/app/platform/audit-log', '/app/admin/audit-log'],
      ['/app/platform/commercial', '/app/admin/commercial'],
      ['/app/platform/admin/app-settings', '/app/admin/app-settings'],
      ['/app/platform/admin/auth', '/app/admin/auth'],
      ['/app/platform/admin/booking', '/app/admin/booking'],
      ['/app/platform/admin/booking/catalog', '/app/admin/booking/catalog'],
      ['/app/platform/admin/booking/form-public', '/app/admin/booking/form-public'],
      ['/app/platform/admin/booking/payments', '/app/admin/booking/payments'],
      ['/app/platform/admin/integrations', '/app/admin/integrations'],
      ['/app/platform/admin/technical', '/app/admin/technical'],
    ];
    for (const [from, to] of cases) {
      const res = doctorRouteRedirectResponse(req(from));
      expect(res?.status, from).toBe(308);
      expect(res?.headers.get('location'), from).toBe(`http://localhost${to}`);
    }
  });

  it('does not invent replacement targets for the permanently removed Rubitime integrations page', () => {
    // Rubitime retirement removed both the page and its final `/app/admin/booking/integrations`
    // target. These two stale bookmarks must therefore fall through to 404 instead of receiving
    // a misleading 308 to a different booking surface.
    expect(doctorRouteRedirectResponse(req('/app/doctor/admin/booking/integrations'))).toBeNull();
    expect(doctorRouteRedirectResponse(req('/app/platform/admin/booking/integrations'))).toBeNull();
  });

  // ── Communications legacy ─────────────────────────────────────────────────

  it('redirects /app/doctor/messages to communications?tab=chats', () => {
    const res = doctorRouteRedirectResponse(req('/app/doctor/messages'));
    expect(res?.status).toBe(308);
    expect(res?.headers.get('location')).toBe(
      'http://localhost/app/doctor/communications?tab=chats',
    );
  });

  it('redirects /app/doctor/online-intake to communications?tab=intake', () => {
    const res = doctorRouteRedirectResponse(req('/app/doctor/online-intake'));
    expect(res?.status).toBe(308);
    expect(res?.headers.get('location')).toBe(
      'http://localhost/app/doctor/communications?tab=intake',
    );
  });

  it('redirects /app/doctor/comments to communications?tab=comments', () => {
    const res = doctorRouteRedirectResponse(req('/app/doctor/comments'));
    expect(res?.status).toBe(308);
    expect(res?.headers.get('location')).toBe(
      'http://localhost/app/doctor/communications?tab=comments',
    );
  });

  it('redirects online-intake detail to communications?tab=intake&id=...', () => {
    const res = doctorRouteRedirectResponse(req('/app/doctor/online-intake/abc-123'));
    expect(res?.status).toBe(308);
    expect(res?.headers.get('location')).toBe(
      'http://localhost/app/doctor/communications?tab=intake&id=abc-123',
    );
  });

  it('redirects /app/doctor/broadcasts to communications?tab=broadcasts', () => {
    const res = doctorRouteRedirectResponse(req('/app/doctor/broadcasts'));
    expect(res?.status).toBe(308);
    expect(res?.headers.get('location')).toBe(
      'http://localhost/app/doctor/communications?tab=broadcasts',
    );
  });

  it('redirects /app/doctor/broadcasts/archive before /broadcasts (order matters)', () => {
    const res = doctorRouteRedirectResponse(req('/app/doctor/broadcasts/archive'));
    expect(res?.status).toBe(308);
    expect(res?.headers.get('location')).toBe(
      'http://localhost/app/doctor/communications?tab=broadcasts&archive=1',
    );
  });

  it('returns null for paths that need no redirect', () => {
    expect(doctorRouteRedirectResponse(req('/app/doctor'))).toBeNull();
    expect(doctorRouteRedirectResponse(req('/app/patient'))).toBeNull();
  });
});

describe('doctorRouteRedirectResponse — /clients/ → new /patients/ card (old card retired)', () => {
  it('redirects /app/doctor/clients (list) to /patients', () => {
    const res = doctorRouteRedirectResponse(req('/app/doctor/clients'));
    expect(res?.status).toBe(308);
    expect(res?.headers.get('location')).toBe('http://localhost/app/doctor/patients');
  });

  it('redirects /clients/:userId to /patients/:userId', () => {
    const res = doctorRouteRedirectResponse(req('/app/doctor/clients/user-123'));
    expect(res?.status).toBe(308);
    expect(res?.headers.get('location')).toBe('http://localhost/app/doctor/patients/user-123');
  });

  it('redirects /clients/:userId/treatment-programs/:instanceId to /patients/:userId/programs/:instanceId', () => {
    const res = doctorRouteRedirectResponse(
      req('/app/doctor/clients/user-123/treatment-programs/inst-9'),
    );
    expect(res?.status).toBe(308);
    expect(res?.headers.get('location')).toBe(
      'http://localhost/app/doctor/patients/user-123/programs/inst-9',
    );
  });

  it('preserves query (discussionItem) across the program redirect', () => {
    const res = doctorRouteRedirectResponse(
      req('/app/doctor/clients/u1/treatment-programs/i1?discussionItem=d1'),
    );
    expect(res?.status).toBe(308);
    expect(res?.headers.get('location')).toBe(
      'http://localhost/app/doctor/patients/u1/programs/i1?discussionItem=d1',
    );
  });

  it('does NOT redirect /clients/name-match-hints (admin tool, no /patients/ equivalent)', () => {
    expect(doctorRouteRedirectResponse(req('/app/doctor/clients/name-match-hints'))).toBeNull();
  });
});

describe('doctorRouteRedirectResponse — /app/doctor/schedule passes through (real page)', () => {
  // /app/doctor/schedule — настоящая страница-шелл (e12); rewrite убран.
  // 308-редиректы со старых URL сохранены выше; сам /schedule проходит насквозь.

  it('passes through /app/doctor/schedule (no tab) — null, not rewrite', () => {
    expect(doctorRouteRedirectResponse(req('/app/doctor/schedule'))).toBeNull();
  });

  it('passes through /app/doctor/schedule?tab=cal — null', () => {
    expect(doctorRouteRedirectResponse(req('/app/doctor/schedule?tab=cal'))).toBeNull();
  });

  it('passes through /app/doctor/schedule?tab=work — null', () => {
    expect(doctorRouteRedirectResponse(req('/app/doctor/schedule?tab=work'))).toBeNull();
  });

  it('passes through /app/doctor/schedule?tab=setup — null', () => {
    expect(doctorRouteRedirectResponse(req('/app/doctor/schedule?tab=setup'))).toBeNull();
  });
});

describe('doctorRouteRedirectResponse — communications passes through (no rewrite)', () => {
  // /app/doctor/communications — настоящая страница-шелл; rewrite убран в Block 5.
  // 308-редиректы со старых URL сохранены выше; сам /communications проходит насквозь.

  it('passes through /app/doctor/communications (no tab) — null, not rewrite', () => {
    expect(doctorRouteRedirectResponse(req('/app/doctor/communications'))).toBeNull();
  });

  it('passes through /app/doctor/communications?tab=chats — null', () => {
    expect(doctorRouteRedirectResponse(req('/app/doctor/communications?tab=chats'))).toBeNull();
  });

  it('passes through communications?tab=intake — null', () => {
    expect(doctorRouteRedirectResponse(req('/app/doctor/communications?tab=intake'))).toBeNull();
  });

  it('passes through communications?tab=intake&id=xyz — null', () => {
    expect(
      doctorRouteRedirectResponse(req('/app/doctor/communications?tab=intake&id=xyz-456')),
    ).toBeNull();
  });

  it('passes through communications?tab=comments — null', () => {
    expect(doctorRouteRedirectResponse(req('/app/doctor/communications?tab=comments'))).toBeNull();
  });

  it('passes through communications?tab=broadcasts — null', () => {
    expect(
      doctorRouteRedirectResponse(req('/app/doctor/communications?tab=broadcasts')),
    ).toBeNull();
  });

  it('passes through communications?tab=broadcasts&archive=1 — null', () => {
    expect(
      doctorRouteRedirectResponse(req('/app/doctor/communications?tab=broadcasts&archive=1')),
    ).toBeNull();
  });
});

describe('doctorRouteRedirectResponse — re-entry guard (loop prevention)', () => {
  // Маркер прокидывается proxy.ts при внутреннем rewrite.
  // На повторном входе вся логика пропускается — петли нет.
  it('returns null for /app/doctor/calendar when marker present', () => {
    const res = doctorRouteRedirectResponse(
      req('/app/doctor/calendar', { 'x-bc-doctor-rewrite': '1' }),
    );
    expect(res).toBeNull();
  });

  it('returns null for /app/doctor/messages when marker present', () => {
    const res = doctorRouteRedirectResponse(
      req('/app/doctor/messages', { 'x-bc-doctor-rewrite': '1' }),
    );
    expect(res).toBeNull();
  });

  it('returns null for /app/doctor/online-intake/abc when marker present', () => {
    const res = doctorRouteRedirectResponse(
      req('/app/doctor/online-intake/abc-123', { 'x-bc-doctor-rewrite': '1' }),
    );
    expect(res).toBeNull();
  });

  it('still redirects legacy URL when marker is absent (direct hit)', () => {
    const res = doctorRouteRedirectResponse(req('/app/doctor/calendar'));
    expect(res?.status).toBe(308);
  });
});
