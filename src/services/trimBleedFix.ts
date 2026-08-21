import { PDFDocument } from 'pdf-lib';
import type { PdfDocumentStructure, PdfPageStructure, PdfBoxInfo } from '../types';
import type { ProductionProfile } from '../utils/productionProfiles';
import { runDeterministicRuleEngine } from '../utils/ruleEngine';

const PT_TO_MM = 25.4 / 72.0;
const MM_TO_PT = 72.0 / 25.4;
const TOLERANCE_MM = 0.5;

export interface TrimBleedPageEligibility {
  page: number;
  eligible: boolean;
  reason: string;
  mediaBox: PdfBoxInfo;
  trimBox?: PdfBoxInfo;
  bleedBox?: PdfBoxInfo;
  expectedWidthMm?: number;
  expectedHeightMm?: number;
  requiredBleedMm: number;
  availableBleedLeftMm: number;
  availableBleedRightMm: number;
  availableBleedTopMm: number;
  availableBleedBottomMm: number;
  proposedTrimX: number;
  proposedTrimY: number;
  proposedTrimWidth: number;
  proposedTrimHeight: number;
  proposedBleedX: number;
  proposedBleedY: number;
  proposedBleedWidth: number;
  proposedBleedHeight: number;
}

export interface TrimBleedEligibilityResult {
  eligible: boolean;
  pages: TrimBleedPageEligibility[];
  globalReason: string;
}

export interface TrimBleedFixAuditEntry {
  ruleId: string;
  fixType: 'trim_bleed_box';
  timestamp: number;
  pageChanges: Array<{
    page: number;
    previousTrimBox?: { x: number; y: number; width: number; height: number };
    newTrimBox: { x: number; y: number; width: number; height: number };
    previousBleedBox?: { x: number; y: number; width: number; height: number };
    newBleedBox: { x: number; y: number; width: number; height: number };
  }>;
  revalidationResult: {
    ruleStatus: 'approved' | 'error' | 'warning' | 'undetermined';
    validated: boolean;
    message: string;
  };
}

export interface TrimBleedFixResult {
  success: boolean;
  pdfBytes?: Uint8Array;
  audit: TrimBleedFixAuditEntry;
  revalidation: {
    ruleStatus: 'approved' | 'error' | 'warning' | 'undetermined';
    validated: boolean;
    message: string;
  };
  error?: string;
}

export function checkTrimBleedEligibility(
  doc: PdfDocumentStructure,
  profile: ProductionProfile
): TrimBleedEligibilityResult {
  const requiredBleedMm = profile.expectedBleedMm ?? 0;

  if (requiredBleedMm <= 0) {
    return {
      eligible: false,
      pages: [],
      globalReason: 'O perfil não exige sangria estrutural. Não há correção a aplicar.',
    };
  }

  if (!profile.expectedWidthMm || !profile.expectedHeightMm) {
    return {
      eligible: false,
      pages: [],
      globalReason: 'As dimensões finais esperadas (formato) não estão definidas no perfil. Não é possível definir TrimBox deterministicamente.',
    };
  }

  const expectedW = profile.expectedWidthMm;
  const expectedH = profile.expectedHeightMm;
  const pageEligibilities: TrimBleedPageEligibility[] = [];
  let allEligible = true;

  for (const page of doc.pages || []) {
    const mb = page.mediaBox;
    const mediaWidthMm = mb.widthMm;
    const mediaHeightMm = mb.heightMm;

    // The MediaBox must contain enough area beyond the trim size for bleed on all sides
    const minMediaWidthMm = expectedW + 2 * requiredBleedMm;
    const minMediaHeightMm = expectedH + 2 * requiredBleedMm;

    // Compute available bleed: how much space exists beyond trim on each side
    // We center the trim box within the media box to maximize symmetric bleed
    const trimX = (mediaWidthMm - expectedW) / 2;
    const trimY = (mediaHeightMm - expectedH) / 2;

    const availLeft = trimX;
    const availRight = mediaWidthMm - expectedW - trimX;
    const availBottom = trimY;
    const availTop = mediaHeightMm - expectedH - trimY;

    const availableBleedLeftMm = Math.max(0, availLeft);
    const availableBleedRightMm = Math.max(0, availRight);
    const availableBleedTopMm = Math.max(0, availTop);
    const availableBleedBottomMm = Math.max(0, availBottom);

    const minAvail = Math.min(
      availableBleedLeftMm,
      availableBleedRightMm,
      availableBleedTopMm,
      availableBleedBottomMm
    );

    // Convert to PDF points for proposed boxes (in MediaBox coordinate space)
    const mediaX = mb.xPt;
    const mediaY = mb.yPt;

    const proposedTrimX = mediaX + trimX * MM_TO_PT;
    const proposedTrimY = mediaY + trimY * MM_TO_PT;
    const proposedTrimWidth = expectedW * MM_TO_PT;
    const proposedTrimHeight = expectedH * MM_TO_PT;

    const proposedBleedX = mediaX + Math.max(0, trimX - requiredBleedMm) * MM_TO_PT;
    const proposedBleedY = mediaY + Math.max(0, trimY - requiredBleedMm) * MM_TO_PT;
    const proposedBleedWidth = (expectedW + 2 * requiredBleedMm) * MM_TO_PT;
    const proposedBleedHeight = (expectedH + 2 * requiredBleedMm) * MM_TO_PT;

    let eligible = true;
    let reason = '';

    if (mediaWidthMm < minMediaWidthMm - TOLERANCE_MM || mediaHeightMm < minMediaHeightMm - TOLERANCE_MM) {
      eligible = false;
      reason = `MediaBox (${mediaWidthMm.toFixed(1)} × ${mediaHeightMm.toFixed(1)} mm) insuficiente para formato ${expectedW} × ${expectedH} mm com sangria de ${requiredBleedMm} mm (mínimo: ${minMediaWidthMm.toFixed(1)} × ${minMediaHeightMm.toFixed(1)} mm).`;
    } else if (minAvail < requiredBleedMm - TOLERANCE_MM) {
      eligible = false;
      reason = `Espaço físico disponível para sangria insuficiente. Disponível: ${minAvail.toFixed(1)} mm, exigido: ${requiredBleedMm} mm. Conteúdo não pode ser esticado.`;
    }

    if (!eligible) allEligible = false;

    pageEligibilities.push({
      page: page.page,
      eligible,
      reason: reason || 'Elegível: MediaBox contém área suficiente para TrimBox e BleedBox determinísticos.',
      mediaBox: mb,
      trimBox: page.trimBox,
      bleedBox: page.bleedBox,
      expectedWidthMm: expectedW,
      expectedHeightMm: expectedH,
      requiredBleedMm,
      availableBleedLeftMm,
      availableBleedRightMm,
      availableBleedTopMm,
      availableBleedBottomMm,
      proposedTrimX,
      proposedTrimY,
      proposedTrimWidth,
      proposedTrimHeight,
      proposedBleedX,
      proposedBleedY,
      proposedBleedWidth,
      proposedBleedHeight,
    });
  }

  return {
    eligible: allEligible,
    pages: pageEligibilities,
    globalReason: allEligible
      ? 'Correção elegível: TrimBox e BleedBox podem ser definidos deterministicamente sem alterar conteúdo.'
      : 'Uma ou mais páginas não atendem aos critérios de elegibilidade.',
  };
}

export async function applyTrimBleedFix(
  originalPdfBytes: Uint8Array,
  doc: PdfDocumentStructure,
  profile: ProductionProfile
): Promise<TrimBleedFixResult> {
  const eligibility = checkTrimBleedEligibility(doc, profile);

  if (!eligibility.eligible) {
    return {
      success: false,
      audit: {
        ruleId: 'RULE-PROF-BLD-001',
        fixType: 'trim_bleed_box',
        timestamp: Date.now(),
        pageChanges: [],
        revalidationResult: { ruleStatus: 'undetermined', validated: false, message: eligibility.globalReason },
      },
      revalidation: { ruleStatus: 'undetermined', validated: false, message: eligibility.globalReason },
      error: eligibility.globalReason,
    };
  }

  // Load the original PDF to create a copy
  const pdfDoc = await PDFDocument.load(originalPdfBytes, { ignoreEncryption: true, updateMetadata: false });
  const pages = pdfDoc.getPages();

  const pageChanges: TrimBleedFixAuditEntry['pageChanges'] = [];

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const eligibilityPage = eligibility.pages[i];
    if (!eligibilityPage || !eligibilityPage.eligible) continue;

    // Record previous values
    const prevTrim = page.getTrimBox();
    const prevBleed = page.getBleedBox();

    const previousTrimBox = prevTrim
      ? { x: prevTrim.x, y: prevTrim.y, width: prevTrim.width, height: prevTrim.height }
      : undefined;
    const previousBleedBox = prevBleed
      ? { x: prevBleed.x, y: prevBleed.y, width: prevBleed.width, height: prevBleed.height }
      : undefined;

    // Set TrimBox (cut line)
    page.setTrimBox(
      eligibilityPage.proposedTrimX,
      eligibilityPage.proposedTrimY,
      eligibilityPage.proposedTrimWidth,
      eligibilityPage.proposedTrimHeight,
    );

    // Set BleedBox (bleed area)
    page.setBleedBox(
      eligibilityPage.proposedBleedX,
      eligibilityPage.proposedBleedY,
      eligibilityPage.proposedBleedWidth,
      eligibilityPage.proposedBleedHeight,
    );

    pageChanges.push({
      page: i + 1,
      previousTrimBox,
      newTrimBox: {
        x: eligibilityPage.proposedTrimX,
        y: eligibilityPage.proposedTrimY,
        width: eligibilityPage.proposedTrimWidth,
        height: eligibilityPage.proposedTrimHeight,
      },
      previousBleedBox,
      newBleedBox: {
        x: eligibilityPage.proposedBleedX,
        y: eligibilityPage.proposedBleedY,
        width: eligibilityPage.proposedBleedWidth,
        height: eligibilityPage.proposedBleedHeight,
      },
    });
  }

  // Save as a NEW PDF (never overwrite original)
  const fixedPdfBytes = await pdfDoc.save();

  // Revalidate with Motor 1
  const fixedDoc = await extractFixedStructure(fixedPdfBytes, doc);
  const revalidationRules = runDeterministicRuleEngine(fixedDoc, profile);
  const bleedRule = revalidationRules.results.find((r) => r.ruleId === 'RULE-PROF-BLD-001');

  const ruleStatus = bleedRule?.status || 'undetermined';
  const validated = ruleStatus === 'approved';
  const message = validated
    ? 'Correção validada pelo Motor 1'
    : 'Alteração aplicada, mas o problema permanece.';

  const audit: TrimBleedFixAuditEntry = {
    ruleId: 'RULE-PROF-BLD-001',
    fixType: 'trim_bleed_box',
    timestamp: Date.now(),
    pageChanges,
    revalidationResult: { ruleStatus, validated, message },
  };

  return {
    success: true,
    pdfBytes: fixedPdfBytes,
    audit,
    revalidation: { ruleStatus, validated, message },
  };
}

// Re-extract the document structure from the fixed PDF for Motor 1 revalidation.
// We re-run the same extractor used by the server.
async function extractFixedStructure(fixedPdfBytes: Uint8Array, originalDoc: PdfDocumentStructure): Promise<PdfDocumentStructure> {
  // Dynamic import to avoid circular dependency issues
  const { extractPdfStructure } = await import('../../server/pdfExtractor');
  return extractPdfStructure(Buffer.from(fixedPdfBytes));
}

export interface PreviewData {
  before: {
    trimBox?: { x: number; y: number; width: number; height: number };
    bleedBox?: { x: number; y: number; width: number; height: number };
    mediaBox: { x: number; y: number; width: number; height: number };
  };
  after: {
    trimBox: { x: number; y: number; width: number; height: number };
    bleedBox: { x: number; y: number; width: number; height: number };
    mediaBox: { x: number; y: number; width: number; height: number };
  };
  bleedMm: number;
  trimWidthMm: number;
  trimHeightMm: number;
}

export function buildPreviewData(
  page: PdfPageStructure,
  eligibilityPage: TrimBleedPageEligibility
): PreviewData {
  const mb = page.mediaBox;
  const before = {
    trimBox: page.trimBox
      ? { x: page.trimBox.xPt, y: page.trimBox.yPt, width: page.trimBox.widthPt, height: page.trimBox.heightPt }
      : undefined,
    bleedBox: page.bleedBox
      ? { x: page.bleedBox.xPt, y: page.bleedBox.yPt, width: page.bleedBox.widthPt, height: page.bleedBox.heightPt }
      : undefined,
    mediaBox: { x: mb.xPt, y: mb.yPt, width: mb.widthPt, height: mb.heightPt },
  };

  const after = {
    trimBox: {
      x: eligibilityPage.proposedTrimX,
      y: eligibilityPage.proposedTrimY,
      width: eligibilityPage.proposedTrimWidth,
      height: eligibilityPage.proposedTrimHeight,
    },
    bleedBox: {
      x: eligibilityPage.proposedBleedX,
      y: eligibilityPage.proposedBleedY,
      width: eligibilityPage.proposedBleedWidth,
      height: eligibilityPage.proposedBleedHeight,
    },
    mediaBox: { x: mb.xPt, y: mb.yPt, width: mb.widthPt, height: mb.heightPt },
  };

  return {
    before,
    after,
    bleedMm: eligibilityPage.requiredBleedMm,
    trimWidthMm: eligibilityPage.expectedWidthMm || 0,
    trimHeightMm: eligibilityPage.expectedHeightMm || 0,
  };
}
