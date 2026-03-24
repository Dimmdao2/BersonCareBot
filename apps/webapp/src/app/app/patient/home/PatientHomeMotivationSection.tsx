type Props = {
  quote: string;
};

/** Цитата дня из БД (детерминированный выбор). */
export function PatientHomeMotivationSection({ quote }: Props) {
  return (
    <section
      id="patient-home-motivation-section"
      className="from-primary/15 text-foreground rounded-xl border border-primary/20 bg-gradient-to-br to-muted/40 p-4 text-sm leading-relaxed shadow-sm"
    >
      {quote}
    </section>
  );
}
