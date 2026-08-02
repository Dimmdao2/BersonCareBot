import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/lib/apiJson', () => ({ apiJson: vi.fn() }));

import { apiJson } from '@/shared/lib/apiJson';
import { BookingPublicAttributionSection } from './BookingPublicAttributionSection';

describe('BookingPublicAttributionSection', () => {
  it('does not expose or load booking attribution when doctor_statistics is blocked', () => {
    render(<BookingPublicAttributionSection visible={false} />);

    expect(screen.queryByText('Источники публичных записей')).not.toBeInTheDocument();
    expect(apiJson).not.toHaveBeenCalled();
  });
});
