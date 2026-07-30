import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommercialConstructorClient } from './CommercialConstructorClient';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('commercial constructor access ladder', () => {
  it('starts unconfigured and exposes the owner fields in product language', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          ok: true,
          tariffs: [],
          organizations: [],
          trialPolicy: null,
        }),
      })),
    );

    render(<CommercialConstructorClient />);
    await screen.findByRole('button', { name: 'Создать' });

    expect(screen.getByLabelText('Мест специалистов')).toHaveValue(null);
    fireEvent.click(screen.getAllByRole('button', { name: 'Настроить' })[0]!);

    expect(screen.getByText('Терпение: дней')).toBeInTheDocument();
    expect(screen.getByText('Предупреждений')).toBeInTheDocument();
    expect(screen.getByText('Только чтение: дней')).toBeInTheDocument();
    expect(screen.getByText('Затем')).toBeInTheDocument();
    expect(screen.queryByText(/квот/i)).not.toBeInTheDocument();
  });
});
