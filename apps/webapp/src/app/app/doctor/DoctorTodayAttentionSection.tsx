import { DoctorSection, DoctorSectionTitle } from "@/shared/ui/doctor/DoctorSection";
import { DoctorMetricList } from "@/shared/ui/doctor/DoctorMetricList";
import { DoctorStatCard } from "./analytics/clients/DoctorStatCard";

type Props = {
  intakeCount: number;
  messagesCount: number;
  pendingTestsCount: number;
  proactiveCount: number;
};

export function DoctorTodayAttentionSection({
  intakeCount,
  messagesCount,
  pendingTestsCount,
  proactiveCount,
}: Props) {
  return (
    <DoctorSection id="doctor-today-section-attention" className="gap-2">
      <DoctorSectionTitle>Требует внимания</DoctorSectionTitle>
      <DoctorMetricList aria-label="Требует внимания">
        <DoctorStatCard
          id="doctor-today-attention-intake"
          title="Онлайн-заявки"
          value={intakeCount}
          tone={intakeCount > 0 ? "warning" : "neutral"}
          href="/app/doctor/online-intake"
        />
        <DoctorStatCard
          id="doctor-today-attention-messages"
          title="Сообщения"
          value={messagesCount}
          tone={messagesCount > 0 ? "warning" : "neutral"}
          href="/app/doctor/messages"
        />
        <DoctorStatCard
          id="doctor-today-attention-pending-tests"
          title="Тесты к проверке"
          value={pendingTestsCount}
          tone={pendingTestsCount > 0 ? "warning" : "neutral"}
          href="#doctor-today-section-pending-tests"
        />
        <DoctorStatCard
          id="doctor-today-attention-proactive"
          title="Сигналы пациентов"
          value={proactiveCount}
          tone={proactiveCount > 0 ? "warning" : "neutral"}
          href="#doctor-today-section-proactive-insights"
        />
      </DoctorMetricList>
    </DoctorSection>
  );
}
