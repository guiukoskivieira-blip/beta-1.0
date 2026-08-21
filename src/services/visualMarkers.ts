import type { PdfDocumentStructure, PdfImageOccurrence, PdfPageStructure, PdfBoxInfo } from '../types';
import type { ProductionProfile } from '../utils/productionProfiles';

export type IssueCategory = 'dpi' | 'dimension' | 'bleed';

export interface VisualIssueMarker {
  page: number;
  category: IssueCategory;
  ruleId: string;
  severity: 'error' | 'warning' | 'undetermined';
  title: string;
  measuredValue: string;
  expectedValue: string;
  imageId?: string;
  // Optional positioned overlay (for DPI image markers)
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface BoxOverlay {
  type: 'mediaBox' | 'trimBox' | 'bleedBox' | 'expectedTrim' | 'expectedBleed';
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  label: string;
}

export interface PageVisualData {
  page: number;
  markers: VisualIssueMarker[];
  boxOverlays: BoxOverlay[];
  unavailableImageIds: string[];
  insufficientEvidence: boolean;
}

export interface MarkerAvailable {
  marker: VisualIssueMarker | null;
  reason?: string;
}

// ============================================================================
// DPI MARKERS — positioned overlays for low-DPI images
// ============================================================================

export function buildDpiMarkersForPage(
  page: PdfPageStructure,
  profile: ProductionProfile
): { markers: VisualIssueMarker[]; unavailableImageIds: string[] } {
  const markers: VisualIssueMarker[] = [];
  const unavailableImageIds: string[] = [];

  for (const img of page.imageOccurrences || []) {
    const dpiX = typeof img.effectiveDpiX === 'number' ? img.effectiveDpiX : 300;
    const dpiY = typeof img.effectiveDpiY === 'number' ? img.effectiveDpiY : 300;
    const minDpi = Math.min(dpiX, dpiY);

    const isCritical = minDpi < profile.warningDpiThreshold;
    const isWarning = !isCritical && minDpi < profile.minEffectiveDpi;

    if (!isCritical && !isWarning) continue;

    const hasCoords =
      typeof img.xPt === 'number' &&
      typeof img.yPt === 'number' &&
      typeof img.appliedWidthPt === 'number' &&
      typeof img.appliedHeightPt === 'number';

    if (!hasCoords) {
      unavailableImageIds.push(img.id);
      continue;
    }

    markers.push({
      page: page.page,
      category: 'dpi',
      ruleId: 'RULE-PROF-DPI-001',
      severity: isCritical ? 'error' : 'warning',
      title: `Imagem com ${minDpi.toFixed(0)} DPI`,
      measuredValue: `${minDpi.toFixed(0)} DPI`,
      expectedValue: `${profile.minEffectiveDpi} DPI`,
      imageId: img.id,
      x: img.xPt!,
      y: img.yPt!,
      width: img.appliedWidthPt!,
      height: img.appliedHeightPt!,
    });
  }

  return { markers, unavailableImageIds };
}

// ============================================================================
// DIMENSION MARKERS — page-level, no positioned overlay
// ============================================================================

export function buildDimensionMarkersForPage(
  page: PdfPageStructure,
  profile: ProductionProfile
): VisualIssueMarker[] {
  if (
    profile.expectedWidthMm === undefined ||
    profile.expectedHeightMm === undefined
  ) {
    return [];
  }

  const expW = profile.expectedWidthMm;
  const expH = profile.expectedHeightMm;
  const tol = 1.5;

  const tb = page.trimBox && page.trimBox.status === 'explicit' ? page.trimBox : null;
  const w = tb && typeof tb.widthMm === 'number' ? tb.widthMm : page.widthMm;
  const h = tb && typeof tb.heightMm === 'number' ? tb.heightMm : page.heightMm;

  const matchNormal = Math.abs(w - expW) <= tol && Math.abs(h - expH) <= tol;
  const matchRotated = Math.abs(w - expH) <= tol && Math.abs(h - expW) <= tol;

  if (matchNormal || matchRotated) return [];

  return [{
    page: page.page,
    category: 'dimension',
    ruleId: 'RULE-PROF-DIM-001',
    severity: 'error',
    title: 'Dimensão divergente do perfil',
    measuredValue: `${w.toFixed(1)} × ${h.toFixed(1)} mm`,
    expectedValue: `${expW} × ${expH} mm`,
  }];
}

// ============================================================================
// BLEED MARKERS — page-level with box overlays
// ============================================================================

export function buildBleedMarkersForPage(
  page: PdfPageStructure,
  profile: ProductionProfile
): { markers: VisualIssueMarker[]; overlays: BoxOverlay[]; insufficientEvidence: boolean } {
  const overlays: BoxOverlay[] = [];
  const insufficientEvidence = false;

  if (profile.expectedBleedMm === undefined || profile.expectedBleedMm <= 0) {
    return { markers: [], overlays, insufficientEvidence };
  }

  const requiredBleedMm = profile.expectedBleedMm;
  const markers: VisualIssueMarker[] = [];

  const mb = page.mediaBox;
  if (!mb || mb.status === 'fallback') {
    return { markers: [], overlays, insufficientEvidence: true };
  }

  // Always show MediaBox as the physical area
  overlays.push({
    type: 'mediaBox',
    xMm: mb.xMm,
    yMm: mb.yMm,
    widthMm: mb.widthMm,
    heightMm: mb.heightMm,
    label: `MediaBox ${mb.widthMm.toFixed(0)}×${mb.heightMm.toFixed(0)}mm`,
  });

  // Show TrimBox if explicit
  if (page.trimBox && page.trimBox.status === 'explicit') {
    const tb = page.trimBox;
    overlays.push({
      type: 'trimBox',
      xMm: tb.xMm,
      yMm: tb.yMm,
      widthMm: tb.widthMm,
      heightMm: tb.heightMm,
      label: `TrimBox ${tb.widthMm.toFixed(0)}×${tb.heightMm.toFixed(0)}mm`,
    });
  }

  // Show BleedBox if explicit
  if (page.bleedBox && page.bleedBox.status === 'explicit') {
    const bb = page.bleedBox;
    overlays.push({
      type: 'bleedBox',
      xMm: bb.xMm,
      yMm: bb.yMm,
      widthMm: bb.widthMm,
      heightMm: bb.heightMm,
      label: `BleedBox ${bb.widthMm.toFixed(0)}×${bb.heightMm.toFixed(0)}mm`,
    });
  }

  // Show expected TrimBox if profile has dimensions
  if (profile.expectedWidthMm && profile.expectedHeightMm) {
    const expW = profile.expectedWidthMm;
    const expH = profile.expectedHeightMm;
    // Expected trim centered in MediaBox
    const trimXMm = (mb.widthMm - expW) / 2 + mb.xMm;
    const trimYMm = (mb.heightMm - expH) / 2 + mb.yMm;
    overlays.push({
      type: 'expectedTrim',
      xMm: trimXMm,
      yMm: trimYMm,
      widthMm: expW,
      heightMm: expH,
      label: `Esperado ${expW}×${expH}mm`,
    });

    // Expected BleedBox = expected trim + bleed on all sides
    const bleedXMm = trimXMm - requiredBleedMm;
    const bleedYMm = trimYMm - requiredBleedMm;
    const bleedWMm = expW + requiredBleedMm * 2;
    const bleedHMm = expH + requiredBleedMm * 2;
    overlays.push({
      type: 'expectedBleed',
      xMm: bleedXMm,
      yMm: bleedYMm,
      widthMm: bleedWMm,
      heightMm: bleedHMm,
      label: `Sangria esperada ${requiredBleedMm}mm`,
    });
  }

  // Determine if there's a bleed problem
  if (!page.trimBox || page.trimBox.status !== 'explicit') {
    markers.push({
      page: page.page,
      category: 'bleed',
      ruleId: 'RULE-PROF-BLD-001',
      severity: 'undetermined',
      title: 'Sangria indeterminada (sem TrimBox)',
      measuredValue: 'Sem TrimBox',
      expectedValue: `${requiredBleedMm} mm`,
    });
  } else {
    const tb = page.trimBox;
    const bb = page.bleedBox?.status === 'explicit' ? page.bleedBox : page.mediaBox;

    if (bb) {
      const leftBleedMm = (tb.xMm ?? 0) - (bb.xMm ?? 0);
      const bottomBleedMm = (tb.yMm ?? 0) - (bb.yMm ?? 0);
      const rightBleedMm = ((bb.xMm ?? 0) + (bb.widthMm ?? 0)) - ((tb.xMm ?? 0) + (tb.widthMm ?? 0));
      const topBleedMm = ((bb.yMm ?? 0) + (bb.heightMm ?? 0)) - ((tb.yMm ?? 0) + (tb.heightMm ?? 0));
      const minBleed = Math.min(leftBleedMm, bottomBleedMm, rightBleedMm, topBleedMm);

      if (minBleed < requiredBleedMm - 0.5) {
        markers.push({
          page: page.page,
          category: 'bleed',
          ruleId: 'RULE-PROF-BLD-001',
          severity: 'error',
          title: 'Sangria insuficiente',
          measuredValue: `${minBleed.toFixed(1)} mm`,
          expectedValue: `${requiredBleedMm} mm`,
        });
      }
    }
  }

  return { markers, overlays, insufficientEvidence };
}

// ============================================================================
// UNIFIED: build all visual data for all pages
// ============================================================================

export function buildAllDpiMarkers(
  doc: PdfDocumentStructure,
  profile: ProductionProfile
): { markers: VisualIssueMarker[]; unavailableImageIds: string[] } {
  const allMarkers: VisualIssueMarker[] = [];
  const allUnavailable: string[] = [];

  for (const page of doc.pages || []) {
    const result = buildDpiMarkersForPage(page, profile);
    allMarkers.push(...result.markers);
    allUnavailable.push(...result.unavailableImageIds);
  }

  return { markers: allMarkers, unavailableImageIds: allUnavailable };
}

export function buildAllVisualData(
  doc: PdfDocumentStructure,
  profile: ProductionProfile
): { allMarkers: VisualIssueMarker[]; pageData: Map<number, PageVisualData> } {
  const allMarkers: VisualIssueMarker[] = [];
  const pageData = new Map<number, PageVisualData>();

  for (const page of doc.pages || []) {
    const dpiResult = buildDpiMarkersForPage(page, profile);
    const dimMarkers = buildDimensionMarkersForPage(page, profile);
    const bleedResult = buildBleedMarkersForPage(page, profile);

    const pageMarkers = [...dpiResult.markers, ...dimMarkers, ...bleedResult.markers];
    allMarkers.push(...pageMarkers);

    pageData.set(page.page, {
      page: page.page,
      markers: pageMarkers,
      boxOverlays: bleedResult.overlays,
      unavailableImageIds: dpiResult.unavailableImageIds,
      insufficientEvidence: bleedResult.insufficientEvidence,
    });
  }

  return { allMarkers, pageData };
}

// ============================================================================
// COORDS: convert PDF pt coordinates to preview percentages
// ============================================================================

export interface PreviewCoords {
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
}

export function pdfCoordsToPreview(
  marker: VisualIssueMarker,
  page: PdfPageStructure
): PreviewCoords | null {
  if (
    typeof marker.x !== 'number' ||
    typeof marker.y !== 'number' ||
    typeof marker.width !== 'number' ||
    typeof marker.height !== 'number'
  ) {
    return null;
  }

  if (marker.width <= 0 || marker.height <= 0) return null;
  if (page.widthPt <= 0 || page.heightPt <= 0) return null;

  const pageWidthPt = page.widthPt;
  const pageHeightPt = page.heightPt;

  const leftPct = (marker.x / pageWidthPt) * 100;
  const bottomPct = (marker.y / pageHeightPt) * 100;
  const widthPct = (marker.width / pageWidthPt) * 100;
  const heightPct = (marker.height / pageHeightPt) * 100;

  const topPct = 100 - bottomPct - heightPct;

  return {
    leftPct: Math.max(0, Math.min(100, leftPct)),
    topPct: Math.max(0, Math.min(100, topPct)),
    widthPct: Math.min(100, widthPct),
    heightPct: Math.min(100, heightPct),
  };
}

export function mmToPreviewPct(
  box: { xMm: number; yMm: number; widthMm: number; heightMm: number },
  page: PdfPageStructure
): PreviewCoords | null {
  if (page.widthMm <= 0 || page.heightMm <= 0) return null;

  const pageXMm = page.mediaBox?.xMm ?? 0;
  const pageYMm = page.mediaBox?.yMm ?? 0;
  const pageWMm = page.widthMm;
  const pageHMm = page.heightMm;

  const leftPct = ((box.xMm - pageXMm) / pageWMm) * 100;
  const bottomPct = ((box.yMm - pageYMm) / pageHMm) * 100;
  const widthPct = (box.widthMm / pageWMm) * 100;
  const heightPct = (box.heightMm / pageHMm) * 100;

  const topPct = 100 - bottomPct - heightPct;

  return {
    leftPct: Math.max(0, Math.min(100, leftPct)),
    topPct: Math.max(0, Math.min(100, topPct)),
    widthPct: Math.min(100, widthPct),
    heightPct: Math.min(100, heightPct),
  };
}
