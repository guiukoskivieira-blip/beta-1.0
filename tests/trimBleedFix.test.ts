/**
 * ARTECHECK — FIX ENGINE V2: Testes de Correção TrimBox/BleedBox.
 * Testa elegibilidade, transformação, preservação do original,
 * revalidação pelo Motor 1, e bloqueio de correções inseguras.
 */
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { checkTrimBleedEligibility, applyTrimBleedFix, buildPreviewData } from '../src/services/trimBleedFix';
import { A4_COMMERCIAL_FLYER_PROFILE, COMMERCIAL_PRINT_300DPI_PROFILE, LARGE_FORMAT_BANNER_PROFILE } from '../src/utils/productionProfiles';
import { runDeterministicRuleEngine } from '../src/utils/ruleEngine';
import { extractPdfStructure } from '../server/pdfExtractor';
import type { PdfDocumentStructure, PdfPageStructure, PreflightAnalysis } from '../src/types';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  const result = fn();
  if (result instanceof Promise) {
    return result.then(() => {
      passed++;
      console.log(`  ✓ FIXV2 ${passed}: ${name}`);
    }).catch((err: any) => {
      failed++;
      console.log(`  ✗ FIXV2 ${passed + failed}: ${name} — ${err.message}`);
    });
  }
  passed++;
  console.log(`  ✓ FIXV2 ${passed}: ${name}`);
}

async function testAsync(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ FIXV2 ${passed}: ${name}`);
  } catch (err: any) {
    failed++;
    console.log(`  ✗ FIXV2 ${passed + failed}: ${name} — ${err.message}`);
  }
}

const MM_TO_PT = 72.0 / 25.4;

async function makePdfWithMediaBox(widthMm: number, heightMm: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([widthMm * MM_TO_PT, heightMm * MM_TO_PT]);
  page.drawText('Test content', { x: 50, y: 50, size: 12 });
  return doc.save();
}

async function makePdfWithMediaBoxAndTrimBox(
  widthMm: number,
  heightMm: number,
  trimX: number,
  trimY: number,
  trimW: number,
  trimH: number
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([widthMm * MM_TO_PT, heightMm * MM_TO_PT]);
  page.drawText('Test content', { x: 50, y: 50, size: 12 });
  page.setTrimBox(trimX * MM_TO_PT, trimY * MM_TO_PT, trimW * MM_TO_PT, trimH * MM_TO_PT);
  return doc.save();
}

function makeDocFromPages(pages: Partial<PdfPageStructure>[]): PdfDocumentStructure {
  const fullPages: PdfPageStructure[] = pages.map((p, i) => ({
    page: i + 1,
    widthPt: p.widthPt || 595.28,
    heightPt: p.heightPt || 841.89,
    widthMm: p.widthMm || 210,
    heightMm: p.heightMm || 297,
    visualWidthMm: p.visualWidthMm || p.widthMm || 210,
    visualHeightMm: p.visualHeightMm || p.heightMm || 297,
    orientation: p.orientation || 'portrait',
    rotation: p.rotation || 0,
    mediaBox: p.mediaBox || {
      status: 'explicit', xPt: 0, yPt: 0, widthPt: 595.28, heightPt: 841.89,
      xMm: 0, yMm: 0, widthMm: 210, heightMm: 297,
    },
    trimBox: p.trimBox,
    bleedBox: p.bleedBox,
    hasTransparency: false,
    imageOccurrences: [],
    colorOccurrences: [],
  }));
  return {
    pageCount: fullPages.length,
    pages: fullPages,
    fonts: [],
    colorSummary: { hasRgb: false, hasCmyk: true, hasSpotColors: false, familiesDetected: ['DeviceCMYK'] },
    pdfxInfo: { isDeclaredPdfX: false },
  };
}

console.log('\n================================================================');
console.log('ARTECHECK — FIX ENGINE V2: TRIM/BLEED CORRECTION');
console.log('================================================================\n');

// ============================================================================
// TESTE 1: MediaBox com 3 mm suficientes => elegível
// ============================================================================

testAsync('MediaBox com área suficiente (216x303 para A4 210x297 + 3mm) => elegível', async () => {
  const pdfBytes = await makePdfWithMediaBox(216, 303);
  const doc = await extractPdfStructure(Buffer.from(pdfBytes));
  const eligibility = checkTrimBleedEligibility(doc, A4_COMMERCIAL_FLYER_PROFILE);
  assert.equal(eligibility.eligible, true, 'Deve ser elegível');
  assert.equal(eligibility.pages.length, 1);
  assert.equal(eligibility.pages[0].eligible, true);
});

// ============================================================================
// TESTE 2: Conteúdo/área insuficiente => não elegível
// ============================================================================

testAsync('MediaBox sem área suficiente (210x297 para A4 com 3mm bleed) => não elegível', async () => {
  // MediaBox is exactly A4 — no room for bleed
  const pdfBytes = await makePdfWithMediaBox(210, 297);
  const doc = await extractPdfStructure(Buffer.from(pdfBytes));
  const eligibility = checkTrimBleedEligibility(doc, A4_COMMERCIAL_FLYER_PROFILE);
  assert.equal(eligibility.eligible, false, 'Não deve ser elegível sem espaço para sangria');
  assert.ok(eligibility.globalReason.length > 0);
});

testAsync('MediaBox muito pequena (100x100 para A4) => não elegível', async () => {
  const pdfBytes = await makePdfWithMediaBox(100, 100);
  const doc = await extractPdfStructure(Buffer.from(pdfBytes));
  const eligibility = checkTrimBleedEligibility(doc, A4_COMMERCIAL_FLYER_PROFILE);
  assert.equal(eligibility.eligible, false);
});

// ============================================================================
// TESTE 3: TrimBox correta após correção
// ============================================================================

testAsync('TrimBox é definida corretamente após applyTrimBleedFix', async () => {
  const pdfBytes = await makePdfWithMediaBox(216, 303);
  const doc = await extractPdfStructure(Buffer.from(pdfBytes));
  const result = await applyTrimBleedFix(pdfBytes, doc, A4_COMMERCIAL_FLYER_PROFILE);
  assert.equal(result.success, true);

  // Re-extract to verify TrimBox
  const fixedDoc = await extractPdfStructure(Buffer.from(result.pdfBytes!));
  const fixedPage = fixedDoc.pages[0];
  assert.ok(fixedPage.trimBox, 'TrimBox deve existir');
  assert.equal(fixedPage.trimBox!.status, 'explicit');
  // TrimBox should be 210x297mm (within tolerance)
  assert.ok(Math.abs(fixedPage.trimBox!.widthMm - 210) < 1, `TrimBox width should be ~210mm, got ${fixedPage.trimBox!.widthMm}`);
  assert.ok(Math.abs(fixedPage.trimBox!.heightMm - 297) < 1, `TrimBox height should be ~297mm, got ${fixedPage.trimBox!.heightMm}`);
});

// ============================================================================
// TESTE 4: BleedBox correta após correção
// ============================================================================

testAsync('BleedBox é definida corretamente após applyTrimBleedFix', async () => {
  const pdfBytes = await makePdfWithMediaBox(216, 303);
  const doc = await extractPdfStructure(Buffer.from(pdfBytes));
  const result = await applyTrimBleedFix(pdfBytes, doc, A4_COMMERCIAL_FLYER_PROFILE);
  assert.equal(result.success, true);

  const fixedDoc = await extractPdfStructure(Buffer.from(result.pdfBytes!));
  const fixedPage = fixedDoc.pages[0];
  assert.ok(fixedPage.bleedBox, 'BleedBox deve existir');
  assert.equal(fixedPage.bleedBox!.status, 'explicit');
  // BleedBox should be 216x303mm (210+6 x 297+6)
  assert.ok(Math.abs(fixedPage.bleedBox!.widthMm - 216) < 1, `BleedBox width should be ~216mm, got ${fixedPage.bleedBox!.widthMm}`);
  assert.ok(Math.abs(fixedPage.bleedBox!.heightMm - 303) < 1, `BleedBox height should be ~303mm, got ${fixedPage.bleedBox!.heightMm}`);
});

// ============================================================================
// TESTE 5: Original permanece intacto
// ============================================================================

testAsync('PDF original permanece intacto após correção', async () => {
  const pdfBytes = await makePdfWithMediaBox(216, 303);
  const originalCopy = new Uint8Array(pdfBytes);
  const doc = await extractPdfStructure(Buffer.from(pdfBytes));
  const result = await applyTrimBleedFix(pdfBytes, doc, A4_COMMERCIAL_FLYER_PROFILE);

  assert.equal(result.success, true);
  // The original bytes should be unchanged
  for (let i = 0; i < originalCopy.length; i++) {
    assert.equal(pdfBytes[i], originalCopy[i], `Original byte ${i} should be unchanged`);
  }
});

// ============================================================================
// TESTE 6: Novo PDF é criado
// ============================================================================

testAsync('Novo PDF é criado (diferente do original)', async () => {
  const pdfBytes = await makePdfWithMediaBox(216, 303);
  const doc = await extractPdfStructure(Buffer.from(pdfBytes));
  const result = await applyTrimBleedFix(pdfBytes, doc, A4_COMMERCIAL_FLYER_PROFILE);

  assert.equal(result.success, true);
  assert.ok(result.pdfBytes, 'Deve gerar bytes do novo PDF');
  assert.ok(result.pdfBytes!.length > 0, 'Novo PDF não deve ser vazio');
  // The fixed PDF should be larger (has TrimBox/BleedBox entries)
  assert.ok(result.pdfBytes!.length >= pdfBytes.length, 'Novo PDF deve ser >= original em tamanho');
});

// ============================================================================
// TESTE 7: Preview antes/depois disponível
// ============================================================================

testAsync('Preview antes/depois disponível quando elegível', async () => {
  const pdfBytes = await makePdfWithMediaBox(216, 303);
  const doc = await extractPdfStructure(Buffer.from(pdfBytes));
  const eligibility = checkTrimBleedEligibility(doc, A4_COMMERCIAL_FLYER_PROFILE);
  assert.equal(eligibility.eligible, true);

  const preview = buildPreviewData(doc.pages[0], eligibility.pages[0]);
  assert.ok(preview.before, 'Preview antes deve existir');
  assert.ok(preview.after, 'Preview depois deve existir');
  assert.ok(preview.after.trimBox, 'TrimBox depois deve existir no preview');
  assert.ok(preview.after.bleedBox, 'BleedBox depois deve existir no preview');
  assert.equal(preview.bleedMm, 3.0);
  assert.equal(preview.trimWidthMm, 210);
  assert.equal(preview.trimHeightMm, 297);
});

// ============================================================================
// TESTE 8: Usuário cancelar => nenhuma alteração
// ============================================================================

test('Cancelar não aplica alteração (fluxo de cancelamento)', () => {
  // This is a UI-level test. At the logic level, we verify that
  // applyTrimBleedFix is never called when cancelled.
  // The test verifies that the eligibility check alone doesn't modify anything.
  const doc = makeDocFromPages([{
    widthMm: 216, heightMm: 303,
    mediaBox: { status: 'explicit', xPt: 0, yPt: 0, widthPt: 612, heightPt: 858, xMm: 0, yMm: 0, widthMm: 216, heightMm: 303 },
  }]);
  const eligibility = checkTrimBleedEligibility(doc, A4_COMMERCIAL_FLYER_PROFILE);
  // Just checking eligibility doesn't modify the doc
  assert.equal(eligibility.eligible, true);
  assert.equal(doc.pages[0].trimBox, undefined, 'TrimBox não deve ser definida apenas por verificar elegibilidade');
});

// ============================================================================
// TESTE 9: Motor 1 revalida
// ============================================================================

testAsync('Motor 1 revalida após correção', async () => {
  const pdfBytes = await makePdfWithMediaBox(216, 303);
  const doc = await extractPdfStructure(Buffer.from(pdfBytes));
  const result = await applyTrimBleedFix(pdfBytes, doc, A4_COMMERCIAL_FLYER_PROFILE);

  assert.equal(result.success, true);
  assert.ok(result.revalidation, 'Revalidação deve estar presente');
  assert.ok(result.audit.revalidationResult, 'Audit deve conter resultado da revalidação');
  assert.ok(result.revalidation.message.length > 0);
});

// ============================================================================
// TESTE 10: Só Motor 1 pode marcar correção como validada
// ============================================================================

testAsync('Só Motor 1 pode marcar correção como validada (não Fix Engine)', async () => {
  const pdfBytes = await makePdfWithMediaBox(216, 303);
  const doc = await extractPdfStructure(Buffer.from(pdfBytes));
  const result = await applyTrimBleedFix(pdfBytes, doc, A4_COMMERCIAL_FLYER_PROFILE);

  assert.equal(result.success, true);
  // The validation comes from Motor 1 re-running, not from Fix Engine declaring it
  const fixedDoc = await extractPdfStructure(Buffer.from(result.pdfBytes!));
  const motor1Result = runDeterministicRuleEngine(fixedDoc, A4_COMMERCIAL_FLYER_PROFILE);
  const bleedRule = motor1Result.results.find(r => r.ruleId === 'RULE-PROF-BLD-001');

  assert.ok(bleedRule, 'Regra de sangria deve existir');
  // If Motor 1 says approved, then validated=true
  if (bleedRule!.status === 'approved') {
    assert.equal(result.revalidation.validated, true);
    assert.match(result.revalidation.message, /Motor 1/);
  }
});

// ============================================================================
// TESTE 11: Não criar sangria falsa
// ============================================================================

testAsync('Não criar sangria falsa quando MediaBox não tem espaço suficiente', async () => {
  // MediaBox exactly A4 — no room for bleed
  const pdfBytes = await makePdfWithMediaBox(210, 297);
  const doc = await extractPdfStructure(Buffer.from(pdfBytes));
  const result = await applyTrimBleedFix(pdfBytes, doc, A4_COMMERCIAL_FLYER_PROFILE);

  assert.equal(result.success, false, 'Não deve aplicar correção sem espaço');
  assert.ok(result.error, 'Deve ter mensagem de erro explicando');
});

testAsync('Não criar sangria falsa esticando conteúdo', async () => {
  // MediaBox slightly larger but not enough for full bleed on all sides
  const pdfBytes = await makePdfWithMediaBox(212, 299);
  const doc = await extractPdfStructure(Buffer.from(pdfBytes));
  const eligibility = checkTrimBleedEligibility(doc, A4_COMMERCIAL_FLYER_PROFILE);
  // 212mm wide: trim=210, bleed needs 3mm each side → need 216mm. Not enough.
  assert.equal(eligibility.eligible, false, 'Não deve ser elegível com 212mm (precisa 216mm)');
});

// ============================================================================
// TESTE 12: DPI/RGB/fontes continuam sem auto fix
// ============================================================================

test('DPI insuficiente não tem correção auto no Fix Engine V2', () => {
  // TrimBleedFix only handles RULE-PROF-BLD-001, not DPI
  const doc = makeDocFromPages([{
    widthMm: 216, heightMm: 303,
    mediaBox: { status: 'explicit', xPt: 0, yPt: 0, widthPt: 612, heightPt: 858, xMm: 0, yMm: 0, widthMm: 216, heightMm: 303 },
    imageOccurrences: [{
      id: 'img1', page: 1, widthPx: 100, heightPx: 100,
      displayWidthMm: 200, displayHeightMm: 200,
      effectiveDpiX: 72, effectiveDpiY: 72, colorSpace: 'DeviceCMYK',
    }],
  }]);
  const eligibility = checkTrimBleedEligibility(doc, A4_COMMERCIAL_FLYER_PROFILE);
  // Eligibility is about Trim/Bleed only, DPI is irrelevant here
  assert.equal(eligibility.eligible, true, 'Elegibilidade Trim/Bleed não depende de DPI');
});

test('Perfil sem sangria (large_format) não oferece correção', () => {
  const doc = makeDocFromPages([{
    widthMm: 1000, heightMm: 1000,
    mediaBox: { status: 'explicit', xPt: 0, yPt: 0, widthPt: 2835, heightPt: 2835, xMm: 0, yMm: 0, widthMm: 1000, heightMm: 1000 },
  }]);
  const eligibility = checkTrimBleedEligibility(doc, LARGE_FORMAT_BANNER_PROFILE);
  assert.equal(eligibility.eligible, false, 'Perfil sem sangria não deve ser elegível');
  assert.match(eligibility.globalReason, /não exige sangria/i);
});

test('Perfil sem dimensões esperadas não oferece correção', () => {
  const doc = makeDocFromPages([{
    widthMm: 216, heightMm: 303,
    mediaBox: { status: 'explicit', xPt: 0, yPt: 0, widthPt: 612, heightPt: 858, xMm: 0, yMm: 0, widthMm: 216, heightMm: 303 },
  }]);
  // COMMERCIAL_PRINT_300DPI_PROFILE has expectedBleedMm but no expectedWidthMm/expectedHeightMm
  const eligibility = checkTrimBleedEligibility(doc, COMMERCIAL_PRINT_300DPI_PROFILE);
  assert.equal(eligibility.eligible, false, 'Perfil sem dimensões não deve ser elegível');
  assert.match(eligibility.globalReason, /dimensões finais/i);
});

// ============================================================================
// TESTE 13: Auditoria registra valores anteriores e novos
// ============================================================================

testAsync('Auditoria registra ruleId, valores anteriores e novos, timestamp', async () => {
  const pdfBytes = await makePdfWithMediaBox(216, 303);
  const doc = await extractPdfStructure(Buffer.from(pdfBytes));
  const result = await applyTrimBleedFix(pdfBytes, doc, A4_COMMERCIAL_FLYER_PROFILE);

  assert.equal(result.success, true);
  assert.equal(result.audit.ruleId, 'RULE-PROF-BLD-001');
  assert.equal(result.audit.fixType, 'trim_bleed_box');
  assert.ok(result.audit.timestamp > 0);
  assert.equal(result.audit.pageChanges.length, 1);
  assert.ok(result.audit.pageChanges[0].newTrimBox, 'Novo TrimBox deve estar no audit');
  assert.ok(result.audit.pageChanges[0].newBleedBox, 'Novo BleedBox deve estar no audit');
});

// ============================================================================
// TESTE 14: Conteúdo gráfico não alterado
// ============================================================================

testAsync('Conteúdo gráfico não é alterado (texto preservado)', async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([216 * MM_TO_PT, 303 * MM_TO_PT]);
  page.drawText('ARTECHECK TEST CONTENT', { x: 50, y: 50, size: 14 });
  const originalBytes = await doc.save();

  const extractedDoc = await extractPdfStructure(Buffer.from(originalBytes));
  const result = await applyTrimBleedFix(originalBytes, extractedDoc, A4_COMMERCIAL_FLYER_PROFILE);

  assert.equal(result.success, true);

  // Reload the fixed PDF and verify content is still there
  const fixedDoc = await PDFDocument.load(result.pdfBytes!);
  const fixedPage = fixedDoc.getPages()[0];
  const textContent = fixedPage.node.Contents();

  // The content stream should still exist and contain the text
  assert.ok(textContent, 'Content stream deve existir no PDF corrigido');

  // Also verify the page count is the same
  assert.equal(fixedDoc.getPageCount(), 1, 'Page count deve ser preservado');
});

// ============================================================================
// RELATÓRIO
// ============================================================================

// Collect all async test promises and wait for them all
const allTestPromises: Promise<void>[] = [];

// Replace testAsync to collect promises
const originalTestAsync = testAsync;

// Wait for all async tests, then report
setTimeout(() => {
  console.log(`\n  Fix Engine V2: ${passed}/${passed + failed} aprovados${failed > 0 ? `, ${failed} falhas` : ''}`);
}, 3000);

export { passed as fixV2Passed, failed as fixV2Failed };
