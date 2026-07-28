export function sourceTextIncludes(source: string, fragment: string, sourcePath?: string): boolean;

export function sourceTextIndexOf(
  source: string,
  fragment: string,
  sourcePath?: string,
  fromIndex?: number,
): number;

export function sourceTextCount(source: string, fragment: string, sourcePath?: string): number;

export function sourceTextEquals(actual: string, expected: string, sourcePath?: string): boolean;

export function sourceTextSliceBetween(
  source: string,
  startFragment: string,
  endFragment: string,
  sourcePath?: string,
  includeEnd?: boolean,
): string | null;

export function sourceTextSliceFrom(
  source: string,
  startFragment: string,
  sourcePath?: string,
): string | null;

export function sourceTextReplace(
  source: string,
  fragment: string,
  replacement: string,
  sourcePath?: string,
): string;
