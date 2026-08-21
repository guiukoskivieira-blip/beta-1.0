import React, { useRef, useState } from 'react';
import { UploadCloud, FileText, AlertCircle, Sparkles, ShieldCheck } from 'lucide-react';
import { LIMITS } from '../config/limits';

interface UploadZoneProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}

export const UploadZone: React.FC<UploadZoneProps> = ({ onFileSelected, disabled = false }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (disabled) return;
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const validateAndSelect = (file: File) => {
    setErrorMsg(null);
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setErrorMsg('Apenas arquivos no formato PDF são suportados.');
      return;
    }
    if (file.size > LIMITS.MAX_UPLOAD_BYTES) {
      setErrorMsg(`O arquivo excede o limite máximo permitido de ${LIMITS.MAX_UPLOAD_MB} MB.`);
      return;
    }
    onFileSelected(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (disabled) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndSelect(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndSelect(e.target.files[0]);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto my-8 px-4">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl p-10 sm:p-14 text-center cursor-pointer transition-all duration-200 ${
          isDragOver
            ? 'border-[#007BFF] bg-[#007BFF]/10 scale-[1.01]'
            : 'border-[#243244] bg-[#101722]/80 hover:border-[#007BFF]/50 hover:bg-[#121A28]'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          onChange={handleFileInputChange}
          disabled={disabled}
          className="hidden"
        />

        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-[#007BFF]/10 border border-[#007BFF]/30 flex items-center justify-center text-[#007BFF] shadow-inner">
            <UploadCloud className="w-8 h-8" />
          </div>

          <div className="space-y-1">
            <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Arraste seu arquivo PDF aqui
            </h3>
            <p className="text-sm text-[#8E98A7]">
              ou clique para selecionar do seu computador
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 pt-2 text-xs text-[#6B778C]">
            <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-[#16202E] border border-[#243244]">
              <FileText className="w-3.5 h-3.5 mr-1 text-[#007BFF]" /> PDF até 50 MB
            </span>
            <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-[#16202E] border border-[#243244]">
              <ShieldCheck className="w-3.5 h-3.5 mr-1 text-[#00D18F]" /> Verificação Determinística
            </span>
            <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-[#16202E] border border-[#243244]">
              <Sparkles className="w-3.5 h-3.5 mr-1 text-[#FFB800]" /> IA Gemini Assistiva
            </span>
          </div>

          {errorMsg && (
            <div className="mt-4 flex items-center text-xs text-[#FF4D4D] bg-[#FF4D4D]/10 px-4 py-2 rounded-lg border border-[#FF4D4D]/30">
              <AlertCircle className="w-4 h-4 mr-2 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
