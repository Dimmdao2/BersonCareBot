'use client';

import {
  createContext,
  type ReactNode,
  useContext,
  useId,
  useLayoutEffect,
  useSyncExternalStore,
} from 'react';

const DoctorModalLayerContext = createContext(0);
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
 * Registers both JSX-nested and sibling modal instances in one visual stack.
 * Only the first open layer owns the dim/blur backdrop.
 */
export function useDoctorModalOverlay(open: boolean, nested = false) {
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

export function useDoctorModalLayer(nested = false) {
  const parentDepth = useContext(DoctorModalLayerContext);
  return {
    isNestedLayer: nested || parentDepth > 0,
    parentDepth,
  };
}

export function DoctorModalLayerProvider({
  depth,
  children,
}: {
  depth: number;
  children: ReactNode;
}) {
  return (
    <DoctorModalLayerContext.Provider value={depth}>{children}</DoctorModalLayerContext.Provider>
  );
}
