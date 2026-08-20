import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import {
  arbitraryFromZodSchema,
  fc,
  fixedClock,
  IncompatibleArbitraryError,
} from '@/app-layer/testing';

const propertySettings = { seed: 1_074, numRuns: 20, endOnFailure: true } as const;

describe('app-layer testing foundation', () => {
  it('validates scalar, object, and union arbitraries through Zod v4 schemas', () => {
    const scalarSchema = z.string().min(1);
    const objectSchema = z.object({ id: z.uuid(), active: z.boolean() }).strict();
    const unionSchema = z.union([z.literal('client'), z.literal('doctor')]);

    fc.assert(
      fc.property(arbitraryFromZodSchema(scalarSchema, fc.string({ minLength: 1 })), (value) => {
        expect(scalarSchema.parse(value)).toBe(value);
      }),
      propertySettings,
    );
    fc.assert(
      fc.property(
        arbitraryFromZodSchema(
          objectSchema,
          fc.record({ id: fc.uuid(), active: fc.boolean() }),
        ),
        (value) => {
          expect(objectSchema.parse(value)).toEqual(value);
        },
      ),
      propertySettings,
    );
    fc.assert(
      fc.property(
        arbitraryFromZodSchema(unionSchema, fc.constantFrom('client', 'doctor')),
        (value) => {
          expect(unionSchema.parse(value)).toBe(value);
        },
      ),
      propertySettings,
    );
  });

  it('fails instead of filtering an arbitrary incompatible with its schema', () => {
    const nonEmptyString = arbitraryFromZodSchema(z.string().min(1), fc.constant(''));

    expect(() => fc.sample(nonEmptyString, 1)).toThrow(IncompatibleArbitraryError);
  });

  it('keeps a deterministic clock local to the unit test', () => {
    const clock = fixedClock(Date.UTC(2026, 6, 30, 12));

    expect(clock.now().toISOString()).toBe('2026-07-30T12:00:00.000Z');
    expect(clock.nowMilliseconds()).toBe(Date.UTC(2026, 6, 30, 12));
    expect(clock.nowSeconds()).toBe(1_785_412_800);
  });

});
