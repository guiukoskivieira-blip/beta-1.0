import React, { useState } from 'react';
import { CircleCheck as CheckCircle2, TriangleAlert as AlertTriangle, Circle as XCircle, ShieldCheck, ShieldX, ClipboardCheck, ChevronDown, ChevronUp, Package } from 'lucide-react';
import type { JobCheckResult, JobCheckSpec, JobCheckFinding } from '../services/jobCheck';
import type { PreflightAnalysis } from '../types';

interface JobCheckResultsProps {
  result: JobCheckResult;
  spec: JobCheckSpec;
  analysis: PreflightAnalysis;
}

export const JobCheckResults: React.FC<JobCheckResultsProps> = ({
  result,
  spec,
  analysis,
}) => {
  const [expandedFindings, setExpandedFindings] = useState<Record<string, boolean>>({});

  const toggleFinding = (id: string) => {
    setExpandedFindings((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const statusConfig = {
    approved: {
      icon: CheckCircle2,
      color: '#00D18F',
      bg: 'bg-[#00D18F]/10',
      border: 'border-[#00D18F]/30',
      label: 'Pedido Compatível',
    },
    review: {
      icon: AlertTriangle,
      color: '#FFB800',
      bg: 'bg-[#FFB800]/10',
      border: 'border-[#FFB800]/30',
      label: 'Revisão Necessária',
    },
    blocked: {
      icon: XCircle,
      color: '#FF4D4D',
      bg: 'bg-[#FF4D4D]/10',
      border: 'border-[#FF4D4D]/30',
      label: 'Pedido Bloqueado',
    },
  };

  const cfg = statusConfig[result.status];
  const StatusIcon = cfg.icon;

  const preflightClassification = analysis.ruleResults?.scoreSummary?.classification;

  const getFindingIcon = (severity: string) => {
    if (severity === 'critical') return <XCircle className="w-4 h-4 text-[#FF4D4D] shrink-0" />;
    return <AlertTriangle className="w-4 h-4 text-[#FFB800] shrink-0" />;
  };

  const expectedVsFound = (): Array<{ label: string; expected: string; found: string; finding?: JobCheckFinding }> => {
    const rows: Array<{ label: string; expected: string; found: string; finding?: JobCheckFinding }> = [];
    const doc = analysis.document;

    if (spec.expectedPageCount !== undefined) {
      const pagesFinding = result.findings.find((f) => f.id.startsWith('JOB-PAGES'));
      const expectedLabel = spec.sidedness === 'double'
        ? `${spec.expectedPageCount} faces (${Math.ceil(spec.expectedPageCount / 2)} folhas)`
        : `${spec.expectedPageCount} página(s)`;
      rows.push({
        label: 'Páginas',
        expected: expectedLabel,
        found: `${doc.pageCount} página(s)`,
        finding: pagesFinding,
      });
    }

    if (spec.expectedWidthMm !== undefined && spec.expectedHeightMm !== undefined) {
      const dimFinding = result.findings.find((f) => f.id === 'JOB-DIM-001');
      const p0 = doc.pages[0];
      const tb = p0?.trimBox?.status === 'explicit' ? p0.trimBox : null;
      const foundW = tb?.widthMm ?? p0?.widthMm ?? 0;
      const foundH = tb?.heightMm ?? p0?.heightMm ?? 0;
      rows.push({
        label: 'Dimensões',
        expected: `${spec.expectedWidthMm} × ${spec.expectedHeightMm} mm`,
        found: `${foundW.toFixed(1)} × ${foundH.toFixed(1)} mm`,
        finding: dimFinding,
      });
    }

    if (spec.colorPolicy) {
      const colorFinding = result.findings.find((f) => f.id.startsWith('JOB-COLOR'));
      const policyLabel = spec.colorPolicy === 'cmyk_only' ? 'CMYK exclusivo'
        : spec.colorPolicy === 'cmyk_or_spot' ? 'CMYK ou Spot'
        : 'RGB permitido';
      const foundLabel = doc.colorSummary.hasRgb
        ? `RGB detectado (${doc.colorSummary.familiesDetected.join(', ')})`
        : doc.colorSummary.hasCmyk
        ? 'CMYK'
        : doc.colorSummary.hasSpotColors
        ? 'Spot'
        : 'N/A';
      rows.push({
        label: 'Cores',
        expected: policyLabel,
        found: foundLabel,
        finding: colorFinding,
      });
    }

    if (spec.minDpi !== undefined) {
      const dpiFinding = result.findings.find((f) => f.id === 'JOB-DPI-001');
      const allImgs = doc.pages.flatMap((p) => p.imageOccurrences || []);
      const minDpi = allImgs.length > 0
        ? Math.min(...allImgs.map((img) => Math.min(
            typeof img.effectiveDpiX === 'number' ? img.effectiveDpiX : 300,
            typeof img.effectiveDpiY === 'number' ? img.effectiveDpiY : 300
          )))
        : null;
      rows.push({
        label: 'DPI mínimo',
        expected: `${spec.minDpi} DPI`,
        found: minDpi !== null ? `${minDpi.toFixed(0)} DPI` : 'Sem imagens',
        finding: dpiFinding,
      });
    }

    if (spec.expectedBleedMm !== undefined && spec.expectedBleedMm > 0) {
      const bleedFinding = result.findings.find((f) => f.id === 'JOB-BLEED-001');
      rows.push({
        label: 'Sangria',
        expected: `${spec.expectedBleedMm} mm`,
        found: bleedFinding ? 'Insuficiente / não comprovada' : `${spec.expectedBleedMm} mm comprovada`,
        finding: bleedFinding,
      });
    }

    if (spec.sidedness) {
      rows.push({
        label: 'Frente/Verso',
        expected: spec.sidedness === 'double' ? 'Frente e Verso' : 'Frente apenas',
        found: spec.sidedness === 'double'
          ? `${doc.pageCount} página(s) (${Math.ceil(doc.pageCount / 2)} folhas potenciais)`
          : `${doc.pageCount} página(s)`,
      });
    }

    return rows;
  };

  const rows = expectedVsFound();

  return (
    <div className="bg-[#101722] border border-[#243244] rounded-2xl p-6 shadow-xl mb-8">
      {/* Header */}
      <div className="flex items-center justify-between pb-5 border-b border-[#243244]">
        <div className="flex items-center space-x-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${cfg.bg} border ${cfg.border}`}>
            <Package className="w-5 h-5" style={{ color: cfg.color }} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">
              Pedido × Arquivo
            </h3>
            <p className="text-xs text-[#8E98A7] mt-0.5">
              Verificação de compatibilidade do PDF com os dados do pedido
            </p>
          </div>
        </div>

        <div className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-semibold ${cfg.bg} ${cfg.border} border`} style={{ color: cfg.color }}>
          <StatusIcon className="w-4 h-4 mr-1.5" />
          {cfg.label}
        </div>
      </div>

      {/* Expected vs Found table */}
      {rows.length > 0 && (
        <div className="mt-5">
          <h4 className="text-xs font-semibold text-[#8E98A7] uppercase tracking-wider mb-3">
            Comparação Esperado × Encontrado
          </h4>
          <div className="space-y-0">
            {rows.map((row, idx) => (
              <div
                key={idx}
                className={`grid grid-cols-3 gap-3 py-2.5 px-3 text-xs rounded-lg ${
                  row.finding ? 'bg-[#0B1018]/50' : ''
                } ${idx > 0 ? 'mt-1' : ''}`}
              >
                <div className="flex items-center text-[#8E98A7] font-medium">
                  {row.label}
                </div>
                <div className="text-white">
                  <span className="text-[#6B778C] text-[10px] block">Esperado</span>
                  {row.expected}
                </div>
                <div className="text-white">
                  <span className="text-[#6B778C] text-[10px] block">Encontrado</span>
                  <span style={row.finding ? { color: row.finding.severity === 'critical' ? '#FF4D4D' : '#FFB800' } : undefined}>
                    {row.found}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Findings */}
      {result.findings.length > 0 && (
        <div className="mt-5">
          <h4 className="text-xs font-semibold text-[#8E98A7] uppercase tracking-wider mb-3">
            Divergências Encontradas ({result.findings.length})
          </h4>
          <div className="space-y-2">
            {result.findings.map((finding) => {
              const isExpanded = !!expandedFindings[finding.id];
              return (
                <div
                  key={finding.id}
                  className="bg-[#0B1018] border border-[#243244] rounded-xl overflow-hidden"
                >
                  <div
                    onClick={() => toggleFinding(finding.id)}
                    className="flex items-start justify-between gap-3 px-4 py-3 cursor-pointer hover:bg-[#16202E]/40 transition-colors"
                  >
                    <div className="flex items-start space-x-2.5 flex-1 min-w-0">
                      {getFindingIcon(finding.severity)}
                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-mono text-[#6B778C] font-semibold">{finding.id}</span>
                          <span className={`text-xs font-semibold ${finding.severity === 'critical' ? 'text-[#FF4D4D]' : 'text-[#FFB800]'}`}>
                            {finding.severity === 'critical' ? 'Crítico' : 'Alerta'}
                          </span>
                        </div>
                        <h5 className="text-sm font-semibold text-white mt-0.5">{finding.title}</h5>
                        <p className="text-xs text-[#A6B4C9] line-clamp-2 mt-0.5">{finding.evidence}</p>
                      </div>
                    </div>
                    <button type="button" className="text-[#8E98A7] hover:text-white p-1 shrink-0">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="px-4 pb-3 pl-11 space-y-2 text-xs">
                      <div>
                        <span className="text-[#8E98A7] font-medium block mb-0.5">Recomendação:</span>
                        <p className="text-[#00D18F] font-medium">{finding.recommendation}</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Gate final */}
      <div className="mt-5 pt-5 border-t border-[#243244]">
        <div className={`flex items-center justify-between p-4 rounded-xl border ${
          result.gateReady
            ? 'bg-[#00D18F]/5 border-[#00D18F]/30'
            : 'bg-[#FF4D4D]/5 border-[#FF4D4D]/30'
        }`}>
          <div className="flex items-center space-x-3">
            {result.gateReady ? (
              <ShieldCheck className="w-6 h-6 text-[#00D18F]" />
            ) : (
              <ShieldX className="w-6 h-6 text-[#FF4D4D]" />
            )}
            <div>
              <h4 className="text-sm font-bold text-white">
                Gate Final de Produção
              </h4>
              <p className="text-xs text-[#8E98A7] mt-0.5">
                {result.gateReady
                  ? 'PDF e pedido compatíveis — pronto para produção'
                  : 'Não está pronto para produção'}
              </p>
            </div>
          </div>

          <div className="text-right text-xs space-y-0.5">
            <div className="flex items-center justify-end space-x-1.5">
              <ClipboardCheck className="w-3.5 h-3.5 text-[#6B778C]" />
              <span className="text-[#8E98A7]">Motor 1:</span>
              <span className={`font-semibold ${
                preflightClassification === 'approved' ? 'text-[#00D18F]' :
                preflightClassification === 'review' ? 'text-[#FFB800]' :
                'text-[#FF4D4D]'
              }`}>
                {preflightClassification === 'approved' ? 'Aprovado' :
                 preflightClassification === 'review' ? 'Revisão' :
                 'Bloqueado'}
              </span>
            </div>
            <div className="flex items-center justify-end space-x-1.5">
              <Package className="w-3.5 h-3.5 text-[#6B778C]" />
              <span className="text-[#8E98A7]">Pedido:</span>
              <span className={`font-semibold ${cfg.color}`}>
                {result.status === 'approved' ? 'Aprovado' : result.status === 'review' ? 'Revisão' : 'Bloqueado'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
