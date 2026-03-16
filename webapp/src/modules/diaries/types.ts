export type SymptomTracking = {
  id: string;
  userId: string;
  symptomKey: string | null;
  symptomTitle: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SymptomEntry = {
  id: string;
  userId: string;
  trackingId: string;
  value0_10: number;
  entryType: "instant" | "daily";
  recordedAt: string;
  source: "bot" | "webapp" | "import";
  notes: string | null;
  createdAt: string;
  /** Set when listing (join with trackings). */
  symptomTitle?: string;
};

export type LfkComplex = {
  id: string;
  userId: string;
  title: string;
  origin: "manual" | "assigned_by_specialist";
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

/** One row = one "I exercised" session. */
export type LfkSession = {
  id: string;
  userId: string;
  complexId: string;
  completedAt: string;
  source: "bot" | "webapp";
  createdAt: string;
  /** Set when listing (join with complexes). */
  complexTitle?: string;
};
