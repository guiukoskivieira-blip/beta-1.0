/**
 * ARTECHECK — Testes do Mapa Visual de Problemas.
 * Testa conversão de coordenadas PDF → preview, geração de markers,
 * e que imagens aprovadas não geram markers.
 */
import assert from 'node:assert/strict';
import {
  buildDpiMarkersForPage,
  buildAllDpiMarkers,
  pdfCoordsToPreview,
  type VisualIssueMarker,
} from '../src/services/visualMarkers';
import { COMMERCIAL_PRINT_300DPI_PROFILE, LARGE_FORMAT_BANNER_PROFILE } from '../src/utils/productionProfiles';
import type { PdfPageStructure, PdfDocumentStructure, PreflightAnalysis, RuleEngineSummary, ScoreSummary } from '../src/types';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ VIS ${passed}: ${name}`);
  } catch (err: any) {
    failed++;
    console.log(`  ✗ VIS ${passed + failed}: ${name} — ${err.message}`);
  }
}

function makePage(overrides: Partial<PdfPageStructure> = {}): PdfPageStructure {
  return {
    page: 1,
    widthPt: 595.28,
    heightPt: 841.89,
    widthMm: 210,
    heightMm: 297,
    visualWidthMm: 210,
    visualHeightMm: 297,
    orientation: 'portrait',
    rotation: 0,
    mediaBox: { status: 'explicit', xPt: 0, yPt: 0, widthPt: 595.28, heightPt: 841.89, xMm: 0, yMm: 0, widthMm: 210, heightMm: 297 },
    trimBox: { status: 'explicit', xPt: 8.5, yPt: 8.5, widthPt: 595.28, heightPt: 841.89, xMm: 3, yMm: 3, widthMm: 210, heightMm: 297 },
    bleedBox: { status: 'explicit', xPt: 0, yPt: 0, widthPt: 612.28, heightPt: 858.89, xMm: 0, yMm: 0, widthMm: 216, heightMm: 303 },
    hasTransparency: false,
    imageOccurrences: [],
    colorOccurrences: [{ page: 1, family: 'DeviceCMYK', count: 1 }],
    ...overrides,
  };
}

console.log('\n================================================================');
console.log('ARTECHECK — MAPA VISUAL DE PROBLEMAS');
console.log('================================================================\n');

// ============================================================================
// TESTE 1: Conversão de coordenadas PDF → preview
// ============================================================================

test('Conversão de coordenadas: imagem no canto inferior esquerdo', () => {
  const page = makePage();
  const marker: VisualIssueMarker = {
    page: 1,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    ruleId: 'RULE-PROF-DPI-001',
    severity: 'error',
    title: 'Test',
    measuredValue: '72 DPI',
    expectedValue: '300 DPI',
    imageId: 'img1',
  };
  const coords = pdfCoordsToPreview(marker, page);
  assert.ok(coords);
  // x=0, y=0 → left=0%, bottom=0% → top = 100 - 0 - height%
  const expectedHeightPct = (100 / 841.89) * 100;
  assert.equal(coords!.leftPct, 0);
  assert.equal(coords!.topPct, 100 - 0 - expectedHeightPct);
  assert.equal(coords!.widthPct, (100 / 595.28) * 100);
  assert.equal(coords!.heightPct, expectedHeightPct);
});

test('Conversão de coordenadas: imagem no centro da página', () => {
  const page = makePage();
  const cx = 595.28 / 2;
  const cy = 841.89 / 2;
  const marker: VisualIssueMarker = {
    page: 1,
    x: cx - 50,
    y: cy - 50,
    width: 100,
    height: 100,
    ruleId: 'RULE-PROF-DPI-001',
    severity: 'error',
    title: 'Test',
    measuredValue: '72 DPI',
    expectedValue: '300 DPI',
    imageId: 'img1',
  };
  const coords = pdfCoordsToPreview(marker, page);
  assert.ok(coords);
  // Should be roughly centered
  assert.ok(coords!.leftPct > 30 && coords!.leftPct < 50);
  assert.ok(coords!.topPct > 30 && coords!.topPct < 50);
});

test('Conversão de coordenadas: imagem no canto superior direito (origem PDF bottom-up)', () => {
  const page = makePage();
  const marker: VisualIssueMarker = {
    page: 1,
    x: 495.28,
    y: 741.89,
    width: 100,
    height: 100,
    ruleId: 'RULE-PROF-DPI-001',
    severity: 'error',
    title: 'Test',
    measuredValue: '72 DPI',
    expectedValue: '300 DPI',
    imageId: 'img1',
  };
  const coords = pdfCoordsToPreview(marker, page);
  assert.ok(coords);
  // x near right → leftPct high
  assert.ok(coords!.leftPct > 80);
  // y near top (high y in PDF = top) → topPct low
  assert.ok(coords!.topPct < 15);
});

test('Conversão: retorna null para coordenadas inválidas', () => {
  const page = makePage();
  const marker: VisualIssueMarker = {
    page: 1,
    x: undefined as any,
    y: undefined as any,
    width: 100,
    height: 100,
    ruleId: 'RULE-PROF-DPI-001',
    severity: 'error',
    title: 'Test',
    measuredValue: '72 DPI',
    expectedValue: '300 DPI',
    imageId: 'img1',
  };
  const coords = pdfCoordsToPreview(marker, page);
  assert.equal(coords, null);
});

test('Conversão: retorna null para width/height <= 0', () => {
  const page = makePage();
  const marker: VisualIssueMarker = {
    page: 1,
    x: 100,
    y: 100,
    width: 0,
    height: 0,
    ruleId: 'RULE-PROF-DPI-001',
    severity: 'error',
    title: 'Test',
    measuredValue: '72 DPI',
    expectedValue: '300 DPI',
    imageId: 'img1',
  };
  const coords = pdfCoordsToPreview(marker, page);
  assert.equal(coords, null);
});

// ============================================================================
// TESTE 2: Página correta
// ============================================================================

test('buildDpiMarkersForPage atribui o número de página correto', () => {
  const page = makePage({
    page: 3,
    imageOccurrences: [
      { id: 'img1', page: 3, widthPx: 100, heightPx: 100, displayWidthMm: 200, displayHeightMm: 200, effectiveDpiX: 72, effectiveDpiY: 72, colorSpace: 'DeviceCMYK', xPt: 50, yPt: 50, appliedWidthPt: 200, appliedHeightPt: 200 },
    ],
  });
  const result = buildDpiMarkersForPage(page, COMMERCIAL_PRINT_300DPI_PROFILE);
  assert.equal(result.markers.length, 1);
  assert.equal(result.markers[0].page, 3);
});

// ============================================================================
// TESTE 3: Escala correta (preview percentual)
// ============================================================================

test('Escala do preview: marker cobre metade da página', () => {
  const page = makePage();
  const halfW = page.widthPt / 2;
  const halfH = page.heightPt / 2;
  const marker: VisualIssueMarker = {
    page: 1,
    x: 0,
    y: 0,
    width: halfW,
    height: halfH,
    ruleId: 'RULE-PROF-DPI-001',
    severity: 'error',
    title: 'Test',
    measuredValue: '72 DPI',
    expectedValue: '300 DPI',
    imageId: 'img1',
  };
  const coords = pdfCoordsToPreview(marker, page);
  assert.ok(coords);
  assert.ok(Math.abs(coords!.widthPct - 50) < 0.1, `widthPct deveria ser ~50, foi ${coords!.widthPct}`);
  assert.ok(Math.abs(coords!.heightPct - 50) < 0.1, `heightPct deveria ser ~50, foi ${coords!.heightPct}`);
});

// ============================================================================
// TESTE 4: Imagem abaixo de DPI gera marker
// ============================================================================

test('Imagem com 72 DPI (abaixo de 200 crítico) gera marker error', () => {
  const page = makePage({
    imageOccurrences: [
      { id: 'img_low', page: 1, widthPx: 100, heightPx: 100, displayWidthMm: 200, displayHeightMm: 200, effectiveDpiX: 72, effectiveDpiY: 72, colorSpace: 'DeviceCMYK', xPt: 50, yPt: 50, appliedWidthPt: 200, appliedHeightPt: 200 },
    ],
  });
  const result = buildDpiMarkersForPage(page, COMMERCIAL_PRINT_300DPI_PROFILE);
  assert.equal(result.markers.length, 1);
  assert.equal(result.markers[0].severity, 'error');
  assert.match(result.markers[0].measuredValue, /72/);
  assert.match(result.markers[0].expectedValue, /300/);
});

test('Imagem com 250 DPI (entre 200 e 300) gera marker warning', () => {
  const page = makePage({
    imageOccurrences: [
      { id: 'img_mid', page: 1, widthPx: 500, heightPx: 500, displayWidthMm: 100, displayHeightMm: 100, effectiveDpiX: 250, effectiveDpiY: 250, colorSpace: 'DeviceCMYK', xPt: 50, yPt: 50, appliedWidthPt: 100, appliedHeightPt: 100 },
    ],
  });
  const result = buildDpiMarkersForPage(page, COMMERCIAL_PRINT_300DPI_PROFILE);
  assert.equal(result.markers.length, 1);
  assert.equal(result.markers[0].severity, 'warning');
});

// ============================================================================
// TESTE 5: Imagem aprovada NÃO gera marker
// ============================================================================

test('Imagem com 350 DPI (acima do mínimo) não gera marker', () => {
  const page = makePage({
    imageOccurrences: [
      { id: 'img_good', page: 1, widthPx: 700, heightPx: 700, displayWidthMm: 100, displayHeightMm: 100, effectiveDpiX: 350, effectiveDpiY: 350, colorSpace: 'DeviceCMYK', xPt: 50, yPt: 50, appliedWidthPt: 100, appliedHeightPt: 100 },
    ],
  });
  const result = buildDpiMarkersForPage(page, COMMERCIAL_PRINT_300DPI_PROFILE);
  assert.equal(result.markers.length, 0);
  assert.equal(result.unavailableImageIds.length, 0);
});

test('Imagem com exatamente 300 DPI (no limite) não gera marker', () => {
  const page = makePage({
    imageOccurrences: [
      { id: 'img_exact', page: 1, widthPx: 600, heightPx: 600, displayWidthMm: 100, displayHeightMm: 100, effectiveDpiX: 300, effectiveDpiY: 300, colorSpace: 'DeviceCMYK', xPt: 50, yPt: 50, appliedWidthPt: 100, appliedHeightPt: 100 },
    ],
  });
  const result = buildDpiMarkersForPage(page, COMMERCIAL_PRINT_300DPI_PROFILE);
  assert.equal(result.markers.length, 0);
});

test('Página sem imagens não gera markers', () => {
  const page = makePage({ imageOccurrences: [] });
  const result = buildDpiMarkersForPage(page, COMMERCIAL_PRINT_300DPI_PROFILE);
  assert.equal(result.markers.length, 0);
  assert.equal(result.unavailableImageIds.length, 0);
});

// ============================================================================
// TESTE 6: Evidência ausente não gera posição inventada
// ============================================================================

test('Imagem com DPI baixo mas sem coordenadas não gera marker, vai para unavailable', () => {
  const page = makePage({
    imageOccurrences: [
      { id: 'img_no_coords', page: 1, widthPx: 100, heightPx: 100, displayWidthMm: 200, displayHeightMm: 200, effectiveDpiX: 72, effectiveDpiY: 72, colorSpace: 'DeviceCMYK' },
    ],
  });
  const result = buildDpiMarkersForPage(page, COMMERCIAL_PRINT_300DPI_PROFILE);
  assert.equal(result.markers.length, 0, 'Não deve criar marker sem coordenadas');
  assert.equal(result.unavailableImageIds.length, 1);
  assert.equal(result.unavailableImageIds[0], 'img_no_coords');
});

test('Imagem com xPt mas sem appliedWidthPt não gera marker', () => {
  const page = makePage({
    imageOccurrences: [
      { id: 'img_partial', page: 1, widthPx: 100, heightPx: 100, displayWidthMm: 200, displayHeightMm: 200, effectiveDpiX: 72, effectiveDpiY: 72, colorSpace: 'DeviceCMYK', xPt: 50, yPt: 50 },
    ],
  });
  const result = buildDpiMarkersForPage(page, COMMERCIAL_PRINT_300DPI_PROFILE);
  assert.equal(result.markers.length, 0, 'Não deve criar marker com coordenadas parciais');
  assert.equal(result.unavailableImageIds.length, 1);
});

// ============================================================================
// TESTE 7: Múltiplas imagens, mistura de aprovadas e reprovadas
// ============================================================================

test('Múltiplas imagens: apenas as com DPI baixo geram markers', () => {
  const page = makePage({
    imageOccurrences: [
      { id: 'img_good', page: 1, widthPx: 700, heightPx: 700, displayWidthMm: 100, displayHeightMm: 100, effectiveDpiX: 350, effectiveDpiY: 350, colorSpace: 'DeviceCMYK', xPt: 0, yPt: 0, appliedWidthPt: 100, appliedHeightPt: 100 },
      { id: 'img_bad', page: 1, widthPx: 100, heightPx: 100, displayWidthMm: 200, displayHeightMm: 200, effectiveDpiX: 72, effectiveDpiY: 72, colorSpace: 'DeviceCMYK', xPt: 200, yPt: 200, appliedWidthPt: 200, appliedHeightPt: 200 },
      { id: 'img_mid', page: 1, widthPx: 500, heightPx: 500, displayWidthMm: 100, displayHeightMm: 100, effectiveDpiX: 250, effectiveDpiY: 250, colorSpace: 'DeviceCMYK', xPt: 400, yPt: 400, appliedWidthPt: 100, appliedHeightPt: 100 },
    ],
  });
  const result = buildDpiMarkersForPage(page, COMMERCIAL_PRINT_300DPI_PROFILE);
  assert.equal(result.markers.length, 2, 'Apenas img_bad e img_mid devem gerar markers');
  assert.equal(result.markers[0].imageId, 'img_bad');
  assert.equal(result.markers[0].severity, 'error');
  assert.equal(result.markers[1].imageId, 'img_mid');
  assert.equal(result.markers[1].severity, 'warning');
});

// ============================================================================
// TESTE 8: buildAllDpiMarkers agrega múltiplas páginas
// ============================================================================

test('buildAllDpiMarkers agrega markers de múltiplas páginas', () => {
  const doc: PdfDocumentStructure = {
    pageCount: 2,
    pages: [
      makePage({
        page: 1,
        imageOccurrences: [
          { id: 'img1', page: 1, widthPx: 100, heightPx: 100, displayWidthMm: 200, displayHeightMm: 200, effectiveDpiX: 72, effectiveDpiY: 72, colorSpace: 'DeviceCMYK', xPt: 50, yPt: 50, appliedWidthPt: 200, appliedHeightPt: 200 },
        ],
      }),
      makePage({
        page: 2,
        imageOccurrences: [
          { id: 'img2', page: 2, widthPx: 100, heightPx: 100, displayWidthMm: 200, displayHeightMm: 200, effectiveDpiX: 100, effectiveDpiY: 100, colorSpace: 'DeviceCMYK', xPt: 50, yPt: 50, appliedWidthPt: 200, appliedHeightPt: 200 },
        ],
      }),
    ],
    fonts: [],
    colorSummary: { hasRgb: false, hasCmyk: true, hasSpotColors: false, familiesDetected: ['DeviceCMYK'] },
    pdfxInfo: { isDeclaredPdfX: false },
  };
  const result = buildAllDpiMarkers(doc, COMMERCIAL_PRINT_300DPI_PROFILE);
  assert.equal(result.markers.length, 2);
  assert.equal(result.markers[0].page, 1);
  assert.equal(result.markers[1].page, 2);
});

// ============================================================================
// TESTE 9: Perfil large_format usa thresholds diferentes
// ============================================================================

test('Perfil large_format: 80 DPI gera marker (abaixo de 72 crítico → error)', () => {
  const page = makePage({
    imageOccurrences: [
      { id: 'img_banner', page: 1, widthPx: 100, heightPx: 100, displayWidthMm: 1000, displayHeightMm: 1000, effectiveDpiX: 50, effectiveDpiY: 50, colorSpace: 'DeviceCMYK', xPt: 50, yPt: 50, appliedWidthPt: 1000, appliedHeightPt: 1000 },
    ],
  });
  const result = buildDpiMarkersForPage(page, LARGE_FORMAT_BANNER_PROFILE);
  assert.equal(result.markers.length, 1);
  assert.equal(result.markers[0].severity, 'error');
});

test('Perfil large_format: 90 DPI não gera marker (acima do mínimo 100? verificar)', () => {
  const page = makePage({
    imageOccurrences: [
      { id: 'img_ok', page: 1, widthPx: 180, heightPx: 180, displayWidthMm: 1000, displayHeightMm: 1000, effectiveDpiX: 90, effectiveDpiY: 90, colorSpace: 'DeviceCMYK', xPt: 50, yPt: 50, appliedWidthPt: 1000, appliedHeightPt: 1000 },
    ],
  });
  // LARGE_FORMAT: minEffectiveDpi=100, warningDpiThreshold=72
  // 90 is between 72 and 100 → warning
  const result = buildDpiMarkersForPage(page, LARGE_FORMAT_BANNER_PROFILE);
  assert.equal(result.markers.length, 1);
  assert.equal(result.markers[0].severity, 'warning');
});

// ============================================================================
// TESTE 10: Marker usa DPI do Motor 1, não recalcula
// ============================================================================

test('Marker usa effectiveDpiX/Y do Motor 1 (não recalcula DPI)', () => {
  const page = makePage({
    imageOccurrences: [
      { id: 'img1', page: 1, widthPx: 100, heightPx: 100, displayWidthMm: 200, displayHeightMm: 200, effectiveDpiX: 147, effectiveDpiY: 147, colorSpace: 'DeviceCMYK', xPt: 50, yPt: 50, appliedWidthPt: 200, appliedHeightPt: 200 },
    ],
  });
  const result = buildDpiMarkersForPage(page, COMMERCIAL_PRINT_300DPI_PROFILE);
  assert.equal(result.markers.length, 1);
  // measuredValue deve refletir 147 DPI, não recalcular a partir de widthPx/appliedWidthPt
  assert.match(result.markers[0].measuredValue, /147/);
});

// ============================================================================
// RELATÓRIO
// ============================================================================

console.log(`\n  Mapa Visual: ${passed}/${passed + failed} aprovados${failed > 0 ? `, ${failed} falhas` : ''}`);

export { passed as visPassed, failed as visFailed };
