export type RuleStatus = 'approved' | 'warning' | 'error' | 'undetermined';

export interface RuleReference {
  page?: number;
  objectType: 'page' | 'font' | 'image' | 'color' | 'bleed' | 'structure';
  objectId?: string;
  details: string;
}

export interface RuleEvaluationResult {
  ruleId: string;
  title: string;
  category: 'universal' | 'profile_conditioned';
  status: RuleStatus;
  evidence: string;
  explanation: string;
  recommendation: string;
  references?: RuleReference[];
}

export interface ScoreSummary {
  score: number;
  classification: 'approved' | 'review' | 'blocked';
  label: string;
  color: string;
  approvedCount: number;
  warningCount: number;
  errorCount: number;
  undeterminedCount: number;
}

export interface RuleEngineSummary {
  profileUsed: {
    id: string;
    name: string;
  };
  totalRules: number;
  approvedCount: number;
  warningCount: number;
  errorCount: number;
  undeterminedCount: number;
  universalRules: RuleEvaluationResult[];
  profileRules: RuleEvaluationResult[];
  results: RuleEvaluationResult[];
  scoreSummary: ScoreSummary;
  grouped: {
    approved: RuleEvaluationResult[];
    warning: RuleEvaluationResult[];
    error: RuleEvaluationResult[];
    undetermined: RuleEvaluationResult[];
  };
}

export interface PdfBoxInfo {
  status: 'explicit' | 'inherited' | 'fallback';
  xPt: number;
  yPt: number;
  widthPt: number;
  heightPt: number;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
}

export interface PdfImageOccurrence {
  id: string;
  page: number;
  name?: string;
  widthPx: number;
  heightPx: number;
  displayWidthMm: number;
  displayHeightMm: number;
  effectiveDpiX: number;
  effectiveDpiY: number;
  colorSpace?: string;
  bitsPerComponent?: number;
  nativeWidthPx?: number;
  nativeHeightPx?: number;
  appliedWidthMm?: number;
  appliedHeightMm?: number;
  appliedWidthPt?: number;
  appliedHeightPt?: number;
  occurrenceIndex?: number;
  isInsideForm?: boolean;
  rotationDeg?: number;
  ctm?: number[];
  filter?: string;
}

export interface PdfFontItem {
  id: string;
  fontKey?: string;
  baseFont?: string;
  cleanFontName?: string;
  resourceName?: string;
  isInsideForm?: boolean;
  formName?: string;
  subtype?: string;
  fontType?: string;
  embeddedFileType?: string;
  isSubset?: boolean;
  subsetPrefix?: string;
  encoding?: string;
  hasToUnicode?: boolean;
  declaredPages?: number[];
  isEmbedded: 'yes' | 'no' | 'subset' | 'undetermined' | boolean;
  isUsedInContent: boolean;
  usedPages?: number[];
}

export interface PdfColorOccurrence {
  page: number;
  family: 'DeviceCMYK' | 'DeviceRGB' | 'DeviceGray' | 'Separation' | 'DeviceN' | 'ICCBased' | string;
  colorantName?: string;
  count?: number;
  source?: string;
  operator?: string;
  isInsideForm?: boolean;
  rawRepresentation?: string;
  details?: {
    spotColorName?: string;
    colorantNames?: string[];
    baseSpaceFamily?: string;
    imageName?: string;
    resourceName?: string;
    colorValues?: number[];
    iccProfile?: {
      profileDescription?: string;
      colorSpace?: string;
      version?: string;
      shortSha256?: string;
      sha256?: string;
    };
  };
}

export interface PdfPageStructure {
  page: number;
  widthPt: number;
  heightPt: number;
  widthMm: number;
  heightMm: number;
  visualWidthMm: number;
  visualHeightMm: number;
  orientation: 'portrait' | 'landscape' | 'square';
  rotation: number;
  mediaBox: PdfBoxInfo;
  trimBox?: PdfBoxInfo;
  bleedBox?: PdfBoxInfo;
  cropBox?: PdfBoxInfo;
  artBox?: PdfBoxInfo;
  hasTransparency: boolean;
  imageOccurrences: PdfImageOccurrence[];
  colorOccurrences: PdfColorOccurrence[];
  fonts?: any[];
  transparencies?: any[];
  images?: any[];
}

export interface PdfDocumentStructure {
  pageCount: number;
  pages: PdfPageStructure[];
  fonts: PdfFontItem[];
  fontSummary?: any;
  transparencySummary?: any;
  transparencies?: any[];
  colorManagementSummary?: any;
  outputIntents?: any[];
  iccProfiles?: any[];
  colorSummary: {
    hasRgb: boolean;
    hasCmyk: boolean;
    hasSpotColors: boolean;
    familiesDetected: string[];
  };
  pdfxInfo?: {
    isDeclaredPdfX: boolean;
    declarationStatus?: 'declared' | 'inconsistent' | 'partially_declared' | 'not_declared' | string;
    pdfVersion?: string;
    headerPdfVersion?: string;
    catalogPdfVersion?: string;
    trapped?: string;
    outputIntentSubtype?: string;
    outputConditionIdentifier?: string;
    hasDestOutputProfile?: boolean;
    inconsistencies?: string[];
    sourcesFound?: Array<{ location?: string; key?: string; value?: string } | any>;
    correlatedData?: any;
    validationDisclaimer?: string;
    declaredVersion?: string;
    declaredConformance?: string;
    recognizedStandard?: string;
  };
  metadata?: {
    title?: string;
    author?: string;
    creator?: string;
    producer?: string;
    creationDate?: string;
    modDate?: string;
  };
}

export interface PreflightAnalysis {
  id: string;
  createdAt: number;
  fileName: string;
  fileSizeBytes: number;
  document: PdfDocumentStructure;
  ruleResults: RuleEngineSummary;
  profileId: string;
  diagnosticInfo?: {
    extractionDurationMs: number;
    evaluationDurationMs: number;
  };
}

export interface UploadResponse {
  success: boolean;
  analysisId?: string;
  file?: {
    name: string;
    size: number;
    mimeType: string;
  };
  document?: PdfDocumentStructure;
  error?: string;
  code?: string;
  renewsAt?: string;
  diagnosticInfo?: {
    uploadDurationMs: number;
    serverExtractionDurationMs: number;
  };
}

export interface HealthResponse {
  ok: boolean;
  status: string;
  service: string;
}

export interface GroundedRuleItem {
  id: string;
  title: string;
  status: 'error' | 'warning' | 'approved' | 'undetermined';
  evidence: string;
  explanation?: string;
  recommendation?: string;
}

export interface AiGroundingContext {
  fileName: string;
  score: number;
  status: string;
  errorCount: number;
  warningCount: number;
  approvedCount?: number;
  blockingErrors: GroundedRuleItem[];
  warnings: GroundedRuleItem[];
  approvedRules: GroundedRuleItem[];
  measuredEvidence: Record<string, any>;
  guardrails?: string[];
  schemaVersion?: string;
  rules?: GroundedRuleItem[];
}

export interface AiAssistantResponse {
  success: boolean;
  reply?: string;
  answer?: string;
  model?: string;
  error?: string;
}
