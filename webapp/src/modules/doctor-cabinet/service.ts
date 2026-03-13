export type DoctorWorkspaceState = {
  status: "foundation";
  message: string;
};

export function getDoctorWorkspaceState(): DoctorWorkspaceState {
  return {
    status: "foundation",
    message:
      "Врачебный интерфейс пока ограничен каркасом авторизации и role-based access. Полноценный workflow пациентов и программ добавляется следующими этапами.",
  };
}
