export type AppointmentSummary = {
  id: string;
  label: string;
  link: string | null;
};

/** MVP: mock data; will be replaced by appointment bridge (e.g. Rubitime). */
export function getUpcomingAppointments(): AppointmentSummary[] {
  return [
    {
      id: "apt-mvp-1",
      label: "Консультация — скоро",
      link: null,
    },
  ];
}
