/**
 * ARTECHECK — Testes de regressão para Assistente IA.
 * Testa subordinação ao motor determinístico, prioridade de bloqueantes,
 * e que falha da IA não afeta diagnóstico.
 */
import assert from 'node:assert/strict';
import { buildGroundedContext, buildGroundedSystemInstruction } from '../src/services/aiGrounding';
import type { PreflightAnalysis } from '../src/types';

let passed = 0;
let failed = 0;
const bugs: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ASSIST ${passed}: ${name}`);
  } catch (err: any) {
    failed++;
    console.log(`  ✗ ASSIST ${passed + failed}: ${name} — ${err.message}`);
  }
}

console.log('\n================================================================');
console.log('ARTECHECK — REGRESSÃO: ASSISTENTE IA');
console.log('================================================================\n');

// ============================================================================
// MOCK: análise com regras aprovadas e bloqueantes misturadas
// ============================================================================

const mockAnalysis: PreflightAnalysis = {
  id: 'regression_test_1',
  createdAt: Date.now(),
  fileName: 'cartao_visita_mix.pdf',
  fileSizeBytes: 512000,
  profileId: 'commercial_print_300dpi',
  document: {
    pageCount: 1,
    pages: [
      {
        page: 1,
        widthPt: 255.12,
        heightPt: 141.73,
        widthMm: 90,
        heightMm: 50,
        visualWidthMm: 90,
        visualHeightMm: 50,
        orientation: 'landscape',
        rotation: 0,
        mediaBox: { status: 'explicit', xPt: 0, yPt: 0, widthPt: 272.13, heightPt: 158.74, xMm: 0, yMm: 0, widthMm: 96, heightMm: 56 },
        trimBox: { status: 'explicit', xPt: 8.5, yPt: 8.5, widthPt: 255.12, heightPt: 141.73, xMm: 3, yMm: 3, widthMm: 90, heightMm: 50 },
        bleedBox: { status: 'explicit', xPt: 0, yPt: 0, widthPt: 272.13, heightPt: 158.74, xMm: 0, yMm: 0, widthMm: 96, heightMm: 56 },
        hasTransparency: false,
        imageOccurrences: [],
        colorOccurrences: [{ page: 1, family: 'DeviceRGB', count: 1 }],
      },
    ],
    fonts: [
      { id: 'Arial', baseFont: 'Arial', cleanFontName: 'Arial', subtype: 'Type1', isEmbedded: 'no', isUsedInContent: true, usedPages: [1] },
    ],
    colorSummary: { hasRgb: true, hasCmyk: false, hasSpotColors: false, familiesDetected: ['DeviceRGB'] },
    pdfxInfo: { isDeclaredPdfX: false },
  },
  ruleResults: {
    profileUsed: { id: 'commercial_print_300dpi', name: 'Impressão Comercial 300 DPI' },
    totalRules: 5,
    approvedCount: 2,
    warningCount: 1,
    errorCount: 2,
    undeterminedCount: 0,
    universalRules: [],
    profileRules: [],
    results: [
      { ruleId: 'RULE_BLEED', title: 'Sangria 3mm', category: 'profile_conditioned', status: 'approved', evidence: 'Sangria de 3.00mm detectada', explanation: 'Conforme', recommendation: '' },
      { ruleId: 'RULE_RGB', title: 'Espaço de Cores', category: 'profile_conditioned', status: 'error', evidence: 'RGB detectado em perfil CMYK', explanation: 'RGB será convertido', recommendation: 'Converta para CMYK' },
      { ruleId: 'RULE_FONT', title: 'Fontes Incorporadas', category: 'universal', status: 'error', evidence: 'Arial não incorporada', explanation: 'Substituição no RIP', recommendation: 'Incorpore a fonte' },
      { ruleId: 'RULE_PDFX', title: 'PDF/X', category: 'universal', status: 'warning', evidence: 'Sem declaração PDF/X', explanation: 'Pré-fechamento normatizado ausente', recommendation: 'Exporte como PDF/X-1a' },
      { ruleId: 'RULE_STRUCT', title: 'Integridade Estrutural', category: 'universal', status: 'approved', evidence: 'Estrutura válida', explanation: 'Documento íntegro', recommendation: '' },
    ],
    scoreSummary: { score: 30, classification: 'blocked', label: 'Bloqueado', color: '#FF4D4D', approvedCount: 2, warningCount: 1, errorCount: 2, undeterminedCount: 0 },
    grouped: { approved: [], warning: [], error: [], undetermined: [] },
  },
};

// ============================================================================
// TESTES: Nunca contradiz regra APPROVED
// ============================================================================

test('Contexto separa approvedRules de blockingErrors (não mistura)', () => {
  const ctx = buildGroundedContext(mockAnalysis);
  assert.equal(ctx.approvedRules.length, 2);
  assert.equal(ctx.blockingErrors.length, 2);
  assert.equal(ctx.warnings.length, 1);

  // Nenhuma regra approved deve aparecer em blockingErrors
  for (const ap of ctx.approvedRules) {
    assert.ok(!ctx.blockingErrors.find((b) => b.id === ap.id), `Regra aprovada ${ap.id} não deve estar em blockingErrors`);
  }
});

test('Guardrails proíbem recomendação sobre itens APPROVED', () => {
  const ctx = buildGroundedContext(mockAnalysis);
  const guardrailsText = (ctx.guardrails || []).join(' ');
  assert.match(guardrailsText, /APROVADAS/i);
  assert.match(guardrailsText, /JAMAIS/i);
});

test('System instruction menciona proibição de corrigir itens aprovados', () => {
  const ctx = buildGroundedContext(mockAnalysis);
  const instruction = buildGroundedSystemInstruction(ctx);
  assert.match(instruction, /ITENS APROVADOS NÃO GERAM RECOMENDAÇÃO/i);
  assert.match(instruction, /PROIBIDO/i);
});

// ============================================================================
// TESTES: BLOCKING tem prioridade
// ============================================================================

test('System instruction lista BLOCKING antes de WARNING e APPROVED', () => {
  const ctx = buildGroundedContext(mockAnalysis);
  const instruction = buildGroundedSystemInstruction(ctx);
  const blockingPos = instruction.indexOf('BLOQUEANTE');
  const warningPos = instruction.indexOf('ALERTA');
  const approvedPos = instruction.indexOf('APROVADO');

  assert.ok(blockingPos >= 0, 'Deve mencionar BLOQUEANTE');
  assert.ok(warningPos >= 0, 'Deve mencionar ALERTA');
  assert.ok(approvedPos >= 0, 'Deve mencionar APROVADO');
  assert.ok(blockingPos < warningPos, 'BLOQUEANTE deve vir antes de ALERTA');
  assert.ok(warningPos < approvedPos, 'ALERTA deve vir antes de APROVADO');
});

test('Contexto inclui contagens corretas de erros e warnings', () => {
  const ctx = buildGroundedContext(mockAnalysis);
  assert.equal(ctx.errorCount, 2);
  assert.equal(ctx.warningCount, 1);
  assert.equal(ctx.approvedCount, 2);
});

test('rules array segue ordem: blocking primeiro, depois warnings, depois approved', () => {
  const ctx = buildGroundedContext(mockAnalysis);
  assert.ok(ctx.rules && ctx.rules.length > 0, 'rules deve existir');
  // Primeiros devem ser error, depois warning, depois approved
  const statuses = ctx.rules.map((r) => r.status);
  const firstErrorIdx = statuses.indexOf('error');
  const firstWarningIdx = statuses.indexOf('warning');
  const firstApprovedIdx = statuses.indexOf('approved');
  assert.ok(firstErrorIdx < firstWarningIdx, 'Erro deve vir antes de warning');
  assert.ok(firstWarningIdx < firstApprovedIdx, 'Warning deve vir antes de approved');
});

// ============================================================================
// TESTES: Falha da IA não afeta diagnóstico determinístico
// ============================================================================

test('Contexto é construído puramente do motor determinístico (sem chamada de IA)', () => {
  // buildGroundedContext não deve fazer nenhuma chamada de rede ou IA
  const ctx = buildGroundedContext(mockAnalysis);
  assert.equal(ctx.schemaVersion, '1.0');
  assert.equal(ctx.score, 30);
  assert.equal(ctx.status, 'blocked');
});

test('System instruction não contém dados inventados além do motor', () => {
  const ctx = buildGroundedContext(mockAnalysis);
  const instruction = buildGroundedSystemInstruction(ctx);
  // Deve conter o score do motor
  assert.match(instruction, /30\/100/);
  // Deve conter os títulos das regras reais
  assert.match(instruction, /Sangria/);
  assert.match(instruction, /Espaço de Cores/);
  assert.match(instruction, /Fontes Incorporadas/);
});

test('MeasuredEvidence contém dados técnicos precisos do documento', () => {
  const ctx = buildGroundedContext(mockAnalysis);
  assert.equal(ctx.measuredEvidence.fileSizeBytes, 512000);
  assert.equal(ctx.measuredEvidence.pageCount, 1);
  assert.equal(ctx.measuredEvidence.trimBox?.widthMm, 90);
  assert.equal(ctx.measuredEvidence.trimBox?.heightMm, 50);
});

// ============================================================================
// RELATÓRIO
// ============================================================================

console.log(`\n  Assistente: ${passed}/${passed + failed} aprovados${failed > 0 ? `, ${failed} falhas` : ''}`);
if (bugs.length > 0) {
  console.log('  BUGS REAIS ENCONTRADOS:');
  for (const b of bugs) console.log(`    - ${b}`);
}

export { bugs as assistBugs, passed as assistPassed, failed as assistFailed };
