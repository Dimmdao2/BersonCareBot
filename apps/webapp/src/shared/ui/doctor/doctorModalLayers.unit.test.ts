import { describe, expect, it } from 'vitest';
import {
  layerOwnsBackdrop,
  type DoctorModalOpenLayer,
} from '@/shared/ui/doctor/DoctorModalLayerContext';

/**
 * Правило владельца (приёмка нового прода 14.09.2026): десктопная модалка обязана затемнять и
 * размывать фон, а правая панель — нет. Панель при этом умеет открываться в несколько слоёв, и
 * ни один из них не должен отнимать затемнение у модалки, открытой поверх.
 */
describe('стек слоёв модалок доктора: кто рисует затемнение', () => {
  const panel = (id: string): DoctorModalOpenLayer => ({ id, kind: 'panel' });
  const backdrop = (id: string): DoctorModalOpenLayer => ({ id, kind: 'backdrop' });

  it('модалка поверх открытой правой панели затемняет фон — тот самый «Приём оплаты»', () => {
    const layers = [panel('appointment-panel'), backdrop('payment')];
    expect(layerOwnsBackdrop(layers, 'payment', 'backdrop')).toBe(true);
  });

  it('правая панель не затемняет ничего, сколько бы слоёв ни открыли', () => {
    const layers = [panel('first'), panel('second'), panel('third')];
    for (const layer of layers) {
      expect(layerOwnsBackdrop(layers, layer.id, 'panel')).toBe(false);
    }
  });

  it('второй накрывающий слой не добавляет второе затемнение поверх первого', () => {
    const layers = [backdrop('first'), backdrop('second')];
    expect(layerOwnsBackdrop(layers, 'first', 'backdrop')).toBe(true);
    expect(layerOwnsBackdrop(layers, 'second', 'backdrop')).toBe(false);
  });

  it('закрытие верхнего слоя возвращает затемнение нижнему', () => {
    const layers = [backdrop('first')];
    expect(layerOwnsBackdrop(layers, 'first', 'backdrop')).toBe(true);
  });

  it('панель, открытая поверх модалки, не отбирает у неё затемнение', () => {
    const layers = [backdrop('dialog'), panel('side')];
    expect(layerOwnsBackdrop(layers, 'dialog', 'backdrop')).toBe(true);
  });

  it('ещё не зарегистрированный слой считает нижним весь текущий стек — затемнение не мигает', () => {
    expect(layerOwnsBackdrop([backdrop('first')], 'unregistered', 'backdrop')).toBe(false);
    expect(layerOwnsBackdrop([panel('side')], 'unregistered', 'backdrop')).toBe(true);
  });
});
