/**
 * Unit-тесты для sendBookingConfirmationEmail (#81).
 *
 * Проверяем:
 * 1. При наличии email — relayOutbound вызывается с нужными параметрами (channel=email, icsContent, subject).
 * 2. При отсутствии email — relayOutbound НЕ вызывается.
 * 3. При ошибке relay — функция возвращает false, НЕ бросает исключение.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendBookingConfirmationEmail } from "./sendBookingConfirmationEmail";

const relayOutboundMock = vi.hoisted(() => vi.fn());
vi.mock("@/modules/messaging/relayOutbound", () => ({
  relayOutbound: relayOutboundMock,
}));

// Logger не должен мешать тестам
vi.mock("@/infra/logging/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const baseInput = {
  bookingId: "booking-abc123",
  contactEmail: "patient@example.com",
  slotStart: "2026-08-15T10:00:00.000Z",
  slotEnd: "2026-08-15T11:00:00.000Z",
  serviceTitle: "Консультация врача",
  locationLabel: "Москва, ул. Лесная 10",
  contactName: "Иван Иванов",
};

describe("sendBookingConfirmationEmail", () => {
  beforeEach(() => {
    relayOutboundMock.mockClear();
  });

  it("вызывает relayOutbound с channel=email и icsContent при наличии contactEmail", async () => {
    relayOutboundMock.mockResolvedValue({ ok: true, status: "accepted" });

    const result = await sendBookingConfirmationEmail(baseInput);

    expect(result).toBe(true);
    expect(relayOutboundMock).toHaveBeenCalledTimes(1);

    const [params] = relayOutboundMock.mock.calls[0] as Parameters<typeof relayOutboundMock>;
    expect(params.channel).toBe("email");
    expect(params.recipient).toBe("patient@example.com");
    // ICS вложение должно быть передано как base64
    expect(typeof params.icsContent).toBe("string");
    expect(params.icsContent!.length).toBeGreaterThan(0);
    // Декодируем и проверяем содержимое ICS
    const icsDecoded = Buffer.from(params.icsContent!, "base64").toString("utf-8");
    expect(icsDecoded).toContain("BEGIN:VCALENDAR");
    expect(icsDecoded).toContain("DTSTART:20260815T100000Z");
    expect(icsDecoded).toContain("SUMMARY:Консультация врача");
    expect(icsDecoded).toContain(`UID:booking-${baseInput.bookingId}@bersoncare.ru`);
    // Subject в metadata
    expect(params.metadata).toMatchObject({
      subject: expect.stringContaining("Консультация врача"),
    });
    // Имя файла должно содержать bookingId
    expect(params.icsFilename).toContain(baseInput.bookingId);
  });

  it("НЕ вызывает relayOutbound если contactEmail не указан (null)", async () => {
    const result = await sendBookingConfirmationEmail({ ...baseInput, contactEmail: null });

    expect(result).toBe(false);
    expect(relayOutboundMock).not.toHaveBeenCalled();
  });

  it("НЕ вызывает relayOutbound если contactEmail пустая строка", async () => {
    const result = await sendBookingConfirmationEmail({ ...baseInput, contactEmail: "   " });

    expect(result).toBe(false);
    expect(relayOutboundMock).not.toHaveBeenCalled();
  });

  it("НЕ вызывает relayOutbound если contactEmail undefined", async () => {
    const result = await sendBookingConfirmationEmail({ ...baseInput, contactEmail: undefined });

    expect(result).toBe(false);
    expect(relayOutboundMock).not.toHaveBeenCalled();
  });

  it("возвращает false (не бросает) если relay возвращает ok=false", async () => {
    relayOutboundMock.mockResolvedValue({ ok: false, reason: "no_integrator_url" });

    const result = await sendBookingConfirmationEmail(baseInput);

    expect(result).toBe(false);
    expect(relayOutboundMock).toHaveBeenCalledTimes(1);
  });

  it("возвращает false (не бросает) если relay выбрасывает исключение", async () => {
    relayOutboundMock.mockRejectedValue(new Error("network_error"));

    const result = await sendBookingConfirmationEmail(baseInput);

    expect(result).toBe(false);
    expect(relayOutboundMock).toHaveBeenCalledTimes(1);
  });

  it("передаёт locationLabel как LOCATION в ICS", async () => {
    relayOutboundMock.mockResolvedValue({ ok: true, status: "accepted" });

    await sendBookingConfirmationEmail(baseInput);

    const [params] = relayOutboundMock.mock.calls[0] as Parameters<typeof relayOutboundMock>;
    const icsDecoded = Buffer.from(params.icsContent!, "base64").toString("utf-8");
    expect(icsDecoded).toContain("LOCATION:Москва\\, ул. Лесная 10");
  });

  it("работает без locationLabel (online-консультация)", async () => {
    relayOutboundMock.mockResolvedValue({ ok: true, status: "accepted" });

    const result = await sendBookingConfirmationEmail({
      ...baseInput,
      locationLabel: null,
    });

    expect(result).toBe(true);
    const [params] = relayOutboundMock.mock.calls[0] as Parameters<typeof relayOutboundMock>;
    const icsDecoded = Buffer.from(params.icsContent!, "base64").toString("utf-8");
    // LOCATION не должна быть в ICS если locationLabel пустой
    expect(icsDecoded).not.toContain("LOCATION:");
  });
});
