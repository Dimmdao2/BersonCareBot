import { describe, expect, it } from 'vitest';
import {
  MechanicWriteClearanceRequiredError,
  assertMechanicWriteClearance,
  enterWithMechanicWriteClearance,
  hasMechanicWriteClearance,
  runWithoutMechanicWriteClearance,
} from './mechanicWriteClearance';

describe('mechanicWriteClearance (3.2 construction)', () => {
  it('refuses a write with no prior clearance in this continuation', () => {
    runWithoutMechanicWriteClearance(() => {
      expect(hasMechanicWriteClearance('courses')).toBe(false);
      expect(() => assertMechanicWriteClearance('courses')).toThrow(
        MechanicWriteClearanceRequiredError,
      );
    });
  });

  it('allows the write once the mechanic was cleared in this continuation', () => {
    runWithoutMechanicWriteClearance(() => {
      enterWithMechanicWriteClearance('courses');
      expect(hasMechanicWriteClearance('courses')).toBe(true);
      expect(() => assertMechanicWriteClearance('courses')).not.toThrow();
    });
  });

  it('clearance for one mechanic never grants another — no cross-mechanic bleed', () => {
    runWithoutMechanicWriteClearance(() => {
      enterWithMechanicWriteClearance('courses');
      expect(() => assertMechanicWriteClearance('mailings')).toThrow(
        MechanicWriteClearanceRequiredError,
      );
    });
  });

  it('propagates clearance across an await boundary in the same continuation', async () => {
    await runWithoutMechanicWriteClearance(async () => {
      enterWithMechanicWriteClearance('courses');
      await Promise.resolve();
      expect(() => assertMechanicWriteClearance('courses')).not.toThrow();
    });
  });

  it('does not leak clearance into a sibling continuation', async () => {
    await runWithoutMechanicWriteClearance(async () => {
      enterWithMechanicWriteClearance('courses');
    });
    await runWithoutMechanicWriteClearance(async () => {
      expect(hasMechanicWriteClearance('courses')).toBe(false);
    });
  });
});
