import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DoctorModal } from './DoctorModal';

const mobileMediaQueryList: MediaQueryList = {
  matches: true,
  media: '(max-width: 767px)',
  onchange: null,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  addListener: () => undefined,
  removeListener: () => undefined,
  dispatchEvent: () => false,
};

function NestedDrawerStack() {
  const [exerciseOpen, setExerciseOpen] = useState(true);

  return (
    <DoctorModal open onClose={() => undefined} title="Этап ЛФК">
      <div data-testid="lower-layer-instance">Сохранённый этап</div>
      <DoctorModal open={exerciseOpen} onClose={() => setExerciseOpen(false)} title="Упражнение">
        Описание упражнения
      </DoctorModal>
    </DoctorModal>
  );
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn(() => mobileMediaQueryList));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('DoctorModal mobile nested drawer', () => {
  it('MODAL-04/05: press on the visible strip closes only the JSX-nested top drawer', async () => {
    render(<NestedDrawerStack />);

    const lowerLayerInstance = await screen.findByTestId('lower-layer-instance');
    const overlays = document.querySelectorAll<HTMLElement>('[data-slot="drawer-overlay"]');
    const topOverlay = overlays.item(overlays.length - 1);

    expect(topOverlay).not.toBeNull();
    fireEvent.touchStart(topOverlay!, {
      touches: [{ clientX: 16, clientY: 16 }],
    });
    fireEvent.touchEnd(topOverlay!, {
      changedTouches: [{ clientX: 16, clientY: 16 }],
      touches: [],
    });
    fireEvent.click(topOverlay!, { detail: 0 });

    await waitFor(() => expect(screen.queryByText('Упражнение')).toBeNull());
    expect(screen.getByTestId('lower-layer-instance')).toBe(lowerLayerInstance);
    expect(screen.getByText('Этап ЛФК')).toBeVisible();
  });
});
