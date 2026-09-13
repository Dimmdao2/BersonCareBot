import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  redirect: vi.fn(),
  loadStaffAccountPageContext: vi.fn(),
  buildDoctorWorkspaceShellData: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: fakes.redirect }));
vi.mock('./accountContext', () => ({ loadStaffAccountPageContext: fakes.loadStaffAccountPageContext }));
vi.mock('../doctor/loadDoctorWorkspaceShell', () => ({
  buildDoctorWorkspaceShellData: fakes.buildDoctorWorkspaceShellData,
}));
vi.mock('@/app-layer/logging/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/shared/ui/doctor/shell/DoctorWorkspaceShell', () => ({
  DoctorWorkspaceShell: ({ children }: { children: ReactNode }) => children,
}));

const WORKSPACE_ACCESS = { organizationId: 'org-1', capabilities: ['clinical.workspace'] };
const SPECIALIST = {
  session: { user: { role: 'doctor', displayName: 'Врач' } },
  workspaceContext: { organizationId: 'org-1', canManageOrganization: false },
  workspaceAccess: WORKSPACE_ACCESS,
};

import AccountLayout from './layout';

describe('/app/account platform-admin boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.redirect.mockImplementation((destination: string) => {
      throw new Error(`redirect:${destination}`);
    });
  });

  it('redirects platform-admin before any account tab can render', async () => {
    fakes.loadStaffAccountPageContext.mockResolvedValue({ session: { user: { role: 'admin' } } });

    await expect(AccountLayout({ children: null })).rejects.toThrow('redirect:/app/admin');
    expect(fakes.redirect).toHaveBeenCalledWith('/app/admin');
  });
});

/**
 * Владелец 14.09.2026: «выбирая в меню настройку учетки соло специалист перестает видеть кучу
 * пунктов меню». Меню считается по данным оболочки — значит страница учётки обязана брать их из
 * ОБЩЕЙ сборки, а не собирать свою урезанную.
 */
describe('меню учётки — то же, что и в остальном кабинете', () => {
  it('дано: у специалиста есть организация → когда рендер → тогда оболочка получает тариф, модули и термины из общей сборки', async () => {
    fakes.loadStaffAccountPageContext.mockResolvedValue(SPECIALIST);
    fakes.buildDoctorWorkspaceShellData.mockResolvedValue({
      workspaceContext: { organizationId: 'org-1', canManageOrganization: false },
      workspaceComposition: 'solo',
      patientLabel: 'клиент',
      supportGroupLabel: 'on_support',
      appointmentLabel: 'приём',
      coursesEnabled: true,
      promoEnabled: false,
      cmsEnabled: true,
      patientHomeTodayEnabled: true,
      specialistTasksEnabled: true,
      shellBrand: { displayName: 'Точка Здоровья', logoUrl: null },
    });

    const shell = (await AccountLayout({ children: null })) as { props: Record<string, unknown> };

    expect(fakes.buildDoctorWorkspaceShellData).toHaveBeenCalledWith(WORKSPACE_ACCESS);
    expect(shell.props).toMatchObject({
      patientLabel: 'клиент',
      coursesEnabled: true,
      cmsEnabled: true,
      specialistTasksEnabled: true,
      workspaceComposition: 'solo',
    });
  });

  it('дано: общая сборка недоступна (кабинет в отказе) → когда рендер → тогда учётка всё равно открывается', async () => {
    fakes.loadStaffAccountPageContext.mockResolvedValue(SPECIALIST);
    fakes.buildDoctorWorkspaceShellData.mockRejectedValue(new Error('entitlement_unavailable'));

    const shell = (await AccountLayout({ children: null })) as { props: Record<string, unknown> };

    expect(shell.props).toMatchObject({ userRole: 'doctor' });
    expect(shell.props).not.toHaveProperty('coursesEnabled');
  });
});
