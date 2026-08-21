/**
 * ARTECHECK — Testes do Fix Engine V1.
 * Verifica classificação de correções, bloqueio de auto fixes inseguros,
 * e que Motor 1 permanece autoridade.
 */
import assert from 'node:assert/strict';
import { buildFixProposals, classifyRule, type FixProposal } from '../src/services/fixEngine';
import type { PreflightAnalysis, RuleEvaluationResult, RuleEngineSummary, ScoreSummary, PdfDocumentStructure } from '../src/types';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ FIX ${passed}: ${name}`);
  } catch (err: any) {
    failed++;
    console.log(`  ✗ FIX ${passed + failed}: ${name} — ${err.message}`);
  }
}

function makeRule(overrides: Partial<RuleEvaluationResult> = {}): RuleEvaluationResult {
  return {
    ruleId: 'RULE-TEST',
    title: 'Test Rule',
    category: 'universal',
    status: 'error',
    evidence: 'Test evidence',
    explanation: 'Test explanation',
    recommendation: 'Test recommendation',
    references: [],
    ...overrides,
  };
}

function makeDoc(): PdfDocumentStructure {
  return {
    pageCount: 1,
    pages: [{
      page: 1, widthPt: 595.28, heightPt: 841.89, widthMm: 210, heightMm: 297,
      visualWidthMm: 210, visualHeightMm: 297, orientation: 'portrait', rotation: 0,
      mediaBox: { status: 'explicit', xPt: 0, yPt: 0, widthPt: 595.28, heightPt: 841.89, xMm: 0, yMm: 0, widthMm: 210, heightMm: 297 },
      trimBox: { status: 'explicit', xPt: 8.5, yPt: 8.5, widthPt: 595.28, heightPt: 841.89, xMm: 3, yMm: 3, widthMm: 210, heightMm: 297 },
      bleedBox: { status: 'explicit', xPt: 0, yPt: 0, widthPt: 612.28, heightPt: 858.89, xMm: 0, yMm: 0, widthMm: 216, heightMm: 303 },
      hasTransparency: false, imageOccurrences: [], colorOccurrences: [],
    }],
    fonts: [],
    colorSummary: { hasRgb: false, hasCmyk: true, hasSpotColors: false, familiesDetected: ['DeviceCMYK'] },
    pdfxInfo: { isDeclaredPdfX: false },
  };
}

function makeAnalysis(rules: RuleEvaluationResult[], classification: 'approved' | 'review' | 'blocked' = 'blocked'): PreflightAnalysis {
  const scoreSummary: ScoreSummary = {
    score: classification === 'blocked' ? 25 : classification === 'review' ? 80 : 100,
    classification,
    label: classification === 'blocked' ? 'Bloqueado' : classification === 'review' ? 'Revisão' : 'Aprovado',
    color: '#00D18F',
    approvedCount: 0, warningCount: 0, errorCount: 0, undeterminedCount: 0,
  };
  const ruleResults: RuleEngineSummary = {
    profileUsed: { id: 'test', name: 'Test' },
    totalRules: rules.length,
    approvedCount: rules.filter(r => r.status === 'approved').length,
    warningCount: rules.filter(r => r.status === 'warning').length,
    errorCount: rules.filter(r => r.status === 'error').length,
    undeterminedCount: rules.filter(r => r.status === 'undetermined').length,
    universalRules: rules.filter(r => r.category === 'universal'),
    profileRules: rules.filter(r => r.category === 'profile_conditioned'),
    results: rules,
    scoreSummary,
    grouped: { approved: [], warning: [], error: [], undetermined: [] },
  };
  return {
    id: 'fix-test-1', createdAt: Date.now(), fileName: 'test.pdf', fileSizeBytes: 1024,
    document: makeDoc(), ruleResults, profileId: 'test',
  };
}

console.log('\n================================================================');
console.log('ARTECHECK — FIX ENGINE V1');
console.log('================================================================\n');

// ============================================================================
// TESTE 1: DPI baixo nunca vira auto
// ============================================================================

test('DPI baixo (error) classificado como MANUAL, nunca auto', () => {
  const rule = makeRule({
    ruleId: 'RULE-PROF-DPI-001',
    title: 'Resolução Efetiva de Imagens (DPI)',
    status: 'error',
    evidence: 'Detectada imagem com 147.0 DPI (Mínimo: 300 DPI)',
    references: [{ page: 1, objectType: 'image', objectId: 'img1', details: '147.0 DPI' }],
  });
  const proposal = classifyRule(rule);
  assert.ok(proposal);
  assert.equal(proposal!.safetyLevel, 'manual');
  assert.equal(proposal!.canApply, false);
  assert.match(proposal!.reasonIfUnavailable, /upsampling/i);
});

test('DPI warning classificado como MANUAL, nunca auto', () => {
  const rule = makeRule({
    ruleId: 'RULE-PROF-DPI-001',
    title: 'Resolução Efetiva de Imagens (DPI)',
    status: 'warning',
    evidence: 'Imagens com resolução intermediária (250 DPI)',
  });
  const proposal = classifyRule(rule);
  assert.ok(proposal);
  assert.equal(proposal!.safetyLevel, 'manual');
});

// ============================================================================
// TESTE 2: Sangria ausente nunca vira auto
// ============================================================================

test('Sangria ausente classificado como MANUAL, nunca auto', () => {
  const rule = makeRule({
    ruleId: 'RULE-PROF-BLD-001',
    title: 'Sangria',
    status: 'error',
    evidence: 'Sangria ausente',
  });
  const proposal = classifyRule(rule);
  assert.ok(proposal);
  assert.equal(proposal!.safetyLevel, 'manual');
  assert.equal(proposal!.canApply, false);
  assert.match(proposal!.reasonIfUnavailable, /inventar conteúdo/i);
});

// ============================================================================
// TESTE 3: Fonte ausente nunca vira auto
// ============================================================================

test('Fonte não incorporada classificada como MANUAL, nunca auto', () => {
  const rule = makeRule({
    ruleId: 'RULE-FONT-001',
    title: 'Fontes Incorporadas',
    status: 'error',
    evidence: 'Arial não incorporada',
    references: [{ page: 1, objectType: 'font', objectId: 'Arial', details: 'Não incorporada' }],
  });
  const proposal = classifyRule(rule);
  assert.ok(proposal);
  assert.equal(proposal!.safetyLevel, 'manual');
  assert.equal(proposal!.canApply, false);
  assert.match(proposal!.reasonIfUnavailable, /licen/i);
});

// ============================================================================
// TESTE 4: RGB pode virar assisted
// ============================================================================

test('RGB detectado (error) classificado como ASSISTED', () => {
  const rule = makeRule({
    ruleId: 'RULE-PROF-CLR-001',
    title: 'Espaço de Cores',
    status: 'error',
    evidence: 'RGB detectado em perfil CMYK',
    references: [{ page: 1, objectType: 'color', details: 'DeviceRGB' }],
  });
  const proposal = classifyRule(rule);
  assert.ok(proposal);
  assert.equal(proposal!.safetyLevel, 'assisted');
  assert.equal(proposal!.canApply, false);
  assert.equal(proposal!.requiresHumanApproval, true);
});

test('RGB detectado (warning) classificado como ASSISTED', () => {
  const rule = makeRule({
    ruleId: 'RULE-PROF-CLR-001',
    title: 'Espaço de Cores',
    status: 'warning',
    evidence: 'RGB detectado',
  });
  const proposal = classifyRule(rule);
  assert.ok(proposal);
  assert.equal(proposal!.safetyLevel, 'assisted');
});

// ============================================================================
// TESTE 5: Approved não gera FixProposal
// ============================================================================

test('Regra aprovada não gera FixProposal', () => {
  const rule = makeRule({
    ruleId: 'RULE-PROF-DPI-001',
    title: 'Resolução Efetiva de Imagens (DPI)',
    status: 'approved',
    evidence: 'Todas as imagens atendem 300 DPI',
  });
  const proposal = classifyRule(rule);
  assert.equal(proposal, null);
});

test('Regra aprovada de cor não gera FixProposal', () => {
  const rule = makeRule({
    ruleId: 'RULE-PROF-CLR-001',
    title: 'Espaço de Cores',
    status: 'approved',
  });
  const proposal = classifyRule(rule);
  assert.equal(proposal, null);
});

test('Regra aprovada de sangria não gera FixProposal', () => {
  const rule = makeRule({
    ruleId: 'RULE-PROF-BLD-001',
    title: 'Sangria',
    status: 'approved',
  });
  const proposal = classifyRule(rule);
  assert.equal(proposal, null);
});

// ============================================================================
// TESTE 6: Fix Engine não altera score/status do Motor 1
// ============================================================================

test('Fix Engine não altera score ou classificação do Motor 1', () => {
  const rules = [
    makeRule({ ruleId: 'RULE-PROF-DPI-001', status: 'error', title: 'DPI', evidence: '147 DPI' }),
    makeRule({ ruleId: 'RULE-PROF-CLR-001', status: 'error', title: 'RGB', evidence: 'RGB detectado' }),
  ];
  const analysis = makeAnalysis(rules, 'blocked');
  const originalScore = analysis.ruleResults.scoreSummary.score;
  const originalClass = analysis.ruleResults.scoreSummary.classification;

  const result = buildFixProposals(analysis);

  assert.equal(analysis.ruleResults.scoreSummary.score, originalScore, 'Score não deve mudar');
  assert.equal(analysis.ruleResults.scoreSummary.classification, originalClass, 'Classificação não deve mudar');
  assert.ok(result.proposals.length > 0, 'Deve gerar propostas');
});

// ============================================================================
// TESTE 7: Motor 1 permanece autoridade
// ============================================================================

test('Fix Engine não declara "corrigido" — propostas têm canApply=false', () => {
  const rules = [
    makeRule({ ruleId: 'RULE-PROF-DPI-001', status: 'error', title: 'DPI' }),
    makeRule({ ruleId: 'RULE-PROF-CLR-001', status: 'error', title: 'RGB' }),
    makeRule({ ruleId: 'RULE-FONT-001', status: 'error', title: 'Fontes' }),
    makeRule({ ruleId: 'RULE-PROF-BLD-001', status: 'error', title: 'Sangria' }),
    makeRule({ ruleId: 'RULE-PDFX-001', status: 'warning', title: 'PDF/X' }),
  ];
  const analysis = makeAnalysis(rules);
  const result = buildFixProposals(analysis);

  for (const p of result.proposals) {
    assert.equal(p.canApply, false, `${p.id} não deve ter canApply=true`);
    assert.ok(p.reasonIfUnavailable.length > 0, `${p.id} deve ter motivo de indisponibilidade`);
  }
});

// ============================================================================
// TESTE 8: PDF/X ausente classificado como ASSISTED
// ============================================================================

test('PDF/X ausente (warning) classificado como ASSISTED', () => {
  const rule = makeRule({
    ruleId: 'RULE-PDFX-001',
    title: 'PDF/X',
    status: 'warning',
    evidence: 'Sem declaração PDF/X',
  });
  const proposal = classifyRule(rule);
  assert.ok(proposal);
  assert.equal(proposal!.safetyLevel, 'assisted');
  assert.equal(proposal!.canApply, false);
  assert.match(proposal!.reasonIfUnavailable, /output intent/i);
});

// ============================================================================
// TESTE 9: buildFixProposals agrega corretamente
// ============================================================================

test('buildFixProposals conta corretamente auto/assisted/manual', () => {
  const rules = [
    makeRule({ ruleId: 'RULE-PROF-DPI-001', status: 'error', title: 'DPI' }),
    makeRule({ ruleId: 'RULE-PROF-CLR-001', status: 'error', title: 'RGB' }),
    makeRule({ ruleId: 'RULE-FONT-001', status: 'error', title: 'Fontes' }),
    makeRule({ ruleId: 'RULE-PROF-BLD-001', status: 'error', title: 'Sangria' }),
    makeRule({ ruleId: 'RULE-PDFX-001', status: 'warning', title: 'PDF/X' }),
    makeRule({ ruleId: 'RULE-PROF-DPI-001', status: 'approved', title: 'DPI OK' }),
  ];
  const analysis = makeAnalysis(rules);
  const result = buildFixProposals(analysis);
  assert.equal(result.autoCount, 0, 'Nenhum auto nesta V1');
  assert.equal(result.assistedCount, 2, 'PDF/X + RGB = 2 assisted');
  assert.equal(result.manualCount, 3, 'DPI + Fontes + Sangria = 3 manual');
  assert.equal(result.proposals.length, 5, 'Approved não gera proposta');
});

// ============================================================================
// TESTE 10: Regra não mapeada não gera proposta
// ============================================================================

test('Regra sem tipo de correção mapeado não gera proposta', () => {
  const rule = makeRule({
    ruleId: 'RULE-STRUCT-001',
    title: 'Integridade Estrutural',
    status: 'error',
  });
  const proposal = classifyRule(rule);
  assert.equal(proposal, null);
});

test('Regra undetermined não gera proposta', () => {
  const rule = makeRule({
    ruleId: 'RULE-PROF-DPI-001',
    status: 'undetermined',
  });
  const proposal = classifyRule(rule);
  assert.equal(proposal, null);
});

// ============================================================================
// TESTE 11: Análise 100% aprovada não gera propostas
// ============================================================================

test('Análise 100% aprovada não gera nenhuma proposta', () => {
  const rules = [
    makeRule({ ruleId: 'RULE-PROF-DPI-001', status: 'approved', title: 'DPI' }),
    makeRule({ ruleId: 'RULE-PROF-CLR-001', status: 'approved', title: 'Cores' }),
    makeRule({ ruleId: 'RULE-PROF-BLD-001', status: 'approved', title: 'Sangria' }),
  ];
  const analysis = makeAnalysis(rules, 'approved');
  const result = buildFixProposals(analysis);
  assert.equal(result.proposals.length, 0);
  assert.equal(result.autoCount, 0);
  assert.equal(result.assistedCount, 0);
  assert.equal(result.manualCount, 0);
});

// ============================================================================
// RELATÓRIO
// ============================================================================

console.log(`\n  Fix Engine: ${passed}/${passed + failed} aprovados${failed > 0 ? `, ${failed} falhas` : ''}`);

export { passed as fixPassed, failed as fixFailed };
