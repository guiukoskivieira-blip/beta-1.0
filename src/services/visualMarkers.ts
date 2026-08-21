import type { PdfDocumentStructure, PdfImageOccurrence, PdfPageStructure } from '../types';
import type { ProductionProfile } from '../utils/productionProfiles';

export interface VisualIssueMarker {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  ruleId: string;
  severity: 'error' | 'warning';
  title: string;
  measuredValue: string;
  expectedValue: string;
  imageId: string;
}

export interface MarkerAvailable {
  marker: VisualIssueMarker | null;
  reason?: string;
}

export interface PageMarkersResult {
  page: number;
  markers: VisualIssueMarker[];
  unavailableImageIds: string[];
}

export function buildDpiMarkersForPage(
  page: PdfPageStructure,
  profile: ProductionProfile
): PageMarkersResult {
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
      x: img.xPt!,
      y: img.yPt!,
      width: img.appliedWidthPt!,
      height: img.appliedHeightPt!,
      ruleId: 'RULE-PROF-DPI-001',
      severity: isCritical ? 'error' : 'warning',
      title: 'Imagem com DPI insuficiente',
      measuredValue: `${minDpi.toFixed(0)} DPI`,
      expectedValue: `${profile.minEffectiveDpi} DPI`,
      imageId: img.id,
    });
  }

  return { page: page.page, markers, unavailableImageIds };
}

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
