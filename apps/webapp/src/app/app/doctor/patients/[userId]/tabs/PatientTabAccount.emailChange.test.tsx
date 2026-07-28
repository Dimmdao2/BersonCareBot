/** @vitest-environment jsdom */
import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PatientTabAccount } from './PatientTabAccount';

vi.mock('@/app/app/doctor/clients/AdminMergeAccountsPanel', () => ({
  AdminMergeAccountsPanel: () => null,
}));

vi.mock('@/app/app/doctor/clients/AdminClientAuditHistorySection', () => ({
  AdminClientAuditHistorySection: () => null,
}));

const userId = '00000000-0000-4000-8000-000000000111';
const emailChangePath = `/api/doctor/patients/${userId}/email-change`;

describe('PatientTabAccount email-change capability', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not probe the admin-only endpoint for a non-admin or an inactive tab', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const view = render(
      <PatientTabAccount
        userId={userId}
        active
        isAdmin={false}
        initialSupplementaryContacts={[]}
      />,
    );
    view.rerender(
      <PatientTabAccount
        userId={userId}
        active={false}
        isAdmin
        initialSupplementaryContacts={[]}
      />,
    );

    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('loads pending email state only for an admin on the active account tab', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true, pending: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<PatientTabAccount userId={userId} active isAdmin initialSupplementaryContacts={[]} />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(emailChangePath, { credentials: 'include' });
    });
  });
});
