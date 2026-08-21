import React from 'react';
import { FileText, X, ArrowRight } from 'lucide-react';
import { formatBytes } from '../../server/pdfExtractor';

interface FileSelectedProps {
  file: File;
  onClear: () => void;
  onAnalyze: () => void;
  isLoading?: boolean;
}

export const FileSelected: React.FC<FileSelectedProps> = ({
  file,
  onClear,
  onAnalyze,
  isLoading = false,
}) => {
  return (
    <div className="w-full max-w-4xl mx-auto my-8 px-4">
      <div className="bg-[#101722] border border-[#243244] rounded-2xl p-6 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center space-x-4 w-full sm:w-auto">
          <div className="w-12 h-12 rounded-xl bg-[#007BFF]/10 border border-[#007BFF]/30 flex items-center justify-center text-[#007BFF] shrink-0">
            <FileText className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-base font-semibold text-white truncate max-w-[280px] sm:max-w-md">
              {file.name}
            </h4>
            <p className="text-xs text-[#8E98A7]">
              {formatBytes(file.size)} • PDF Document
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3 w-full sm:w-auto justify-end">
          <button
            type="button"
            onClick={onClear}
            disabled={isLoading}
            className="p-2 text-[#8E98A7] hover:text-white hover:bg-[#16202E] rounded-lg transition-colors disabled:opacity-50"
            title="Remover arquivo"
          >
            <X className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={onAnalyze}
            disabled={isLoading}
            className="flex-1 sm:flex-none inline-flex items-center justify-center px-6 py-2.5 rounded-xl bg-[#007BFF] hover:bg-[#0066D6] text-white font-medium text-sm transition-all shadow-lg shadow-[#007BFF]/20 disabled:opacity-50 cursor-pointer"
          >
            {isLoading ? (
              <span className="inline-flex items-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processando...
              </span>
            ) : (
              <>
                <span>Analisar Arquivo</span>
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
