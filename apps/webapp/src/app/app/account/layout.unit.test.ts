import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({ redirect: vi.fn(), loadStaffAccountPageContext: vi.fn() }));

vi.mock('next/navigation', () => ({ redirect: fakes.redirect }));
vi.mock('./accountContext', () => ({ loadStaffAccountPageContext: fakes.loadStaffAccountPageContext }));
vi.mock('@/shared/ui/doctor/shell/DoctorWorkspaceShell', () => ({
  DoctorWorkspaceShell: ({ children }: { children: ReactNode }) => children,
}));

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
