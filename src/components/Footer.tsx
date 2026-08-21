import React from 'react';
import { ShieldCheck } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="w-full border-t border-[#243244]/60 bg-[#0B1018] py-6 px-4 mt-auto">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between text-xs text-[#8E98A7] gap-4">
        <div className="flex items-center space-x-2">
          <ShieldCheck className="w-4 h-4 text-[#00D18F]" />
          <span>ArteCheck IA • Validação de Pré-impressão & Inteligência Gráfica</span>
        </div>
        <p className="text-[11px] text-[#556375]">
          Processamento volátil em memória. Conformidade com ISO 12647 e padrões PDF/X.
        </p>
      </div>
    </footer>
  );
};
