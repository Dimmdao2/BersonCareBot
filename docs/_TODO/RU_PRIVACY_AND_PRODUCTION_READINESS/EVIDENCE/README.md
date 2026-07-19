# Evidence index

В git хранятся только обезличенные отчёты, checksums, версии, команды без секретов и ссылки на защищённое
хранилище. Реальные ПДн, дампы, ключи, токены, полные журналы доступа и incident artifacts сюда не попадают.

## Формат записи

| Stage | Date | Environment | Release SHA | Check | Result | Protected artifact reference | Reviewer |
|---|---|---|---|---|---|---|---|

## Минимальный комплект

- scope/data-flow registry и external legal/ISPDn review reference;
- Security CI first-run triage и повторный clean/accepted run;
- TEST host-hardening rehearsal + rollback;
- current PROD baseline + provider response reference;
- LUKS mount/swap/PG checksum/service-user/firewall evidence без ключей и чувствительных путей;
- S3 capability matrix с явными `unsupported`, client-side encryption coverage, version inventory и
  delete-all-versions/app-retention checks;
- backup checksum + restore drill report + measured RPO/RTO;
- consent/DSAR/offboarding end-to-end results;
- clinical access audit negative/positive scenarios;
- secret rotation и incident tabletop reports;
- final CI SHA и owner go/no-go.
- cutover timeline, rollback decision, secret rotation и old-resource deletion confirmation.
