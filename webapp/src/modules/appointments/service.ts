export type AppointmentSummary = {
  id: string;
  label: string;
  link: string | null;
};

/** MVP: mock data; will be replaced by appointment bridge (e.g. Rubitime). userId is for future filtering. */
export function getUpcomingAppointments(_userId: string): AppointmentSummary[] {
  return [
    {
      id: "apt-mvp-1",
      label: "Консультация — скоро",
      link: null,
    },
  ];
}
