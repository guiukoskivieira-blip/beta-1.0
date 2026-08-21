import { RuleEvaluationResult, ScoreSummary } from '../types';

export function calculateComplianceScore(results: RuleEvaluationResult[]): ScoreSummary {
  const approved = results.filter((r) => r.status === 'approved');
  const warning = results.filter((r) => r.status === 'warning');
  const error = results.filter((r) => r.status === 'error');
  const undetermined = results.filter((r) => r.status === 'undetermined');

  let score = 100;
  // Errors deduct 25 points each
  score -= error.length * 25;
  // Warnings deduct 10 points each
  score -= warning.length * 10;
  // Undetermined deducts 5 points
  score -= undetermined.length * 5;

  score = Math.max(0, Math.min(100, score));

  let classification: 'approved' | 'review' | 'blocked' = 'approved';
  let label = 'Aprovado para Produção';
  let color = '#00D18F'; // Emerald green

  if (error.length > 0) {
    classification = 'blocked';
    label = 'Bloqueado — Correção Obrigatória';
    color = '#FF4D4D'; // Crimson Red
  } else if (warning.length > 0 || undetermined.length > 0 || score < 90) {
    classification = 'review';
    label = 'Atenção — Revisão Necessária';
    color = '#FFB800'; // Amber Yellow
  }

  return {
    score,
    classification,
    label,
    color,
    approvedCount: approved.length,
    warningCount: warning.length,
    errorCount: error.length,
    undeterminedCount: undetermined.length,
  };
}
