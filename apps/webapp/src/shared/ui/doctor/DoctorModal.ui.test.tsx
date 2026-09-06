import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DoctorModal, DoctorModalTextEditorField } from './DoctorModal';

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

describe('DoctorModal fullscreen-text presentation', () => {
  it('MODAL-TEXT-02/04/06: mobile editor has no drag handle, autofocuses its sole textarea, and keeps title/footer', () => {
    render(
      <DoctorModal
        open
        onClose={() => undefined}
        title="Новая заметка"
        presentation="fullscreen-text"
        footer={
          <button type="button" onClick={() => undefined}>
            Сохранить
          </button>
        }
      >
        <DoctorModalTextEditorField value="" onChange={() => undefined} placeholder="Текст заметки" />
      </DoctorModal>,
    );

    const field = screen.getByPlaceholderText('Текст заметки');
    expect(document.activeElement).toBe(field);
    // The canonical bottom-drawer handle is a decorative pill rendered only when `showHandle`
    // (default) is on; the fullscreen-text presentation turns it off (MODAL-TEXT-02).
    expect(document.querySelector('.rounded-full.bg-muted-foreground\\/35')).toBeNull();
    expect(screen.getByText('Новая заметка')).toBeVisible();
    expect(screen.getByText('Сохранить')).toBeVisible();
  });

  it('same presentation on a standard drawer keeps the drag handle (sanity check for the assertion above)', () => {
    render(
      <DoctorModal open onClose={() => undefined} title="Обычная модалка">
        Контент
      </DoctorModal>,
    );
    expect(document.querySelector('.rounded-full.bg-muted-foreground\\/35')).not.toBeNull();
  });

  it('MODAL-TEXT-05: visualViewport resize updates geometry without unmounting the textarea or losing value/focus', () => {
    const listeners: Record<string, () => void> = {};
    const fakeViewport = {
      offsetTop: 0,
      height: 600,
      addEventListener: (type: string, cb: () => void) => {
        listeners[type] = cb;
      },
      removeEventListener: () => undefined,
    };
    vi.stubGlobal('visualViewport', fakeViewport);

    function Harness() {
      const [value, setValue] = useState('черновик заметки');
      return (
        <DoctorModal
          open
          onClose={() => undefined}
          title="Новая заметка"
          presentation="fullscreen-text"
          footer={
            <button type="button" onClick={() => undefined}>
              Сохранить
            </button>
          }
        >
          <DoctorModalTextEditorField value={value} onChange={setValue} placeholder="Текст заметки" />
        </DoctorModal>
      );
    }

    render(<Harness />);
    const field = screen.getByPlaceholderText('Текст заметки') as HTMLTextAreaElement;
    expect(field.value).toBe('черновик заметки');
    expect(document.activeElement).toBe(field);

    fakeViewport.height = 320;
    fakeViewport.offsetTop = 44;
    act(() => {
      listeners.resize?.();
    });

    // Same node — the keyboard-driven geometry change did not remount the editor.
    expect(screen.getByPlaceholderText('Текст заметки')).toBe(field);
    expect(field.value).toBe('черновик заметки');
    expect(document.activeElement).toBe(field);
    const drawerContent = document.querySelector<HTMLElement>('[data-slot="drawer-content"]');
    expect(drawerContent?.style.height).toBe('320px');
    expect(drawerContent?.style.top).toBe('44px');
  });
});
