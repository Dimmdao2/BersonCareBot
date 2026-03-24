export type SymptomSide = "left" | "right" | "both";

export type SymptomTracking = {
  id: string;
  userId: string;
  symptomKey: string | null;
  symptomTitle: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  symptomTypeRefId?: string | null;
  regionRefId?: string | null;
  side?: SymptomSide | null;
  diagnosisText?: string | null;
  diagnosisRefId?: string | null;
  stageRefId?: string | null;
  deletedAt?: string | null;
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
  symptomTrackingId?: string | null;
  regionRefId?: string | null;
  side?: SymptomSide | null;
  diagnosisText?: string | null;
  diagnosisRefId?: string | null;
};

/** One row = one "I exercised" session. */
export type LfkSession = {
  id: string;
  userId: string;
  complexId: string;
  completedAt: string;
  source: "bot" | "webapp";
  createdAt: string;
  /** When the patient recorded the session (may differ from completed_at). */
  recordedAt?: string | null;
  durationMinutes?: number | null;
  difficulty0_10?: number | null;
  pain0_10?: number | null;
  comment?: string | null;
  /** Set when listing (join with complexes). */
  complexTitle?: string;
};
