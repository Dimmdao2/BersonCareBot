import { describe, expect, it, vi } from 'vitest';
import { createProductsService } from './service';
import type { ProductsPort } from './ports';

function makePort(overrides: Partial<ProductsPort> = {}): ProductsPort {
  return {
    listProducts: vi.fn(),
    resolveProductOrganizationId: vi.fn(),
    getProduct: vi.fn(),
    upsertProduct: vi.fn(),
    createPayLink: vi.fn(),
    getPayLinkByToken: vi.fn(),
    incrementPayLinkUse: vi.fn(),
    createPurchase: vi.fn(),
    resolvePurchaseOrganizationId: vi.fn(),
    getPurchase: vi.fn(),
    listPurchasesForUser: vi.fn(),
    listPurchasesByPhone: vi.fn(),
    linkPurchasesByPhone: vi.fn(),
    setPurchaseStatus: vi.fn(),
    appendHistoryEvent: vi.fn(),
    ...overrides,
  };
}

describe('products service', () => {
  it('linkPurchasesByPhone normalizes phone', async () => {
    const linkPurchasesByPhone = vi.fn().mockResolvedValue(2);
    const svc = createProductsService({
      port: makePort({ linkPurchasesByPhone }),
      payments: null,
      entitlements: null,
      memberships: null,
      courses: null,
    });
    const n = await svc.linkPurchasesForUser('u1', '89991234567', 'org-1');
    expect(n).toBe(2);
    expect(linkPurchasesByPhone).toHaveBeenCalledWith('u1', '+79991234567', 'org-1');
  });

  it('activatePurchase grants course enrollment', async () => {
    const enrollPatient = vi.fn().mockResolvedValue({});
    const purchase = {
      id: 'pur-1',
      organizationId: 'org-1',
      productId: 'prod-1',
      productType: 'course' as const,
      platformUserId: 'u1',
      buyerPhoneNormalized: null,
      giftRecipientPhoneNormalized: null,
      status: 'awaiting_payment' as const,
      title: 'Курс',
      priceMinor: 1000,
      currency: 'RUB',
      validityDays: null,
      validFrom: null,
      validUntil: null,
      fulfillmentJson: {},
      paymentIntentId: null,
      paymentRef: 'pay-1',
      payLinkId: null,
    };
    const product = {
      id: 'prod-1',
      organizationId: 'org-1',
      productType: 'course' as const,
      title: 'Курс',
      description: null,
      priceMinor: 1000,
      currency: 'RUB',
      compositionJson: {},
      accessRulesJson: {},
      paymentRulesJson: {},
      validityDays: null,
      courseId: 'course-1',
      subscriptionPackageId: null,
      showInPatientCatalog: true,
      payByLinkEnabled: false,
      isActive: true,
    };
    const setPurchaseStatus = vi.fn().mockResolvedValue({ ...purchase, status: 'active' });
    const svc = createProductsService({
      port: makePort({
        getPurchase: vi.fn().mockResolvedValue(purchase),
        getProduct: vi.fn().mockResolvedValue(product),
        setPurchaseStatus,
        appendHistoryEvent: vi.fn(),
      }),
      payments: null,
      entitlements: null,
      memberships: null,
      courses: { enrollPatient } as never,
      isCourseMechanicEnabled: vi.fn().mockResolvedValue(true),
      courseBelongsToOrganization: vi.fn().mockResolvedValue(true),
      hasActivePatientEnrollment: vi.fn().mockResolvedValue(true),
    });
    await svc.activatePurchase('pur-1', 'org-1', 'pay-1');
    expect(enrollPatient).toHaveBeenCalledWith({ courseId: 'course-1', patientUserId: 'u1' });

    enrollPatient.mockClear();
    setPurchaseStatus.mockClear();
    const denied = createProductsService({
      port: makePort({
        getPurchase: vi.fn().mockResolvedValue(purchase),
        getProduct: vi.fn().mockResolvedValue(product),
        setPurchaseStatus,
        appendHistoryEvent: vi.fn(),
      }),
      payments: null,
      entitlements: null,
      memberships: null,
      courses: { enrollPatient } as never,
      isCourseMechanicEnabled: vi.fn().mockResolvedValue(true),
      courseBelongsToOrganization: vi.fn().mockResolvedValue(true),
      hasActivePatientEnrollment: vi.fn().mockResolvedValue(false),
    });
    await expect(denied.activatePurchase('pur-1', 'org-1', 'pay-1')).rejects.toThrow(
      'course_patient_enrollment_required',
    );
    expect(enrollPatient).not.toHaveBeenCalled();
    expect(setPurchaseStatus).not.toHaveBeenCalled();
  });

  it('rejects an OFF or foreign course product before product mutation', async () => {
    const upsertProduct = vi.fn();
    const input = {
      organizationId: 'org-1',
      productType: 'course' as const,
      title: 'Курс',
      priceMinor: 1000,
      courseId: 'course-1',
    };
    const off = createProductsService({
      port: makePort({ upsertProduct }),
      payments: null,
      entitlements: null,
      memberships: null,
      courses: null,
      isCourseMechanicEnabled: vi.fn().mockResolvedValue(false),
      courseBelongsToOrganization: vi.fn().mockResolvedValue(true),
    });
    await expect(off.upsertProduct(input)).rejects.toThrow('course_entitlement_required');

    const foreign = createProductsService({
      port: makePort({ upsertProduct }),
      payments: null,
      entitlements: null,
      memberships: null,
      courses: null,
      isCourseMechanicEnabled: vi.fn().mockResolvedValue(true),
      courseBelongsToOrganization: vi.fn().mockResolvedValue(false),
    });
    await expect(foreign.upsertProduct(input)).rejects.toThrow('course_not_found');
    expect(upsertProduct).not.toHaveBeenCalled();
  });

  it('hides an OFF course product while retaining ordinary products', async () => {
    const ordinary = {
      id: 'prod-ordinary',
      organizationId: 'org-1',
      productType: 'single_visit' as const,
      title: 'Приём',
      description: null,
      priceMinor: 1000,
      currency: 'RUB',
      compositionJson: {},
      accessRulesJson: {},
      paymentRulesJson: {},
      validityDays: null,
      courseId: null,
      subscriptionPackageId: null,
      showInPatientCatalog: true,
      payByLinkEnabled: true,
      isActive: true,
    };
    const course = {
      ...ordinary,
      id: 'prod-course',
      productType: 'course' as const,
      courseId: 'course-1',
    };
    const svc = createProductsService({
      port: makePort({ listProducts: vi.fn().mockResolvedValue([course, ordinary]) }),
      payments: null,
      entitlements: null,
      memberships: null,
      courses: null,
      isCourseMechanicEnabled: vi.fn().mockResolvedValue(false),
    });
    await expect(svc.listCatalog('org-1')).resolves.toEqual([ordinary]);
    await expect(svc.listStaffProducts('org-1')).resolves.toEqual([ordinary]);
  });

  it('keeps OFF course products inert for pay-link reads and writes', async () => {
    const product = {
      id: 'prod-course',
      organizationId: 'org-1',
      productType: 'course' as const,
      title: 'Курс',
      description: null,
      priceMinor: 1000,
      currency: 'RUB',
      compositionJson: {},
      accessRulesJson: {},
      paymentRulesJson: {},
      validityDays: null,
      courseId: 'course-1',
      subscriptionPackageId: null,
      showInPatientCatalog: true,
      payByLinkEnabled: true,
      isActive: true,
    };
    const createPayLink = vi.fn();
    const svc = createProductsService({
      port: makePort({
        getProduct: vi.fn().mockResolvedValue(product),
        createPayLink,
        getPayLinkByToken: vi.fn().mockResolvedValue({
          id: 'link-1',
          organizationId: 'org-1',
          productId: product.id,
          token: 'token',
          expiresAt: null,
          maxUses: null,
          useCount: 0,
          isActive: true,
          product,
        }),
      }),
      payments: null,
      entitlements: null,
      memberships: null,
      courses: null,
      isCourseMechanicEnabled: vi.fn().mockResolvedValue(false),
    });
    await expect(svc.resolvePayLink('token')).resolves.toBeNull();
    await expect(
      svc.createPayLink({ organizationId: 'org-1', productId: product.id }),
    ).rejects.toThrow('course_entitlement_required');
    expect(createPayLink).not.toHaveBeenCalled();
  });

  it('rejects course purchase without an active exact-organization enrollment before mutation', async () => {
    const product = {
      id: 'prod-course',
      organizationId: 'org-1',
      productType: 'course' as const,
      title: 'Курс',
      description: null,
      priceMinor: 1000,
      currency: 'RUB',
      compositionJson: {},
      accessRulesJson: {},
      paymentRulesJson: {},
      validityDays: null,
      courseId: 'course-1',
      subscriptionPackageId: null,
      showInPatientCatalog: true,
      payByLinkEnabled: true,
      isActive: true,
    };
    const incrementPayLinkUse = vi.fn();
    const createPurchase = vi.fn();
    const svc = createProductsService({
      port: makePort({
        getPayLinkByToken: vi.fn().mockResolvedValue({
          id: 'link-1',
          organizationId: 'org-1',
          productId: product.id,
          token: 'token',
          expiresAt: null,
          maxUses: null,
          useCount: 0,
          isActive: true,
          product,
        }),
        incrementPayLinkUse,
        createPurchase,
      }),
      payments: null,
      entitlements: null,
      memberships: null,
      courses: null,
      isCourseMechanicEnabled: vi.fn().mockResolvedValue(true),
      courseBelongsToOrganization: vi.fn().mockResolvedValue(true),
      hasActivePatientEnrollment: vi.fn().mockResolvedValue(false),
    });
    await expect(
      svc.startPurchase({
        organizationId: 'org-1',
        productId: product.id,
        platformUserId: 'patient-1',
        payLinkToken: 'token',
      }),
    ).rejects.toThrow('course_patient_enrollment_required');
    expect(incrementPayLinkUse).not.toHaveBeenCalled();
    expect(createPurchase).not.toHaveBeenCalled();
  });

  it('does not create an identity while rejecting an unknown public course buyer', async () => {
    const product = {
      id: 'prod-course',
      organizationId: 'org-1',
      productType: 'course' as const,
      title: 'Курс',
      description: null,
      priceMinor: 1000,
      currency: 'RUB',
      compositionJson: {},
      accessRulesJson: {},
      paymentRulesJson: {},
      validityDays: null,
      courseId: 'course-1',
      subscriptionPackageId: null,
      showInPatientCatalog: true,
      payByLinkEnabled: true,
      isActive: true,
    };
    const resolvePlatformUserByPhone = vi.fn();
    const createPurchase = vi.fn();
    const svc = createProductsService({
      port: makePort({ getProduct: vi.fn().mockResolvedValue(product), createPurchase }),
      payments: null,
      entitlements: null,
      memberships: null,
      courses: null,
      resolvePlatformUserByPhone,
      findPlatformUserByPhone: vi.fn().mockResolvedValue(null),
      isCourseMechanicEnabled: vi.fn().mockResolvedValue(true),
      courseBelongsToOrganization: vi.fn().mockResolvedValue(true),
    });
    await expect(
      svc.startPurchase({
        organizationId: 'org-1',
        productId: product.id,
        buyerPhone: '+79990001122',
      }),
    ).rejects.toThrow('platform_user_required_for_course');
    expect(resolvePlatformUserByPhone).not.toHaveBeenCalled();
    expect(createPurchase).not.toHaveBeenCalled();
  });

  it('listActivePurchasesForBooking filters by service and visits', async () => {
    const purchase = {
      id: 'pur-2',
      organizationId: 'org-1',
      productId: 'prod-2',
      productType: 'promo' as const,
      platformUserId: 'u1',
      buyerPhoneNormalized: null,
      giftRecipientPhoneNormalized: null,
      status: 'active' as const,
      title: 'Акция',
      priceMinor: 0,
      currency: 'RUB',
      validityDays: null,
      validFrom: null,
      validUntil: null,
      fulfillmentJson: { visitsRemaining: 2 },
      paymentIntentId: null,
      paymentRef: null,
      payLinkId: null,
    };
    const product = {
      id: 'prod-2',
      organizationId: 'org-1',
      productType: 'promo' as const,
      title: 'Акция',
      description: null,
      priceMinor: 0,
      currency: 'RUB',
      compositionJson: { serviceIds: ['svc-1'], visitCount: 2 },
      accessRulesJson: {},
      paymentRulesJson: {},
      validityDays: null,
      courseId: null,
      subscriptionPackageId: null,
      showInPatientCatalog: true,
      payByLinkEnabled: false,
      isActive: true,
    };
    const svc = createProductsService({
      port: makePort({
        listPurchasesForUser: vi.fn().mockResolvedValue([purchase]),
        getProduct: vi.fn().mockResolvedValue(product),
      }),
      payments: null,
      entitlements: null,
      memberships: null,
      courses: null,
    });
    const list = await svc.listActivePurchasesForBooking('u1', 'org-1', 'svc-1');
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe('pur-2');
    const empty = await svc.listActivePurchasesForBooking('u1', 'org-1', 'other');
    expect(empty).toHaveLength(0);
  });

  it('activatePurchase links platform user from buyer phone before fulfillment', async () => {
    const setPurchaseStatus = vi.fn().mockResolvedValue({
      id: 'pur-3',
      organizationId: 'org-1',
      productId: 'prod-3',
      productType: 'content_access' as const,
      platformUserId: 'u-guest',
      buyerPhoneNormalized: '+79991112233',
      giftRecipientPhoneNormalized: null,
      status: 'offered' as const,
      title: 'Доступ',
      priceMinor: 0,
      currency: 'RUB',
      validityDays: 30,
      validFrom: null,
      validUntil: null,
      fulfillmentJson: {},
      paymentIntentId: null,
      paymentRef: null,
      payLinkId: null,
    });
    const purchase = {
      id: 'pur-3',
      organizationId: 'org-1',
      productId: 'prod-3',
      productType: 'content_access' as const,
      platformUserId: null,
      buyerPhoneNormalized: '+79991112233',
      giftRecipientPhoneNormalized: null,
      status: 'offered' as const,
      title: 'Доступ',
      priceMinor: 0,
      currency: 'RUB',
      validityDays: 30,
      validFrom: null,
      validUntil: null,
      fulfillmentJson: {},
      paymentIntentId: null,
      paymentRef: null,
      payLinkId: null,
    };
    const product = {
      id: 'prod-3',
      organizationId: 'org-1',
      productType: 'content_access' as const,
      title: 'Доступ',
      description: null,
      priceMinor: 0,
      currency: 'RUB',
      compositionJson: { contentIds: ['lesson-x'] },
      accessRulesJson: {},
      paymentRulesJson: {},
      validityDays: 30,
      courseId: null,
      subscriptionPackageId: null,
      showInPatientCatalog: true,
      payByLinkEnabled: false,
      isActive: true,
    };
    const grantContentAccessForPurchase = vi.fn();
    const getPurchase = vi.fn().mockResolvedValue(purchase);
    const svc = createProductsService({
      port: makePort({
        getPurchase,
        getProduct: vi.fn().mockResolvedValue(product),
        setPurchaseStatus,
        appendHistoryEvent: vi.fn(),
      }),
      payments: null,
      entitlements: { grantContentAccessForPurchase } as never,
      memberships: null,
      courses: null,
      resolvePlatformUserByPhone: vi.fn(async () => ({ ok: true as const, userId: 'u-guest' })),
    });
    await svc.activatePurchase('pur-3', 'org-1');
    expect(grantContentAccessForPurchase).toHaveBeenCalledWith(
      expect.objectContaining({ platformUserId: 'u-guest', contentIds: ['lesson-x'] }),
    );
  });
});
