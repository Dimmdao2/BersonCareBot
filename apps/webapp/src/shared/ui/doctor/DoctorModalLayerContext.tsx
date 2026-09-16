'use client';

import { useId, useLayoutEffect, useSyncExternalStore } from 'react';

/**
 * Вид слоя в общем стеке модалок доктора (решение владельца 14.09.2026):
 *
 * — `backdrop` — слой, который закрывает собой страницу: десктопный диалог, мобильный
 *   bottom-sheet и правая панель начиная с 768px. Он затемняет ВСЁ под собой ровно один раз:
 *   вложенный слой нового затемнения не добавляет.
 * — `panel` — компактная правая панель 540–767px. Она стоит рядом с оставшейся частью страницы,
 *   ничего не затемняет и умеет открываться в несколько слоёв.
 *
 * Компактная панель не занимает место владельца затемнения: диалог, открытый из неё, получает
 * собственный backdrop. На md+ сама правая панель регистрируется как `backdrop`, поэтому её
 * вложенные слои используют уже существующее затемнение.
 */
export type DoctorModalLayerKind = 'backdrop' | 'panel';

export type DoctorModalOpenLayer = { id: string; kind: DoctorModalLayerKind };

/**
 * Кто рисует затемнение: слой-`backdrop`, под которым нет другого такого же.
 *
 * Слои-панели пропускаются — они ничего не закрывают, поэтому и очередь на затемнение не занимают.
 * Свой слой, ещё не попавший в стек (первый проход до layout-эффекта), считает нижним весь текущий
 * стек: иначе затемнение мигало бы на открытии второго слоя.
 */
export function layerOwnsBackdrop(
  layers: readonly DoctorModalOpenLayer[],
  layerId: string,
  kind: DoctorModalLayerKind,
): boolean {
  if (kind !== 'backdrop') return false;
  const ownIndex = layers.findIndex((layer) => layer.id === layerId);
  const below = ownIndex === -1 ? layers : layers.slice(0, ownIndex);
  return !below.some((layer) => layer.kind === 'backdrop');
}

let openLayers: readonly DoctorModalOpenLayer[] = [];
const openLayerListeners = new Set<() => void>();
const EMPTY_LAYERS: readonly DoctorModalOpenLayer[] = [];

function subscribeToOpenLayers(listener: () => void) {
  openLayerListeners.add(listener);
  return () => openLayerListeners.delete(listener);
}

function getOpenLayersSnapshot(): readonly DoctorModalOpenLayer[] {
  return openLayers;
}

function notifyOpenLayers() {
  for (const listener of openLayerListeners) listener();
}

/**
 * Регистрирует слой в общем стеке и отвечает, он ли рисует затемнение.
 *
 * Стек общий для JSX-вложенных и sibling-слоёв: порядок задаётся моментом открытия, а не деревом
 * компонентов, поэтому вызывающему коду не нужно знать, из чего именно его открыли — это и было
 * источником ошибки, когда caller-ы помечали себя «вложенными» вручную.
 */
export function useDoctorModalOverlay(open: boolean, kind: DoctorModalLayerKind) {
  const layerId = useId();
  const layers = useSyncExternalStore(
    subscribeToOpenLayers,
    getOpenLayersSnapshot,
    () => EMPTY_LAYERS,
  );

  useLayoutEffect(() => {
    if (!open) return;
    openLayers = [...openLayers.filter((layer) => layer.id !== layerId), { id: layerId, kind }];
    notifyOpenLayers();
    return () => {
      if (!openLayers.some((layer) => layer.id === layerId)) return;
      openLayers = openLayers.filter((layer) => layer.id !== layerId);
      notifyOpenLayers();
    };
  }, [kind, layerId, open]);

  return layerOwnsBackdrop(layers, layerId, kind);
}
