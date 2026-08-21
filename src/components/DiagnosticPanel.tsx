import React, { useState } from 'react';
import { RuleEvaluationResult, RuleEngineSummary } from '../types';
import { CheckCircle2, AlertTriangle, XCircle, HelpCircle, ChevronDown, ChevronUp, Layers, Sliders } from 'lucide-react';

interface DiagnosticPanelProps {
  ruleResults: RuleEngineSummary;
}

export const DiagnosticPanel: React.FC<DiagnosticPanelProps> = ({ ruleResults }) => {
  const [filter, setFilter] = useState<'all' | 'error' | 'warning' | 'approved' | 'undetermined'>('all');
  const [expandedRules, setExpandedRules] = useState<Record<string, boolean>>({});

  const toggleExpand = (ruleId: string) => {
    setExpandedRules((prev) => ({ ...prev, [ruleId]: !prev[ruleId] }));
  };

  const filteredRules = ruleResults.results.filter((rule) => {
    if (filter === 'all') return true;
    return rule.status === filter;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#00D18F]/10 text-[#00D18F] border border-[#00D18F]/30">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Aprovado
          </span>
        );
      case 'warning':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FFB800]/10 text-[#FFB800] border border-[#FFB800]/30">
            <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Alerta
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FF4D4D]/10 text-[#FF4D4D] border border-[#FF4D4D]/30">
            <XCircle className="w-3.5 h-3.5 mr-1" /> Bloqueante
          </span>
        );
      case 'undetermined':
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#8E98A7]/10 text-[#8E98A7] border border-[#8E98A7]/30">
            <HelpCircle className="w-3.5 h-3.5 mr-1" /> Indeterminado
          </span>
        );
    }
  };

  return (
    <div className="bg-[#101722] border border-[#243244] rounded-2xl p-6 shadow-xl mb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#243244]">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center">
            <Sliders className="w-5 h-5 mr-2 text-[#007BFF]" />
            Diagnóstico das Regras Técnicas
          </h3>
          <p className="text-xs text-[#8E98A7] mt-1">
            Perfil ativo: <span className="text-white font-medium">{ruleResults.profileUsed.name}</span>
          </p>
        </div>

        {/* Filter buttons */}
        <div className="flex flex-wrap items-center gap-1.5 bg-[#0B1018] p-1 rounded-xl border border-[#243244]">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
              filter === 'all' ? 'bg-[#007BFF] text-white' : 'text-[#8E98A7] hover:text-white'
            }`}
          >
            Todas ({ruleResults.totalRules})
          </button>
          {ruleResults.errorCount > 0 && (
            <button
              type="button"
              onClick={() => setFilter('error')}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                filter === 'error' ? 'bg-[#FF4D4D] text-white' : 'text-[#FF4D4D] hover:bg-[#FF4D4D]/10'
              }`}
            >
              Erros ({ruleResults.errorCount})
            </button>
          )}
          {ruleResults.warningCount > 0 && (
            <button
              type="button"
              onClick={() => setFilter('warning')}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                filter === 'warning' ? 'bg-[#FFB800] text-black' : 'text-[#FFB800] hover:bg-[#FFB800]/10'
              }`}
            >
              Alertas ({ruleResults.warningCount})
            </button>
          )}
          <button
            type="button"
            onClick={() => setFilter('approved')}
            className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
              filter === 'approved' ? 'bg-[#00D18F] text-black' : 'text-[#00D18F] hover:bg-[#00D18F]/10'
            }`}
          >
            Aprovadas ({ruleResults.approvedCount})
          </button>
        </div>
      </div>

      {/* Rules list */}
      <div className="divide-y divide-[#243244]/50 mt-2">
        {filteredRules.map((rule) => {
          const isExpanded = !!expandedRules[rule.ruleId];

          return (
            <div key={rule.ruleId} className="py-4 first:pt-4 last:pb-0">
              <div
                onClick={() => toggleExpand(rule.ruleId)}
                className="flex items-start justify-between gap-4 cursor-pointer hover:bg-[#16202E]/40 p-2 -mx-2 rounded-xl transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2.5 mb-1">
                    <span className="text-xs font-mono text-[#6B778C] font-semibold">
                      {rule.ruleId}
                    </span>
                    <h4 className="text-sm font-semibold text-white truncate">
                      {rule.title}
                    </h4>
                  </div>
                  <p className="text-xs text-[#A6B4C9] line-clamp-2">
                    {rule.evidence}
                  </p>
                </div>

                <div className="flex items-center space-x-3 shrink-0">
                  {getStatusBadge(rule.status)}
                  <button type="button" className="text-[#8E98A7] hover:text-white p-1">
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="mt-3 pl-4 border-l-2 border-[#243244] ml-2 space-y-2.5 text-xs">
                  <div>
                    <span className="text-[#8E98A7] font-medium block mb-0.5">Explicação Técnica:</span>
                    <p className="text-[#C3CBD6]">{rule.explanation}</p>
                  </div>
                  <div>
                    <span className="text-[#8E98A7] font-medium block mb-0.5">Recomendação Operacional:</span>
                    <p className="text-[#00D18F] font-medium">{rule.recommendation}</p>
                  </div>
                  {rule.references && rule.references.length > 0 && (
                    <div>
                      <span className="text-[#8E98A7] font-medium block mb-1">Ocorrências / Objetos:</span>
                      <div className="space-y-1">
                        {rule.references.slice(0, 10).map((ref, idx) => (
                          <div key={idx} className="bg-[#0B1018] px-2.5 py-1.5 rounded-lg border border-[#243244] text-[#8E98A7] flex items-center justify-between">
                            <span>{ref.page ? `Página ${ref.page}` : 'Documento'}: {ref.details}</span>
                            <span className="text-[10px] text-[#6B778C] uppercase">{ref.objectType}</span>
                          </div>
                        ))}
                      </div>
                    </div>
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
