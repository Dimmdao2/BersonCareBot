import { describe, expect, it } from 'vitest';
import { createProductsService } from './service';
import { createCoursesService } from '@/modules/courses/service';
import {
  assertMechanicWriteClearance,
  enterWithMechanicWriteClearance,
  ensureMechanicWriteClearanceContext,
  runWithoutMechanicWriteClearance,
} from '@/app-layer/entitlements/mechanicWriteClearance';
import type { CourseIntroPagesPort, CoursesPort } from '@/modules/courses/ports';
import type { CourseRecord } from '@/modules/courses/types';
import type { ProductsPort } from './ports';
import type { ProductPurchaseRecord, ProductRecord } from './types';

const organizationId = 'aaaaaaaa-1111-4111-8111-111111111111';
const courseId = 'bbbbbbbb-1111-4111-8111-111111111111';
const productId = 'cccccccc-1111-4111-8111-111111111111';
const purchaseId = 'dddddddd-1111-4111-8111-111111111111';
const platformUserId = 'eeeeeeee-1111-4111-8111-111111111111';
const programTemplateId = 'ffffffff-1111-4111-8111-111111111111';

const course: CourseRecord = {
  id: courseId,
  title: 'Курс',
  description: null,
  programTemplateId,
  introLessonPageId: null,
  accessSettings: {},
  status: 'published',
  priceMinor: 500000,
  currency: 'RUB',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const product: ProductRecord = {
  id: productId,
  organizationId,
  productType: 'course',
  title: 'Курс',
  description: null,
  priceMinor: 500000,
  currency: 'RUB',
  compositionJson: {},
  accessRulesJson: {},
  paymentRulesJson: {},
  validityDays: null,
  courseId,
  subscriptionPackageId: null,
  showInPatientCatalog: true,
  payByLinkEnabled: false,
  isActive: true,
};

function buildPurchase(): ProductPurchaseRecord {
  return {
    id: purchaseId,
    organizationId,
    productId,
    productType: 'course',
    platformUserId,
    buyerPhoneNormalized: null,
    giftRecipientPhoneNormalized: null,
    status: 'awaiting_payment',
    title: product.title,
    priceMinor: product.priceMinor,
    currency: product.currency,
    validityDays: null,
    validFrom: null,
    validUntil: null,
    fulfillmentJson: {},
    paymentIntentId: 'intent-1',
    paymentRef: null,
    payLinkId: null,
  };
}

function buildServices() {
  const coursesPort: CoursesPort = {
    listPublished: async () => [course],
    listAssignedToPatient: async () => [],
    listForDoctor: async () => [],
    getById: async (id) => (id === courseId ? course : null),
    create: async () => {
      throw new Error('unused');
    },
    update: async () => null,
    getCourseUsageSummary: async () => null,
  };
  const introPages: CourseIntroPagesPort = { getById: async () => null };
  const enrolled: unknown[] = [];
  const coursesService = createCoursesService({
    courses: coursesPort,
    introPages,
    assertWriteClearance: assertMechanicWriteClearance,
    assignTemplateToPatient: async (input) => {
      enrolled.push(input);
      return { instanceId: 'instance-1' };
    },
  });

  let purchase = buildPurchase();
  const productsPort: ProductsPort = {
    listProducts: async () => [product],
    resolveProductOrganizationId: async () => organizationId,
    getProduct: async (id, org) => (id === productId && org === organizationId ? product : null),
    upsertProduct: async () => {
      throw new Error('unused');
    },
    createPayLink: async () => {
      throw new Error('unused');
    },
    getPayLinkByToken: async () => null,
    incrementPayLinkUse: async () => {},
    createPurchase: async () => {
      throw new Error('unused');
    },
    resolvePurchaseOrganizationId: async () => organizationId,
    getPurchase: async (id, org) =>
      id === purchaseId && org === organizationId ? purchase : null,
    listPurchasesForUser: async () => [],
    listPurchasesByPhone: async () => [],
    linkPurchasesByPhone: async () => 0,
    setPurchaseStatus: async (id, org, status, patch) => {
      if (id !== purchaseId || org !== organizationId) return null;
      purchase = { ...purchase, status, ...patch };
      return purchase;
    },
    appendHistoryEvent: async () => {},
  };

  const productsService = createProductsService({
    port: productsPort,
    payments: null,
    entitlements: null,
    memberships: null,
    courses: coursesService,
    isCourseMechanicEnabled: async () => true,
    courseBelongsToOrganization: async () => true,
    hasActivePatientEnrollment: async () => true,
    ensureWriteClearanceContext: ensureMechanicWriteClearanceContext,
    grantWriteClearance: enterWithMechanicWriteClearance,
  });

  return { productsService, enrolled, getPurchase: () => purchase };
}

describe('products service — 3.2 круг 2, оплаченный курс зачисляется по пути вебхука', () => {
  it('activatePurchase enrolls the patient with no requireEntitlementForMutation("courses") decision ever run — the webhook shape', async () => {
    const { productsService, enrolled, getPurchase } = buildServices();

    await runWithoutMechanicWriteClearance(() =>
      productsService.activatePurchase(purchaseId, organizationId, 'payment-1'),
    );

    expect(enrolled).toHaveLength(1);
    expect(getPurchase().status).toBe('active');
  });
});
