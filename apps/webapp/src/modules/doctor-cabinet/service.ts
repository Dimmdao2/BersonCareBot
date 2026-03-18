export type DoctorWorkspaceState = {
  status: "foundation";
  message: string;
  patientList: { id: string; label: string }[];
};

/** Состояние обзорного экрана специалиста (что требует внимания). */
export type DoctorOverviewState = {
  myDay: {
    appointmentsToday: number;
    nearestAppointmentLabel: string | null;
    cancellationsToday: number;
    reschedulesToday: number;
    pendingConfirmation: number;
    needReminder: number;
  };
  nearestAppointments: Array<{
    id: string;
    time: string;
    clientLabel: string;
    type: string;
    status: string;
    clientUserId: string;
  }>;
  requireAttention: Array<{
    id: string;
    kind: "frequent_cancellations" | "no_contact" | "diary_worsening" | "diary_skips" | "no_channels" | "delivery_failed";
    clientUserId: string;
    clientLabel: string;
  }>;
  recentEvents: Array<{
    id: string;
    type: string;
    label: string;
    at: string;
  }>;
  quickActions: Array<{ id: string; label: string; href: string }>;
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

/** Возвращает состояние обзора для главной страницы кабинета специалиста. Пока заглушка; позже — агрегация из appointments/clients/diaries/messageLog. */
export function getOverviewState(): DoctorOverviewState {
  return {
    myDay: {
      appointmentsToday: 0,
      nearestAppointmentLabel: null,
      cancellationsToday: 0,
      reschedulesToday: 0,
      pendingConfirmation: 0,
      needReminder: 0,
    },
    nearestAppointments: [],
    requireAttention: [],
    recentEvents: [],
    quickActions: [
      { id: "clients", label: "Клиенты", href: "/app/doctor/clients" },
      { id: "appointments", label: "Записи на сегодня", href: "/app/doctor/appointments" },
      { id: "message", label: "Написать сообщение", href: "/app/doctor/messages" },
      { id: "stats", label: "Статистика", href: "/app/doctor/stats" },
    ],
  };
}
