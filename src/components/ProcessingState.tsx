import React from 'react';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

interface ProcessingStateProps {
  status: 'uploading' | 'extracting' | 'analyzing' | 'error';
  errorMessage?: string;
  onRetry?: () => void;
}

export const ProcessingState: React.FC<ProcessingStateProps> = ({
  status,
  errorMessage,
  onRetry,
}) => {
  const steps = [
    { id: 'uploading', label: 'Envio seguro em memória (Zero Storage)' },
    { id: 'extracting', label: 'Extração estrutural determinística de objetos' },
    { id: 'analyzing', label: 'Avaliação das regras de pré-impressão' },
  ];

  const getCurrentStepIndex = () => {
    switch (status) {
      case 'uploading': return 0;
      case 'extracting': return 1;
      case 'analyzing': return 2;
      default: return 0;
    }
  };

  const currentIndex = getCurrentStepIndex();

  if (status === 'error') {
    return (
      <div className="w-full max-w-2xl mx-auto my-12 p-8 bg-[#161B22] border border-[#FF4D4D]/30 rounded-2xl text-center shadow-2xl">
        <div className="w-14 h-14 mx-auto rounded-full bg-[#FF4D4D]/10 border border-[#FF4D4D]/30 flex items-center justify-center text-[#FF4D4D] mb-4">
          <AlertCircle className="w-7 h-7" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Falha no Processamento</h3>
        <p className="text-sm text-[#8E98A7] mb-6 max-w-md mx-auto">
          {errorMessage || 'Ocorreu um erro ao processar e avaliar o arquivo PDF.'}
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="px-6 py-2.5 bg-[#007BFF] hover:bg-[#0066D6] text-white font-medium text-sm rounded-xl transition-all shadow-lg"
          >
            Tentar Novamente
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto my-12 p-8 bg-[#101722] border border-[#243244] rounded-2xl text-center shadow-2xl">
      <div className="w-14 h-14 mx-auto rounded-2xl bg-[#007BFF]/10 border border-[#007BFF]/30 flex items-center justify-center text-[#007BFF] mb-6 animate-pulse">
        <Loader2 className="w-7 h-7 animate-spin" />
      </div>

      <h3 className="text-xl font-bold text-white mb-2">Analisando Arquivo PDF</h3>
      <p className="text-sm text-[#8E98A7] mb-8">
        Executando preflight determinístico e checagem dimensional.
      </p>

      <div className="space-y-4 max-w-md mx-auto text-left">
        {steps.map((step, idx) => {
          const isDone = idx < currentIndex;
          const isCurrent = idx === currentIndex;

          return (
            <div
              key={step.id}
              className={`flex items-center space-x-3 p-3.5 rounded-xl border transition-all ${
                isCurrent
                  ? 'border-[#007BFF] bg-[#007BFF]/5 text-white'
                  : isDone
                  ? 'border-[#00D18F]/30 bg-[#00D18F]/5 text-[#A6B4C9]'
                  : 'border-[#243244]/40 bg-[#121820]/40 text-[#556375]'
              }`}
            >
              {isDone ? (
                <CheckCircle2 className="w-5 h-5 text-[#00D18F] shrink-0" />
              ) : isCurrent ? (
                <Loader2 className="w-5 h-5 text-[#007BFF] animate-spin shrink-0" />
              ) : (
                <div className="w-5 h-5 rounded-full border border-[#556375] shrink-0 flex items-center justify-center text-[10px]">
                  {idx + 1}
                </div>
              )}
              <span className="text-xs sm:text-sm font-medium">{step.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
