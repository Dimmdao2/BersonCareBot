import { describe, expect, it, vi, beforeEach } from 'vitest';

const requireAdminBookingEngineMock = vi.hoisted(() => vi.fn());
const listScheduleTemplatesMock = vi.hoisted(() => vi.fn());
const createScheduleTemplateMock = vi.hoisted(() => vi.fn());
const deleteScheduleTemplateMock = vi.hoisted(() => vi.fn());
const applyScheduleTemplateMock = vi.hoisted(() => vi.fn());
const principalState = vi.hoisted(() => ({ inside: false }));
const withDoctorWorkspacePrincipalMock = vi.hoisted(() =>
  vi.fn(
    async <T>(_workspace: { organizationId: string }, _source: string, fn: () => Promise<T>) => {
      principalState.inside = true;
      try {
        return await fn();
      } finally {
        principalState.inside = false;
      }
    },
  ),
);

vi.mock('../_requireAdminBookingEngine', () => ({
  requireAdminBookingEngine: requireAdminBookingEngineMock,
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    bookingScheduling: {
      listScheduleTemplates: listScheduleTemplatesMock,
      createScheduleTemplate: createScheduleTemplateMock,
      deleteScheduleTemplate: deleteScheduleTemplateMock,
      applyScheduleTemplate: applyScheduleTemplateMock,
    },
  }),
}));

vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withDoctorWorkspacePrincipal: withDoctorWorkspacePrincipalMock,
}));

import { GET, POST, DELETE } from './route';

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TMPL = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('/api/admin/booking-engine/working-schedule-templates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    principalState.inside = false;
  });

  describe('GET', () => {
    it('returns 401 when not authenticated', async () => {
      requireAdminBookingEngineMock.mockResolvedValue({
        ok: false,
        response: Response.json({ ok: false, error: 'unauthorized' }, { status: 401 }),
      });
      const res = await GET(
        new Request('http://localhost/api/admin/booking-engine/working-schedule-templates'),
      );
      expect(res.status).toBe(401);
    });

    it('returns rows', async () => {
      requireAdminBookingEngineMock.mockResolvedValue({ ok: true, ctx: { organizationId: ORG } });
      listScheduleTemplatesMock.mockResolvedValue([{ id: TMPL, name: 'Стандарт' }]);
      const res = await GET(
        new Request('http://localhost/api/admin/booking-engine/working-schedule-templates'),
      );
      const json = (await res.json()) as { ok: boolean; rows: unknown[] };
      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.rows).toHaveLength(1);
      expect(listScheduleTemplatesMock).toHaveBeenCalledWith(ORG);
      expect(withDoctorWorkspacePrincipalMock).not.toHaveBeenCalled();
    });
  });

  describe('POST (create)', () => {
    it('returns 401 when not authenticated', async () => {
      requireAdminBookingEngineMock.mockResolvedValue({
        ok: false,
        response: Response.json({ ok: false, error: 'unauthorized' }, { status: 401 }),
      });
      const res = await POST(
        new Request('http://localhost/api/admin/booking-engine/working-schedule-templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Test', startMinute: 540, endMinute: 1080 }),
        }),
      );
      expect(res.status).toBe(401);
    });

    it('creates a template', async () => {
      requireAdminBookingEngineMock.mockResolvedValue({ ok: true, ctx: { organizationId: ORG } });
      createScheduleTemplateMock.mockImplementation(async () => {
        expect(principalState.inside).toBe(true);
        return { id: TMPL, name: 'Стандарт' };
      });
      const res = await POST(
        new Request('http://localhost/api/admin/booking-engine/working-schedule-templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Стандарт', startMinute: 540, endMinute: 1080 }),
        }),
      );
      const json = (await res.json()) as { ok: boolean; row: { id: string } };
      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(createScheduleTemplateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: ORG,
          name: 'Стандарт',
          startMinute: 540,
          endMinute: 1080,
        }),
      );
      expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: ORG }),
        'admin.booking-engine.working-schedule-templates.create',
        expect.any(Function),
      );
    });

    it('rejects startMinute >= endMinute', async () => {
      requireAdminBookingEngineMock.mockResolvedValue({ ok: true, ctx: { organizationId: ORG } });
      const res = await POST(
        new Request('http://localhost/api/admin/booking-engine/working-schedule-templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Плохой', startMinute: 600, endMinute: 540 }),
        }),
      );
      expect(res.status).toBe(400);
      expect(createScheduleTemplateMock).not.toHaveBeenCalled();
    });

    it('rejects missing name', async () => {
      requireAdminBookingEngineMock.mockResolvedValue({ ok: true, ctx: { organizationId: ORG } });
      const res = await POST(
        new Request('http://localhost/api/admin/booking-engine/working-schedule-templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ startMinute: 540, endMinute: 1080 }),
        }),
      );
      expect(res.status).toBe(400);
    });
  });

  describe('POST (apply)', () => {
    it('applies template to dates', async () => {
      requireAdminBookingEngineMock.mockResolvedValue({ ok: true, ctx: { organizationId: ORG } });
      applyScheduleTemplateMock.mockImplementation(async () => {
        expect(principalState.inside).toBe(true);
        return [];
      });
      const res = await POST(
        new Request(
          'http://localhost/api/admin/booking-engine/working-schedule-templates?action=apply',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ templateId: TMPL, dates: ['2026-06-10', '2026-06-11'] }),
          },
        ),
      );
      const json = (await res.json()) as { ok: boolean };
      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(applyScheduleTemplateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: ORG,
          templateId: TMPL,
          dates: ['2026-06-10', '2026-06-11'],
        }),
      );
      expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: ORG }),
        'admin.booking-engine.working-schedule-templates.apply',
        expect.any(Function),
      );
    });

    it('returns 400 when templateId missing for apply', async () => {
      requireAdminBookingEngineMock.mockResolvedValue({ ok: true, ctx: { organizationId: ORG } });
      const res = await POST(
        new Request(
          'http://localhost/api/admin/booking-engine/working-schedule-templates?action=apply',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dates: ['2026-06-10'] }),
          },
        ),
      );
      expect(res.status).toBe(400);
      expect(applyScheduleTemplateMock).not.toHaveBeenCalled();
      expect(withDoctorWorkspacePrincipalMock).not.toHaveBeenCalled();
    });
  });

  describe('DELETE', () => {
    it('returns 400 when id missing', async () => {
      requireAdminBookingEngineMock.mockResolvedValue({ ok: true, ctx: { organizationId: ORG } });
      const res = await DELETE(
        new Request('http://localhost/api/admin/booking-engine/working-schedule-templates'),
      );
      expect(res.status).toBe(400);
    });

    it('deletes template by id', async () => {
      requireAdminBookingEngineMock.mockResolvedValue({ ok: true, ctx: { organizationId: ORG } });
      deleteScheduleTemplateMock.mockImplementation(async () => {
        expect(principalState.inside).toBe(true);
      });
      const res = await DELETE(
        new Request(
          `http://localhost/api/admin/booking-engine/working-schedule-templates?id=${TMPL}`,
        ),
      );
      const json = (await res.json()) as { ok: boolean };
      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(deleteScheduleTemplateMock).toHaveBeenCalledWith(TMPL, ORG);
      expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: ORG }),
        'admin.booking-engine.working-schedule-templates.delete',
        expect.any(Function),
      );
    });
  });
});
