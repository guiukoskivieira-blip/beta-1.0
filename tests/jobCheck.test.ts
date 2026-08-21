/**
 * ARTECHECK — Testes do módulo Job Check (Pedido × Arquivo).
 * Verifica que o Job Check compara dados do pedido com o diagnóstico do Motor 1
 * sem recalculá-lo, e que divergências críticas bloqueiam a produção.
 */
import assert from 'node:assert/strict';
import { runJobCheck, type JobCheckSpec } from '../src/services/jobCheck';
import type { PreflightAnalysis, PdfDocumentStructure, RuleEngineSummary, ScoreSummary } from '../src/types';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ JOB ${passed}: ${name}`);
  } catch (err: any) {
    failed++;
    console.log(`  ✗ JOB ${passed + failed}: ${name} — ${err.message}`);
  }
}

function makeDoc(overrides: Partial<PdfDocumentStructure> = {}): PdfDocumentStructure {
  return {
    pageCount: 1,
    pages: [
      {
        page: 1,
        widthPt: 595.28,
        heightPt: 841.89,
        widthMm: 210,
        heightMm: 297,
        visualWidthMm: 210,
        visualHeightMm: 297,
        orientation: 'portrait',
        rotation: 0,
        mediaBox: { status: 'explicit', xPt: 0, yPt: 0, widthPt: 612.28, heightPt: 858.89, xMm: 0, yMm: 0, widthMm: 216, heightMm: 303 },
        trimBox: { status: 'explicit', xPt: 8.5, yPt: 8.5, widthPt: 595.28, heightPt: 841.89, xMm: 3, yMm: 3, widthMm: 210, heightMm: 297 },
        bleedBox: { status: 'explicit', xPt: 0, yPt: 0, widthPt: 612.28, heightPt: 158.74, xMm: 0, yMm: 0, widthMm: 216, heightMm: 303 },
        hasTransparency: false,
        imageOccurrences: [],
        colorOccurrences: [{ page: 1, family: 'DeviceCMYK', count: 1 }],
      },
    ],
    fonts: [],
    colorSummary: { hasRgb: false, hasCmyk: true, hasSpotColors: false, familiesDetected: ['DeviceCMYK'] },
    pdfxInfo: { isDeclaredPdfX: false },
    ...overrides,
  };
}

function makeAnalysis(doc: PdfDocumentStructure, classification: 'approved' | 'review' | 'blocked' = 'approved'): PreflightAnalysis {
  const scoreSummary: ScoreSummary = {
    score: classification === 'blocked' ? 25 : classification === 'review' ? 80 : 100,
    classification,
    label: classification === 'blocked' ? 'Bloqueado' : classification === 'review' ? 'Revisão' : 'Aprovado',
    color: '#00D18F',
    approvedCount: 9,
    warningCount: classification === 'review' ? 1 : 0,
    errorCount: classification === 'blocked' ? 2 : 0,
    undeterminedCount: 0,
  };
  const ruleResults: RuleEngineSummary = {
    profileUsed: { id: 'test', name: 'Test' },
    totalRules: 9,
    approvedCount: 9,
    warningCount: 0,
    errorCount: 0,
    undeterminedCount: 0,
    universalRules: [],
    profileRules: [],
    results: [],
    scoreSummary,
    grouped: { approved: [], warning: [], error: [], undetermined: [] },
  };
  return {
    id: 'job-test-1',
    createdAt: Date.now(),
    fileName: 'test.pdf',
    fileSizeBytes: 1024,
    document: doc,
    ruleResults,
    profileId: 'commercial_print_300dpi',
  };
}

console.log('\n================================================================');
console.log('ARTECHECK — JOB CHECK (Pedido × Arquivo)');
console.log('================================================================\n');

// ============================================================================
// TESTE 1: Pedido 2 páginas + PDF 1 página => blocked
// ============================================================================

test('Pedido 2 páginas + PDF 1 página => blocked', () => {
  const doc = makeDoc({ pageCount: 1, pages: [makeDoc().pages[0]] });
  const analysis = makeAnalysis(doc);
  const spec: JobCheckSpec = { expectedPageCount: 2 };
  const result = runJobCheck(spec, analysis);
  assert.equal(result.status, 'blocked');
  assert.ok(result.blockingCount >= 1);
  const pageFinding = result.findings.find((f) => f.id === 'JOB-PAGES-001');
  assert.ok(pageFinding);
  assert.equal(pageFinding!.severity, 'critical');
});

// ============================================================================
// TESTE 2: Dimensões corretas => approved
// ============================================================================

test('Dimensões corretas => approved', () => {
  const doc = makeDoc();
  const analysis = makeAnalysis(doc);
  const spec: JobCheckSpec = { expectedWidthMm: 210, expectedHeightMm: 297 };
  const result = runJobCheck(spec, analysis);
  assert.equal(result.status, 'approved');
  assert.equal(result.blockingCount, 0);
  assert.equal(result.warningCount, 0);
});

// ============================================================================
// TESTE 3: Dimensão errada => blocked
// ============================================================================

test('Dimensão errada => blocked', () => {
  const doc = makeDoc();
  const analysis = makeAnalysis(doc);
  const spec: JobCheckSpec = { expectedWidthMm: 100, expectedHeightMm: 150 };
  const result = runJobCheck(spec, analysis);
  assert.equal(result.status, 'blocked');
  const dimFinding = result.findings.find((f) => f.id === 'JOB-DIM-001');
  assert.ok(dimFinding);
  assert.equal(dimFinding!.severity, 'critical');
});

// ============================================================================
// TESTE 4: CMYK pedido + RGB encontrado => blocked (cmyk_only) ou review (cmyk_or_spot)
// ============================================================================

test('CMYK pedido (cmyk_only) + RGB encontrado => blocked', () => {
  const doc = makeDoc({
    colorSummary: { hasRgb: true, hasCmyk: false, hasSpotColors: false, familiesDetected: ['DeviceRGB'] },
  });
  const analysis = makeAnalysis(doc);
  const spec: JobCheckSpec = { colorPolicy: 'cmyk_only' };
  const result = runJobCheck(spec, analysis);
  assert.equal(result.status, 'blocked');
  const colorFinding = result.findings.find((f) => f.id === 'JOB-COLOR-001');
  assert.ok(colorFinding);
});

test('CMYK pedido (cmyk_or_spot) + apenas RGB => review (não blocked)', () => {
  const doc = makeDoc({
    colorSummary: { hasRgb: true, hasCmyk: false, hasSpotColors: false, familiesDetected: ['DeviceRGB'] },
  });
  const analysis = makeAnalysis(doc);
  const spec: JobCheckSpec = { colorPolicy: 'cmyk_or_spot' };
  const result = runJobCheck(spec, analysis);
  assert.equal(result.status, 'review');
  const colorFinding = result.findings.find((f) => f.id === 'JOB-COLOR-002');
  assert.ok(colorFinding);
  assert.equal(colorFinding!.severity, 'warning');
});

test('RGB permitido + RGB presente => approved', () => {
  const doc = makeDoc({
    colorSummary: { hasRgb: true, hasCmyk: false, hasSpotColors: false, familiesDetected: ['DeviceRGB'] },
  });
  const analysis = makeAnalysis(doc);
  const spec: JobCheckSpec = { colorPolicy: 'rgb_allowed' };
  const result = runJobCheck(spec, analysis);
  assert.equal(result.status, 'approved');
});

// ============================================================================
// TESTE 5: Sangria exigida ausente => blocked
// ============================================================================

test('Sangria exigida (3mm) ausente (sem TrimBox) => blocked', () => {
  const page = makeDoc().pages[0];
  delete (page as any).trimBox;
  const doc = makeDoc({ pages: [page] });
  const analysis = makeAnalysis(doc);
  const spec: JobCheckSpec = { expectedBleedMm: 3 };
  const result = runJobCheck(spec, analysis);
  assert.equal(result.status, 'blocked');
  const bleedFinding = result.findings.find((f) => f.id === 'JOB-BLEED-001');
  assert.ok(bleedFinding);
  assert.equal(bleedFinding!.severity, 'critical');
});

test('Sangria exigida (3mm) presente => approved', () => {
  const doc = makeDoc();
  const analysis = makeAnalysis(doc);
  const spec: JobCheckSpec = { expectedBleedMm: 3 };
  const result = runJobCheck(spec, analysis);
  assert.equal(result.status, 'approved');
});

test('Sangria exigida (5mm) mas PDF tem 3mm => blocked', () => {
  const doc = makeDoc();
  const analysis = makeAnalysis(doc);
  const spec: JobCheckSpec = { expectedBleedMm: 5 };
  const result = runJobCheck(spec, analysis);
  assert.equal(result.status, 'blocked');
  const bleedFinding = result.findings.find((f) => f.id === 'JOB-BLEED-001');
  assert.ok(bleedFinding);
});

// ============================================================================
// TESTE 6: PDF tecnicamente aprovado, mas pedido incompatível => gate não pode dizer "pronto"
// ============================================================================

test('PDF aprovado no Motor 1 + pedido incompatível => gateReady=false', () => {
  const doc = makeDoc({ pageCount: 1, pages: [makeDoc().pages[0]] });
  const analysis = makeAnalysis(doc, 'approved');
  const spec: JobCheckSpec = { expectedPageCount: 4 };
  const result = runJobCheck(spec, analysis);
  assert.equal(result.status, 'blocked');
  assert.equal(result.gateReady, false, 'gateReady deve ser false quando Job Check bloqueia mesmo com Motor 1 aprovado');
});

test('PDF aprovado no Motor 1 + pedido compatível => gateReady=true', () => {
  const doc = makeDoc();
  const analysis = makeAnalysis(doc, 'approved');
  const spec: JobCheckSpec = { expectedWidthMm: 210, expectedHeightMm: 297, expectedPageCount: 1, colorPolicy: 'cmyk_only', expectedBleedMm: 3 };
  const result = runJobCheck(spec, analysis);
  assert.equal(result.status, 'approved');
  assert.equal(result.gateReady, true);
});

test('PDF bloqueado no Motor 1 + pedido compatível => gateReady=false', () => {
  const doc = makeDoc();
  const analysis = makeAnalysis(doc, 'blocked');
  const spec: JobCheckSpec = { expectedWidthMm: 210, expectedHeightMm: 297 };
  const result = runJobCheck(spec, analysis);
  assert.equal(result.gateReady, false, 'gateReady deve ser false quando Motor 1 bloqueia mesmo com Job Check aprovado');
});

test('PDF em revisão no Motor 1 + pedido compatível => gateReady=false', () => {
  const doc = makeDoc();
  const analysis = makeAnalysis(doc, 'review');
  const spec: JobCheckSpec = {};
  const result = runJobCheck(spec, analysis);
  assert.equal(result.gateReady, false, 'gateReady deve ser false quando Motor 1 está em review');
});

// ============================================================================
// TESTES ADICIONAIS: Frente/verso, DPI, páginas excedentes
// ============================================================================

test('Frente/verso: pedido 4 faces + PDF 2 páginas => approved', () => {
  const p1 = makeDoc().pages[0];
  const p2 = { ...p1, page: 2 };
  const doc = makeDoc({ pageCount: 2, pages: [p1, p2] });
  const analysis = makeAnalysis(doc);
  const spec: JobCheckSpec = { expectedPageCount: 4, sidedness: 'double' };
  const result = runJobCheck(spec, analysis);
  assert.equal(result.status, 'approved');
});

test('Frente/verso: pedido 4 faces + PDF 1 página => blocked', () => {
  const doc = makeDoc();
  const analysis = makeAnalysis(doc);
  const spec: JobCheckSpec = { expectedPageCount: 4, sidedness: 'double' };
  const result = runJobCheck(spec, analysis);
  assert.equal(result.status, 'blocked');
});

test('DPI abaixo do mínimo do pedido (150 DPI exigido, imagem a 72) => blocked', () => {
  const page = makeDoc().pages[0];
  page.imageOccurrences = [
    { id: 'img1', page: 1, widthPx: 100, heightPx: 100, displayWidthMm: 100, displayHeightMm: 100, effectiveDpiX: 72, effectiveDpiY: 72, colorSpace: 'DeviceCMYK' },
  ];
  const doc = makeDoc({ pages: [page] });
  const analysis = makeAnalysis(doc);
  const spec: JobCheckSpec = { minDpi: 150 };
  const result = runJobCheck(spec, analysis);
  assert.equal(result.status, 'blocked');
  const dpiFinding = result.findings.find((f) => f.id === 'JOB-DPI-001');
  assert.ok(dpiFinding);
});

test('Páginas excedentes (pedido 1, PDF 3) => review (não blocked)', () => {
  const p1 = makeDoc().pages[0];
  const pages = [p1, { ...p1, page: 2 }, { ...p1, page: 3 }];
  const doc = makeDoc({ pageCount: 3, pages });
  const analysis = makeAnalysis(doc);
  const spec: JobCheckSpec = { expectedPageCount: 1 };
  const result = runJobCheck(spec, analysis);
  assert.equal(result.status, 'review');
  const pagesFinding = result.findings.find((f) => f.id === 'JOB-PAGES-002');
  assert.ok(pagesFinding);
  assert.equal(pagesFinding!.severity, 'warning');
});

test('Job Check não recalcula dados do Motor 1 (usa apenas evidências existentes)', () => {
  const doc = makeDoc();
  const analysis = makeAnalysis(doc, 'approved');
  const spec: JobCheckSpec = { expectedWidthMm: 210, expectedHeightMm: 297 };
  const result = runJobCheck(spec, analysis);
  // O resultado deve usar o scoreSummary do Motor 1 sem modificá-lo
  assert.equal(analysis.ruleResults.scoreSummary.score, 100, 'Motor 1 score não deve ser alterado');
  assert.equal(analysis.ruleResults.scoreSummary.classification, 'approved', 'Motor 1 classification não deve ser alterado');
  assert.equal(result.gateReady, true);
});

// ============================================================================
// RELATÓRIO
// ============================================================================

console.log(`\n  Job Check: ${passed}/${passed + failed} aprovados${failed > 0 ? `, ${failed} falhas` : ''}`);

export { passed as jobPassed, failed as jobFailed };
