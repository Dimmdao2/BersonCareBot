#!/usr/bin/env node
/**
 * Structural gate for T-G (`docs/_TODO/MEDICAL_WELLNESS_TERMINOLOGY_MODE_2026-09-02.md`): every
 * surface that already speaks the organization's word for the booking event (`appointment_label`)
 * must get every form of that word from the shared resolver
 * (`resolvePatientTerms`/`agreeWithAppointment`/`appointmentDeliveryFormatLabels`/
 * `capitalizeAppointmentForm`) — never re-derive or hardcode the word or its gender/case agreement
 * locally. `patientTerms.ts` is the one file allowed to spell the four words themselves; a picker
 * screen that lists the raw `APPOINTMENT_LABEL_VALUES` options is also fine — it presents the whole
 * menu, it does not decide which one is "the" word for a surface.
 *
 * Scope: only files that ALREADY reference an `appointment*` term field or helper are checked. A file
 * that has not been wired to the terminology layer at all is a different, already-tracked gap (owner
 * scope, not a silent one), not what this gate defends against; this gate's job is the narrower,
 * cheaper-to-keep-green one — no file that reads terms from the resolver is ALSO allowed to carry a
 * literal fallback of the word next to it (exactly the T-F N3 shape: `blockEditorMetadata.ts` hardcoded
 * `'Запись на приём'` even though sibling code in the same product area already read `appointmentLabel`).
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const appRoot = path.resolve(import.meta.dirname, '..');
const sourceRoot = path.join(appRoot, 'src');

const patientTermsPath = path.join(
  sourceRoot,
  'modules',
  'system-settings',
  'patientTerms.ts',
);

/** Cheap text pre-check: does this file reference an appointment-specific term/helper at all? */
const APPOINTMENT_REFERENCE_RE =
  /appointment(?:Gender|Singular|Genitive|Dative|Accusative|Instrumental|Prepositional|Plural|DeliveryFormatLabels|Label)/;

/** Words this gate bans as a raw literal in an in-scope file, normalized (ё→е, lowercase), whole-word. */
const BANNED_WORD_STEMS = ['прием', 'сеанс', 'тренировк', 'сесси'];

/**
 * Named, justified exceptions: a file (or a file+exact-substring pair) that is legitimately allowed
 * to spell the word even though it references appointment terms nearby. Each entry names the reason
 * so the next agent doesn't have to re-derive it. Growing this list is a real decision, not busywork —
 * a new entry needs the same kind of justification as the ones below.
 */
const ALLOWED_LITERALS = [
  // T-A/T-E (public booking): anonymous booking has no per-org appointment_label door — see plan §T-E
  // "T-E не сделан, и это не пропуск, а закрытая дверь." These two files stay on the platform default.
  { file: 'app/book/PublicFormatStepClient.tsx', substring: 'Очный приём' },
  { file: '[clinicSlug]/booking/BookingEntryClient.tsx', substring: 'Онлайн-приём' },
  // T-F: M2M/organizational principal cannot read `appointment_label` (door closed, measured live on
  // DEV in the T-F audit) — these stay on the platform default "приём" by the same plan decision.
  { file: 'modules/web-push/pushNotificationCopy.ts', substring: 'Запись на приём' },
  {
    file: 'modules/booking-notifications/appointmentReminderMaterialization.ts',
    substring: 'приём',
  },
  // T-F audit finding #14: catalog service-title fallback, not the organization's appointment word —
  // "ЗАГЛУШКА 'Приём' вместо ОТСУТСТВУЮЩЕГО имени услуги НЕ ТРОНУТА" (already independently PASSed).
  { file: 'modules/patient-booking/patientMessageText.ts', substring: 'Приём' },
  { file: 'modules/patient-booking/patientMessageText.ts', substring: 'Вы записаны на приём' },
  // Raw setting default BEFORE the resolver call — mirrors resolvePatientTerms's own platform default
  // for the same key, exactly like the neighboring `patient_label` default ('пациент') a line above.
  // Not composed copy: this value only ever feeds resolvePatientTerms/DoctorPatientTermsProvider.
  { file: 'app/app/doctor/loadDoctorWorkspaceShell.ts', substring: 'приём' },
  { file: 'app/app/settings/page.tsx', substring: 'приём' },
  // T-C (§24.1, ведущий): fallback literal for a module-level constant with no terminology context at
  // its declaration site — "литерал остался запасным значением типа" (plan doc, T-C section).
  { file: 'app/app/doctor/patients/PatientsPageClient.tsx', substring: 'Были на приёме' },
  // Unrelated homonym: "сеанс" here is a membership/package session count, not the appointment word —
  // this file is in scope only because of the entry above, on the same SEGMENTS table.
  { file: 'app/app/doctor/patients/PatientsPageClient.tsx', substring: 'остались сеансы' },
];

function isAllowed(filename, matchedText) {
  return ALLOWED_LITERALS.some(
    (entry) => filename.endsWith(entry.file) && matchedText.includes(entry.substring),
  );
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return [full];
  });
}

function normalize(text) {
  return text.toLowerCase().replaceAll('ё', 'е');
}

function bannedWordIn(text) {
  const normalized = normalize(text);
  for (const stem of BANNED_WORD_STEMS) {
    const re = new RegExp(`(?<![\\p{L}])${stem}\\p{L}*`, 'u');
    const match = re.exec(normalized);
    if (match) return match[0];
  }
  return null;
}

function isImportOrExportSpecifier(node) {
  const parent = node.parent;
  return (
    parent &&
    (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) &&
    parent.moduleSpecifier === node
  );
}

function checkSource(filename, text) {
  const findings = [];
  if (filename === patientTermsPath) return findings;
  if (!APPOINTMENT_REFERENCE_RE.test(text)) return findings;
  if (/\bAPPOINTMENT_LABEL_VALUES\b/.test(text)) return findings; // sanctioned raw-option picker UI

  const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  const visit = (node) => {
    let literalText = null;
    if (ts.isStringLiteral(node) && !isImportOrExportSpecifier(node)) {
      literalText = node.text;
    } else if (ts.isNoSubstitutionTemplateLiteral(node)) {
      literalText = node.text;
    } else if (ts.isTemplateExpression(node)) {
      literalText = node.head.text + node.templateSpans.map((span) => span.literal.text).join('');
    }
    if (literalText) {
      const matched = bannedWordIn(literalText);
      if (matched && !isAllowed(filename, literalText)) {
        findings.push(
          `${filename}: hardcoded appointment-word literal "${matched}" in ${JSON.stringify(
            literalText.slice(0, 80),
          )} — route through resolvePatientTerms/agreeWithAppointment/appointmentDeliveryFormatLabels instead`,
        );
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return findings;
}

function checkTree() {
  return walk(sourceRoot)
    .filter(
      (file) =>
        (file.endsWith('.ts') || file.endsWith('.tsx')) &&
        !file.endsWith('.test.ts') &&
        !file.endsWith('.test.tsx'),
    )
    .flatMap((file) => checkSource(file, fs.readFileSync(file, 'utf8')));
}

function selfTest() {
  const fixtures = [
    [
      'wired file hardcodes the word instead of reading appointmentSingular',
      'virtual/modules/patient-home/blockEditorMetadata.ts',
      `
        function meta(terms) {
          void terms.appointmentGender;
          return { displayTitle: 'Запись на приём' };
        }
      `,
    ],
    [
      'wired file hardcodes the delivery-format compound instead of calling the shared helper',
      'virtual/app/app/doctor/SomeAppointmentCard.tsx',
      `
        import type { AppointmentTerms } from '@/modules/system-settings/patientTerms';
        function label(terms: AppointmentTerms) {
          return terms.appointmentGender === 'feminine' ? 'Очная тренировка' : 'Очный приём';
        }
      `,
    ],
    [
      'wired file falls back to a literal default in a template instead of the resolver default',
      'virtual/modules/patient-booking/someTemplate.ts',
      `
        import { appointmentDeliveryFormatLabels } from '@/modules/system-settings/patientTerms';
        function fallback(label) {
          return label ?? \`Запись на прием\`;
        }
      `,
    ],
  ];
  let failed = 0;
  for (const [name, filename, source] of fixtures) {
    if (checkSource(filename, source).length === 0) {
      failed += 1;
      console.error(`self-test stayed green: ${name}`);
    }
  }
  if (failed > 0) throw new Error(`appointment word single-source self-test: ${failed} fixture(s) stayed green`);
  console.log('appointment word single-source self-test: OK (all fixtures went red)');
}

if (process.argv.includes('--self-test')) selfTest();
const findings = checkTree();
if (findings.length) {
  console.error(findings.join('\n'));
  process.exitCode = 1;
} else {
  console.log('appointment word single-source: OK');
}
