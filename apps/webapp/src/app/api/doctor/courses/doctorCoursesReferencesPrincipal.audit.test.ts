import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

const doctorApiWriteRoutes = [
  'src/app/api/doctor/courses/route.ts',
  'src/app/api/doctor/courses/[id]/route.ts',
  'src/app/api/doctor/references/[categoryCode]/route.ts',
];

const doctorActionFiles = ['src/app/app/doctor/references/actions.ts'];

const adminApiWriteRoutes = ['src/app/api/admin/references/[itemId]/archive/route.ts'];

describe('doctor courses/references residual principal coverage', () => {
  it.each(doctorApiWriteRoutes)(
    '%s uses selected workspace principal for write handlers',
    (file) => {
      const src = readSource(file);
      expect(src).toContain('requireDoctorWorkspaceApiContext');
      expect(src).toContain('withDoctorWorkspacePrincipal');
    },
  );

  it('POST /api/doctor/courses is gated by the courses entitlement', () => {
    const src = readSource('src/app/api/doctor/courses/route.ts');
    expect(src).toContain('requireEntitlementForRead(auth.ctx, "courses")');
  });

  it('guards every doctor course list, direct and usage read with the same workspace entitlement and principal', () => {
    const collection = readSource('src/app/api/doctor/courses/route.ts');
    const item = readSource('src/app/api/doctor/courses/[id]/route.ts');
    const usage = readSource('src/app/api/doctor/courses/[id]/usage/route.ts');
    for (const source of [collection, item, usage]) {
      expect(source).toContain('requireDoctorWorkspaceApiContext');
      expect(source).toContain('requireEntitlementForRead(auth.ctx, "courses")');
      expect(source).toContain('withDoctorWorkspacePrincipal');
    }
  });

  it('hides course RSC entrypoints unless their trusted organization has the courses mechanic', () => {
    const doctorPages = [
      'src/app/app/doctor/courses/page.tsx',
      'src/app/app/doctor/courses/new/page.tsx',
      'src/app/app/doctor/courses/[id]/page.tsx',
    ];
    for (const file of doctorPages) {
      const source = readSource(file);
      expect(source).toContain('requireDoctorWorkspaceContext');
      expect(source).toContain(
        'requireEntitlementForPage({ organizationId: workspace.organizationId }, "courses")',
      );
      expect(source).not.toContain('assertMechanicEnabled(');
    }
    const patientPage = readSource('src/app/app/patient/courses/page.tsx');
    expect(patientPage).toContain('requirePatientAccessWithPhone');
    expect(patientPage).toContain('resolvePatientEnrollmentOrganizationId');
    expect(patientPage).toContain(
      'requireEntitlementForPage({ organizationId: patientOrganization.organizationId }, "courses")',
    );
    expect(patientPage).not.toContain('assertMechanicEnabled(');
    expect(patientPage).toContain('withPatientOrganizationPrincipal');
  });

  it('covers every current course consumer with a trusted principal and the courses entitlement where its projection or write is optional', () => {
    const optionalDoctorPickers = [
      'src/app/app/doctor/content/page.tsx',
      'src/app/app/doctor/content/new/page.tsx',
      'src/app/app/doctor/content/edit/[id]/page.tsx',
      'src/app/app/doctor/patient-home/page.tsx',
    ];
    for (const file of optionalDoctorPickers) {
      const source = readSource(file);
      expect(source).toContain('requireEntitlementForReadAction(workspace, "courses")');
      expect(source).toContain('withDoctorWorkspacePrincipal');
    }

    const patientProjections = [
      'src/app/app/patient/content/[slug]/PatientContentSlugArticle.tsx',
      'src/app/app/patient/sections/[slug]/page.tsx',
    ];
    for (const file of patientProjections) {
      const source = readSource(file);
      expect(source).toContain('resolvePatientEnrollmentOrganizationId');
      expect(source).toContain('requireEntitlementForReadAction(patientOrganization, "courses")');
      expect(source).toContain('withPatientOrganizationPrincipal');
    }

    const patientHomePage = readSource('src/app/app/patient/page.tsx');
    expect(patientHomePage).toContain('resolvePatientOrganizationRequestContext');
    expect(patientHomePage).toContain(
      'requireEntitlementForReadAction({ organizationId: patientContext.organizationId }, "courses")',
    );
    const patientHomeProjection = readSource('src/app/app/patient/home/PatientHomeToday.tsx');
    expect(patientHomeProjection).toContain('withPatientOrganizationPrincipal');

    const contentReferenceWrite = readSource('src/app/app/doctor/content/actions.ts');
    expect(contentReferenceWrite).toContain(
      'requireEntitlementForReadAction(workspace, "courses")',
    );
    expect(contentReferenceWrite).toContain('withDoctorWorkspacePrincipal');
    const patientHomeReferenceWrite = readSource('src/app/app/settings/patient-home/actions.ts');
    expect(patientHomeReferenceWrite).toContain(
      'requireEntitlementForMutationAction(workspace, "courses")',
    );
    expect(patientHomeReferenceWrite).toContain('withDoctorWorkspacePrincipal');

    const paymentFulfillment = readSource('src/app-layer/di/buildAppDeps.ts');
    expect(paymentFulfillment).toContain('payments.product-capture.fulfillment');
    expect(paymentFulfillment).toContain('withExplicitOrganizationPrincipal');
  });

  it('fail-closes course products across authoring, links, purchase and fulfillment', () => {
    const products = readSource('src/modules/products/service.ts');
    expect(products).toContain('course_entitlement_required');
    expect(products).toContain('course_patient_enrollment_required');
    expect(products).toContain('courseBelongsToOrganization');
    expect(products).toContain('hasActivePatientEnrollment');
    expect(products).toContain('filterAvailableCourseProducts');
    expect(products).toContain(
      'await assertCourseProductAvailable(product, purchase.organizationId, platformUserId)',
    );

    const deps = readSource('src/app-layer/di/buildAppDeps.ts');
    expect(deps).toContain('isMechanicEnabled(orgEntitlementsPort, organizationId, "courses")');
    expect(deps).toContain(
      'patientOrganizationService?.hasActiveEnrollment(platformUserId, organizationId)',
    );
    expect(deps).toContain('source: "products.course-scope"');
    expect(deps).toContain('coursesService.getCourseForDoctor(courseId)');

    for (const file of [
      'src/app/api/doctor/booking-engine/products/route.ts',
      'src/app/api/admin/booking-engine/products/route.ts',
    ]) {
      const source = readSource(file);
      expect(source).toContain('products.upsertProduct');
      expect(source).toContain('withDoctorWorkspacePrincipal');
      expect(source).toContain('product_upsert_failed');
    }
  });

  it('derives product purchase scope from enrollment or a stored link, never a caller-selected organization', () => {
    const patientPurchase = readSource('src/app/api/booking/products/purchase/route.ts');
    expect(patientPurchase).toContain('resolvePatientEnrollmentOrganizationId');
    expect(patientPurchase).toContain('productOrganizationId !== organizationId');
    expect(patientPurchase).toContain('withExplicitOrganizationPrincipal');

    const publicPurchase = readSource('src/app/api/booking/public/products/purchase/route.ts');
    expect(publicPurchase).toContain('deps.products.resolvePayLink(parsed.data.payLinkToken)');
    expect(publicPurchase).toContain('const organizationId = link.organizationId');
    expect(publicPurchase).toContain('platformUserId: null');
    expect(publicPurchase).not.toContain('platformUserId: z.');
    expect(publicPurchase).not.toContain('resolveProductOrganizationId(parsed.data.productId)');
  });

  it.each(doctorActionFiles)(
    '%s uses selected workspace principal for server action writes',
    (file) => {
      const src = readSource(file);
      expect(src).not.toContain('requireDoctorAccess');
      expect(src).toContain('requireDoctorWorkspaceContext');
      expect(src).toContain('withDoctorWorkspacePrincipal');
    },
  );

  it.each(adminApiWriteRoutes)(
    '%s requires admin mode and selected workspace principal',
    (file) => {
      const src = readSource(file);
      expect(src).toContain('requireAdminModeSession');
      expect(src).toContain('requireDoctorWorkspaceApiContext');
      expect(src).toContain('withDoctorWorkspacePrincipal');
    },
  );

  it('pgCourses requires principal-aware mutation transactions and org stamps', () => {
    const src = readSource('src/infra/repos/pgCourses.ts');
    expect(src).toContain('getCurrentDbPrincipalOrganizationId');
    expect(src).toContain('runDrizzleMutationTransaction');
    expect(src).toContain('organization_principal_required');
    expect(src).toContain('organization_principal_mismatch');
    expect(src).toContain('organizationId');
    expect(src).not.toContain('organizationReadCondition');
    expect(src).not.toContain('organization_id IS NULL');
  });

  it('pgReferences requires principal-aware SQL transactions and org stamps', () => {
    const src = readSource('src/infra/repos/pgReferences.ts');
    expect(src).toContain('getCurrentDbPrincipalOrganizationId');
    expect(src).toContain('runWebappTransaction');
    expect(src).toContain("set_config('app.org'");
    expect(src).toContain('organization_principal_required');
    expect(src).toContain('organization_principal_mismatch');
    expect(src).toContain('organization_id');
  });
});
