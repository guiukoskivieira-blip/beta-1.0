export interface BetaUser {
  id: string;
  email: string;
  displayName?: string;
  companyName?: string;
  role?: string;
  organizationId?: string;
}

export interface UserSession {
  user: BetaUser | null;
  accessToken?: string;
}

export interface AnalysisRecordSummary {
  id: string;
  createdAt: number;
  fileName: string;
  fileSizeBytes: number;
  segmentName: string;
  productName: string;
  variantName: string;
  productionProfileId: string;
  status: 'approved' | 'review' | 'blocked';
  score: number;
  errorCount: number;
  warningCount: number;
  approvedCount: number;
  organizationId?: string;
  userId?: string;
}

export interface StoredProductionProfile {
  id: string;
  name: string;
  description?: string;
  category: string;
  userId?: string;
  organizationId?: string;
  rules: {
    dimensions?: {
      targetWidthMm: number;
      targetHeightMm: number;
      toleranceMm?: number;
    };
    dpi?: {
      recommendedDpi: number;
      criticalDpi: number;
    };
    bleed?: {
      requiredBleedMm: number;
      toleranceMm?: number;
    };
    colors?: {
      allowedModes: ('CMYK' | 'RGB' | 'Grayscale' | 'Spot')[];
      rgbPolicy: 'error' | 'warning' | 'allowed';
    };
    pdfx?: {
      required: boolean;
    };
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface UsageRecord {
  period: string;
  analyses: number;
  bytesUploaded: number;
  userId?: string;
  organizationId?: string;
}

export const BETA_PLAN_LIMITS = {
  free: {
    analysesPerMonth: 15,
    maxUploadMb: 25,
    customProfilesLimit: 1,
    aiAssistant: false,
  },
  beta: {
    analysesPerMonth: 100,
    maxUploadMb: 50,
    customProfilesLimit: 5,
    aiAssistant: true,
  },
  pro: {
    analysesPerMonth: 1000,
    maxUploadMb: 100,
    customProfilesLimit: 50,
    aiAssistant: true,
  },
};
