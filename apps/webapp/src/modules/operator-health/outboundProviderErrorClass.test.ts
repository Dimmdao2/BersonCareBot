import { describe, expect, it } from "vitest";
import {
  classifyOutboundProviderErrorClass,
  isPageOnFirstOccurrenceProviderErrorClass,
} from "@bersoncare/operator-db-schema";

/**
 * D-f. Оба сигнала — ловушки по построению, и оба обязаны попадать в собственный класс,
 * а не в общий retry / «проблема с учёткой, залогируем».
 */
describe("classifyOutboundProviderErrorClass", () => {
  it("classifies the SES-style daily quota rejection, which is a 4xx", () => {
    // Конформный SMTP-клиент ретраит 4xx молча — именно так июльский отказ прожил сутки.
    expect(
      classifyOutboundProviderErrorClass("454 Throttling failure: Daily message quota exceeded"),
    ).toBe("provider_quota_exhausted");
    expect(classifyOutboundProviderErrorClass("452 4.5.3 Too many messages")).toBe(
      "provider_quota_exhausted",
    );
    expect(classifyOutboundProviderErrorClass("421 4.7.0 Maximum sending rate reached")).toBe(
      "provider_quota_exhausted",
    );
  });

  it("classifies SendGrid-style credit exhaustion that arrives as HTTP 401", () => {
    expect(classifyOutboundProviderErrorClass("HTTP 401 Maximum credits exceeded")).toBe(
      "provider_credit_exhausted",
    );
    expect(classifyOutboundProviderErrorClass("provider responded 402: insufficient balance")).toBe(
      "provider_credit_exhausted",
    );
  });

  it("does not let a bare 401 fall into a log-and-forget bucket", () => {
    const cls = classifyOutboundProviderErrorClass("http_401");
    expect(cls).toBe("provider_auth_rejected");
    expect(isPageOnFirstOccurrenceProviderErrorClass(cls)).toBe(true);
  });

  it("classifies SMTP credential rejection", () => {
    expect(classifyOutboundProviderErrorClass("535 5.7.8 Authentication failed")).toBe(
      "provider_auth_rejected",
    );
    expect(classifyOutboundProviderErrorClass("EAUTH: Invalid login")).toBe("provider_auth_rejected");
  });

  it("keeps ordinary transport failures out of the paging classes", () => {
    for (const message of ["ECONNREFUSED 127.0.0.1:587", "socket timeout", "HTTP 503", ""]) {
      const cls = classifyOutboundProviderErrorClass(message);
      expect(cls).toBe("provider_send_failed");
      expect(isPageOnFirstOccurrenceProviderErrorClass(cls)).toBe(false);
    }
  });

  it("pages on the first occurrence for every dead-delivery class", () => {
    for (const message of [
      "454 Daily message quota exceeded",
      "401 Maximum credits exceeded",
      "535 authentication failed",
      "email_not_configured",
    ]) {
      expect(isPageOnFirstOccurrenceProviderErrorClass(classifyOutboundProviderErrorClass(message))).toBe(
        true,
      );
    }
  });
});
