/**
 * ARTECHECK — Testes de integração UI do TrimBleedFixPanel.
 * Verifica:
 * - eligible -> botão "Preparar correção" aparece
 * - not eligible -> motivo aparece, preview não aparece
 * - perfil sem dimensões -> mostra "Correção automática indisponível"
 * - bleed rule aprovada -> painel não aparece
 */
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { TrimBleedFixPanel } from '../src/components/TrimBleedFixPanel';
import { A4_COMMERCIAL_FLYER_PROFILE, COMMERCIAL_PRINT_300DPI_PROFILE, LARGE_FORMAT_BANNER_PROFILE } from '../src/utils/productionProfiles';
import { runDeterministicRuleEngine } from '../src/utils/ruleEngine';
import type { PreflightAnalysis, PdfDocumentStructure, PdfPageStructure, RuleEngineSummary, ScoreSummary, RuleEvaluationResult } from '../src/types';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ TRIMUI ${passed}: ${name}`);
  } catch (err: any) {
    failed++;
    console.log(`  ✗ TRIMUI ${passed + failed}: ${name} — ${err.message}`);
  }
}

function makePage(overrides: Partial<PdfPageStructure> = {}): PdfPageStructure {
  return {
    page: 1,
    widthPt: 612.28,
    heightPt: 858.89,
    widthMm: 216,
    heightMm: 303,
    visualWidthMm: 216,
    visualHeightMm: 303,
    orientation: 'portrait',
    rotation: 0,
    mediaBox: { status: 'explicit', xPt: 0, yPt: 0, widthPt: 612.28, heightPt: 858.89, xMm: 0, yMm: 0, widthMm: 216, heightMm: 303 },
    trimBox: undefined,
    bleedBox: undefined,
    hasTransparency: false,
    imageOccurrences: [],
    colorOccurrences: [{ page: 1, family: 'DeviceCMYK', count: 1 }],
    ...overrides,
  };
}

function makeDoc(pages: PdfPageStructure[]): PdfDocumentStructure {
  return {
    pageCount: pages.length,
    pages,
    fonts: [],
    colorSummary: { hasRgb: false, hasCmyk: true, hasSpotColors: false, familiesDetected: ['DeviceCMYK'] },
    pdfxInfo: { isDeclaredPdfX: false },
  };
}

function makeAnalysis(doc: PdfDocumentStructure, profile: any): PreflightAnalysis {
  const ruleResults = runDeterministicRuleEngine(doc, profile);
  return {
    id: 'trim-ui-test',
    createdAt: Date.now(),
    fileName: 'test.pdf',
    fileSizeBytes: 1024,
    document: doc,
    ruleResults,
    profileId: profile.id,
  };
}

function render(analysis: PreflightAnalysis, profile: any, originalFile: File | null = null): string {
  return renderToString(
    React.createElement(TrimBleedFixPanel, { analysis, profile, originalFile })
  );
}

console.log('\n================================================================');
console.log('ARTECHECK — TRIM/BLEED FIX PANEL UI (Integração)');
console.log('================================================================\n');

// ============================================================================
// TESTE 1: Eligible -> botão "Preparar correção" aparece
// ============================================================================

test('Eligible: MediaBox 216x303 + A4 profile => mostra "Correção elegível" e botão "Preparar correção"', () => {
  const doc = makeDoc([makePage()]); // 216x303 = A4 + 3mm bleed on all sides
  const analysis = makeAnalysis(doc, A4_COMMERCIAL_FLYER_PROFILE);
  const html = render(analysis, A4_COMMERCIAL_FLYER_PROFILE);

  assert.ok(html.includes('Correção elegível'), 'Deve mostrar "Correção elegível"');
  assert.ok(html.includes('Preparar correção'), 'Deve mostrar botão "Preparar correção"');
});

// ============================================================================
// TESTE 2: Not eligible -> motivo aparece, preview não aparece
// ============================================================================

test('Not eligible: MediaBox 210x297 (sem espaço) + A4 profile => mostra "Correção automática indisponível" e motivo', () => {
  const doc = makeDoc([makePage({
    widthPt: 595.28, heightPt: 841.89,
    widthMm: 210, heightMm: 297,
    visualWidthMm: 210, visualHeightMm: 297,
    mediaBox: { status: 'explicit', xPt: 0, yPt: 0, widthPt: 595.28, heightPt: 841.89, xMm: 0, yMm: 0, widthMm: 210, heightMm: 297 },
  })]);
  const analysis = makeAnalysis(doc, A4_COMMERCIAL_FLYER_PROFILE);
  const html = render(analysis, A4_COMMERCIAL_FLYER_PROFILE);

  assert.ok(html.includes('Correção automática indisponível'), 'Deve mostrar "Correção automática indisponível"');
  assert.ok(!html.includes('Preparar correção'), 'Não deve mostrar botão "Preparar correção"');
  assert.ok(!html.includes('Antes'), 'Não deve mostrar preview antes/depois');
});

// ============================================================================
// TESTE 3: Perfil sem dimensões => mostra "Correção automática indisponível"
// ============================================================================

test('Perfil sem dimensões (COMMERCIAL_PRINT_300DPI) => mostra "Correção automática indisponível"', () => {
  const doc = makeDoc([makePage()]);
  const analysis = makeAnalysis(doc, COMMERCIAL_PRINT_300DPI_PROFILE);
  const html = render(analysis, COMMERCIAL_PRINT_300DPI_PROFILE);

  assert.ok(html.includes('Correção automática indisponível'), 'Deve mostrar indisponível');
  assert.ok(html.includes('não define formato final'), 'Deve explicar que o perfil não define formato');
  assert.ok(!html.includes('Preparar correção'), 'Não deve mostrar botão de correção');
});

// ============================================================================
// TESTE 4: Perfil sem sangria => mostra "Correção automática indisponível"
// ============================================================================

test('Perfil sem sangria exigida (LARGE_FORMAT, bleed=0) => painel não renderiza (regra aprovada)', () => {
  const doc = makeDoc([makePage()]);
  const analysis = makeAnalysis(doc, LARGE_FORMAT_BANNER_PROFILE);
  const html = render(analysis, LARGE_FORMAT_BANNER_PROFILE);

  // Large format profile has expectedBleedMm: 0, so no bleed required
  // The bleed rule evaluates as approved, so isRelevant is false and panel returns null
  assert.ok(!html.includes('Correção de Caixas Técnicas'), 'Painel não deve aparecer quando perfil não exige sangria');
  assert.ok(!html.includes('Preparar correção'), 'Botão não deve aparecer');
});

// ============================================================================
// TESTE 5: Bleed rule aprovada => painel não aparece
// ============================================================================

test('Bleed rule aprovada => painel não renderiza', () => {
  // Create a doc with proper trim and bleed boxes so RULE-PROF-BLD-001 passes
  const doc = makeDoc([makePage({
    trimBox: { status: 'explicit', xPt: 8.5, yPt: 8.5, widthPt: 595.28, heightPt: 841.89, xMm: 3, yMm: 3, widthMm: 210, heightMm: 297 },
    bleedBox: { status: 'explicit', xPt: 0, yPt: 0, widthPt: 612.28, heightPt: 858.89, xMm: 0, yMm: 0, widthMm: 216, heightMm: 303 },
  })]);
  const analysis = makeAnalysis(doc, A4_COMMERCIAL_FLYER_PROFILE);
  const html = render(analysis, A4_COMMERCIAL_FLYER_PROFILE);

  // When bleed is approved, isRelevant is false, so panel returns null
  assert.ok(!html.includes('Correção de Caixas Técnicas'), 'Painel não deve aparecer quando sangria está aprovada');
  assert.ok(!html.includes('Preparar correção'), 'Botão não deve aparecer');
});

// ============================================================================
// TESTE 6: Painel sempre visível quando relevante (não escondido silenciosamente)
// ============================================================================

test('Painel visível quando bleed rule tem erro (não escondido silenciosamente)', () => {
  const doc = makeDoc([makePage()]); // No trim/bleed => error
  const analysis = makeAnalysis(doc, A4_COMMERCIAL_FLYER_PROFILE);
  const html = render(analysis, A4_COMMERCIAL_FLYER_PROFILE);

  assert.ok(html.includes('Correção de Caixas Técnicas'), 'Painel deve ser visível');
  assert.ok(html.includes('Scissors') || html.includes('scissors'), 'Ícone deve aparecer');
});

// ============================================================================
// TESTE 7: Preview não aparece no estado idle
// ============================================================================

test('Preview antes/depois não aparece no estado idle', () => {
  const doc = makeDoc([makePage()]);
  const analysis = makeAnalysis(doc, A4_COMMERCIAL_FLYER_PROFILE);
  const html = render(analysis, A4_COMMERCIAL_FLYER_PROFILE);

  // In idle state, preview should not be shown
  assert.ok(!html.includes('Documento corrigido'), 'Preview "depois" não deve aparecer no idle');
});

// ============================================================================
// TESTE 8: Estado elegível mostra mensagem de segurança sobre conteúdo
// ============================================================================

test('Estado elegível mostra aviso sobre conteúdo não modificado', () => {
  const doc = makeDoc([makePage()]);
  const analysis = makeAnalysis(doc, A4_COMMERCIAL_FLYER_PROFILE);
  const html = render(analysis, A4_COMMERCIAL_FLYER_PROFILE);

  assert.ok(html.includes('conteúdo gráfico não será modificado') || html.includes('O conteúdo gráfico não'), 'Deve mencionar que conteúdo não será modificado');
});

// ============================================================================
// TESTE 9: Estado não elegível mostra motivo técnico específico
// ============================================================================

test('Estado não elegível mostra motivo técnico da página', () => {
  const doc = makeDoc([makePage({
    widthPt: 595.28, heightPt: 841.89,
    widthMm: 210, heightMm: 297,
    visualWidthMm: 210, visualHeightMm: 297,
    mediaBox: { status: 'explicit', xPt: 0, yPt: 0, widthPt: 595.28, heightPt: 841.89, xMm: 0, yMm: 0, widthMm: 210, heightMm: 297 },
  })]);
  const analysis = makeAnalysis(doc, A4_COMMERCIAL_FLYER_PROFILE);
  const html = render(analysis, A4_COMMERCIAL_FLYER_PROFILE);

  // Should mention MediaBox insuficiente or similar technical reason
  assert.ok(html.includes('MediaBox') || html.includes('insuficiente') || html.includes('sangria'), 'Deve mostrar motivo técnico');
  assert.ok(html.includes('Reexporte'), 'Deve sugerir reexportar o arquivo');
});

// ============================================================================
// RELATÓRIO
// ============================================================================

console.log(`\n  Trim/Bleed UI: ${passed}/${passed + failed} aprovados${failed > 0 ? `, ${failed} falhas` : ''}`);

export { passed as trimUiPassed, failed as trimUiFailed };
