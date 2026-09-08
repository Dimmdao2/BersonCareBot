type Props = {
  quote: string;
};

/** Цитата дня из БД (детерминированный выбор). */
export function PatientHomeMotivationSection({ quote }: Props) {
  return (
    <section
      id="patient-home-motivation-section"
      className="from-primary/15 rounded-xl border border-primary/20 bg-gradient-to-br to-muted/40 p-4 patient-type-secondary shadow-sm"
    >
      {quote}
    </section>
  );
}
