import {
  PatientSegmentedTab,
  PatientSegmentedTabList,
} from '@/shared/ui/patient/PatientSegmentedStrip';

export function PatientPlanTabStrip(props: {
  programTabSubtitle: string;
  recommendationListCount: number;
  progressTabProgramDaysLabel: string;
}) {
  const { programTabSubtitle, recommendationListCount, progressTabProgramDaysLabel } = props;
  return (
    <PatientSegmentedTabList>
      <PatientSegmentedTab
        value="program"
        label="Программа"
        subtitle={programTabSubtitle}
      />
      <PatientSegmentedTab
        value="recommendations"
        label="Рекомендации"
        subtitle={`${recommendationListCount} рекомендаций`}
      />
      <PatientSegmentedTab
        value="progress"
        label="Прогресс"
        subtitle={progressTabProgramDaysLabel}
      />
    </PatientSegmentedTabList>
  );
}
