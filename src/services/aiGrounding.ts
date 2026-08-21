import type { PreflightAnalysis, AiGroundingContext, GroundedRuleItem } from '../types';

/**
 * Builds a strictly subordinate AI grounding context from deterministic preflight analysis.
 * Deterministic preflight engine is the single source of truth.
 */
export function buildGroundedContext(analysis: PreflightAnalysis): AiGroundingContext {
  const results = analysis.ruleResults?.results || [];

  const blockingErrors: GroundedRuleItem[] = [];
  const warnings: GroundedRuleItem[] = [];
  const approvedRules: GroundedRuleItem[] = [];

  for (const r of results) {
    const item: GroundedRuleItem = {
      id: r.ruleId,
      title: r.title,
      status: r.status,
      evidence: r.evidence,
      explanation: r.explanation,
      recommendation: r.recommendation,
    };

    if (r.status === 'error') {
      blockingErrors.push(item);
    } else if (r.status === 'warning') {
      warnings.push(item);
    } else if (r.status === 'approved') {
      approvedRules.push(item);
    }
  }

  const firstPage = analysis.document?.pages?.[0];
  const unembeddedFonts = (analysis.document?.fonts || []).filter(
    (f) => f.isEmbedded === false || f.isEmbedded === 'no'
  );

  const measuredEvidence: Record<string, any> = {
    fileName: analysis.fileName,
    fileSizeBytes: analysis.fileSizeBytes,
    pageCount: analysis.document?.pageCount ?? 1,
    trimBox: firstPage?.trimBox,
    bleedBox: firstPage?.bleedBox,
    mediaBox: firstPage?.mediaBox,
    colorSummary: analysis.document?.colorSummary,
    fontsCount: (analysis.document?.fonts || []).length,
    unembeddedFontsCount: unembeddedFonts.length,
    profileUsed: analysis.ruleResults?.profileUsed,
  };

  const guardrails = [
    'O motor determinístico de pré-impressão é a única fonte de verdade técnica.',
    'Nunca contradiga ou questione regras categorizadas como APROVADAS (approvedRules).',
    'Nunca invente erros, avisos ou problemas ausentes da lista de bloqueios (blockingErrors) e alertas (warnings).',
    'Prioridade estrita de resposta: 1º BLOCKING (bloqueantes/erros), 2º WARNING (alertas), 3º Nenhuma recomendação corretiva para regras APROVADAS.',
    'Se uma regra estiver APROVADA (ex: sangria 3 mm aprovada), você JAMAIS deve recomendar verificar, corrigir ou ajustar esse item.',
    'Explique ou forneça instruções de correção exclusivamente para os problemas reais medidos no relatório.',
  ];

  return {
    schemaVersion: '1.0',
    fileName: analysis.fileName,
    score: analysis.ruleResults.scoreSummary.score,
    status: analysis.ruleResults.scoreSummary.classification,
    errorCount: analysis.ruleResults.errorCount,
    warningCount: analysis.ruleResults.warningCount,
    approvedCount: approvedRules.length,
    blockingErrors,
    warnings,
    approvedRules,
    measuredEvidence,
    guardrails,
    rules: [...blockingErrors, ...warnings, ...approvedRules],
  };
}

/**
 * Builds the strict subordinate system prompt for Gemini.
 */
export function buildGroundedSystemInstruction(context: AiGroundingContext): string {
  const approvedTitles = (context.approvedRules || []).map(r => `• ${r.title} (Status: APROVADO | Evidência: ${r.evidence})`).join('\n');
  const blockingTitles = (context.blockingErrors || []).map(r => `• [BLOQUEANTE] ${r.title}: ${r.evidence}`).join('\n') || '• Nenhum erro bloqueante.';
  const warningTitles = (context.warnings || []).map(r => `• [ALERTA] ${r.title}: ${r.evidence}`).join('\n') || '• Nenhum alerta.';

  return [
    'Você é o Assistente Especialista de Pré-impressão do ArteCheck AI.',
    'SUA REGRA SUPREMA: O motor determinístico de pré-impressão é a única e absoluta fonte da verdade.',
    'Você está estritamente SUBORDINADO ao diagnóstico do motor.',
    '',
    'DIRETRIZES DE RESPOSTA OBRIGATÓRIAS:',
    '1. ORDEM DE PRIORIDADE: Responda primeiro sobre problemas BLOQUEANTES (erros). Depois trate dos ALERTAS (warnings).',
    '2. ITENS APROVADOS NÃO GERAM RECOMENDAÇÃO: Se um item foi aprovado pelo motor (ex: Sangria de 3 mm aprovada), É ESTRITAMENTE PROIBIDO sugerir conferência, correção, ajuste ou alteração desse item.',
    '3. NÃO INVENTE ERROS: Nunca suponha falhas que o motor não detectou.',
    '4. RESPOSTA OBJETIVA: Responda em Português do Brasil com orientações práticas no software de editoração (InDesign, Illustrator, CorelDraw, Acrobat).',
    '',
    '--- SUMÁRIO DETERMINÍSTICO DO ARQUIVO ---',
    `Status Geral: ${context.status} (Score: ${context.score}/100)`,
    `Erros Bloqueantes (${context.errorCount}):\n${blockingTitles}`,
    `Alertas (${context.warningCount}):\n${warningTitles}`,
    `Regras Aprovadas (${context.approvedCount ?? context.approvedRules?.length ?? 0}):\n${approvedTitles || '• Nenhuma.'}`,
  ].join('\n');
}
