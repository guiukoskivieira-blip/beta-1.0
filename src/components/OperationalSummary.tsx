import React from 'react';
import { PreflightAnalysis } from '../types';
import { CheckCircle2, AlertTriangle, XCircle, FileText, Layers, ShieldCheck, Gauge } from 'lucide-react';
import { formatBytes } from '../../server/pdfExtractor';

interface OperationalSummaryProps {
  analysis: PreflightAnalysis;
}

export const OperationalSummary: React.FC<OperationalSummaryProps> = ({ analysis }) => {
  const { document, ruleResults } = analysis;
  const { scoreSummary } = ruleResults;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
      {/* Card 1: Score & Classification */}
      <div className="bg-[#101722] border border-[#243244] rounded-2xl p-6 shadow-xl flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-[#8E98A7] uppercase tracking-wider">
            Índice de Conformidade
          </span>
          <Gauge className="w-5 h-5 text-[#007BFF]" />
        </div>

        <div className="my-4 flex items-baseline space-x-3">
          <span
            className="text-4xl sm:text-5xl font-black tracking-tight"
            style={{ color: scoreSummary.color }}
          >
            {scoreSummary.score}
          </span>
          <span className="text-sm font-semibold text-[#8E98A7]">/ 100</span>
        </div>

        <div className="flex items-center space-x-2">
          {scoreSummary.classification === 'approved' ? (
            <CheckCircle2 className="w-4 h-4 text-[#00D18F]" />
          ) : scoreSummary.classification === 'review' ? (
            <AlertTriangle className="w-4 h-4 text-[#FFB800]" />
          ) : (
            <XCircle className="w-4 h-4 text-[#FF4D4D]" />
          )}
          <span className="text-xs font-semibold text-white">
            {scoreSummary.label}
          </span>
        </div>
      </div>

      {/* Card 2: Document Structure */}
      <div className="bg-[#101722] border border-[#243244] rounded-2xl p-6 shadow-xl flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-[#8E98A7] uppercase tracking-wider">
            Geometria & Páginas
          </span>
          <FileText className="w-5 h-5 text-[#00D18F]" />
        </div>

        <div className="my-3 space-y-1.5 text-xs text-[#C3CBD6]">
          <div className="flex justify-between py-0.5 border-b border-[#243244]/40">
            <span className="text-[#8E98A7]">Páginas Totais:</span>
            <span className="font-semibold text-white">{document.pageCount}</span>
          </div>
          <div className="flex justify-between py-0.5 border-b border-[#243244]/40">
            <span className="text-[#8E98A7]">Formato Pág 1:</span>
            <span className="font-semibold text-white">
              {document.pages[0]?.widthMm.toFixed(1)} × {document.pages[0]?.heightMm.toFixed(1)} mm
            </span>
          </div>
          <div className="flex justify-between py-0.5">
            <span className="text-[#8E98A7]">Tamanho do Arquivo:</span>
            <span className="font-semibold text-white">{formatBytes(analysis.fileSizeBytes)}</span>
          </div>
        </div>

        <div className="text-[11px] text-[#8E98A7] flex items-center">
          <ShieldCheck className="w-3.5 h-3.5 mr-1 text-[#00D18F]" />
          {document.pdfxInfo?.isDeclaredPdfX ? document.pdfxInfo.declaredVersion : 'PDF Padrão'}
        </div>
      </div>

      {/* Card 3: Color & Content summary */}
      <div className="bg-[#101722] border border-[#243244] rounded-2xl p-6 shadow-xl flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-[#8E98A7] uppercase tracking-wider">
            Cores & Imagens
          </span>
          <Layers className="w-5 h-5 text-[#FFB800]" />
        </div>

        <div className="my-3 space-y-1.5 text-xs text-[#C3CBD6]">
          <div className="flex justify-between py-0.5 border-b border-[#243244]/40">
            <span className="text-[#8E98A7]">Espaço de Cores:</span>
            <span className="font-semibold text-white">
              {document.colorSummary.hasRgb ? 'RGB Detectado' : 'CMYK / Spot'}
            </span>
          </div>
          <div className="flex justify-between py-0.5 border-b border-[#243244]/40">
            <span className="text-[#8E98A7]">Ocorrências Imagens:</span>
            <span className="font-semibold text-white">
              {document.pages.reduce((acc, p) => acc + (p.imageOccurrences?.length || 0), 0)}
            </span>
          </div>
          <div className="flex justify-between py-0.5">
            <span className="text-[#8E98A7]">Fontes Detectadas:</span>
            <span className="font-semibold text-white">{document.fonts.length}</span>
          </div>
        </div>

        <div className="text-[11px] text-[#8E98A7] flex items-center">
          <span className="w-2 h-2 rounded-full bg-[#00D18F] mr-1.5"></span>
          {document.fonts.every((f) => f.isEmbedded !== 'no')
            ? '100% Fontes Incorporadas'
            : 'Aviso de Fontes Não Incorporadas'}
        </div>
      </div>
    </div>
  );
};
