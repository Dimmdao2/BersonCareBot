/**
 * Чей логотип стоит над приглашением.
 *
 * Владелец 10.09: «он видит логотип терапии, логотип клиники»; 11.09 уточнил, чем случаи
 * различаются: «нет логотипа клиники, потому что небрендированная. Логотип терапии как раз есть».
 * Шапка показывает бренд ТОЙ ПОВЕРХНОСТИ, на которой человек стоит, — так же, как пациентский вход
 * (`TherapyGoLoginShell` против брендированного `PatientAppShell`).
 *
 * ЧТО ЛОМАЕТСЯ БЕЗ ЭТОГО ФАЙЛА: (1) чужой логотип над чужим приглашением — continuation можно
 * открыть на хосте другой клиники, и это ровно та подмена, ради которой брендированные хосты и
 * заводились; (2) безымянный экран на общем пациентском входе, куда уводит редирект с чужого
 * хоста; (3) исчезнувшее соглашение о пользовании — на брендированном хосте это единственное
 * место, где вообще названа платформа.
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

import { PATIENT_DEFAULT_SURFACE } from '@/config/productSurfaces';
import JoinContinuationPage from './page';

const CONTINUATION = 'c'.repeat(43);
const INVITE_ORGANIZATION = '00000000-0000-4000-8000-0000000000a1';
const OTHER_ORGANIZATION = '00000000-0000-4000-8000-0000000000a2';
const CLINIC_LOGO = 'https://media.example.test/org-logo/berson.png';
const PLATFORM_LOCKUP = 'therapygo-lockup-horizontal';

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
  const page = await JoinContinuationPage({
    params: Promise.resolve({ continuation: CONTINUATION }),
  });
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

  it('на хосте своей клиники показывает ЕЁ логотип, а не наш', async () => {
    fakes.resolvedSurface.mockResolvedValue(surfaceOf(INVITE_ORGANIZATION));

    const html = await render();

    expect(html).toContain(CLINIC_LOGO);
    expect(html).not.toContain(PLATFORM_LOCKUP);
    expect(html).toContain('Точка Здоровья');
  });

  it('на хосте ЧУЖОЙ клиники логотипа нет вовсе — имя клиники остаётся из приглашения', async () => {
    fakes.resolvedSurface.mockResolvedValue(surfaceOf(OTHER_ORGANIZATION));

    const html = await render();

    expect(html).not.toContain(CLINIC_LOGO);
    expect(html).not.toContain(PLATFORM_LOCKUP);
    expect(html).toContain('Точка Здоровья');
  });

  it('когда приглашение неизвестно, логотип клиники не ставится даже на её хосте', async () => {
    // Кука продолжения не совпала (ссылку открыли в другом браузере или она протухла). Чьё это
    // приглашение, сказать нечем, поэтому логотип хоста был бы утверждением на пустом месте.
    fakes.readCookie.mockResolvedValue('d'.repeat(43));
    fakes.resolvedSurface.mockResolvedValue(surfaceOf(INVITE_ORGANIZATION));

    const html = await render();

    expect(html).not.toContain(CLINIC_LOGO);
    expect(html).toContain('Ссылка недействительна');
    expect(html).toContain('/legal/terms');
  });

  it('на общем пациентском входе стоит логотип платформенного приложения', async () => {
    // Клиничного бренда тут нет по устройству поверхности, а безымянным экран быть не должен:
    // именно сюда уводит редирект с чужого хоста (`proxy.ts`).
    fakes.resolvedSurface.mockResolvedValue({
      ...surfaceOf(INVITE_ORGANIZATION),
      effectivePatientBrand: undefined,
    });

    const html = await render();

    expect(html).not.toContain(CLINIC_LOGO);
    expect(html).toContain(PLATFORM_LOCKUP);
    expect(html).toContain(PATIENT_DEFAULT_SURFACE.name);
  });

  it('соглашение и политика стоят на экране до входа — на любой поверхности', async () => {
    fakes.resolvedSurface.mockResolvedValue(surfaceOf(INVITE_ORGANIZATION));

    const html = await render();

    expect(html).toContain('/legal/terms');
    expect(html).toContain('/legal/privacy');
  });

  it('без резолва поверхности экран остаётся рабочим, просто без клиничного бренда', async () => {
    fakes.resolvedSurface.mockResolvedValue(null);

    const html = await render();

    expect(html).not.toContain(CLINIC_LOGO);
    expect(html).toContain('Доступ к кабинету пациента');
  });
});
