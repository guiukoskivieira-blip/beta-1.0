import React, { useState } from 'react';
import { Wrench, Ban, ShieldCheck, ChevronDown, ChevronUp, Zap, UserCheck, Hand, TriangleAlert as AlertTriangle } from 'lucide-react';
import type { PreflightAnalysis } from '../types';
import { buildFixProposals, type FixProposal, type FixSafetyLevel } from '../services/fixEngine';

interface FixEnginePanelProps {
  analysis: PreflightAnalysis;
}

const safetyConfig: Record<FixSafetyLevel, { icon: typeof Zap; color: string; bg: string; border: string; label: string }> = {
  auto: {
    icon: Zap,
    color: '#00D18F',
    bg: 'bg-[#00D18F]/10',
    border: 'border-[#00D18F]/30',
    label: 'Automática',
  },
  assisted: {
    icon: UserCheck,
    color: '#007BFF',
    bg: 'bg-[#007BFF]/10',
    border: 'border-[#007BFF]/30',
    label: 'Assistida',
  },
  manual: {
    icon: Hand,
    color: '#FF4D4D',
    bg: 'bg-[#FF4D4D]/10',
    border: 'border-[#FF4D4D]/30',
    label: 'Manual',
  },
};

export const FixEnginePanel: React.FC<FixEnginePanelProps> = ({ analysis }) => {
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  const result = buildFixProposals(analysis);

  if (result.proposals.length === 0) {
    return null;
  }

  const toggleExpand = (id: string) => {
    setExpandedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="bg-[#101722] border border-[#243244] rounded-2xl p-6 shadow-xl mb-8">
      {/* Header */}
      <div className="flex items-center justify-between pb-5 border-b border-[#243244]">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-lg bg-[#007BFF]/15 border border-[#007BFF]/40 flex items-center justify-center text-[#007BFF]">
            <Wrench className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Correções disponíveis</h3>
            <p className="text-xs text-[#8E98A7] mt-0.5">
              Análise de viabilidade de correção — nenhuma alteração é aplicada automaticamente
            </p>
          </div>
        </div>

        {/* Summary badges */}
        <div className="flex items-center gap-2 text-xs">
          {result.autoCount > 0 && (
            <span className={`inline-flex items-center px-2 py-1 rounded-full font-semibold ${safetyConfig.auto.bg} ${safetyConfig.auto.border} border`} style={{ color: safetyConfig.auto.color }}>
              <Zap className="w-3 h-3 mr-1" /> {result.autoCount} Auto
            </span>
          )}
          {result.assistedCount > 0 && (
            <span className={`inline-flex items-center px-2 py-1 rounded-full font-semibold ${safetyConfig.assisted.bg} ${safetyConfig.assisted.border} border`} style={{ color: safetyConfig.assisted.color }}>
              <UserCheck className="w-3 h-3 mr-1" /> {result.assistedCount} Assistida
            </span>
          )}
          {result.manualCount > 0 && (
            <span className={`inline-flex items-center px-2 py-1 rounded-full font-semibold ${safetyConfig.manual.bg} ${safetyConfig.manual.border} border`} style={{ color: safetyConfig.manual.color }}>
              <Hand className="w-3 h-3 mr-1" /> {result.manualCount} Manual
            </span>
          )}
        </div>
      </div>

      {/* Warning banner */}
      <div className="mt-4 flex items-start space-x-2.5 p-3 rounded-xl bg-[#FFB800]/5 border border-[#FFB800]/20">
        <ShieldCheck className="w-4 h-4 text-[#FFB800] shrink-0 mt-0.5" />
        <p className="text-xs text-[#A6B4C9]">
          O Fix Engine é um motor de decisão. Ele classifica correções por segurança, mas
          <span className="text-[#FFB800] font-medium"> não altera o PDF</span>. O Motor 1 permanece a autoridade final.
        </p>
      </div>

      {/* Proposals list */}
      <div className="divide-y divide-[#243244]/50 mt-2">
        {result.proposals.map((proposal) => {
          const cfg = safetyConfig[proposal.safetyLevel];
          const SafetyIcon = cfg.icon;
          const isExpanded = !!expandedItems[proposal.id];

          return (
            <div key={proposal.id} className="py-4 first:pt-4 last:pb-0">
              <div
                onClick={() => toggleExpand(proposal.id)}
                className="flex items-start justify-between gap-4 cursor-pointer hover:bg-[#16202E]/40 p-2 -mx-2 rounded-xl transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2.5 mb-1">
                    <span className="text-xs font-mono text-[#6B778C] font-semibold">{proposal.ruleId}</span>
                    <h4 className="text-sm font-semibold text-white truncate">{proposal.title}</h4>
                  </div>
                  <p className="text-xs text-[#A6B4C9] line-clamp-2">{proposal.description}</p>
                </div>

                <div className="flex items-center space-x-3 shrink-0">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.border} border`} style={{ color: cfg.color }}>
                    <SafetyIcon className="w-3.5 h-3.5 mr-1" /> {cfg.label}
                  </span>
                  <button type="button" className="text-[#8E98A7] hover:text-white p-1">
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="mt-3 pl-4 border-l-2 border-[#243244] ml-2 space-y-3 text-xs">
                  {/* Status */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-[#0B1018] border border-[#243244]">
                    <div className="flex items-center space-x-2">
                      {proposal.canApply ? (
                        <Wrench className="w-4 h-4 text-[#00D18F]" />
                      ) : (
                        <Ban className="w-4 h-4 text-[#FF4D4D]" />
                      )}
                      <span className="text-[#8E98A7] font-medium">Correção automática:</span>
                      <span className={proposal.canApply ? 'text-[#00D18F] font-semibold' : 'text-[#FF4D4D] font-semibold'}>
                        {proposal.canApply ? 'disponível' : 'indisponível'}
                      </span>
                    </div>
                    {proposal.requiresHumanApproval && (
                      <span className="inline-flex items-center text-[#FFB800]">
                        <AlertTriangle className="w-3 h-3 mr-1" /> Requer aprovação humana
                      </span>
                    )}
                  </div>

                  {/* Reason */}
                  <div>
                    <span className="text-[#8E98A7] font-medium block mb-0.5">Motivo:</span>
                    <p className="text-[#C3CBD6]">{proposal.reasonIfUnavailable}</p>
                  </div>

                  {/* Measured vs Expected */}
                  {(proposal.measuredValue || proposal.expectedValue) && (
                    <div className="grid grid-cols-2 gap-3">
                      {proposal.measuredValue && (
                        <div className="p-2.5 rounded-lg bg-[#0B1018] border border-[#243244]">
                          <span className="text-[#6B778C] text-[10px] block">Medido</span>
                          <span className="text-[#FF4D4D] font-semibold">{proposal.measuredValue}</span>
                        </div>
                      )}
                      {proposal.expectedValue && (
                        <div className="p-2.5 rounded-lg bg-[#0B1018] border border-[#243244]">
                          <span className="text-[#6B778C] text-[10px] block">Esperado</span>
                          <span className="text-[#00D18F] font-semibold">{proposal.expectedValue}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Affected pages */}
                  {proposal.affectedPages.length > 0 && (
                    <div>
                      <span className="text-[#8E98A7] font-medium block mb-0.5">Páginas afetadas:</span>
                      <span className="text-[#C3CBD6]">{proposal.affectedPages.join(', ')}</span>
                    </div>
                  )}

                  {/* Action button for assisted */}
                  {proposal.safetyLevel === 'assisted' && (
                    <button
                      type="button"
                      disabled
                      className="inline-flex items-center px-4 py-2 rounded-xl bg-[#007BFF]/10 border border-[#007BFF]/30 text-[#007BFF] text-xs font-medium cursor-not-allowed opacity-60"
                    >
                      <UserCheck className="w-3.5 h-3.5 mr-1.5" />
                      Preparar correção
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
