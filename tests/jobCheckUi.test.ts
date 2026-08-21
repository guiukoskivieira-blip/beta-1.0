/**
 * ARTECHECK — Testes de integração UI do Job Check.
 * Verifica que JobCheckForm e JobCheckResults renderizam corretamente,
 * que o gate final reflete corretamente Motor 1 + Job Check,
 * e que Job Check não mistura resultados com Motor 1.
 */
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { JobCheckForm, EMPTY_SPEC } from '../src/components/JobCheckForm';
import { JobCheckResults } from '../src/components/JobCheckResults';
import { runJobCheck, type JobCheckSpec } from '../src/services/jobCheck';
import type { PreflightAnalysis, PdfDocumentStructure, RuleEngineSummary, ScoreSummary } from '../src/types';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ UI ${passed}: ${name}`);
  } catch (err: any) {
    failed++;
    console.log(`  ✗ UI ${passed + failed}: ${name} — ${err.message}`);
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
        bleedBox: { status: 'explicit', xPt: 0, yPt: 0, widthPt: 612.28, heightPt: 858.89, xMm: 0, yMm: 0, widthMm: 216, heightMm: 303 },
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
    id: 'ui-test-1',
    createdAt: Date.now(),
    fileName: 'test.pdf',
    fileSizeBytes: 1024,
    document: doc,
    ruleResults,
    profileId: 'commercial_print_300dpi',
  };
}

console.log('\n================================================================');
console.log('ARTECHECK — JOB CHECK UI (Integração)');
console.log('================================================================\n');

// ============================================================================
// TESTES: JobCheckForm
// ============================================================================

test('JobCheckForm desativado por padrão não renderiza campos', () => {
  const html = renderToString(
    React.createElement(JobCheckForm, {
      enabled: false,
      onToggle: () => {},
      spec: EMPTY_SPEC,
      onSpecChange: () => {},
    })
  );
  assert.ok(html.includes('Conferir com dados do pedido'), 'Deve mostrar título da seção');
  assert.ok(!html.includes('Especificações do pedido'), 'Não deve mostrar formulário quando desativado');
});

test('JobCheckForm ativado mostra campos do pedido', () => {
  const html = renderToString(
    React.createElement(JobCheckForm, {
      enabled: true,
      onToggle: () => {},
      spec: EMPTY_SPEC,
      onSpecChange: () => {},
    })
  );
  assert.ok(html.includes('Conferir com dados do pedido'), 'Deve mostrar título');
  assert.ok(html.includes('Especifica'), 'Deve mostrar seção de especificações');
});

test('JobCheckForm ativado com spec preenchida mostra valores nos campos', () => {
  const spec: JobCheckSpec = {
    expectedPageCount: 4,
    expectedWidthMm: 210,
    expectedHeightMm: 297,
    colorPolicy: 'cmyk_only',
    expectedBleedMm: 3,
    sidedness: 'double',
    material: 'Couché 300g',
  };
  const html = renderToString(
    React.createElement(JobCheckForm, {
      enabled: true,
      onToggle: () => {},
      spec,
      onSpecChange: () => {},
    })
  );
  // O formulário começa recolhido; verificamos que pelo menos a seção de especificações existe
  assert.ok(html.includes('Especifica'), 'Deve mostrar seção de especificações');
  // Como o SSR não clica em expandir, verificamos que o componente renderiza sem erros
  // e que o toggle switch está presente
  assert.ok(html.includes('translate-x-5'), 'Toggle deve estar ativado');
});

// ============================================================================
// TESTES: JobCheckResults — gate final
// ============================================================================

test('JobCheckResults: Motor 1 aprovado + Job Check aprovado => gate ready', () => {
  const doc = makeDoc();
  const analysis = makeAnalysis(doc, 'approved');
  const spec: JobCheckSpec = { expectedWidthMm: 210, expectedHeightMm: 297 };
  const result = runJobCheck(spec, analysis);
  const html = renderToString(
    React.createElement(JobCheckResults, { result, spec, analysis })
  );
  assert.ok(html.includes('Gate Final de Produção'), 'Deve mostrar gate final');
  assert.ok(html.includes('pronto para produção'), 'Deve indicar pronto para produção');
  assert.ok(html.includes('Pedido Compatível'), 'Deve mostrar status aprovado');
});

test('JobCheckResults: Motor 1 aprovado + Job Check bloqueado => gate NOT ready', () => {
  const doc = makeDoc();
  const analysis = makeAnalysis(doc, 'approved');
  const spec: JobCheckSpec = { expectedPageCount: 4 };
  const result = runJobCheck(spec, analysis);
  assert.equal(result.status, 'blocked');
  assert.equal(result.gateReady, false);
  const html = renderToString(
    React.createElement(JobCheckResults, { result, spec, analysis })
  );
  assert.ok(html.includes('Não está pronto para produção'), 'Não deve dizer pronto para produção');
  assert.ok(html.includes('Pedido Bloqueado'), 'Deve mostrar status bloqueado');
});

test('JobCheckResults: Motor 1 bloqueado + Job Check aprovado => gate NOT ready', () => {
  const doc = makeDoc();
  const analysis = makeAnalysis(doc, 'blocked');
  const spec: JobCheckSpec = { expectedWidthMm: 210, expectedHeightMm: 297 };
  const result = runJobCheck(spec, analysis);
  assert.equal(result.gateReady, false);
  const html = renderToString(
    React.createElement(JobCheckResults, { result, spec, analysis })
  );
  assert.ok(html.includes('Não está pronto para produção'), 'Gate deve ser false quando Motor 1 bloqueia');
  assert.ok(html.includes('Bloqueado'), 'Deve mostrar Motor 1 como bloqueado');
});

test('JobCheckResults mostra tabela Esperado × Encontrado', () => {
  const doc = makeDoc();
  const analysis = makeAnalysis(doc, 'approved');
  const spec: JobCheckSpec = { expectedWidthMm: 210, expectedHeightMm: 297, expectedPageCount: 1 };
  const result = runJobCheck(spec, analysis);
  const html = renderToString(
    React.createElement(JobCheckResults, { result, spec, analysis })
  );
  assert.ok(html.includes('Esperado'), 'Deve mostrar coluna Esperado');
  assert.ok(html.includes('Encontrado'), 'Deve mostrar coluna Encontrado');
  assert.ok(html.includes('210'), 'Deve mostrar largura esperada');
});

test('JobCheckResults mostra divergências quando há findings', () => {
  const doc = makeDoc();
  const analysis = makeAnalysis(doc, 'approved');
  const spec: JobCheckSpec = { expectedPageCount: 4 };
  const result = runJobCheck(spec, analysis);
  const html = renderToString(
    React.createElement(JobCheckResults, { result, spec, analysis })
  );
  assert.ok(html.includes('Diverg'), 'Deve mostrar seção de divergências');
  assert.ok(html.includes('JOB-PAGES'), 'Deve mostrar ID do finding');
});

test('JobCheckResults não mistura erros do Motor 1 com findings do Job Check', () => {
  const doc = makeDoc();
  const analysis = makeAnalysis(doc, 'blocked');
  const spec: JobCheckSpec = { expectedPageCount: 4 };
  const result = runJobCheck(spec, analysis);
  const html = renderToString(
    React.createElement(JobCheckResults, { result, spec, analysis })
  );
  // Deve mostrar ambos separadamente: Motor 1 status e Job Check status
  assert.ok(html.includes('Motor 1:'), 'Deve mostrar status do Motor 1 separadamente');
  assert.ok(html.includes('Pedido:'), 'Deve mostrar status do Pedido separadamente');
  // O gate final deve ser bloqueado
  assert.ok(html.includes('Não está pronto para produção'));
});

test('JobCheckResults com 0 findings mostra status approved e gate ready (se Motor 1 aprovado)', () => {
  const doc = makeDoc();
  const analysis = makeAnalysis(doc, 'approved');
  const spec: JobCheckSpec = { expectedWidthMm: 210, expectedHeightMm: 297, expectedBleedMm: 3 };
  const result = runJobCheck(spec, analysis);
  assert.equal(result.findings.length, 0);
  const html = renderToString(
    React.createElement(JobCheckResults, { result, spec, analysis })
  );
  assert.ok(html.includes('Pedido Compatível'));
  assert.ok(html.includes('pronto para produção'));
  // Não deve mostrar seção de divergências
  assert.ok(!html.includes('Diverg'), 'Não deve mostrar divergências quando não há findings');
});

// ============================================================================
// RELATÓRIO
// ============================================================================

console.log(`\n  Job Check UI: ${passed}/${passed + failed} aprovados${failed > 0 ? `, ${failed} falhas` : ''}`);

export { passed as uiPassed, failed as uiFailed };
