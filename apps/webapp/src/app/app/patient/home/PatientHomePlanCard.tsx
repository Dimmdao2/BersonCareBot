import Link from "next/link";
import { routePaths } from "@/app-layer/routes/paths";
import { patientHomeCardClass } from "./patientHomeCardStyles";

export type PatientHomePlanCardInstance = {
  id: string;
  title: string;
};

type Props = { instance: PatientHomePlanCardInstance | null };

export function PatientHomePlanCard({ instance }: Props) {
  if (!instance) return null;

  return (
    <section aria-labelledby="patient-home-plan-heading">
      <h2 id="patient-home-plan-heading" className="mb-2 text-base font-semibold">
        Мой план
      </h2>
      <Link
        href={routePaths.patientTreatmentProgram(instance.id)}
        className={`${patientHomeCardClass} block transition-colors hover:border-primary/30`}
      >
        <h3 className="text-base font-semibold">{instance.title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">Активная программа лечения</p>
        <span className="mt-3 inline-flex text-sm font-medium text-primary">Перейти к плану</span>
      </Link>
    </section>
  );
}
