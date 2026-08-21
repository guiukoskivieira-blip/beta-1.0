import React, { useState, useMemo, useCallback } from 'react';
import { Eye, TriangleAlert as AlertTriangle, Circle as XCircle, Info, ChevronLeft, ChevronRight, Ruler, Crop } from 'lucide-react';
import type { PreflightAnalysis, PdfPageStructure } from '../types';
import type { ProductionProfile } from '../utils/productionProfiles';
import {
  buildAllVisualData,
  pdfCoordsToPreview,
  mmToPreviewPct,
  type VisualIssueMarker,
  type PageVisualData,
  type IssueCategory,
} from '../services/visualMarkers';

interface VisualPreviewProps {
  analysis: PreflightAnalysis;
  profile: ProductionProfile;
}

const CATEGORY_META: Record<IssueCategory, { label: string; icon: typeof Eye }> = {
  dpi: { label: 'DPI', icon: Eye },
  dimension: { label: 'Dimensão', icon: Ruler },
  bleed: { label: 'Sangria', icon: Crop },
};

export const VisualPreview: React.FC<VisualPreviewProps> = ({ analysis, profile }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentIssueIdx, setCurrentIssueIdx] = useState(0);

  const { allMarkers, pageData } = useMemo(
    () => buildAllVisualData(analysis.document, profile),
    [analysis, profile]
  );

  const totalPages = analysis.document.pages.length;
  const hasIssues = allMarkers.length > 0;

  // Sort markers by page then by category for stable ordering
  const sortedMarkers = useMemo(() => {
    return [...allMarkers].sort((a, b) => {
      if (a.page !== b.page) return a.page - b.page;
      const catOrder: Record<IssueCategory, number> = { dpi: 0, dimension: 1, bleed: 2 };
      return catOrder[a.category] - catOrder[b.category];
    });
  }, [allMarkers]);

  const currentMarker = sortedMarkers[currentIssueIdx] || null;
  const currentPageNum = currentMarker?.page || 1;
  const currentPage = analysis.document.pages.find((p) => p.page === currentPageNum) || analysis.document.pages[0];
  const currentPageData: PageVisualData | undefined = pageData.get(currentPage?.page);

  const navigateIssue = useCallback((direction: 'prev' | 'next') => {
    setCurrentIssueIdx((prev) => {
      if (direction === 'prev') return Math.max(0, prev - 1);
      return Math.min(sortedMarkers.length - 1, prev + 1);
    });
  }, [sortedMarkers.length]);

  // "Ver no arquivo" — open and jump to a specific rule's first marker
  const openAtRule = useCallback((ruleId: string) => {
    const idx = sortedMarkers.findIndex((m) => m.ruleId === ruleId);
    if (idx >= 0) {
      setCurrentIssueIdx(idx);
    } else {
      setCurrentIssueIdx(0);
    }
    setIsOpen(true);
  }, [sortedMarkers]);

  if (!isOpen) {
    return (
      <div className="mb-8">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          disabled={!hasIssues}
          className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl border transition-all ${
            hasIssues
              ? 'bg-[#101722] border-[#243244] hover:bg-[#16202E] text-white cursor-pointer shadow-xl'
              : 'bg-[#101722]/50 border-[#243244]/50 text-[#6B778C] cursor-not-allowed'
          }`}
        >
          <div className="flex items-center space-x-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
              hasIssues ? 'bg-[#007BFF]/15 border border-[#007BFF]/40 text-[#007BFF]' : 'bg-[#1A2332] border border-[#243244] text-[#6B778C]'
            }`}>
              <Eye className="w-5 h-5" />
            </div>
            <div className="text-left">
              <h3 className="text-sm font-semibold">
                Ver no arquivo
              </h3>
              <p className="text-xs text-[#8E98A7] mt-0.5">
                {hasIssues
                  ? `${sortedMarkers.length} problema(s) visual localizado(s)`
                  : 'Nenhum problema visual detectado'}
              </p>
            </div>
          </div>
          {hasIssues && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-[#FF4D4D]/10 text-[#FF4D4D] border border-[#FF4D4D]/30">
              {sortedMarkers.length} ponto(s)
            </span>
          )}
        </button>

        {/* Quick links to jump to specific issues */}
        {hasIssues && (
          <div className="flex flex-wrap gap-2 mt-3">
            {(['dpi', 'dimension', 'bleed'] as IssueCategory[]).map((cat) => {
              const catMarkers = sortedMarkers.filter((m) => m.category === cat);
              if (catMarkers.length === 0) return null;
              const Meta = CATEGORY_META[cat];
              const Icon = Meta.icon;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => openAtRule(catMarkers[0].ruleId)}
                  className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium bg-[#0B1018] border border-[#243244] text-[#A6B4C9] hover:bg-[#16202E] hover:text-white transition-all"
                >
                  <Icon className="w-3.5 h-3.5 mr-1.5" />
                  {Meta.label} ({catMarkers.length})
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  if (!hasIssues) {
    return (
      <div className="bg-[#101722] border border-[#243244] rounded-2xl p-6 shadow-xl mb-8">
        <div className="flex items-center justify-between pb-5 border-b border-[#243244]">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-[#00D18F]/15 border border-[#00D18F]/40 flex items-center justify-center text-[#00D18F]">
              <Eye className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Mapa Visual de Problemas</h3>
              <p className="text-xs text-[#8E98A7] mt-0.5">Nenhum problema visual detectado</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="px-3 py-1.5 rounded-lg text-xs text-[#8E98A7] hover:text-white hover:bg-[#16202E] transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    );
  }

  const pageAspect = currentPage.widthMm / currentPage.heightMm;
  const pageMarkers = currentPageData?.markers || [];
  const unavailableImageIds = currentPageData?.unavailableImageIds || [];
  const boxOverlays = currentPageData?.boxOverlays || [];
  const insufficientEvidence = currentPageData?.insufficientEvidence || false;

  // DPI markers that have positioned coordinates
  const dpiMarkers = pageMarkers.filter((m) => m.category === 'dpi');

  return (
    <div className="bg-[#101722] border border-[#243244] rounded-2xl p-6 shadow-xl mb-8">
      {/* Header */}
      <div className="flex items-center justify-between pb-5 border-b border-[#243244]">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-lg bg-[#007BFF]/15 border border-[#007BFF]/40 flex items-center justify-center text-[#007BFF]">
            <Eye className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Mapa Visual de Problemas</h3>
            <p className="text-xs text-[#8E98A7] mt-0.5">
              Localização determinística de problemas detectados pelo Motor 1
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="px-3 py-1.5 rounded-lg text-xs text-[#8E98A7] hover:text-white hover:bg-[#16202E] transition-colors"
        >
          Fechar
        </button>
      </div>

      {/* Issue navigation: Anterior | Problema X de Y | Próximo */}
      <div className="flex items-center justify-center gap-4 mt-4">
        <button
          type="button"
          onClick={() => navigateIssue('prev')}
          disabled={currentIssueIdx === 0}
          className="p-1.5 rounded-lg text-[#8E98A7] hover:text-white hover:bg-[#16202E] disabled:opacity-30 transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-xs text-[#8E98A7] font-medium">
          Problema {currentIssueIdx + 1} de {sortedMarkers.length}
        </span>
        <button
          type="button"
          onClick={() => navigateIssue('next')}
          disabled={currentIssueIdx === sortedMarkers.length - 1}
          className="p-1.5 rounded-lg text-[#8E98A7] hover:text-white hover:bg-[#16202E] disabled:opacity-30 transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Current page indicator */}
      <div className="text-center mt-1">
        <span className="text-xs text-[#6B778C]">
          Página {currentPage.page} de {totalPages}
        </span>
      </div>

      {/* Preview area */}
      <div className="mt-4 flex flex-col lg:flex-row gap-4">
        {/* Page preview */}
        <div className="flex-1 flex items-center justify-center">
          <div
            className="relative bg-white border-2 border-[#243244] rounded-lg shadow-2xl"
            style={{
              width: '100%',
              maxWidth: pageAspect > 1 ? '600px' : '420px',
              aspectRatio: `${currentPage.widthMm} / ${currentPage.heightMm}`,
            }}
          >
            {/* Placeholder for PDF page rendering */}
            <div className="absolute inset-0 flex items-center justify-center text-[#8E98A7] text-xs">
              <div className="text-center">
                <Info className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>Preview da página {currentPage.page}</p>
                <p className="text-[10px] mt-1 opacity-60">{currentPage.widthMm.toFixed(0)} × {currentPage.heightMm.toFixed(0)} mm</p>
              </div>
            </div>

            {/* Draw box overlays (dimension/bleed) */}
            {boxOverlays.map((overlay, idx) => {
              const coords = mmToPreviewPct(overlay, currentPage);
              if (!coords) return null;

              const styles: Record<string, { border: string; bg: string; labelColor: string }> = {
                mediaBox: { border: '#4A5568', bg: 'rgba(74, 85, 104, 0.05)', labelColor: '#4A5568' },
                trimBox: { border: '#007BFF', bg: 'rgba(0, 123, 255, 0.06)', labelColor: '#007BFF' },
                bleedBox: { border: '#FFB800', bg: 'rgba(255, 184, 0, 0.06)', labelColor: '#FFB800' },
                expectedTrim: { border: '#007BFF', bg: 'rgba(0, 123, 255, 0.03)', labelColor: '#007BFF' },
                expectedBleed: { border: '#FFB800', bg: 'rgba(255, 184, 0, 0.03)', labelColor: '#FFB800' },
              };

              const isExpected = overlay.type === 'expectedTrim' || overlay.type === 'expectedBleed';
              const style = styles[overlay.type];

              return (
                <div
                  key={`overlay-${idx}`}
                  className={`absolute ${isExpected ? 'border-dashed' : 'border-solid'} border-2`}
                  style={{
                    left: `${coords.leftPct}%`,
                    top: `${coords.topPct}%`,
                    width: `${coords.widthPct}%`,
                    height: `${coords.heightPct}%`,
                    borderColor: style.border,
                    backgroundColor: style.bg,
                  }}
                >
                  <span
                    className="absolute -top-4 left-0 text-[8px] font-medium whitespace-nowrap"
                    style={{ color: style.labelColor }}
                  >
                    {overlay.label}
                  </span>
                </div>
              );
            })}

            {/* Draw DPI markers */}
            {dpiMarkers.map((marker, idx) => {
              const coords = pdfCoordsToPreview(marker, currentPage);
              if (!coords) return null;

              const isCritical = marker.severity === 'error';
              const color = isCritical ? '#FF4D4D' : '#FFB800';
              const isCurrent = currentMarker?.imageId === marker.imageId && currentMarker?.page === marker.page;

              return (
                <div
                  key={`dpi-${marker.imageId}-${idx}`}
                  className={`absolute border-2 rounded-sm transition-all ${isCurrent ? 'z-10 ring-2 ring-white/50' : ''}`}
                  style={{
                    left: `${coords.leftPct}%`,
                    top: `${coords.topPct}%`,
                    width: `${coords.widthPct}%`,
                    height: `${coords.heightPct}%`,
                    borderColor: color,
                    backgroundColor: `${color}20`,
                    boxShadow: isCurrent ? `0 0 0 2px ${color}80` : `0 0 0 1px ${color}40`,
                  }}
                >
                  <div
                    className="absolute -top-2 -left-2 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white"
                    style={{ backgroundColor: color }}
                  >
                    {idx + 1}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Issue details panel */}
        <div className="lg:w-72 space-y-3">
          {/* Current issue detail */}
          {currentMarker && (
            <div className="p-4 rounded-xl border border-[#007BFF]/40 bg-[#007BFF]/5">
              <div className="flex items-start space-x-2.5">
                {currentMarker.severity === 'error' ? (
                  <XCircle className="w-4 h-4 text-[#FF4D4D] shrink-0 mt-0.5" />
                ) : currentMarker.severity === 'undetermined' ? (
                  <AlertTriangle className="w-4 h-4 text-[#FFB800] shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-[#FFB800] shrink-0 mt-0.5" />
                )}
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-white block">
                    {currentMarker.title}
                  </span>
                  <span className="text-[10px] text-[#6B778C]">
                    {CATEGORY_META[currentMarker.category].label} · Página {currentMarker.page}
                  </span>
                  <div className="mt-2 space-y-1 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-[#8E98A7]">Encontrado:</span>
                      <span className="text-white font-semibold">{currentMarker.measuredValue}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#8E98A7]">Esperado:</span>
                      <span className="text-[#00D18F] font-medium">{currentMarker.expectedValue}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* All issues on this page */}
          <h4 className="text-xs font-semibold text-[#8E98A7] uppercase tracking-wider">
            Problemas nesta página ({pageMarkers.length})
          </h4>

          {pageMarkers.length === 0 && unavailableImageIds.length === 0 && !insufficientEvidence && (
            <div className="text-xs text-[#8E98A7] italic">
              Nenhum problema visual nesta página.
            </div>
          )}

          {pageMarkers.map((marker, idx) => {
            const isCritical = marker.severity === 'error';
            const isUndetermined = marker.severity === 'undetermined';
            const color = isCritical ? '#FF4D4D' : isUndetermined ? '#FFB800' : '#FFB800';
            const isCurrent = currentMarker === marker;
            const CatIcon = CATEGORY_META[marker.category].icon;

            return (
              <button
                key={`${marker.category}-${marker.ruleId}-${idx}`}
                type="button"
                onClick={() => {
                  const globalIdx = sortedMarkers.indexOf(marker);
                  if (globalIdx >= 0) setCurrentIssueIdx(globalIdx);
                }}
                className={`w-full text-left p-3 rounded-xl border bg-[#0B1018] transition-all ${
                  isCurrent ? 'border-[#007BFF]/50 ring-1 ring-[#007BFF]/30' : 'border-[#243244] hover:border-[#243244]/80'
                }`}
              >
                <div className="flex items-start space-x-2">
                  <CatIcon className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-white">
                        {marker.title}
                      </span>
                    </div>
                    <div className="mt-1 space-y-0.5 text-[11px]">
                      <div className="flex justify-between">
                        <span className="text-[#8E98A7]">Encontrado:</span>
                        <span style={{ color }} className="font-semibold">{marker.measuredValue}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#8E98A7]">Esperado:</span>
                        <span className="text-white font-medium">{marker.expectedValue}</span>
                      </div>
                      {marker.imageId && (
                        <div className="flex justify-between">
                          <span className="text-[#8E98A7]">Imagem:</span>
                          <span className="text-[#6B778C] font-mono text-[10px]">{marker.imageId}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}

          {/* Unavailable locations */}
          {unavailableImageIds.length > 0 && (
            <div className="p-3 rounded-xl border border-[#243244] bg-[#0B1018]/50">
              <div className="flex items-start space-x-2">
                <Info className="w-4 h-4 text-[#8E98A7] shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-[#8E98A7] font-medium">
                    Localização visual indisponível
                  </p>
                  <p className="text-[11px] text-[#6B778C] mt-1">
                    {unavailableImageIds.length} imagem(ns) com DPI insuficiente não puderam ser localizadas no fluxo de conteúdo.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Insufficient evidence for bleed */}
          {insufficientEvidence && (
            <div className="p-3 rounded-xl border border-[#243244] bg-[#0B1018]/50">
              <div className="flex items-start space-x-2">
                <Info className="w-4 h-4 text-[#8E98A7] shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-[#8E98A7] font-medium">
                    Localização visual indisponível.
                  </p>
                  <p className="text-[11px] text-[#6B778C] mt-1">
                    Não há geometria confiável para representar as caixas técnicas desta página.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
