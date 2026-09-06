'use client';

import {
  createContext,
  type ReactNode,
  useContext,
  useId,
  useLayoutEffect,
  useSyncExternalStore,
} from 'react';

const PatientModalLayerContext = createContext(0);
let openLayerIds: readonly string[] = [];
const openLayerListeners = new Set<() => void>();
const EMPTY_LAYERS: readonly string[] = [];

function subscribeToOpenLayers(listener: () => void) {
  openLayerListeners.add(listener);
  return () => openLayerListeners.delete(listener);
}

function getOpenLayersSnapshot(): readonly string[] {
  return openLayerIds;
}

function notifyOpenLayers() {
  for (const listener of openLayerListeners) listener();
}

/**
 * Регистрирует и вложенные по JSX, и соседние экземпляры модалок в одном визуальном стеке.
 * Затемнение принадлежит только первому открытому слою: второй слой не темнит экран ещё раз.
 */
export function usePatientModalOverlay(open: boolean, nested = false) {
  const layerId = useId();
  const openLayers = useSyncExternalStore(
    subscribeToOpenLayers,
    getOpenLayersSnapshot,
    () => EMPTY_LAYERS,
  );

  useLayoutEffect(() => {
    if (!open) return;
    if (!openLayerIds.includes(layerId)) {
      openLayerIds = [...openLayerIds, layerId];
      notifyOpenLayers();
    }
    return () => {
      const index = openLayerIds.indexOf(layerId);
      if (index === -1) return;
      openLayerIds = openLayerIds.filter((id) => id !== layerId);
      notifyOpenLayers();
    };
  }, [layerId, open]);

  const ownIndex = openLayers.indexOf(layerId);
  const hasEarlierLayer = ownIndex === -1 ? openLayers.length > 0 : ownIndex > 0;
  return !nested && !hasEarlierLayer;
}

export function usePatientModalLayer(nested = false) {
  const parentDepth = useContext(PatientModalLayerContext);
  return {
    isNestedLayer: nested || parentDepth > 0,
    parentDepth,
  };
}

export function PatientModalLayerProvider({
  depth,
  children,
}: {
  depth: number;
  children: ReactNode;
}) {
  return (
    <PatientModalLayerContext.Provider value={depth}>{children}</PatientModalLayerContext.Provider>
  );
}
