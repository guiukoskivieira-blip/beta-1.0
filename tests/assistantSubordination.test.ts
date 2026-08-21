import assert from 'node:assert/strict';
import { buildGroundedContext, buildGroundedSystemInstruction } from '../src/services/aiGrounding';
import type { PreflightAnalysis } from '../src/types';

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`✓ ASSISTANT ${passed}: ${name}`);
}

console.log('================================================================');
console.log('ARTECHECK AI — SUÍTE DE TESTES: ASSISTENTE SUBORDINADO AO MOTOR');
console.log('================================================================\n');

const mockAnalysisWithApprovedBleed: PreflightAnalysis = {
  id: 'analysis_test_approved',
  createdAt: Date.now(),
  fileName: 'cartao_visita_cmyk_aprovado.pdf',
  fileSizeBytes: 1048576,
  profileId: 'profile_cartao_9x5',
  document: {
    pageCount: 1,
    fonts: [
      {
        id: 'font_helvetica',
        baseFont: 'Helvetica-Bold',
        isEmbedded: true,
        isUsedInContent: true,
      },
    ],
    colorSummary: {
      hasRgb: false,
      hasCmyk: true,
      hasSpotColors: false,
      familiesDetected: ['DeviceCMYK'],
    },
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
        hasTransparency: false,
        imageOccurrences: [],
        colorOccurrences: [],
        mediaBox: {
          status: 'explicit',
          xPt: 0,
          yPt: 0,
          widthPt: 272.13,
          heightPt: 158.74,
          xMm: 0,
          yMm: 0,
          widthMm: 96,
          heightMm: 56,
        },
        trimBox: {
          status: 'explicit',
          xPt: 8.5,
          yPt: 8.5,
          widthPt: 255.12,
          heightPt: 141.73,
          xMm: 3,
          yMm: 3,
          widthMm: 90,
          heightMm: 50,
        },
        bleedBox: {
          status: 'explicit',
          xPt: 0,
          yPt: 0,
          widthPt: 272.13,
          heightPt: 158.74,
          xMm: 0,
          yMm: 0,
          widthMm: 96,
          heightMm: 56,
        },
      },
    ],
  },
  ruleResults: {
    profileUsed: {
      id: 'profile_cartao_9x5',
      name: 'Cartão de Visita Comercial 9x5cm (3mm sangria)',
    },
    totalRules: 3,
    approvedCount: 3,
    warningCount: 0,
    errorCount: 0,
    undeterminedCount: 0,
    universalRules: [],
    profileRules: [],
    grouped: {
      approved: [],
      warning: [],
      error: [],
      undetermined: [],
    },
    scoreSummary: {
      score: 100,
      classification: 'approved',
      label: 'Pronto para Impressão',
      color: '#10B981',
      approvedCount: 3,
      warningCount: 0,
      errorCount: 0,
      undeterminedCount: 0,
    },
    results: [
      {
        ruleId: 'RULE_BLEED_DETECTION',
        category: 'profile_conditioned',
        title: 'Sangria de Impressão (3 mm)',
        status: 'approved',
        evidence: 'Sangria de 3.00 mm detectada (TrimBox 90x50 mm, BleedBox 96x56 mm)',
        explanation: 'A sangria de 3 mm está em total conformidade com o perfil.',
        recommendation: '',
      },
      {
        ruleId: 'RULE_COLOR_SPACE',
        category: 'universal',
        title: 'Espaço de Cor CMYK',
        status: 'approved',
        evidence: '100% CMYK. Nenhum canal RGB detectado.',
        explanation: 'Arquivo 100% pronto para separação em quadricromia.',
        recommendation: '',
      },
      {
        ruleId: 'RULE_IMAGE_RESOLUTION',
        category: 'profile_conditioned',
        title: 'Resolução de Imagens (DPI)',
        status: 'approved',
        evidence: 'Resolução mínima de 300 DPI atendida.',
        explanation: 'Todas as imagens possuem alta definição para offset.',
        recommendation: '',
      },
    ],
  },
};

const mockAnalysisWithBlockingIssue: PreflightAnalysis = {
  id: 'analysis_test_blocking',
  createdAt: Date.now(),
  fileName: 'panfleto_rgb_sem_sangria.pdf',
  fileSizeBytes: 2048576,
  profileId: 'profile_panfleto_a5',
  document: {
    pageCount: 1,
    fonts: [],
    colorSummary: {
      hasRgb: true,
      hasCmyk: false,
      hasSpotColors: false,
      familiesDetected: ['DeviceRGB'],
    },
    pages: [
      {
        page: 1,
        widthPt: 419.53,
        heightPt: 595.28,
        widthMm: 148,
        heightMm: 210,
        visualWidthMm: 148,
        visualHeightMm: 210,
        orientation: 'portrait',
        rotation: 0,
        hasTransparency: false,
        imageOccurrences: [],
        colorOccurrences: [],
        mediaBox: {
          status: 'explicit',
          xPt: 0,
          yPt: 0,
          widthPt: 419.53,
          heightPt: 595.28,
          xMm: 0,
          yMm: 0,
          widthMm: 148,
          heightMm: 210,
        },
      },
    ],
  },
  ruleResults: {
    profileUsed: {
      id: 'profile_panfleto_a5',
      name: 'Panfleto A5 CMYK 300 DPI',
    },
    totalRules: 4,
    approvedCount: 1,
    warningCount: 1,
    errorCount: 2,
    undeterminedCount: 0,
    universalRules: [],
    profileRules: [],
    grouped: {
      approved: [],
      warning: [],
      error: [],
      undetermined: [],
    },
    scoreSummary: {
      score: 45,
      classification: 'blocked',
      label: 'Arquivo Bloqueado para Produção',
      color: '#EF4444',
      approvedCount: 1,
      warningCount: 1,
      errorCount: 2,
      undeterminedCount: 0,
    },
    results: [
      {
        ruleId: 'RULE_BLEED_DETECTION',
        category: 'profile_conditioned',
        title: 'Sangria de Impressão (3 mm)',
        status: 'error',
        evidence: 'Sangria ausente (0 mm detectado). Necessário 3 mm.',
        explanation: 'Falta de margem de corte pode gerar filetes brancos.',
        recommendation: 'Aumente o documento em 3 mm em cada lado nas configurações de prancheta.',
      },
      {
        ruleId: 'RULE_IMAGE_RESOLUTION',
        category: 'profile_conditioned',
        title: 'Resolução Mínima (300 DPI)',
        status: 'error',
        evidence: 'Imagens a 72 DPI detectadas na página 1.',
        explanation: 'Imagens em baixa resolução causam aspecto pixelado.',
        recommendation: 'Substitua imagens de 72 DPI por arquivos em alta definição (300 DPI).',
      },
      {
        ruleId: 'RULE_COLOR_SPACE',
        category: 'universal',
        title: 'Espaço de Cores',
        status: 'warning',
        evidence: 'Cores RGB presentes na composição.',
        explanation: 'Imagens em RGB serão convertidas automaticamente pela RIP da gráfica.',
        recommendation: 'Converta os elementos RGB para o perfil CMYK da gráfica.',
      },
      {
        ruleId: 'RULE_FONTS_EMBEDDED',
        category: 'universal',
        title: 'Fontes Incorporadas',
        status: 'approved',
        evidence: 'Todas as fontes estão incorporadas ou em curvas.',
        explanation: 'Nenhuma fonte ausente detectada.',
        recommendation: '',
      },
    ],
  },
};

test('1. Contexto separa estritamente regras Aprovadas, Alertas e Bloqueantes', () => {
  const context = buildGroundedContext(mockAnalysisWithApprovedBleed);
  assert.equal(context.score, 100);
  assert.equal(context.status, 'approved');
  assert.equal(context.errorCount, 0);
  assert.equal(context.warningCount, 0);
  assert.equal(context.approvedRules.length, 3);
  assert.equal(context.blockingErrors.length, 0);
  assert.equal(context.warnings.length, 0);

  const bleedRule = context.approvedRules.find((r) => r.id === 'RULE_BLEED_DETECTION');
  assert.ok(bleedRule, 'Regra de sangria deve estar presente');
  assert.equal(bleedRule?.status, 'approved');
  assert.match(bleedRule?.evidence || '', /3\.00 mm/);
});

test('2. Guardrails proíbem recomendação corretiva sobre itens Aprovados', () => {
  const context = buildGroundedContext(mockAnalysisWithApprovedBleed);
  const guardrailsText = (context.guardrails || []).join(' ');

  assert.match(guardrailsText, /Nunca contradiga ou questione regras categorizadas como APROVADAS/i);
  assert.match(guardrailsText, /JAMAIS deve recomendar verificar, corrigir ou ajustar esse item/i);
  assert.match(guardrailsText, /Nenhuma recomendação corretiva para regras APROVADAS/i);
});

test('3. Prioridade estrita de resolução (BLOCKING -> WARNING -> APROVADO sem correção)', () => {
  const context = buildGroundedContext(mockAnalysisWithBlockingIssue);
  assert.equal(context.blockingErrors.length, 2);
  assert.equal(context.warnings.length, 1);
  assert.equal(context.approvedRules.length, 1);

  const instruction = buildGroundedSystemInstruction(context);
  assert.match(instruction, /ORDEM DE PRIORIDADE: Responda primeiro sobre problemas BLOQUEANTES/);
  assert.match(instruction, /ITENS APROVADOS NÃO GERAM RECOMENDAÇÃO/);
  assert.match(instruction, /Erros Bloqueantes \(2\)/);
  assert.match(instruction, /Alertas \(1\)/);
  assert.match(instruction, /Regras Aprovadas \(1\)/);
});

test('4. Medições técnicas determinísticas são anexadas com exatidão', () => {
  const context = buildGroundedContext(mockAnalysisWithApprovedBleed);
  assert.equal(context.measuredEvidence.fileSizeBytes, 1048576);
  assert.equal(context.measuredEvidence.pageCount, 1);
  assert.equal(context.measuredEvidence.trimBox?.widthMm, 90);
  assert.equal(context.measuredEvidence.trimBox?.heightMm, 50);
  assert.equal(context.measuredEvidence.bleedBox?.widthMm, 96);
  assert.equal(context.measuredEvidence.bleedBox?.heightMm, 56);
});

test('5. Instrução ao Gemini define motor determinístico como única fonte da verdade', () => {
  const context = buildGroundedContext(mockAnalysisWithApprovedBleed);
  const instruction = buildGroundedSystemInstruction(context);
  assert.match(instruction, /motor determinístico de pré-impressão é a única e absoluta fonte da verdade/i);
  assert.match(instruction, /estritamente SUBORDINADO ao diagnóstico do motor/i);
});

console.log(`\nAssistente Gemini: ${passed}/5 testes aprovados.`);
