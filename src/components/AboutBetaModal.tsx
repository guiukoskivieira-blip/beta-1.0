import React from 'react';
import { X, Info, ShieldCheck, CheckCircle2, Cpu } from 'lucide-react';

interface AboutBetaModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutBetaModal: React.FC<AboutBetaModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
      <div className="bg-[#101722] border border-[#243244] rounded-2xl w-full max-w-lg p-6 shadow-2xl relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-[#8E98A7] hover:text-white p-1"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mb-4">
          <h3 className="text-xl font-bold text-white flex items-center">
            <Info className="w-5 h-5 mr-2 text-[#007BFF]" />
            Sobre o ArteCheck IA
          </h3>
          <p className="text-xs text-[#8E98A7] mt-1">
            Plataforma de validação técnica determinística de PDF para a indústria gráfica.
          </p>
        </div>

        <div className="space-y-4 text-xs text-[#C3CBD6] leading-relaxed">
          <div className="p-3.5 bg-[#0B1018] rounded-xl border border-[#243244]">
            <h4 className="font-semibold text-white mb-1 flex items-center">
              <ShieldCheck className="w-4 h-4 mr-1.5 text-[#00D18F]" />
              Zero Armazenamento Permanente
            </h4>
            <p className="text-[#8E98A7]">
              Seus arquivos PDF são inspecionados em buffers de memória volátil e descartados imediatamente após a extração da estrutura geométrica. Nenhuma arte gráfica de cliente é mantida em disco.
            </p>
          </div>

          <div className="p-3.5 bg-[#0B1018] rounded-xl border border-[#243244]">
            <h4 className="font-semibold text-white mb-1 flex items-center">
              <Cpu className="w-4 h-4 mr-1.5 text-[#007BFF]" />
              Motor Determinístico de Regras
            </h4>
            <p className="text-[#8E98A7]">
              A validação de caixas de corte (MediaBox, TrimBox, BleedBox), espaços de cor (CMYK/RGB/Spot) e resolução efetiva (DPI) é calculada por fórmulas matemáticas exatas, sem alucinações.
            </p>
          </div>

          <p className="text-[11px] text-[#6B778C] text-center pt-2">
            ArteCheck IA • Versão Beta 1.0 • Desenvolvido para Gráficas e Agências
          </p>
        </div>
      </div>
    </div>
  );
};
