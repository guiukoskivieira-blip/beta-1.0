import React, { useState } from 'react';
import { ChevronDown, ChevronUp, ClipboardCheck } from 'lucide-react';
import type { JobCheckSpec, JobColorPolicy, JobSidedness } from '../services/jobCheck';

interface JobCheckFormProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  spec: JobCheckSpec;
  onSpecChange: (spec: JobCheckSpec) => void;
}

const EMPTY_SPEC: JobCheckSpec = {};

export const JobCheckForm: React.FC<JobCheckFormProps> = ({
  enabled,
  onToggle,
  spec,
  onSpecChange,
}) => {
  const [expanded, setExpanded] = useState(false);

  const update = (patch: Partial<JobCheckSpec>) => {
    onSpecChange({ ...spec, ...patch });
  };

  const numUpdate = (key: keyof JobCheckSpec, value: string) => {
    if (value === '') {
      const rest = { ...spec };
      delete rest[key];
      onSpecChange(rest);
    } else {
      const n = Number(value);
      if (!Number.isNaN(n) && n > 0) {
        update({ [key]: n } as Partial<JobCheckSpec>);
      }
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto mb-4 px-4">
      <div className="bg-[#101722] border border-[#243244] rounded-2xl shadow-xl overflow-hidden">
        {/* Toggle header */}
        <button
          type="button"
          onClick={() => onToggle(!enabled)}
          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-[#16202E]/50 transition-colors"
        >
          <div className="flex items-center space-x-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${enabled ? 'bg-[#007BFF]/15 border border-[#007BFF]/40 text-[#007BFF]' : 'bg-[#1A2332] border border-[#243244] text-[#6B778C]'}`}>
              <ClipboardCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">
                Conferir com dados do pedido
              </h3>
              <p className="text-xs text-[#8E98A7] mt-0.5">
                {enabled ? 'Ativado — verifique compatibilidade após análise' : 'Opcional — ative para comparar PDF com pedido'}
              </p>
            </div>
          </div>

          {/* Toggle switch */}
          <div className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${enabled ? 'bg-[#007BFF]' : 'bg-[#243244]'}`}>
            <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </div>
        </button>

        {/* Expandable form */}
        {enabled && (
          <div className="border-t border-[#243244]">
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="w-full flex items-center justify-between px-5 py-2.5 text-xs text-[#8E98A7] hover:text-white transition-colors"
            >
              <span className="font-medium">Especificações do pedido</span>
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {expanded && (
              <div className="px-5 pb-5 space-y-4">
                {/* Sidedness + Page count */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-[#8E98A7] mb-1.5 font-medium">Frente / Verso</label>
                    <div className="flex gap-2">
                      {([['single', 'Frente'], ['double', 'Frente e Verso']] as [JobSidedness, string][]).map(([val, label]) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => update({ sidedness: val })}
                          className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                            spec.sidedness === val
                              ? 'bg-[#007BFF]/15 border-[#007BFF]/50 text-[#007BFF]'
                              : 'bg-[#0B1018] border-[#243244] text-[#8E98A7] hover:text-white'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-[#8E98A7] mb-1.5 font-medium">Nº de páginas esperado</label>
                    <input
                      type="number"
                      min={1}
                      value={spec.expectedPageCount ?? ''}
                      onChange={(e) => numUpdate('expectedPageCount', e.target.value)}
                      placeholder="Ex: 4"
                      className="w-full bg-[#0B1018] border border-[#243244] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[#4A5468] focus:outline-none focus:border-[#007BFF]/50 transition-colors"
                    />
                  </div>
                </div>

                {/* Dimensions */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-[#8E98A7] mb-1.5 font-medium">Largura (mm) — opcional</label>
                    <input
                      type="number"
                      min={1}
                      value={spec.expectedWidthMm ?? ''}
                      onChange={(e) => numUpdate('expectedWidthMm', e.target.value)}
                      placeholder="Ex: 210"
                      className="w-full bg-[#0B1018] border border-[#243244] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[#4A5468] focus:outline-none focus:border-[#007BFF]/50 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#8E98A7] mb-1.5 font-medium">Altura (mm) — opcional</label>
                    <input
                      type="number"
                      min={1}
                      value={spec.expectedHeightMm ?? ''}
                      onChange={(e) => numUpdate('expectedHeightMm', e.target.value)}
                      placeholder="Ex: 297"
                      className="w-full bg-[#0B1018] border border-[#243244] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[#4A5468] focus:outline-none focus:border-[#007BFF]/50 transition-colors"
                    />
                  </div>
                </div>

                {/* Color policy */}
                <div>
                  <label className="block text-xs text-[#8E98A7] mb-1.5 font-medium">CMYK obrigatório?</label>
                  <div className="flex gap-2">
                    {([['cmyk_only', 'Sim, CMYK exclusivo'], ['cmyk_or_spot', 'CMYK ou Spot'], ['rgb_allowed', 'RGB permitido']] as [JobColorPolicy, string][]).map(([val, label]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => update({ colorPolicy: val })}
                        className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                          spec.colorPolicy === val
                            ? 'bg-[#007BFF]/15 border-[#007BFF]/50 text-[#007BFF]'
                            : 'bg-[#0B1018] border-[#243244] text-[#8E98A7] hover:text-white'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* DPI + Bleed */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-[#8E98A7] mb-1.5 font-medium">DPI mínimo — opcional</label>
                    <input
                      type="number"
                      min={1}
                      value={spec.minDpi ?? ''}
                      onChange={(e) => numUpdate('minDpi', e.target.value)}
                      placeholder="Ex: 300"
                      className="w-full bg-[#0B1018] border border-[#243244] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[#4A5468] focus:outline-none focus:border-[#007BFF]/50 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#8E98A7] mb-1.5 font-medium">Sangria (mm) — opcional</label>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={spec.expectedBleedMm ?? ''}
                      onChange={(e) => numUpdate('expectedBleedMm', e.target.value)}
                      placeholder="Ex: 3"
                      className="w-full bg-[#0B1018] border border-[#243244] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[#4A5468] focus:outline-none focus:border-[#007BFF]/50 transition-colors"
                    />
                  </div>
                </div>

                {/* Material + Acabamento + Quantidade */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-[#8E98A7] mb-1.5 font-medium">Material — opcional</label>
                    <input
                      type="text"
                      value={spec.material ?? ''}
                      onChange={(e) => update({ material: e.target.value || undefined })}
                      placeholder="Ex: Couché 300g"
                      className="w-full bg-[#0B1018] border border-[#243244] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[#4A5468] focus:outline-none focus:border-[#007BFF]/50 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#8E98A7] mb-1.5 font-medium">Acabamento — opcional</label>
                    <input
                      type="text"
                      value={spec.acabamento ?? ''}
                      onChange={(e) => update({ acabamento: e.target.value || undefined })}
                      placeholder="Ex: Verniz UV"
                      className="w-full bg-[#0B1018] border border-[#243244] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[#4A5468] focus:outline-none focus:border-[#007BFF]/50 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#8E98A7] mb-1.5 font-medium">Quantidade — opcional</label>
                    <input
                      type="number"
                      min={1}
                      value={spec.quantidade ?? ''}
                      onChange={(e) => numUpdate('quantidade', e.target.value)}
                      placeholder="Ex: 500"
                      className="w-full bg-[#0B1018] border border-[#243244] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[#4A5468] focus:outline-none focus:border-[#007BFF]/50 transition-colors"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export { EMPTY_SPEC };
