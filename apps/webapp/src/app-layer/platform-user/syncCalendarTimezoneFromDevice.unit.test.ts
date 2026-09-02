/**
 * Failure caught: a device timezone can be invalid, already current, or changed, but a split or
 * regressed sync rule still reads/writes in the wrong branch. That silently advances user records
 * (and, for patients, calls the SECURITY DEFINER operation) on ordinary application entry.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  syncCalendarTimezoneFromDevice,
  type CalendarTimezoneFromDevicePort,
} from './syncCalendarTimezoneFromDevice';

function makePort(
  current: string | null,
  writeResult = true,
): {
  port: CalendarTimezoneFromDevicePort;
  readCurrent: ReturnType<typeof vi.fn>;
  writeChanged: ReturnType<typeof vi.fn>;
} {
  const readCurrent = vi.fn(async () => current);
  const writeChanged = vi.fn(async () => writeResult);
  return { port: { readCurrent, writeChanged }, readCurrent, writeChanged };
}

describe('syncCalendarTimezoneFromDevice', () => {
  it.each([null, '', '   ', 'Mars/Olympus'])(
    'does not read or write an absent or invalid device timezone: %j',
    async (raw) => {
      const { port, readCurrent, writeChanged } = makePort('Europe/Moscow');

      await expect(syncCalendarTimezoneFromDevice('user-1', raw, port)).resolves.toBe(false);
      expect(readCurrent).not.toHaveBeenCalled();
      expect(writeChanged).not.toHaveBeenCalled();
    },
  );

  it('reads a valid matching timezone but does not write it', async () => {
    const { port, readCurrent, writeChanged } = makePort('Europe/Moscow');

    await expect(syncCalendarTimezoneFromDevice('user-1', ' Europe/Moscow ', port)).resolves.toBe(
      false,
    );
    expect(readCurrent).toHaveBeenCalledExactlyOnceWith('user-1');
    expect(writeChanged).not.toHaveBeenCalled();
  });

  it.each([
    ['changed', 'Europe/Moscow', 'Asia/Novosibirsk', true],
    ['previously empty', null, 'Europe/Moscow', false],
  ] as const)(
    'delegates a %s valid timezone to the supplied role adapter and returns its result',
    async (_caseName, current, raw, expected) => {
      const { port, readCurrent, writeChanged } = makePort(current, expected);

      await expect(syncCalendarTimezoneFromDevice('user-1', raw, port)).resolves.toBe(expected);
      expect(readCurrent).toHaveBeenCalledExactlyOnceWith('user-1');
      expect(writeChanged).toHaveBeenCalledExactlyOnceWith('user-1', raw);
    },
  );
});
