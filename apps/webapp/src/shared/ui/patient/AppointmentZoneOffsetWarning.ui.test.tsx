/**
 * PATIENT-OVERVIEW-09/10 (docs/_TODO/DOCTOR_MOBILE_UI_OWNER_ACCEPTANCE_2026-09-04.md §P3): the
 * compact red `!`/`UTC±N` badge appears ONLY when the branch's offset at the appointment instant
 * differs from the patient device's offset — and never before the device zone is known client-side
 * (no flashed/false warning, no hydration mismatch: the first render must match the server's).
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppointmentZoneOffsetWarning } from './AppointmentZoneOffsetWarning';

const deviceTimeZone = vi.hoisted(() => ({ current: 'Europe/Moscow' }));

vi.mock('@/shared/lib/browserCalendarIana', () => ({
  getBrowserCalendarIanaForAuth: () => deviceTimeZone.current,
}));

beforeEach(() => {
  deviceTimeZone.current = 'Europe/Moscow';
});

afterEach(() => {
  cleanup();
});

describe('AppointmentZoneOffsetWarning', () => {
  it('PATIENT-OVERVIEW-10: renders nothing once the device zone is known and matches the branch zone', async () => {
    deviceTimeZone.current = 'Europe/Istanbul'; // also +180, no DST — agrees with Europe/Moscow
    const { container } = render(
      <AppointmentZoneOffsetWarning iso="2026-07-15T09:00:00Z" branchTimeZone="Europe/Moscow" />,
    );

    // Give the client-only effect a tick to run before asserting the settled state.
    await waitFor(() => expect(container.textContent).toBe(''));
    expect(screen.queryByText('!')).not.toBeInTheDocument();
  });

  it('PATIENT-OVERVIEW-09: renders the red "!" and the branch UTC label once offsets are known to differ', async () => {
    deviceTimeZone.current = 'Europe/Moscow'; // +180
    render(
      <AppointmentZoneOffsetWarning iso="2026-07-15T09:00:00Z" branchTimeZone="Asia/Kolkata" />, // +330
    );

    await waitFor(() => expect(screen.getByText('!')).toBeInTheDocument());
    expect(screen.getByText('UTC+5:30')).toBeInTheDocument();
  });

  it('never renders a fabricated UTC label for a legacy row with no canonical branch zone', async () => {
    render(<AppointmentZoneOffsetWarning iso="2026-07-15T09:00:00Z" branchTimeZone={null} />);

    // No canonical branch zone to compare against — must stay empty even after the device-zone
    // effect settles, not just on the first (pre-effect) render.
    await Promise.resolve();
    expect(screen.queryByText('!')).not.toBeInTheDocument();
  });
});
