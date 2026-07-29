import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';

configure({ asyncUtilTimeout: 3000 });

if (typeof globalThis.PointerEvent === 'undefined') {
  globalThis.PointerEvent = class extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;

    constructor(type: string, init?: PointerEventInit) {
      super(type, init);
      this.pointerId = init?.pointerId ?? 1;
      this.pointerType = init?.pointerType ?? 'mouse';
    }
  } as unknown as typeof PointerEvent;
}
