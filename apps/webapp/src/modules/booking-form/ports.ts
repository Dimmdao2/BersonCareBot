export type BookingFormFieldRecord = {
  id: string;
  organizationId: string;
  fieldKey: string;
  fieldType: string;
  label: string;
  placeholder: string | null;
  isRequired: boolean;
  visibleToPatient: boolean;
  visibleToStaff: boolean;
  sortOrder: number;
  isActive: boolean;
};

export type FormAnswerInput = { fieldKey: string; value: string };

export type BookingFormPort = {
  listActiveFields(organizationId: string, audience: "patient" | "staff"): Promise<BookingFormFieldRecord[]>;
  listAllFieldsAdmin(organizationId: string): Promise<BookingFormFieldRecord[]>;
  upsertFieldAdmin(
    organizationId: string,
    input: {
      id?: string;
      fieldKey: string;
      fieldType: string;
      label: string;
      placeholder?: string | null;
      isRequired: boolean;
      visibleToPatient: boolean;
      visibleToStaff: boolean;
      sortOrder: number;
      isActive: boolean;
    },
  ): Promise<BookingFormFieldRecord>;
  saveSubmissions(input: {
    organizationId: string;
    appointmentId: string;
    answers: FormAnswerInput[];
  }): Promise<void>;
};

export type BookingFormService = {
  validateAnswers(
    organizationId: string,
    audience: "patient" | "staff",
    answers: FormAnswerInput[],
    profilePrefill?: Record<string, string>,
  ): Promise<{ ok: true } | { ok: false; error: string; fieldKey?: string }>;
  saveForAppointment(
    organizationId: string,
    appointmentId: string,
    answers: FormAnswerInput[],
  ): Promise<void>;
  listPatientFields(organizationId: string): Promise<BookingFormFieldRecord[]>;
  listAdminFields(organizationId: string): Promise<BookingFormFieldRecord[]>;
  upsertAdminField(
    organizationId: string,
    input: Parameters<BookingFormPort["upsertFieldAdmin"]>[1],
  ): Promise<BookingFormFieldRecord>;
};
