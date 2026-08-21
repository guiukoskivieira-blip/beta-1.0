import React, { useEffect, useState } from 'react';
import { X, History, FileText, CheckCircle2, AlertTriangle, XCircle, Trash2 } from 'lucide-react';
import type { AnalysisRecordSummary } from '../domain/beta';
import { LocalStorageProvider } from '../storage/LocalStorageProvider';
import { formatBytes } from '../../server/pdfExtractor';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({ isOpen, onClose }) => {
  const [history, setHistory] = useState<AnalysisRecordSummary[]>([]);
  const storage = new LocalStorageProvider();

  useEffect(() => {
    if (isOpen) {
      storage.listAnalyses().then(setHistory);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDelete = async (id: string) => {
    await storage.deleteAnalysis(id);
    setHistory((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
      <div className="bg-[#101722] border border-[#243244] rounded-2xl w-full max-w-2xl p-6 shadow-2xl relative max-h-[90vh] flex flex-col">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-[#8E98A7] hover:text-white p-1"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mb-4">
          <h3 className="text-xl font-bold text-white flex items-center">
            <History className="w-5 h-5 mr-2 text-[#007BFF]" />
            Histórico de Análises
          </h3>
          <p className="text-xs text-[#8E98A7] mt-1">
            Registro das últimas checagens de pré-impressão realizadas nesta máquina.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {history.length === 0 ? (
            <div className="text-center py-12 text-[#8E98A7] text-xs">
              Nenhuma análise salva no histórico recente.
            </div>
          ) : (
            history.map((item) => (
              <div
                key={item.id}
                className="bg-[#0B1018] border border-[#243244] rounded-xl p-4 flex items-center justify-between gap-4"
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-[#16202E] flex items-center justify-center text-[#007BFF] shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-white truncate max-w-xs sm:max-w-md">
                      {item.fileName}
                    </h4>
                    <p className="text-xs text-[#8E98A7]">
                      {new Date(item.createdAt).toLocaleString('pt-BR')} • {formatBytes(item.fileSizeBytes)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-4 shrink-0">
                  <div className="text-right">
                    <span className="text-sm font-bold text-white block">
                      {item.score}/100
                    </span>
                    <span className="text-[10px] text-[#8E98A7] uppercase font-semibold">
                      {item.status}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(item.id)}
                    className="p-1.5 text-[#8E98A7] hover:text-[#FF4D4D] rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
