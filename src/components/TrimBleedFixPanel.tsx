import React, { useState, useMemo, useCallback } from 'react';
import { Scissors, ShieldCheck, CircleCheck as CheckCircle2, TriangleAlert as AlertTriangle, Download, X, Eye, Loader as Loader2, RefreshCw, Ban } from 'lucide-react';
import type { PreflightAnalysis } from '../types';
import type { ProductionProfile } from '../utils/productionProfiles';
import { checkTrimBleedEligibility, buildPreviewData, type TrimBleedEligibilityResult, type PreviewData } from '../services/trimBleedFix';
import { applyTrimBleedFixViaApi } from '../services/api';

interface TrimBleedFixPanelProps {
  analysis: PreflightAnalysis;
  profile: ProductionProfile;
  originalFile: File | null;
}

type Phase = 'idle' | 'preview' | 'applying' | 'applied' | 'cancelled' | 'error' | 'structural_error';

export const TrimBleedFixPanel: React.FC<TrimBleedFixPanelProps> = ({ analysis, profile, originalFile }) => {
  const [phase, setPhase] = useState<Phase>('idle');
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [revalidationMessage, setRevalidationMessage] = useState<string>('');
  const [validated, setValidated] = useState<boolean>(false);
  const [structuralValid, setStructuralValid] = useState<boolean>(false);
  const [fixedPdfBlob, setFixedPdfBlob] = useState<Blob | null>(null);

  const bleedRule = useMemo(() => {
    return analysis.ruleResults.results.find((r) => r.ruleId === 'RULE-PROF-BLD-001');
  }, [analysis]);

  const isRelevant = useMemo(() => {
    if (!bleedRule) return false;
    return bleedRule.status === 'error' || bleedRule.status === 'undetermined' || bleedRule.status === 'warning';
  }, [bleedRule]);

  const profileHasDimensions = !!(
    profile.expectedBleedMm && profile.expectedBleedMm > 0 &&
    profile.expectedWidthMm && profile.expectedHeightMm
  );

  // Compute eligibility synchronously so it's available on first render (including SSR)
  const eligibility = useMemo<TrimBleedEligibilityResult | null>(() => {
    if (!isRelevant) return null;
    if (!profileHasDimensions) return null;
    return checkTrimBleedEligibility(analysis.document, profile);
  }, [analysis, profile, isRelevant, profileHasDimensions]);

  const handlePrepareFix = useCallback(() => {
    if (!eligibility || !eligibility.eligible) return;
    const firstPage = analysis.document.pages[0];
    if (!firstPage) return;
    const pd = buildPreviewData(firstPage, eligibility.pages[0]);
    setPreviewData(pd);
    setPhase('preview');
  }, [analysis, eligibility]);

  const handleApplyFix = useCallback(async () => {
    if (!originalFile) {
      setErrorMessage('Arquivo original não disponível para correção.');
      setPhase('error');
      return;
    }

    setPhase('applying');

    try {
      const response = await applyTrimBleedFixViaApi(originalFile, profile.id);

      if (!response.success || !response.fixedPdfBase64) {
        // Check if this was a structural validation failure
        if (response.structuralValidation && !response.structuralValidation.valid) {
          setErrorMessage(response.structuralValidation.message || 'Falha na validação estrutural do PDF corrigido.');
          setPhase('structural_error');
          return;
        }
        setErrorMessage(response.error || 'Não foi possível aplicar a correção.');
        setPhase('error');
        return;
      }

      const binaryString = atob(response.fixedPdfBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'application/pdf' });
      setFixedPdfBlob(blob);

      const structureOk = response.structuralValidation?.valid ?? false;
      setStructuralValid(structureOk);

      if (response.revalidation) {
        setRevalidationMessage(response.revalidation.message);
        setValidated(response.revalidation.validated);
      }

      // Only mark as 'applied' if both structural and Motor 1 validation passed
      if (structureOk && response.revalidation?.validated) {
        setPhase('applied');
      } else if (!structureOk) {
        setErrorMessage('Falha na validação estrutural do PDF corrigido.');
        setPhase('structural_error');
      } else {
        // Structural passed but Motor 1 didn't approve
        setPhase('applied');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Erro ao comunicar com o servidor.');
      setPhase('error');
    }
  }, [originalFile, profile]);

  const handleCancel = useCallback(() => {
    setPhase('cancelled');
  }, []);

  const handleDownload = useCallback(() => {
    if (!fixedPdfBlob || !originalFile) return;
    const baseName = originalFile.name.replace(/\.pdf$/i, '');
    const url = URL.createObjectURL(fixedPdfBlob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = `${baseName}_artecheck_corrigido.pdf`;
    window.document.body.appendChild(a);
    a.click();
    window.document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [fixedPdfBlob, originalFile]);

  const handleReset = useCallback(() => {
    setPhase('idle');
    setPreviewData(null);
    setErrorMessage('');
    setRevalidationMessage('');
    setValidated(false);
    setStructuralValid(false);
    setFixedPdfBlob(null);
  }, []);

  // Don't render if bleed rule is approved or not present
  if (!isRelevant) return null;

  const isEligible = eligibility?.eligible === true;

  return (
    <div className="bg-[#101722] border border-[#243244] rounded-2xl p-6 shadow-xl mb-8">
      {/* Header */}
      <div className="flex items-center justify-between pb-5 border-b border-[#243244]">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-lg bg-[#00D18F]/15 border border-[#00D18F]/40 flex items-center justify-center text-[#00D18F]">
            <Scissors className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Correção de Caixas Técnicas</h3>
            <p className="text-xs text-[#8E98A7] mt-0.5">
              TrimBox e BleedBox — quando deterministicamente seguro
            </p>
          </div>
        </div>
      </div>

      {/* Idle state */}
      {phase === 'idle' && (
        <div className="mt-5">
          {/* Profile without dimensions */}
          {!profileHasDimensions && (
            <div className="flex items-start space-x-2.5 p-4 rounded-xl bg-[#FFB800]/5 border border-[#FFB800]/20">
              <Ban className="w-4 h-4 text-[#FFB800] shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-[#FFB800] font-medium">Correção automática indisponível</p>
                <p className="text-xs text-[#A6B4C9] mt-1">
                  O perfil selecionado ("{profile.name}") não define formato final (largura e altura) e sangria.
                  Não é possível calcular TrimBox deterministicamente. Selecione um perfil com dimensões definidas
                  (ex: "Folheto Comercial A4") ou configure um perfil personalizado.
                </p>
              </div>
            </div>
          )}

          {/* Eligible state */}
          {profileHasDimensions && isEligible && (
            <>
              <div className="flex items-start space-x-2.5 p-4 rounded-xl bg-[#00D18F]/5 border border-[#00D18F]/20 mb-4">
                <CheckCircle2 className="w-4 h-4 text-[#00D18F] shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-[#00D18F] font-medium">Correção elegível</p>
                  <p className="text-xs text-[#A6B4C9] mt-1">
                    O MediaBox contém área suficiente para definir TrimBox e BleedBox deterministicamente,
                    sem alterar o conteúdo gráfico. Um novo arquivo PDF será gerado.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-2.5 p-3 rounded-xl bg-[#FFB800]/5 border border-[#FFB800]/20 mb-4">
                <ShieldCheck className="w-4 h-4 text-[#FFB800] shrink-0 mt-0.5" />
                <p className="text-xs text-[#A6B4C9]">
                  Esta correção altera <span className="text-white font-medium">somente as caixas técnicas</span> do PDF.
                  O conteúdo gráfico não será modificado.
                </p>
              </div>

              <button
                type="button"
                onClick={handlePrepareFix}
                className="inline-flex items-center px-5 py-2.5 rounded-xl text-sm font-medium bg-[#007BFF]/15 border border-[#007BFF]/40 text-[#007BFF] hover:bg-[#007BFF]/25 cursor-pointer transition-all"
              >
                <Eye className="w-4 h-4 mr-2" />
                Preparar correção
              </button>
            </>
          )}

          {/* Not eligible state (profile has dimensions but MediaBox is insufficient) */}
          {profileHasDimensions && !isEligible && eligibility && (
            <div className="flex items-start space-x-2.5 p-4 rounded-xl bg-[#FF4D4D]/5 border border-[#FF4D4D]/20">
              <Ban className="w-4 h-4 text-[#FF4D4D] shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-[#FF4D4D] font-medium">Correção automática indisponível</p>
                <p className="text-xs text-[#A6B4C9] mt-1">{eligibility.globalReason}</p>
                {eligibility.pages.map((p) => (
                  !p.eligible ? (
                    <p key={p.page} className="text-xs text-[#6B778C] mt-1.5">
                      Página {p.page}: {p.reason}
                    </p>
                  ) : null
                ))}
                <p className="text-xs text-[#A6B4C9] mt-2">
                  A sangria deve ser parte da arte original. Não é possível inventar conteúdo de borda.
                  Reexporte o arquivo com sangria configurada no software de origem.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Preview state: show before/after */}
      {phase === 'preview' && previewData && eligibility && (
        <div className="mt-5">
          <div className="flex items-start space-x-2.5 p-3 rounded-xl bg-[#FFB800]/5 border border-[#FFB800]/20 mb-5">
            <ShieldCheck className="w-4 h-4 text-[#FFB800] shrink-0 mt-0.5" />
            <p className="text-xs text-[#A6B4C9]">
              Esta correção altera <span className="text-white font-medium">somente as caixas técnicas</span> do PDF.
              O conteúdo gráfico não foi modificado.
            </p>
          </div>

          {/* Before/After preview */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
            {/* Before */}
            <div>
              <h4 className="text-xs font-semibold text-[#8E98A7] uppercase tracking-wider mb-2">Antes</h4>
              <BoxPreview
                mediaBox={previewData.before.mediaBox}
                trimBox={previewData.before.trimBox}
                bleedBox={previewData.before.bleedBox}
                label="Documento original"
              />
            </div>
            {/* After */}
            <div>
              <h4 className="text-xs font-semibold text-[#00D18F] uppercase tracking-wider mb-2">Depois</h4>
              <BoxPreview
                mediaBox={previewData.after.mediaBox}
                trimBox={previewData.after.trimBox}
                bleedBox={previewData.after.bleedBox}
                label="Documento corrigido"
                highlightChanges
              />
            </div>
          </div>

          {/* Measurements */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="p-3 rounded-xl bg-[#0B1018] border border-[#243244] text-center">
              <span className="text-[10px] text-[#6B778C] block">Sangria</span>
              <span className="text-lg font-bold text-[#00D18F]">{previewData.bleedMm} mm</span>
            </div>
            <div className="p-3 rounded-xl bg-[#0B1018] border border-[#243244] text-center">
              <span className="text-[10px] text-[#6B778C] block">Formato</span>
              <span className="text-sm font-bold text-white">{previewData.trimWidthMm} × {previewData.trimHeightMm} mm</span>
            </div>
            <div className="p-3 rounded-xl bg-[#0B1018] border border-[#243244] text-center">
              <span className="text-[10px] text-[#6B778C] block">Alteração</span>
              <span className="text-sm font-bold text-[#007BFF]">Caixas técnicas</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleApplyFix}
              disabled={!originalFile}
              className="inline-flex items-center px-5 py-2.5 rounded-xl text-sm font-medium bg-[#00D18F]/15 border border-[#00D18F]/40 text-[#00D18F] hover:bg-[#00D18F]/25 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Aplicar correção
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="inline-flex items-center px-5 py-2.5 rounded-xl text-sm font-medium bg-[#1A2332] border border-[#243244] text-[#8E98A7] hover:bg-[#243244] hover:text-white cursor-pointer transition-all"
            >
              <X className="w-4 h-4 mr-2" />
              Cancelar
            </button>
            {!originalFile && (
              <span className="text-xs text-[#FF4D4D]">Arquivo original necessário</span>
            )}
          </div>
        </div>
      )}

      {/* Applying state */}
      {phase === 'applying' && (
        <div className="mt-5 flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-[#007BFF] animate-spin mr-3" />
          <span className="text-sm text-[#A6B4C9]">Gerando PDF corrigido e revalidando com Motor 1...</span>
        </div>
      )}

      {/* Applied state — only shown when both structural + Motor 1 validation pass */}
      {phase === 'applied' && (
        <div className="mt-5">
          {structuralValid && validated ? (
            <>
              <div className="flex items-start space-x-2.5 p-4 rounded-xl mb-4 bg-[#00D18F]/5 border border-[#00D18F]/20">
                <CheckCircle2 className="w-5 h-5 text-[#00D18F] shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-[#00D18F]">PDF corrigido e validado</p>
                  <div className="mt-2 space-y-1">
                    <p className="text-xs text-[#A6B4C9] flex items-center gap-1.5">
                      <CheckCircle2 className="w-3 h-3 text-[#00D18F]" /> Integridade estrutural
                    </p>
                    <p className="text-xs text-[#A6B4C9] flex items-center gap-1.5">
                      <CheckCircle2 className="w-3 h-3 text-[#00D18F]" /> Reanálise pelo Motor 1
                    </p>
                    <p className="text-xs text-[#A6B4C9] flex items-center gap-1.5">
                      <CheckCircle2 className="w-3 h-3 text-[#00D18F]" /> TrimBox validado
                    </p>
                    <p className="text-xs text-[#A6B4C9] flex items-center gap-1.5">
                      <CheckCircle2 className="w-3 h-3 text-[#00D18F]" /> BleedBox validado
                    </p>
                    <p className="text-xs text-[#A6B4C9] flex items-center gap-1.5">
                      <CheckCircle2 className="w-3 h-3 text-[#00D18F]" /> Conteúdo gráfico preservado
                    </p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className={`flex items-start space-x-2.5 p-4 rounded-xl mb-4 ${
              structuralValid
                ? 'bg-[#FFB800]/5 border border-[#FFB800]/20'
                : 'bg-[#FF4D4D]/5 border border-[#FF4D4D]/20'
            }`}>
              {structuralValid ? (
                <AlertTriangle className="w-5 h-5 text-[#FFB800] shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-[#FF4D4D] shrink-0 mt-0.5" />
              )}
              <div>
                <p className={`text-sm font-medium ${structuralValid ? 'text-[#FFB800]' : 'text-[#FF4D4D]'}`}>
                  {structuralValid ? revalidationMessage : 'Falha na validação estrutural do PDF corrigido.'}
                </p>
                <p className="text-xs text-[#A6B4C9] mt-1">
                  {structuralValid
                    ? 'O Motor 1 reanalisou o PDF corrigido. A alteração foi aplicada, mas o problema persiste.'
                    : 'O PDF gerado não passou na validação estrutural. O arquivo original permanece intacto.'}
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            {structuralValid && (
              <button
                type="button"
                onClick={handleDownload}
                className="inline-flex items-center px-5 py-2.5 rounded-xl text-sm font-medium bg-[#007BFF]/15 border border-[#007BFF]/40 text-[#007BFF] hover:bg-[#007BFF]/25 cursor-pointer transition-all"
              >
                <Download className="w-4 h-4 mr-2" />
                Baixar PDF corrigido
              </button>
            )}
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center px-5 py-2.5 rounded-xl text-sm font-medium bg-[#1A2332] border border-[#243244] text-[#8E98A7] hover:bg-[#243244] hover:text-white cursor-pointer transition-all"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Recomeçar
            </button>
          </div>
        </div>
      )}

      {/* Cancelled state */}
      {phase === 'cancelled' && (
        <div className="mt-5">
          <div className="flex items-start space-x-2.5 p-4 rounded-xl bg-[#243244]/30 border border-[#243244] mb-4">
            <X className="w-4 h-4 text-[#8E98A7] shrink-0 mt-0.5" />
            <p className="text-sm text-[#A6B4C9]">
              Correção cancelada. Nenhuma alteração foi aplicada. O PDF original permanece intacto.
            </p>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center px-4 py-2 rounded-xl text-sm font-medium bg-[#1A2332] border border-[#243244] text-[#8E98A7] hover:bg-[#243244] hover:text-white cursor-pointer transition-all"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Voltar
          </button>
        </div>
      )}

      {/* Structural error state — PDF failed independent structural validation */}
      {phase === 'structural_error' && (
        <div className="mt-5">
          <div className="flex items-start space-x-2.5 p-4 rounded-xl bg-[#FF4D4D]/5 border border-[#FF4D4D]/20 mb-4">
            <AlertTriangle className="w-5 h-5 text-[#FF4D4D] shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-[#FF4D4D]">{errorMessage}</p>
              <p className="text-xs text-[#A6B4C9] mt-1">
                O PDF corrigido não pode ser disponibilizado como validado. O arquivo original permanece intacto.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center px-4 py-2 rounded-xl text-sm font-medium bg-[#1A2332] border border-[#243244] text-[#8E98A7] hover:bg-[#243244] hover:text-white cursor-pointer transition-all"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Tentar novamente
          </button>
        </div>
      )}

      {/* Error state */}
      {phase === 'error' && (
        <div className="mt-5">
          <div className="flex items-start space-x-2.5 p-4 rounded-xl bg-[#FF4D4D]/5 border border-[#FF4D4D]/20 mb-4">
            <AlertTriangle className="w-4 h-4 text-[#FF4D4D] shrink-0 mt-0.5" />
            <p className="text-sm text-[#FF4D4D]">{errorMessage}</p>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center px-4 py-2 rounded-xl text-sm font-medium bg-[#1A2332] border border-[#243244] text-[#8E98A7] hover:bg-[#243244] hover:text-white cursor-pointer transition-all"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Tentar novamente
          </button>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Box Preview sub-component — visualizes MediaBox, TrimBox, BleedBox
// ============================================================================

interface BoxPreviewProps {
  mediaBox: { x: number; y: number; width: number; height: number };
  trimBox?: { x: number; y: number; width: number; height: number };
  bleedBox?: { x: number; y: number; width: number; height: number };
  label: string;
  highlightChanges?: boolean;
}

const BoxPreview: React.FC<BoxPreviewProps> = ({ mediaBox, trimBox, bleedBox, label, highlightChanges }) => {
  const mbX = mediaBox.x;
  const mbY = mediaBox.y;
  const mbW = mediaBox.width;
  const mbH = mediaBox.height;

  const toPct = (x: number, y: number, w: number, h: number) => ({
    left: ((x - mbX) / mbW) * 100,
    top: ((mbH - (y + h - mbY)) / mbH) * 100,
    width: (w / mbW) * 100,
    height: (h / mbH) * 100,
  });

  const trimPct = trimBox ? toPct(trimBox.x, trimBox.y, trimBox.width, trimBox.height) : null;
  const bleedPct = bleedBox ? toPct(bleedBox.x, bleedBox.y, bleedBox.width, bleedBox.height) : null;

  const aspect = mbW / mbH;

  return (
    <div className="flex flex-col items-center">
      <div
        className="relative bg-[#0B1018] border border-[#243244] rounded-lg shadow-2xl overflow-hidden"
        style={{
          width: '100%',
          maxWidth: aspect > 1 ? '280px' : '200px',
          aspectRatio: `${mbW} / ${mbH}`,
        }}
      >
        {/* MediaBox area */}
        <div className="absolute inset-0 bg-[#16202E]" />

        {/* BleedBox */}
        {bleedPct && (
          <div
            className="absolute border-2 border-dashed"
            style={{
              left: `${bleedPct.left}%`,
              top: `${bleedPct.top}%`,
              width: `${bleedPct.width}%`,
              height: `${bleedPct.height}%`,
              borderColor: highlightChanges ? '#00D18F' : '#FFB800',
              backgroundColor: highlightChanges ? 'rgba(0, 209, 143, 0.08)' : 'rgba(255, 184, 0, 0.05)',
            }}
          >
            <span className="absolute -top-4 left-0 text-[8px] font-medium text-[#FFB800] whitespace-nowrap">
              BleedBox
            </span>
          </div>
        )}

        {/* TrimBox */}
        {trimPct && (
          <div
            className="absolute border-2"
            style={{
              left: `${trimPct.left}%`,
              top: `${trimPct.top}%`,
              width: `${trimPct.width}%`,
              height: `${trimPct.height}%`,
              borderColor: highlightChanges ? '#00D18F' : '#007BFF',
              backgroundColor: highlightChanges ? 'rgba(0, 209, 143, 0.05)' : 'rgba(0, 123, 255, 0.03)',
            }}
          >
            <span className="absolute -top-4 right-0 text-[8px] font-medium text-[#007BFF] whitespace-nowrap">
              TrimBox
            </span>
          </div>
        )}

        {/* Fallback if no trim/bleed */}
        {!trimPct && !bleedPct && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[10px] text-[#6B778C]">Sem caixas técnicas</span>
          </div>
        )}
      </div>
      <span className="text-xs text-[#6B778C] mt-2">{label}</span>
    </div>
  );
};
