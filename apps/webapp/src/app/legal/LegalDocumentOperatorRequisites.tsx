import { LEGAL_DOCUMENT_OPERATOR } from '@/config/legalDocumentOperator';

const REQUISITE_FIELDS = [
  { key: 'legalEntityName', label: 'Наименование юридического лица' },
  { key: 'registeredAddress', label: 'Адрес' },
  { key: 'inn', label: 'ИНН' },
  { key: 'ogrn', label: 'ОГРН' },
] as const;

/** Shows the one configured legal-document operator without inventing missing owner data. */
export function LegalDocumentOperatorRequisites() {
  const { requisites } = LEGAL_DOCUMENT_OPERATOR;
  const missingLabels = REQUISITE_FIELDS.filter(({ key }) => !requisites[key]).map(
    ({ label }) => label,
  );
  const awaitingOwnerInput =
    requisites.status === 'awaiting-owner-input' || missingLabels.length > 0;

  return (
    <section className="space-y-2" aria-labelledby="legal-document-operator">
      <h2 id="legal-document-operator" className="text-base font-medium">
        Сведения об операторе
      </h2>
      {awaitingOwnerInput ? (
        <p className="text-muted-foreground" role="status">
          Реквизиты оператора ожидают уточнения владельцем.
          {missingLabels.length > 0 ? ` Не указаны: ${missingLabels.join(', ')}.` : null}
        </p>
      ) : null}
      {REQUISITE_FIELDS.some(({ key }) => requisites[key]) ? (
        <dl className="grid gap-1">
          {REQUISITE_FIELDS.map(({ key, label }) =>
            requisites[key] ? (
              <div key={key} className="grid gap-1 sm:grid-cols-[max-content_1fr] sm:gap-x-3">
                <dt className="font-medium">{label}</dt>
                <dd>{requisites[key]}</dd>
              </div>
            ) : null,
          )}
        </dl>
      ) : null}
    </section>
  );
}
