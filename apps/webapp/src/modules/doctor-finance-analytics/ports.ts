export type FinanceAnalyticsBucket = 'week' | 'month';

export type DoctorFinanceAnalyticsPeriod = {
  from: string;
  toExclusive: string;
  displayIana: string;
  bucket: FinanceAnalyticsBucket;
};

export type DoctorFinanceAnalyticsAudience = {
  organizationId: string;
  specialistId: string | null;
  staffUserId: string;
  canManageAllSpecialists: boolean;
  excludedUserIds?: string[];
  branchId?: string | null;
  onlineOnly?: boolean;
};

export type DoctorFinanceBreakdownRow = {
  key: string;
  label: string;
  amountMinor: number;
};

export type DoctorFinanceSeriesPoint = {
  bucketStart: string;
  totalMinor: number;
  onlineMinor: number;
  cashMinor: number;
};

export type DoctorFinanceAnalytics = {
  currency: 'RUB';
  totalMinor: number;
  membershipMinor: number;
  onlineMinor: number;
  cashMinor: number;
  series: DoctorFinanceSeriesPoint[];
  byService: DoctorFinanceBreakdownRow[];
  byBranch: DoctorFinanceBreakdownRow[];
};

export type DoctorFinanceAnalyticsPort = {
  getFinanceAnalytics(
    period: DoctorFinanceAnalyticsPeriod,
    audience: DoctorFinanceAnalyticsAudience,
  ): Promise<DoctorFinanceAnalytics>;
};

export const emptyDoctorFinanceAnalyticsPort: DoctorFinanceAnalyticsPort = {
  async getFinanceAnalytics() {
    return {
      currency: 'RUB',
      totalMinor: 0,
      membershipMinor: 0,
      onlineMinor: 0,
      cashMinor: 0,
      series: [],
      byService: [],
      byBranch: [],
    };
  },
};
