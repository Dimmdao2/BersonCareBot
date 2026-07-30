import * as fc from 'fast-check';

/**
 * The small Zod v4 surface this test boundary needs. Keeping it structural avoids
 * coupling the test API to Zod internals (or to the Zod-v3-only zod-fast-check
 * adapter) while still validating every generated value with the production schema.
 */
export type ZodV4Schema<Output> = Readonly<{
  safeParse: (input: unknown) =>
    | Readonly<{ success: true; data: Output }>
    | Readonly<{ success: false }>;
}>;

export class IncompatibleArbitraryError extends Error {
  constructor() {
    super('The supplied arbitrary generated a value rejected by its Zod schema.');
    this.name = 'IncompatibleArbitraryError';
  }
}

/**
 * Validates each generated candidate using the supplied production Zod v4 schema.
 *
 * This is deliberately fail-closed instead of filtering invalid values: an arbitrary
 * that does not describe the schema must make the property fail, not silently narrow
 * the generated input space.
 */
export function arbitraryFromZodSchema<Output>(
  schema: ZodV4Schema<Output>,
  source: fc.Arbitrary<unknown>,
): fc.Arbitrary<Output> {
  return source.map((candidate) => {
    const parsed = schema.safeParse(candidate);
    if (!parsed.success) {
      throw new IncompatibleArbitraryError();
    }
    return parsed.data;
  });
}
