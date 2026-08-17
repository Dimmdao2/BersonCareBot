import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({ apiJson: vi.fn(), refresh: vi.fn() }));

vi.mock('@/shared/lib/apiJson', () => ({ apiJson: fakes.apiJson }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: fakes.refresh }) }));

import { DoctorScreensToggleSection } from './DoctorScreensToggleSection';

describe('DoctorScreensToggleSection capability refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.apiJson.mockResolvedValue({ ok: true });
  });

  it('refreshes the server shell exactly once after a successful disable', async () => {
    render(<DoctorScreensToggleSection initialDisabled={false} />);

    fireEvent.click(screen.getByRole('switch'));

    await waitFor(() => expect(fakes.refresh).toHaveBeenCalledTimes(1));
    expect(fakes.apiJson).toHaveBeenCalledWith(
      '/api/doctor/account/doctor-screens',
      expect.objectContaining({ body: JSON.stringify({ disabled: true }) }),
    );
  });

  it('does not refresh or loop when the capability write fails', async () => {
    fakes.apiJson.mockRejectedValue(new Error('write failed'));
    render(<DoctorScreensToggleSection initialDisabled />);

    fireEvent.click(screen.getByRole('switch'));

    expect(await screen.findByText('write failed')).toBeInTheDocument();
    expect(fakes.refresh).not.toHaveBeenCalled();
  });
});
