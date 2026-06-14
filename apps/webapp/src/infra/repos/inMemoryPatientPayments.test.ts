import { describe, it, expect, beforeEach } from "vitest";
import {
  inMemoryPatientPaymentsPort,
  __resetInMemoryPatientPaymentsForTest,
} from "./inMemoryPatientPayments";

const PATIENT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const DOCTOR = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

describe("inMemoryPatientPayments", () => {
  beforeEach(() => {
    __resetInMemoryPatientPaymentsForTest();
  });

  it("addCashPayment then listPayments returns the payment", async () => {
    const payment = await inMemoryPatientPaymentsPort.addCashPayment({
      patientUserId: PATIENT,
      amountMinor: 150000, // 1500 рублей в копейках
      currency: "RUB",
      comment: "Наличные на стойке",
      service: "Первичный приём",
      visitId: null,
      createdBy: DOCTOR,
    });

    expect(payment.id).toBeTruthy();
    expect(payment.patientUserId).toBe(PATIENT);
    expect(payment.amountMinor).toBe(150000);
    expect(payment.currency).toBe("RUB");
    expect(payment.kind).toBe("cash");
    expect(payment.status).toBe("paid");
    expect(payment.comment).toBe("Наличные на стойке");
    expect(payment.service).toBe("Первичный приём");
    expect(payment.provider).toBeNull();
    expect(payment.providerPaymentId).toBeNull();

    const list = await inMemoryPatientPaymentsPort.listPayments(PATIENT);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(payment.id);
  });

  it("listPayments returns newest first", async () => {
    const p1 = await inMemoryPatientPaymentsPort.addCashPayment({
      patientUserId: PATIENT,
      amountMinor: 50000,
      createdBy: DOCTOR,
    });
    // Short delay to ensure distinct createdAt
    await new Promise((r) => setTimeout(r, 2));
    const p2 = await inMemoryPatientPaymentsPort.addCashPayment({
      patientUserId: PATIENT,
      amountMinor: 80000,
      createdBy: DOCTOR,
    });

    const list = await inMemoryPatientPaymentsPort.listPayments(PATIENT);
    expect(list).toHaveLength(2);
    // p2 is newer — should come first
    expect(list[0].id).toBe(p2.id);
    expect(list[1].id).toBe(p1.id);
  });

  it("rejects amount <= 0", async () => {
    await expect(
      inMemoryPatientPaymentsPort.addCashPayment({
        patientUserId: PATIENT,
        amountMinor: 0,
        createdBy: DOCTOR,
      }),
    ).rejects.toThrow("payment_amount_must_be_positive_integer");

    await expect(
      inMemoryPatientPaymentsPort.addCashPayment({
        patientUserId: PATIENT,
        amountMinor: -100,
        createdBy: DOCTOR,
      }),
    ).rejects.toThrow("payment_amount_must_be_positive_integer");
  });

  it("listPayments isolates by patientUserId", async () => {
    const OTHER_PATIENT = "cccccccc-cccc-cccc-cccc-cccccccccccc";
    await inMemoryPatientPaymentsPort.addCashPayment({
      patientUserId: PATIENT,
      amountMinor: 10000,
      createdBy: DOCTOR,
    });
    await inMemoryPatientPaymentsPort.addCashPayment({
      patientUserId: OTHER_PATIENT,
      amountMinor: 20000,
      createdBy: DOCTOR,
    });

    const list = await inMemoryPatientPaymentsPort.listPayments(PATIENT);
    expect(list).toHaveLength(1);
    expect(list[0].patientUserId).toBe(PATIENT);
  });
});
