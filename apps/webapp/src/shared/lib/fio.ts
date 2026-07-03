export type StructuredFio = {
  lastName: string | null;
  firstName: string | null;
  patronymic: string | null;
};

export type FioSource =
  | "manual"
  | "booking"
  | "rubitime"
  | "native_booking"
  | "profile_structured"
  | "oauth"
  | "telegram"
  | "max"
  | "display_name";

export type FioConfidence = "none" | "low" | "medium" | "high";

export type FioConflictReason =
  | "empty"
  | "one_token"
  | "latin_or_mixed"
  | "unknown_first_name"
  | "unknown_patronymic"
  | "missing_last_name"
  | "missing_first_name"
  | "non_canonical_order"
  | "source_weaker_than_winner"
  | "candidate_disagrees_with_winner";

export type FioCandidate = {
  raw: string;
  normalizedInput: string;
  source: FioSource;
  value: StructuredFio;
  confidence: FioConfidence;
  score: number;
  reasons: FioConflictReason[];
};

export type FioDecision = {
  selected: FioCandidate | null;
  candidates: FioCandidate[];
  conflicts: FioConflictReason[];
};

export type RussianNameDictionaries = {
  firstNames?: ReadonlySet<string>;
  patronymics?: ReadonlySet<string>;
};

type TokenMark = {
  value: string;
  isFirstName: boolean;
  isPatronymic: boolean;
};

const STRONG_SOURCES = new Set<FioSource>(["manual", "booking", "rubitime", "native_booking", "profile_structured"]);

const SOURCE_SCORE: Record<FioSource, number> = {
  manual: 600,
  booking: 520,
  rubitime: 500,
  native_booking: 480,
  profile_structured: 430,
  oauth: 180,
  telegram: 160,
  max: 160,
  display_name: 120,
};

const CONFIDENCE_SCORE: Record<FioConfidence, number> = {
  none: 0,
  low: 10,
  medium: 80,
  high: 160,
};

function compactWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function dictionaryKey(value: string): string {
  return compactWhitespace(value).toLowerCase().replace(/ё/g, "е");
}

function normalizeNameInput(value: string): string {
  return compactWhitespace(value.replace(/[^\p{L}\s'-]/gu, " "));
}

function titleCasePart(value: string): string {
  return value
    .split("-")
    .map((part) => {
      const lower = part.toLowerCase();
      return lower ? `${lower[0]?.toUpperCase() ?? ""}${lower.slice(1)}` : lower;
    })
    .join("-");
}

export function normalizeFioPart(value: string | null | undefined): string | null {
  const normalized = normalizeNameInput(value ?? "");
  if (!normalized) return null;
  return normalized
    .split(" ")
    .map(titleCasePart)
    .join(" ");
}

function hasLatinOrMixed(value: string): boolean {
  return /[A-Za-z]/.test(value);
}

function likelyPatronymicBySuffix(value: string): boolean {
  const key = dictionaryKey(value);
  return /(вич|вна|ич|ична|оглы|кызы)$/.test(key);
}

function markToken(token: string, dictionaries: RussianNameDictionaries): TokenMark {
  const key = dictionaryKey(token);
  const isFirstName = dictionaries.firstNames?.has(key) ?? false;
  const isPatronymic = (dictionaries.patronymics?.has(key) ?? false) || likelyPatronymicBySuffix(token);
  return {
    value: normalizeFioPart(token) ?? token,
    isFirstName,
    isPatronymic,
  };
}

function isComplete(fio: StructuredFio): boolean {
  return Boolean(fio.lastName && fio.firstName && fio.patronymic);
}

function confidenceFor(value: StructuredFio, marks: TokenMark[], source: FioSource, reasons: FioConflictReason[]): FioConfidence {
  if (!value.firstName && !value.lastName && !value.patronymic) return "none";
  const recognizedFirst = marks.some((mark) => mark.value === value.firstName && mark.isFirstName);
  const recognizedPatronymic = !value.patronymic || marks.some((mark) => mark.value === value.patronymic && mark.isPatronymic);
  if (isComplete(value) && recognizedFirst && recognizedPatronymic) {
    return STRONG_SOURCES.has(source) ? "high" : "medium";
  }
  if (value.firstName && value.lastName && STRONG_SOURCES.has(source) && !reasons.includes("latin_or_mixed")) {
    return recognizedFirst ? "high" : "medium";
  }
  if (value.firstName && value.patronymic && recognizedFirst && recognizedPatronymic) return "medium";
  if (value.firstName || value.lastName) return "low";
  return "none";
}

function scoreCandidate(source: FioSource, confidence: FioConfidence, value: StructuredFio): number {
  let score = SOURCE_SCORE[source] + CONFIDENCE_SCORE[confidence];
  if (value.lastName) score += 20;
  if (value.firstName) score += 20;
  if (value.patronymic) score += 15;
  return score;
}

function parseMarkedTokens(marks: TokenMark[], reasons: FioConflictReason[]): StructuredFio {
  const [a, b, c] = marks;
  if (!a) return { lastName: null, firstName: null, patronymic: null };

  if (!b) {
    reasons.push("one_token", "missing_last_name");
    return { lastName: null, firstName: a.value, patronymic: null };
  }

  if (!c) {
    if (b.isPatronymic) {
      reasons.push("missing_last_name");
      return { lastName: null, firstName: a.value, patronymic: b.value };
    }
    if (a.isFirstName && !b.isFirstName) {
      return { lastName: b.value, firstName: a.value, patronymic: null };
    }
    if (!a.isFirstName && b.isFirstName) {
      return { lastName: a.value, firstName: b.value, patronymic: null };
    }
    reasons.push("unknown_first_name");
    return { lastName: a.value, firstName: b.value, patronymic: null };
  }

  if (b.isFirstName && c.isPatronymic) {
    return { lastName: a.value, firstName: b.value, patronymic: c.value };
  }
  if (a.isFirstName && b.isPatronymic) {
    reasons.push("non_canonical_order");
    return { lastName: c.value, firstName: a.value, patronymic: b.value };
  }
  if (a.isFirstName && c.isPatronymic) {
    reasons.push("non_canonical_order");
    return { lastName: b.value, firstName: a.value, patronymic: c.value };
  }
  if (b.isPatronymic) {
    reasons.push("unknown_first_name");
    return { lastName: c.value, firstName: a.value, patronymic: b.value };
  }
  if (c.isPatronymic) {
    reasons.push("unknown_first_name");
    return { lastName: a.value, firstName: b.value, patronymic: c.value };
  }

  reasons.push("unknown_first_name", "unknown_patronymic");
  return { lastName: a.value, firstName: b.value, patronymic: c.value };
}

export function parseFioCandidate(
  raw: string | null | undefined,
  source: FioSource,
  dictionaries: RussianNameDictionaries = {},
): FioCandidate {
  const normalizedInput = normalizeNameInput(raw ?? "");
  const reasons: FioConflictReason[] = [];
  if (!normalizedInput) {
    reasons.push("empty");
    const value = { lastName: null, firstName: null, patronymic: null };
    return {
      raw: raw ?? "",
      normalizedInput,
      source,
      value,
      confidence: "none",
      score: scoreCandidate(source, "none", value),
      reasons,
    };
  }
  if (hasLatinOrMixed(normalizedInput)) reasons.push("latin_or_mixed");

  const marks = normalizedInput.split(" ").slice(0, 4).map((token) => markToken(token, dictionaries));
  const value = parseMarkedTokens(marks, reasons);
  if (value.firstName && !marks.some((mark) => mark.value === value.firstName && mark.isFirstName)) {
    reasons.push("unknown_first_name");
  }
  if (value.patronymic && !marks.some((mark) => mark.value === value.patronymic && mark.isPatronymic)) {
    reasons.push("unknown_patronymic");
  }
  if (!value.firstName) reasons.push("missing_first_name");
  if (!value.lastName) reasons.push("missing_last_name");

  const uniqueReasons = [...new Set(reasons)];
  const confidence = confidenceFor(value, marks, source, uniqueReasons);
  return {
    raw: raw ?? "",
    normalizedInput,
    source,
    value,
    confidence,
    score: scoreCandidate(source, confidence, value),
    reasons: uniqueReasons,
  };
}

export function decideFio(candidates: FioCandidate[]): FioDecision {
  const usable = candidates.filter((candidate) => candidate.confidence !== "none");
  const selected = [...usable].sort((a, b) => b.score - a.score)[0] ?? null;
  const conflicts = new Set<FioConflictReason>();
  if (!selected) return { selected: null, candidates, conflicts: ["empty"] };

  for (const candidate of usable) {
    if (candidate === selected) continue;
    if (candidate.score < selected.score) conflicts.add("source_weaker_than_winner");
    const selectedKey = fioComparisonKey(selected.value);
    const candidateKey = fioComparisonKey(candidate.value);
    if (selectedKey && candidateKey && selectedKey !== candidateKey) {
      conflicts.add("candidate_disagrees_with_winner");
    }
  }
  return { selected, candidates, conflicts: [...conflicts] };
}

function fioComparisonKey(value: StructuredFio): string {
  return [value.lastName, value.firstName, value.patronymic].map((part) => dictionaryKey(part ?? "")).join("|");
}

export function formatDoctorFio(value: StructuredFio | null | undefined, fallback = ""): string {
  const label = [value?.lastName, value?.firstName, value?.patronymic].map(normalizeFioPart).filter(Boolean).join(" ");
  return label || fallback;
}

export function formatPatientGreetingName(value: StructuredFio | null | undefined, fallback = ""): string {
  const firstName = normalizeFioPart(value?.firstName);
  if (firstName) return firstName;
  return normalizeFioPart(fallback.split(/\s+/)[0] ?? "") ?? fallback;
}
