import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PatientHomeBlockRuntimeStatusBadge } from './PatientHomeBlockRuntimeStatusBadge';

describe('patient-home runtime status UI', () => {
  it('tells an editor that a hidden block is invisible to patients', () => {
    render(
      <PatientHomeBlockRuntimeStatusBadge
        status={{
          blockCode: 'courses',
          kind: 'hidden',
          visibleResolvedItems: 1,
          visibleConfiguredItems: 1,
          unresolvedConfiguredItems: 0,
        }}
      />,
    );

    const badge = screen.getByTestId('patient-home-runtime-status-badge');
    expect(badge).toHaveTextContent('Скрыт');
    expect(badge).toHaveAttribute('data-runtime-kind', 'hidden');
    expect(badge).toHaveAttribute('title', expect.stringContaining('пациенты его не увидят'));
  });

  it('distinguishes an unresolved empty block from a ready block', () => {
    const { rerender } = render(
      <PatientHomeBlockRuntimeStatusBadge
        status={{
          blockCode: 'courses',
          kind: 'empty',
          visibleResolvedItems: 0,
          visibleConfiguredItems: 1,
          unresolvedConfiguredItems: 1,
        }}
      />,
    );

    expect(screen.getByTestId('patient-home-runtime-status-badge')).toHaveTextContent('Пусто');

    rerender(
      <PatientHomeBlockRuntimeStatusBadge
        status={{
          blockCode: 'courses',
          kind: 'ready',
          visibleResolvedItems: 1,
          visibleConfiguredItems: 1,
          unresolvedConfiguredItems: 0,
        }}
      />,
    );

    const badge = screen.getByTestId('patient-home-runtime-status-badge');
    expect(badge).toHaveTextContent('Готово');
    expect(badge).toHaveAttribute(
      'title',
      expect.stringContaining('отобразится на главной пациента'),
    );
  });
});
