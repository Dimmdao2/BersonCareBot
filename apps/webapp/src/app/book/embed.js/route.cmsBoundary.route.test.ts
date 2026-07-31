import { describe, expect, it, vi } from 'vitest';

/**
 * Boundary proof for TARIFFS_PAYMENTS_ADMIN_PLAN.md §5a 4a.3: the embeddable booking widget
 * script must keep working when the owning organization has the `cms_pages` mechanic disabled —
 * CMS gates article editing/publishing, not the embeddable booking widget (`/book/embed.js`,
 * which the external site's script tag loads and points at `/book`).
 */
const fakes = vi.hoisted(() => ({ buildAppDeps: vi.fn() }));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));

import { GET } from './route';

describe('GET /book/embed.js — booking widget stays up with cms_pages disabled', () => {
  it('serves the embed script even for a clinic with no CMS entitlement', async () => {
    fakes.buildAppDeps.mockReturnValue({
      orgEntitlements: {
        resolveMechanicAccess: async () => ({
          mechanic: 'cms_pages',
          state: 'disabled',
          policySource: 'system',
          warning: null,
        }),
      },
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/javascript; charset=utf-8');
    const body = await response.text();
    expect(body).toContain('/book');
  });
});
