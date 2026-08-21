import React, { useState } from 'react';
import { Eye, TriangleAlert as AlertTriangle, Circle as XCircle, Info, ChevronLeft, ChevronRight } from 'lucide-react';
import type { PreflightAnalysis, PdfPageStructure } from '../types';
import type { ProductionProfile } from '../utils/productionProfiles';
import {
  buildAllDpiMarkers,
  pdfCoordsToPreview,
  type VisualIssueMarker,
} from '../services/visualMarkers';

interface VisualPreviewProps {
  analysis: PreflightAnalysis;
  profile: ProductionProfile;
}

export const VisualPreview: React.FC<VisualPreviewProps> = ({ analysis, profile }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentPageIdx, setCurrentPageIdx] = useState(0);
  const [hoveredMarker, setHoveredMarker] = useState<VisualIssueMarker | null>(null);

  const { markers, unavailableImageIds } = buildAllDpiMarkers(analysis.document, profile);
  const totalPages = analysis.document.pages.length;

  if (!isOpen) {
    const hasIssues = markers.length > 0 || unavailableImageIds.length > 0;
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
                  ? `${markers.length} imagem(ns) com DPI insuficiente localizadas`
                  : 'Nenhuma imagem com DPI insuficiente detectada'}
              </p>
            </div>
          </div>
          {hasIssues && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-[#FF4D4D]/10 text-[#FF4D4D] border border-[#FF4D4D]/30">
              {markers.length + unavailableImageIds.length} ponto(s)
            </span>
          )}
        </button>
      </div>
    );
  }

  const page = analysis.document.pages[currentPageIdx];
  const pageMarkers = markers.filter((m) => m.page === page.page);
  const pageUnavailable = unavailableImageIds.length > 0;

  const pageAspect = page.widthMm / page.heightMm;

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
              Localização determinística das imagens com DPI insuficiente
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

      {/* Page navigation */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-4">
          <button
            type="button"
            onClick={() => setCurrentPageIdx(Math.max(0, currentPageIdx - 1))}
            disabled={currentPageIdx === 0}
            className="p-1.5 rounded-lg text-[#8E98A7] hover:text-white hover:bg-[#16202E] disabled:opacity-30 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-xs text-[#8E98A7] font-medium">
            Página {page.page} de {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setCurrentPageIdx(Math.min(totalPages - 1, currentPageIdx + 1))}
            disabled={currentPageIdx === totalPages - 1}
            className="p-1.5 rounded-lg text-[#8E98A7] hover:text-white hover:bg-[#16202E] disabled:opacity-30 transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Preview area */}
      <div className="mt-4 flex flex-col lg:flex-row gap-4">
        {/* Page preview */}
        <div className="flex-1 flex items-center justify-center">
          <div
            className="relative bg-white border-2 border-[#243244] rounded-lg shadow-2xl"
            style={{
              width: '100%',
              maxWidth: pageAspect > 1 ? '600px' : '420px',
              aspectRatio: `${page.widthMm} / ${page.heightMm}`,
            }}
          >
            {/* Placeholder for PDF page rendering */}
            <div className="absolute inset-0 flex items-center justify-center text-[#8E98A7] text-xs">
              <div className="text-center">
                <Info className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>Preview da página {page.page}</p>
                <p className="text-[10px] mt-1 opacity-60">{page.widthMm.toFixed(0)} × {page.heightMm.toFixed(0)} mm</p>
              </div>
            </div>

            {/* Draw markers */}
            {pageMarkers.map((marker, idx) => {
              const coords = pdfCoordsToPreview(marker, page);
              if (!coords) return null;

              const isCritical = marker.severity === 'error';
              const color = isCritical ? '#FF4D4D' : '#FFB800';

              return (
                <div
                  key={`${marker.imageId}-${idx}`}
                  className="absolute border-2 rounded-sm cursor-pointer transition-all hover:z-10"
                  style={{
                    left: `${coords.leftPct}%`,
                    top: `${coords.topPct}%`,
                    width: `${coords.widthPct}%`,
                    height: `${coords.heightPct}%`,
                    borderColor: color,
                    backgroundColor: `${color}20`,
                    boxShadow: `0 0 0 1px ${color}40`,
                  }}
                  onMouseEnter={() => setHoveredMarker(marker)}
                  onMouseLeave={() => setHoveredMarker(null)}
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

        {/* Marker details panel */}
        <div className="lg:w-72 space-y-3">
          <h4 className="text-xs font-semibold text-[#8E98A7] uppercase tracking-wider">
            Problemas nesta página
          </h4>

          {pageMarkers.length === 0 && !pageUnavailable && (
            <div className="text-xs text-[#8E98A7] italic">
              Nenhum problema visual nesta página.
            </div>
          )}

          {pageMarkers.map((marker, idx) => {
            const isCritical = marker.severity === 'error';
            const color = isCritical ? '#FF4D4D' : '#FFB800';
            const isHovered = hoveredMarker?.imageId === marker.imageId;

            return (
              <div
                key={`${marker.imageId}-${idx}`}
                className={`p-3 rounded-xl border bg-[#0B1018] transition-all ${
                  isHovered ? 'border-[#007BFF]/50 ring-1 ring-[#007BFF]/30' : 'border-[#243244]'
                }`}
              >
                <div className="flex items-start space-x-2">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                    style={{ backgroundColor: color }}
                  >
                    {idx + 1}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center space-x-1.5">
                      {isCritical ? (
                        <XCircle className="w-3.5 h-3.5 text-[#FF4D4D] shrink-0" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-[#FFB800] shrink-0" />
                      )}
                      <span className="text-xs font-semibold text-white">
                        {marker.title}
                      </span>
                    </div>
                    <div className="mt-1.5 space-y-0.5 text-[11px]">
                      <div className="flex justify-between">
                        <span className="text-[#8E98A7]">Medido:</span>
                        <span style={{ color }} className="font-semibold">{marker.measuredValue}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#8E98A7]">Mínimo:</span>
                        <span className="text-white font-medium">{marker.expectedValue}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#8E98A7]">Imagem:</span>
                        <span className="text-[#6B778C] font-mono text-[10px]">{marker.imageId}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
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
        </div>
      </div>
    </div>
  );
};
