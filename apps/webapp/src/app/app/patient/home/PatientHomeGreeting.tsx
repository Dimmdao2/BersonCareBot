type Props = {
  /** Имя только при полном tier patient (без ПДн при onboarding). */
  personalizedName: string | null;
};

export function PatientHomeGreeting({ personalizedName }: Props) {
  const greeting =
    personalizedName?.trim() ?
      `Здравствуйте, ${personalizedName.trim()}`
    : "Здравствуйте";

  return (
    <header className="px-0 pt-1">
      <h1 className="text-xl font-semibold tracking-tight text-foreground">{greeting}</h1>
      <p className="mt-1 text-sm text-muted-foreground">Сегодня — короткие практики в удобном темпе</p>
    </header>
  );
}
