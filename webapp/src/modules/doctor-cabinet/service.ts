export type DoctorWorkspaceState = {
  status: "foundation";
  message: string;
  patientList: { id: string; label: string }[];
};

/** MVP: placeholder patient list for later extension. */
export function getDoctorWorkspaceState(): DoctorWorkspaceState {
  return {
    status: "foundation",
    message:
      "Врачебный интерфейс: каркас авторизации и доступ по ролям. Ниже — заглушка списка пациентов для следующих этапов.",
    patientList: [],
  };
}
