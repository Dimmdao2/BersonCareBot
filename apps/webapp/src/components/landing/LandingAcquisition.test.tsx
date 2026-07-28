/** @vitest-environment jsdom */
import type { ImgHTMLAttributes } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LandingAcquisition } from '@/components/landing/LandingAcquisition';

vi.mock('next/image', () => ({
  // The test replaces Next's optimized image with the DOM element jsdom can render.
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ alt, ...props }: ImgHTMLAttributes<HTMLImageElement>) => (
    <img alt={alt ?? ''} {...props} />
  ),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

describe('LandingAcquisition', () => {
  it('keeps specialist acquisition primary and patient, clinic, legal and support entries truthful', () => {
    render(<LandingAcquisition appBaseUrl="https://test.example" />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /\u043a\u0430\u0431\u0438\u043d\u0435\u0442 \u0441\u043f\u0435\u0446\u0438\u0430\u043b\u0438\u0441\u0442\u0430/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('link', {
        name: /\u0441\u043e\u0437\u0434\u0430\u0442\u044c \u043a\u0430\u0431\u0438\u043d\u0435\u0442/i,
      })[0],
    ).toHaveAttribute('href', '/app?intent=specialist');
    expect(
      screen.getAllByRole('link', {
        name: /\u043f\u0440\u0438\u0433\u043b\u0430\u0448\u0435\u043d\u0438\u0435/i,
      })[0],
    ).toHaveAttribute('href', '/app');
    expect(
      screen.getAllByRole('link', {
        name: /\u0434\u0435\u043c\u043e \u0434\u043b\u044f \u043a\u043b\u0438\u043d\u0438\u043a\u0438/i,
      })[0],
    ).toHaveAttribute('href', '/app/contact-support?from=clinic-demo');
    expect(
      screen.getByRole('link', {
        name: '\u041f\u043e\u043b\u0438\u0442\u0438\u043a\u0430 \u043a\u043e\u043d\u0444\u0438\u0434\u0435\u043d\u0446\u0438\u0430\u043b\u044c\u043d\u043e\u0441\u0442\u0438',
      }),
    ).toHaveAttribute('href', '/legal/privacy');
    expect(
      screen.getByRole('link', {
        name: '\u0421\u0432\u044f\u0437\u044c \u0441 \u043f\u043e\u0434\u0434\u0435\u0440\u0436\u043a\u043e\u0439',
      }),
    ).toHaveAttribute('href', '/app/contact-support');
    expect(
      screen.queryByRole('link', {
        name: /\u043a\u0430\u0442\u0430\u043b\u043e\u0433 \u043e\u0440\u0433\u0430\u043d\u0438\u0437\u0430\u0446\u0438\u0439/i,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: /\u0443\u0441\u043b\u043e\u0432\u0438\u044f \u0437\u0430\u043f\u0443\u0441\u043a\u0430/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: /\u043d\u043e \u044d\u0442\u043e \u043d\u0435 \u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u043e/i,
      }),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/[\u20bd$\u20ac]\s*\d|\d\s*[\u20bd$\u20ac]/);
  });
});
