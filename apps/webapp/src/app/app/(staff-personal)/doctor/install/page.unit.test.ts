import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  redirect: vi.fn(),
  requireStaffPersonalInstallPage: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: fakes.redirect }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requireStaffPersonalInstallPage: fakes.requireStaffPersonalInstallPage,
}));

import DoctorInstallPage from './page';

describe('/app/doctor/install role redirect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.redirect.mockImplementation((destination: string) => {
      throw new Error(`redirect:${destination}`);
    });
  });

  it('sends a specialist to the sole staff install surface', async () => {
    fakes.requireStaffPersonalInstallPage.mockResolvedValue({ user: { role: 'doctor' } });

    await expect(DoctorInstallPage()).rejects.toThrow('redirect:/app/account?tab=install');
    expect(fakes.redirect).toHaveBeenCalledWith('/app/account?tab=install');
  });

  it('keeps platform-admin out of staff install UI', async () => {
    fakes.requireStaffPersonalInstallPage.mockResolvedValue({ user: { role: 'admin' } });

    await expect(DoctorInstallPage()).rejects.toThrow('redirect:/app/admin');
    expect(fakes.redirect).toHaveBeenCalledWith('/app/admin');
  });
});
