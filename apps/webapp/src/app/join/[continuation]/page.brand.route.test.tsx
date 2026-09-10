/**
 * Чей логотип стоит над приглашением.
 *
 * Владелец 10.09: «он видит логотип терапии, логотип клиники». Бренд клиники приезжает в запрос от
 * ХОСТА, а приглашение принадлежит КОНКРЕТНОЙ клинике, и это не одно и то же: continuation можно
 * открыть на хосте чужой клиники. Без сверки человек увидел бы приглашение клиники A под логотипом
 * клиники B — ровно та подмена, ради которой брендированные хосты и заводились.
 *
 * ЧТО ЛОМАЕТСЯ БЕЗ ЭТОГО ФАЙЛА: чужой логотип над чужим приглашением; и обратная крайность — если
 * убрать бренд совсем, экран перестаёт быть узнаваемым, а владелец просил именно узнаваемость.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  readCookie: vi.fn(),
  resolvedSurface: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/principal/bootstrapPrincipal', () => ({
  stampBootstrapPrincipal: () => undefined,
}));
vi.mock('@/modules/patient-invites/continuationCookie', () => ({
  readPatientInviteContinuationCookie: fakes.readCookie,
}));
vi.mock('@/shared/lib/surface/requestSurface.server', () => ({
  getOptionalResolvedSurface: fakes.resolvedSurface,
}));
// Клиентский компонент здесь не проверяется — важно, ЧТО страница ему отдаёт, поэтому его хуки
// (роутер, состояние формы) не поднимаются: рендерится только та разметка, которая несёт бренд.
vi.mock('next/navigation', async () => ({
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND');
  }),
  useRouter: () => ({ replace: vi.fn() }),
}));

import JoinContinuationPage from './page';

const CONTINUATION = 'c'.repeat(43);
const INVITE_ORGANIZATION = '00000000-0000-4000-8000-0000000000a1';
const OTHER_ORGANIZATION = '00000000-0000-4000-8000-0000000000a2';
const CLINIC_LOGO = 'https://media.example.test/org-logo/berson.png';

function surfaceOf(organizationId: string) {
  return {
    surface: 'patient',
    publicOrigin: 'https://berson.example.test',
    organizationId,
    effectivePatientBrand: {
      effectiveDisplayName: 'Точка Здоровья',
      patientAppName: 'TherapyGo',
      accentToken: 'accent',
      logoUrl: CLINIC_LOGO,
    },
    authPolicy: {},
  };
}

async function render(): Promise<string> {
  const page = await JoinContinuationPage({ params: Promise.resolve({ continuation: CONTINUATION }) });
  return renderToStaticMarkup(page);
}

describe('экран приглашения — бренд', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.readCookie.mockResolvedValue(CONTINUATION);
    fakes.buildAppDeps.mockReturnValue({
      patientInvites: {
        lookupContinuation: vi.fn().mockResolvedValue({
          ok: true,
          organizationId: INVITE_ORGANIZATION,
          preview: {
            organizationTitle: 'Точка Здоровья',
            recipientHint: 'k***@gmail.com',
            inviteExpiresAt: '2026-09-18T00:00:00.000Z',
            recipientBinding: 'bound_email',
          },
        }),
      },
    });
  });

  it('на хосте своей клиники показывает её логотип и имя приложения', async () => {
    fakes.resolvedSurface.mockResolvedValue(surfaceOf(INVITE_ORGANIZATION));

    const html = await render();

    expect(html).toContain(CLINIC_LOGO);
    expect(html).toContain('TherapyGo');
    expect(html).toContain('Точка Здоровья');
  });

  it('на хосте ЧУЖОЙ клиники логотип не показывается — имя клиники остаётся из приглашения', async () => {
    fakes.resolvedSurface.mockResolvedValue(surfaceOf(OTHER_ORGANIZATION));

    const html = await render();

    expect(html).not.toContain(CLINIC_LOGO);
    expect(html).toContain('Точка Здоровья');
  });

  it('когда приглашение неизвестно, остаётся имя приложения — но не логотип клиники', async () => {
    // Кука продолжения не совпала (ссылку открыли в другом браузере или она протухла). Чьё это
    // приглашение, сказать нечем, поэтому логотип клиники хоста был бы утверждением на пустом
    // месте; имя приложения — это «логотип терапии», он про нас, а не про клинику.
    fakes.readCookie.mockResolvedValue('d'.repeat(43));
    fakes.resolvedSurface.mockResolvedValue(surfaceOf(INVITE_ORGANIZATION));

    const html = await render();

    expect(html).not.toContain(CLINIC_LOGO);
    expect(html).toContain('TherapyGo');
    expect(html).toContain('Ссылка недействительна');
  });

  it('без резолва поверхности экран остаётся рабочим, просто без бренда', async () => {
    fakes.resolvedSurface.mockResolvedValue(null);

    const html = await render();

    expect(html).not.toContain(CLINIC_LOGO);
    expect(html).toContain('Доступ к кабинету пациента');
  });
});
