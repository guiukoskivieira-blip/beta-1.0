import type {
  PdfDocumentStructure,
  PreflightAnalysis,
  RuleStatus,
} from '../types';

export type JobColorPolicy = 'cmyk_only' | 'cmyk_or_spot' | 'rgb_allowed';
export type JobSidedness = 'single' | 'double';

export interface JobCheckSpec {
  produto?: string;
  expectedWidthMm?: number;
  expectedHeightMm?: number;
  expectedPageCount?: number;
  sidedness?: JobSidedness;
  colorPolicy?: JobColorPolicy;
  minDpi?: number;
  expectedBleedMm?: number;
  material?: string;
  acabamento?: string;
  quantidade?: number;
}

export interface JobCheckFinding {
  id: string;
  title: string;
  severity: 'critical' | 'warning';
  evidence: string;
  recommendation: string;
}

export interface JobCheckResult {
  status: 'approved' | 'review' | 'blocked';
  findings: JobCheckFinding[];
  blockingCount: number;
  warningCount: number;
  gateReady: boolean;
}

function isCritical(f: JobCheckFinding) {
  return f.severity === 'critical';
}

export function runJobCheck(
  spec: JobCheckSpec,
  analysis: PreflightAnalysis
): JobCheckResult {
  const doc = analysis.document;
  const findings: JobCheckFinding[] = [];

  if (!doc || doc.pageCount === 0 || !Array.isArray(doc.pages) || doc.pages.length === 0) {
    findings.push({
      id: 'JOB-DOC-001',
      title: 'Documento sem páginas válidas',
      severity: 'critical',
      evidence: 'O documento não possui páginas para comparar com o pedido.',
      recommendation: 'Envie um PDF válido para verificação do pedido.',
    });
  }

  if (spec.expectedPageCount !== undefined && doc) {
    const actual = doc.pageCount;
    const expected = spec.expectedPageCount;

    if (spec.sidedness === 'double') {
      const requiredSheets = Math.ceil(expected / 2);
      if (actual < requiredSheets) {
        findings.push({
          id: 'JOB-PAGES-001',
          title: 'Páginas insuficientes para o pedido',
          severity: 'critical',
          evidence: `Pedido exige ${expected} faces (${requiredSheets} folhas frente/verso), PDF possui ${actual} página(s).`,
          recommendation: `Adicione ${requiredSheets - actual} página(s) ao arquivo.`,
        });
      } else if (actual > requiredSheets) {
        findings.push({
          id: 'JOB-PAGES-002',
          title: 'Páginas excedentes',
          severity: 'warning',
          evidence: `Pedido exige ${expected} faces (${requiredSheets} folhas), PDF possui ${actual} página(s) (excesso de ${actual - requiredSheets}).`,
          recommendation: 'Confirme se as páginas extras são intencionais.',
        });
      }
    } else {
      if (actual < expected) {
        findings.push({
          id: 'JOB-PAGES-001',
          title: 'Páginas insuficientes',
          severity: 'critical',
          evidence: `Pedido exige ${expected} página(s), PDF possui ${actual}.`,
          recommendation: `Adicione ${expected - actual} página(s) ao arquivo.`,
        });
      } else if (actual > expected) {
        findings.push({
          id: 'JOB-PAGES-002',
          title: 'Páginas excedentes',
          severity: 'warning',
          evidence: `Pedido exige ${expected} página(s), PDF possui ${actual} (excesso de ${actual - expected}).`,
          recommendation: 'Confirme se as páginas extras são intencionais.',
        });
      }
    }
  }

  if (spec.expectedWidthMm !== undefined && spec.expectedHeightMm !== undefined && doc?.pages?.length) {
    const expW = spec.expectedWidthMm;
    const expH = spec.expectedHeightMm;
    const tol = 1.5;
    const mismatched: Array<{ page: number; widthMm: number; heightMm: number }> = [];

    for (const p of doc.pages) {
      const tb = p.trimBox && p.trimBox.status === 'explicit' ? p.trimBox : null;
      const w = tb && typeof tb.widthMm === 'number' ? tb.widthMm : p.widthMm;
      const h = tb && typeof tb.heightMm === 'number' ? tb.heightMm : p.heightMm;
      const matchNormal = Math.abs(w - expW) <= tol && Math.abs(h - expH) <= tol;
      const matchRotated = Math.abs(w - expH) <= tol && Math.abs(h - expW) <= tol;
      if (!matchNormal && !matchRotated) {
        mismatched.push({ page: p.page, widthMm: w, heightMm: h });
      }
    }

    if (mismatched.length > 0) {
      const details = mismatched
        .map((m) => `Pág ${m.page}: ${m.widthMm.toFixed(1)}×${m.heightMm.toFixed(1)} mm`)
        .join(', ');
      findings.push({
        id: 'JOB-DIM-001',
        title: 'Dimensão incompatível com o pedido',
        severity: 'critical',
        evidence: `Pedido especifica ${expW}×${expH} mm, mas ${mismatched.length} página(s) divergem: ${details}.`,
        recommendation: `Ajuste a prancheta para ${expW}×${expH} mm antes de exportar.`,
      });
    }
  }

  if (spec.colorPolicy && doc?.colorSummary) {
    const cs = doc.colorSummary;
    if (spec.colorPolicy === 'cmyk_only' && cs.hasRgb) {
      findings.push({
        id: 'JOB-COLOR-001',
        title: 'Cores incompatíveis com o pedido',
        severity: 'critical',
        evidence: `Pedido exige CMYK exclusivo, mas elementos em DeviceRGB foram detectados (${cs.familiesDetected.join(', ')}).`,
        recommendation: 'Converta todos os objetos para CMYK antes de enviar.',
      });
    } else if (spec.colorPolicy === 'cmyk_or_spot' && cs.hasRgb && !cs.hasCmyk && !cs.hasSpotColors) {
      findings.push({
        id: 'JOB-COLOR-002',
        title: 'Cores incompatíveis com o pedido',
        severity: 'warning',
        evidence: `Pedido aceita CMYK ou spot, mas apenas DeviceRGB foi detectado.`,
        recommendation: 'Converta imagens RGB para CMYK para garantir fidelidade de impressão.',
      });
    }
  }

  if (spec.minDpi !== undefined && doc?.pages?.length) {
    const lowDpi: Array<{ page: number; id: string; dpi: number }> = [];
    for (const p of doc.pages) {
      for (const img of p.imageOccurrences || []) {
        const dpi = Math.min(
          typeof img.effectiveDpiX === 'number' ? img.effectiveDpiX : 300,
          typeof img.effectiveDpiY === 'number' ? img.effectiveDpiY : 300
        );
        if (dpi < spec.minDpi) {
          lowDpi.push({ page: p.page, id: img.id, dpi });
        }
      }
    }
    if (lowDpi.length > 0) {
      const details = lowDpi
        .map((d) => `Pág ${d.page} ${d.id}: ${d.dpi.toFixed(0)} DPI`)
        .join(', ');
      findings.push({
        id: 'JOB-DPI-001',
        title: 'DPI abaixo do mínimo do pedido',
        severity: 'critical',
        evidence: `${lowDpi.length} imagem(ns) abaixo do mínimo de ${spec.minDpi} DPI: ${details}.`,
        recommendation: 'Substitua as imagens em baixa resolução por originais de maior qualidade.',
      });
    }
  }

  if (spec.expectedBleedMm !== undefined && spec.expectedBleedMm > 0 && doc?.pages?.length) {
    const insufficient: Array<{ page: number; bleed: number }> = [];
    for (const p of doc.pages) {
      const tb = p.trimBox;
      const bb = p.bleedBox?.status === 'explicit' ? p.bleedBox : p.mediaBox;
      if (!tb || tb.status !== 'explicit') {
        insufficient.push({ page: p.page, bleed: -1 });
        continue;
      }
      if (bb && tb) {
        const left = (tb.xMm ?? 0) - (bb.xMm ?? 0);
        const bottom = (tb.yMm ?? 0) - (bb.yMm ?? 0);
        const right = ((bb.xMm ?? 0) + (bb.widthMm ?? 0)) - ((tb.xMm ?? 0) + (tb.widthMm ?? 0));
        const top = ((bb.yMm ?? 0) + (bb.heightMm ?? 0)) - ((tb.yMm ?? 0) + (tb.heightMm ?? 0));
        const minBleed = Math.min(left, bottom, right, top);
        if (minBleed < spec.expectedBleedMm - 0.5) {
          insufficient.push({ page: p.page, bleed: minBleed });
        }
      }
    }
    if (insufficient.length > 0) {
      const hasMissingTrim = insufficient.some((i) => i.bleed < 0);
      const details = insufficient
        .filter((i) => i.bleed >= 0)
        .map((i) => `Pág ${i.page}: ${i.bleed.toFixed(1)} mm`)
        .join(', ');
      findings.push({
        id: 'JOB-BLEED-001',
        title: 'Sangria exigida não comprovada',
        severity: 'critical',
        evidence: hasMissingTrim
          ? `Pedido exige ${spec.expectedBleedMm} mm de sangria, mas o PDF não possui TrimBox declarada para verificação.`
          : `Pedido exige ${spec.expectedBleedMm} mm de sangria. Página(s) com sangria insuficiente: ${details}.`,
        recommendation: `Configure sangria de ${spec.expectedBleedMm} mm em todas as bordas e exporte com TrimBox.`,
      });
    }
  }

  const blocking = findings.filter(isCritical);
  const warnings = findings.filter((f) => f.severity === 'warning');

  let status: 'approved' | 'review' | 'blocked' = 'approved';
  if (blocking.length > 0) {
    status = 'blocked';
  } else if (warnings.length > 0) {
    status = 'review';
  }

  const preflightBlocked = analysis.ruleResults?.scoreSummary?.classification === 'blocked';
  const preflightReview = analysis.ruleResults?.scoreSummary?.classification === 'review';

  let gateReady = status === 'approved';
  if (preflightBlocked || preflightReview) {
    gateReady = false;
  }

  return {
    status,
    findings,
    blockingCount: blocking.length,
    warningCount: warnings.length,
    gateReady,
  };
}
