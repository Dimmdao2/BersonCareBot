import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiJson } from '@/shared/lib/apiJson';
import { AdminAuditLogSection } from './AdminAuditLogSection';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/shared/lib/apiJson', () => ({
  apiJson: vi.fn(),
}));

const apiJsonMock = vi.mocked(apiJson);

const auditState = {
  ok: true as const,
  total: 1,
  page: 1,
  limit: 50,
  openAutoMergeConflictCount: 1,
  items: [
    {
      id: 'audit-1',
      actor_id: null,
      action: 'auto_merge_conflict',
      target_id: 'target-1',
      conflict_key: 'conflict-1',
      details: {},
      status: 'error' as const,
      repeat_count: 1,
      last_seen_at: '2026-08-11T12:00:00.000Z',
      resolved_at: null,
      created_at: '2026-08-11T12:00:00.000Z',
      actor_display_name: null,
    },
  ],
};

beforeEach(() => {
  apiJsonMock.mockReset();
});

afterEach(cleanup);

describe('AdminAuditLogSection errors', () => {
  it('shows the canonical retry state when the initial load fails', async () => {
    apiJsonMock.mockRejectedValue(new Error('network'));

    render(<AdminAuditLogSection displayTimeZone="Europe/Moscow" />);

    expect(await screen.findByText('Не удалось загрузить журнал операций.')).toBeVisible();
    expect(screen.getByText(/AUDIT-LOG/)).toBeVisible();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    await waitFor(() => expect(apiJsonMock).toHaveBeenCalledTimes(2));
  });

  it('keeps loaded rows visible when resolving a conflict fails', async () => {
    apiJsonMock
      .mockResolvedValueOnce(auditState)
      .mockRejectedValueOnce(new Error('permission_denied'));

    render(<AdminAuditLogSection displayTimeZone="Europe/Moscow" />);

    const resolveButton = await screen.findByRole('button', { name: 'Закрыть' });
    fireEvent.click(resolveButton);

    expect(
      await screen.findByText('Не удалось закрыть конфликт. Повторите попытку.'),
    ).toBeVisible();
    expect(screen.getByRole('table')).toBeVisible();
    expect(screen.queryByText('Не удалось загрузить журнал операций.')).not.toBeInTheDocument();
  });
});
