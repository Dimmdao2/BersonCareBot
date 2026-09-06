/**
 * Least-privilege wall around the appointment financial snapshot (owner checklist
 * `docs/_TODO/DOCTOR_MOBILE_UI_OWNER_ACCEPTANCE_2026-09-04.md` §K — PAY-APPT-04, PAY-APPT-09,
 * PAY-APPT-18, PAY-APPT-19).
 *
 * Oracle, in the owner's words: «роли врача, пациента, системной процедуры и webhook имеют только
 * необходимые права чтения и записи через центральную схему grants».
 *
 * The failure this catches, in one line: a role that must only READ the money of an appointment is
 * granted WRITE on it, so a path nobody audited — a patient reschedule, a staff edit, an expiry
 * sweep — can silently rewrite what the clinic is owed or what the patient already paid.
 *
 * Why it is checked against the declaration model rather than a live database: the declaration is
 * the single source the reconcile emits from, and this repo forbids a worker from creating a
 * throwaway database or mutating shared DEV/TEST. Behaviour under a real cluster is proved by the
 * `*.devDbProof.test.mjs` family after the reconcile lands; this file pins the contract that
 * reconcile will carry there, which is exactly where the drift starts.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { REV10_CLINICAL_ACCESS } from './relation-access.ts';
import { declaration } from './declaration.ts';

const APPOINTMENTS = 'public.be_appointments';

/** The snapshot the appointment now owns. Money the clinic charges, plus the money already taken. */
const SNAPSHOT_COLUMNS = [
  'price_minor',
  'price_currency',
  'prepayment_mode',
  'prepayment_percent_bps',
  'prepayment_amount_minor',
  'prepayment_required_minor',
  'payment_deadline_at',
];
/** Factual money: what actually arrived. Only the payment seam may ever write this. */
const FACTUAL_MONEY_COLUMN = 'prepayment_paid_minor';

function directGrant(role, operation) {
  const access = REV10_CLINICAL_ACCESS[APPOINTMENTS];
  assert.equal(access.kind, 'direct', `${APPOINTMENTS} access kind`);
  const matches = access.grants.filter(
    (grant) => grant.role === role && grant.operations.includes(operation),
  );
  return matches.length === 1 ? matches[0] : null;
}

function fn(identity) {
  const declared = declaration.portContext.functions[identity];
  assert.ok(declared, `function not declared: ${identity}`);
  return declared;
}

function appointmentSurface(identity) {
  const surface = (fn(identity).relationSurfaces ?? []).find(
    (entry) => entry.relation === APPOINTMENTS,
  );
  assert.ok(surface, `${identity} declares no ${APPOINTMENTS} surface`);
  return surface;
}

/** Columns the surface may really UPDATE: the narrowed list when present, otherwise all of them. */
function updatableColumns(surface) {
  assert.ok(surface.operations.includes('UPDATE'), 'surface does not update at all');
  return new Set(surface.operationColumns?.UPDATE ?? surface.columns);
}

test('the doctor may write the snapshot but never the money that actually arrived', () => {
  const update = directGrant('app_staff', 'UPDATE');
  assert.ok(update, 'app_staff UPDATE grant on be_appointments');
  assert.notEqual(update.columns, 'table', 'app_staff UPDATE must stay column-scoped');
  const granted = new Set(update.columns);
  assert.deepEqual(
    SNAPSHOT_COLUMNS.filter((column) => !granted.has(column)),
    [],
    'the staff edit path cannot persist the snapshot it is authorised to change',
  );
  assert.equal(
    granted.has(FACTUAL_MONEY_COLUMN),
    false,
    `app_staff must not update ${FACTUAL_MONEY_COLUMN}: a doctor edit would forge a payment`,
  );
});

test('the patient role reaches an appointment only through a named root', () => {
  const access = REV10_CLINICAL_ACCESS[APPOINTMENTS];
  const patientGrants = access.grants.filter((grant) => grant.role === 'app_patient');
  assert.deepEqual(
    patientGrants,
    [],
    'app_patient holds a direct grant on be_appointments; the patient door must stay a definer root',
  );
});

test('the patient booking door creates an appointment and never updates its money afterwards', () => {
  const create = appointmentSurface('app.create_current_patient_booking_appointments(text)');
  assert.deepEqual(create.operations.includes('UPDATE'), false, 'patient create must not update');
  assert.deepEqual(
    SNAPSHOT_COLUMNS.filter((column) => !create.columns.includes(column)),
    [],
    'the patient door must persist the same snapshot columns as the staff door',
  );
  assert.equal(fn('app.create_current_patient_booking_appointments(text)').execute.join(), 'app_patient');
});

test('a patient reschedule or cancellation reads the money but cannot rewrite it', () => {
  for (const identity of [
    'app.apply_current_patient_booking_reschedule(text)',
    'app.apply_current_patient_booking_cancellation(text)',
  ]) {
    const surface = appointmentSurface(identity);
    // These roots return the whole row (`to_jsonb` of `UPDATE … RETURNING *`), so reading the
    // financial columns is required; writing them is not, and must stay refused.
    assert.deepEqual(
      SNAPSHOT_COLUMNS.filter((column) => !surface.columns.includes(column)),
      [],
      `${identity} returns the whole appointment row and needs to read the snapshot`,
    );
    const writable = updatableColumns(surface);
    assert.deepEqual(
      [...SNAPSHOT_COLUMNS, FACTUAL_MONEY_COLUMN].filter((column) => writable.has(column)),
      [],
      `${identity} may write appointment money; the patient seam must not`,
    );
  }
});

test('only the payment seam writes the money that actually arrived', () => {
  const writers = Object.entries(declaration.portContext.functions).filter(([, declared]) => {
    const surface = (declared.relationSurfaces ?? []).find((e) => e.relation === APPOINTMENTS);
    if (!surface || !surface.operations.includes('UPDATE')) return false;
    return updatableColumns(surface).has(FACTUAL_MONEY_COLUMN);
  });
  // Двери приёма денег ровно две — онлайн-платёж провайдера и наличные в кассе, — и обе стоят у
  // ОДНОГО шва. Третья дверь здесь означала бы, что зачислить предоплату умеет кто-то ещё.
  assert.deepEqual(
    writers.map(([identity]) => identity).sort(),
    [
      'app.settle_appointment_cash_prepayment(text)',
      'app.settle_booking_payment_webhook_event(text,text,text,text,text)',
    ],
    'more than the two payment-seam roots may credit an appointment prepayment',
  );
  for (const [, declared] of writers) {
    assert.equal(declared.owner, 'app_seam_payment_webhook_owner');
    assert.equal(declared.security, 'DEFINER');
  }
  assert.deepEqual(fn('app.settle_booking_payment_webhook_event(text,text,text,text,text)').execute, [
    'app_tenant_service',
  ]);
  assert.deepEqual(fn('app.settle_appointment_cash_prepayment(text)').execute, ['app_staff']);
});

test('the cash door credits money but never rewrites the price it was measured against', () => {
  const identity = 'app.settle_appointment_cash_prepayment(text)';
  const surface = appointmentSurface(identity);
  const writable = updatableColumns(surface);
  // Наличные — факт денег. Стоимость и условие предоплаты они не переписывают: иначе касса стала бы
  // второй дверью правки снимка, и показанное пациенту требование можно было бы подогнать под кассу.
  assert.deepEqual(
    SNAPSHOT_COLUMNS.filter((column) => writable.has(column)),
    [],
    `${identity} may rewrite the financial snapshot; only the staff edit path may`,
  );
  assert.ok(writable.has(FACTUAL_MONEY_COLUMN), `${identity} must credit ${FACTUAL_MONEY_COLUMN}`);
  // Ledger и запись обязаны меняться одним корнем: разложенные на два коммита они оставляют
  // оплаченную наличными запись под отменой по истечении срока.
  const ledger = (fn(identity).relationSurfaces ?? []).find(
    (entry) => entry.relation === 'public.patient_payment',
  );
  assert.ok(ledger, `${identity} must write the cash ledger in the same root`);
  assert.ok(ledger.operations.includes('INSERT'), 'cash root must insert the ledger row');
});

test('the cash settlement is reached through the declared staff port capability', () => {
  const capability = Object.values(declaration.portContext.capabilities ?? {}).find(
    (entry) => entry.functionIdentity === 'app.settle_appointment_cash_prepayment(text)',
  );
  assert.ok(capability, 'no port capability declares the cash settlement root');
  assert.equal(capability.sessionRole, 'app_staff');
  assert.equal(capability.targetRole, 'app_staff');
  assert.equal(capability.contextClass, 'staff');
  assert.equal(capability.purpose, 'booking-payment.prepayment.cash-settle');
});

test('the expiry job may only release the slot, never touch money', () => {
  const identity = 'app.expire_due_booking_prepayments(integer)';
  const declared = fn(identity);
  assert.equal(declared.security, 'DEFINER');
  assert.equal(declared.owner, 'app_seam_payment_webhook_owner');
  assert.deepEqual(
    declared.execute,
    ['app_worker'],
    'the expiry sweep must be reachable only by the system job role',
  );
  const surface = appointmentSurface(identity);
  // It has to READ the money to decide whether the deadline may still be enforced …
  for (const column of ['payment_ref', FACTUAL_MONEY_COLUMN, 'payment_deadline_at', 'status']) {
    assert.ok(surface.columns.includes(column), `${identity} must read ${column}`);
  }
  // … and it writes nothing but the slot release itself.
  assert.deepEqual(
    [...updatableColumns(surface)].sort(),
    ['payment_deadline_at', 'status', 'updated_at'],
    'the expiry sweep may write columns beyond the slot release',
  );
});

test('the expiry job is reached through the declared port capability, not an ad-hoc role switch', () => {
  const capability = Object.values(declaration.portContext.capabilities ?? {}).find(
    (entry) => entry.functionIdentity === 'app.expire_due_booking_prepayments(integer)',
  );
  assert.ok(capability, 'no port capability declares the expiry root');
  assert.equal(capability.targetRole, 'app_worker');
  assert.equal(capability.contextClass, 'service');
  assert.equal(capability.purpose, 'booking-payment.prepayment.expire');
});
