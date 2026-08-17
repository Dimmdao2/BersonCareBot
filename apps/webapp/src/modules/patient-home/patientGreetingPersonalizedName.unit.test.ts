import { describe, expect, it } from 'vitest';
import { patientGreetingPersonalizedName } from './patientGreetingPersonalizedName';

describe('patientGreetingPersonalizedName', () => {
  it('never leaks surname into Today greeting', () => {
    expect(
      patientGreetingPersonalizedName({ firstName: 'Иван', displayName: 'Петров Иван Сергеевич' }),
    ).toBe('Иван');
    expect(
      patientGreetingPersonalizedName({ firstName: undefined, displayName: 'Петров Иван Сергеевич' }),
    ).toBe('Петров');
  });
});
