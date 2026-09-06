'use client';

import { useSyncExternalStore } from 'react';

/**
 * Совпадает с `patient-mobile` из `app/styles/patient.css`: узкий ИЛИ низкий вьюпорт.
 * Ландшафтный телефон остаётся мобильным, как и вся остальная patient-оболочка.
 */
const MOBILE_QUERY = '(max-width: 767px), (max-height: 599px)';

function subscribe(onStoreChange: () => void) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }
  const mq = window.matchMedia(MOBILE_QUERY);
  mq.addEventListener('change', onStoreChange);
  return () => mq.removeEventListener('change', onStoreChange);
}

function getSnapshot(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(MOBILE_QUERY).matches;
}

/**
 * Единая точка определения «мобильного» вьюпорта patient-зоны (desktop dialog ⇄ bottom drawer).
 * SSR/первый кадр → false (десктоп), затем гидрация уточняет.
 */
export function useIsMobileViewport(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
