export function ClinicMaintenanceScreen(props: { clinicName: string; message: string }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-muted/30 p-5">
      <section className="w-full max-w-xl rounded-2xl border border-border bg-background p-6 shadow-sm">
        <p className="text-sm text-muted-foreground">{props.clinicName}</p>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">Технические работы</h1>
        <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-foreground">
          {props.message}
        </p>
      </section>
    </main>
  );
}
