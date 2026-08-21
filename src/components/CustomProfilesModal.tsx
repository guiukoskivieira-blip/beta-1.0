import React, { useState } from 'react';
import { X, Plus, Trash2, CheckCircle2, Sliders } from 'lucide-react';
import type { StoredProductionProfile } from '../domain/beta';
import {
  getLocalCustomProfiles,
  saveLocalCustomProfile,
  deleteLocalCustomProfile,
  validateCustomProfile,
} from '../utils/customProfilesStorage';

interface CustomProfilesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectProfile?: (profile: StoredProductionProfile) => void;
}

export const CustomProfilesModal: React.FC<CustomProfilesModalProps> = ({
  isOpen,
  onClose,
  onSelectProfile,
}) => {
  const [profiles, setProfiles] = useState<StoredProductionProfile[]>(() => getLocalCustomProfiles());
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [widthMm, setWidthMm] = useState<number>(210);
  const [heightMm, setHeightMm] = useState<number>(297);
  const [bleedMm, setBleedMm] = useState<number>(3);
  const [dpi, setDpi] = useState<number>(300);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const newProfile: StoredProductionProfile = {
      id: `custom_${Date.now()}`,
      name,
      category: 'custom',
      rules: {
        dimensions: {
          targetWidthMm: Number(widthMm),
          targetHeightMm: Number(heightMm),
        },
        dpi: {
          recommendedDpi: Number(dpi),
          criticalDpi: Math.max(72, Number(dpi) * 0.66),
        },
        bleed: {
          requiredBleedMm: Number(bleedMm),
        },
        colors: {
          allowedModes: ['CMYK'],
          rgbPolicy: 'error',
        },
      },
    };

    const val = validateCustomProfile(newProfile);
    if (!val.valid) {
      setErrorMsg(val.errors.join(' '));
      return;
    }

    saveLocalCustomProfile(newProfile);
    setProfiles(getLocalCustomProfiles());
    setIsCreating(false);
    setName('');
  };

  const handleDelete = (id: string) => {
    deleteLocalCustomProfile(id);
    setProfiles(getLocalCustomProfiles());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
      <div className="bg-[#101722] border border-[#243244] rounded-2xl w-full max-w-xl p-6 shadow-2xl relative max-h-[90vh] flex flex-col">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-[#8E98A7] hover:text-white p-1"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mb-4">
          <h3 className="text-xl font-bold text-white flex items-center">
            <Sliders className="w-5 h-5 mr-2 text-[#007BFF]" />
            Perfis de Produção Personalizados
          </h3>
          <p className="text-xs text-[#8E98A7] mt-1">
            Configure gabaritos de cortes, sangrias e exigências de DPI da sua gráfica.
          </p>
        </div>

        {errorMsg && (
          <div className="mb-4 text-xs text-[#FF4D4D] bg-[#FF4D4D]/10 border border-[#FF4D4D]/30 p-2.5 rounded-lg">
            {errorMsg}
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {profiles.length === 0 && !isCreating && (
            <div className="text-center py-8 text-[#8E98A7] text-xs">
              Nenhum perfil personalizado cadastrado. Crie um novo perfil para sua impressora.
            </div>
          )}

          {profiles.map((p) => (
            <div
              key={p.id}
              className="bg-[#0B1018] border border-[#243244] rounded-xl p-3.5 flex items-center justify-between"
            >
              <div>
                <h4 className="text-sm font-semibold text-white">{p.name}</h4>
                <p className="text-xs text-[#8E98A7]">
                  {p.rules.dimensions?.targetWidthMm} × {p.rules.dimensions?.targetHeightMm} mm •{' '}
                  Sangria {p.rules.bleed?.requiredBleedMm} mm • DPI {p.rules.dpi?.recommendedDpi}
                </p>
              </div>

              <div className="flex items-center space-x-2">
                {onSelectProfile && (
                  <button
                    type="button"
                    onClick={() => {
                      onSelectProfile(p);
                      onClose();
                    }}
                    className="px-3 py-1 bg-[#007BFF] hover:bg-[#0066D6] text-white text-xs font-medium rounded-lg"
                  >
                    Usar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleDelete(p.id)}
                  className="p-1.5 text-[#8E98A7] hover:text-[#FF4D4D] rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}

          {isCreating && (
            <form onSubmit={handleSave} className="bg-[#16202E] border border-[#007BFF]/40 rounded-xl p-4 space-y-3 text-xs">
              <h4 className="font-semibold text-white">Novo Perfil</h4>
              <div>
                <label className="block text-[#8E98A7] mb-1">Nome do Gabarito/Produto</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Cartão Duplo Couché 300g"
                  className="w-full bg-[#0B1018] border border-[#243244] rounded-lg px-3 py-2 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[#8E98A7] mb-1">Largura (mm)</label>
                  <input
                    type="number"
                    required
                    value={widthMm}
                    onChange={(e) => setWidthMm(Number(e.target.value))}
                    className="w-full bg-[#0B1018] border border-[#243244] rounded-lg px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-[#8E98A7] mb-1">Altura (mm)</label>
                  <input
                    type="number"
                    required
                    value={heightMm}
                    onChange={(e) => setHeightMm(Number(e.target.value))}
                    className="w-full bg-[#0B1018] border border-[#243244] rounded-lg px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[#8E98A7] mb-1">Sangria (mm)</label>
                  <input
                    type="number"
                    required
                    value={bleedMm}
                    onChange={(e) => setBleedMm(Number(e.target.value))}
                    className="w-full bg-[#0B1018] border border-[#243244] rounded-lg px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-[#8E98A7] mb-1">DPI Mínimo</label>
                  <input
                    type="number"
                    required
                    value={dpi}
                    onChange={(e) => setDpi(Number(e.target.value))}
                    className="w-full bg-[#0B1018] border border-[#243244] rounded-lg px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-3 py-1.5 text-[#8E98A7] hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#007BFF] hover:bg-[#0066D6] text-white font-medium rounded-lg"
                >
                  Salvar Perfil
                </button>
              </div>
            </form>
          )}
        </div>

        {!isCreating && (
          <div className="mt-4 pt-3 border-t border-[#243244] flex justify-end">
            <button
              type="button"
              onClick={() => setIsCreating(true)}
              className="inline-flex items-center px-4 py-2 bg-[#007BFF] hover:bg-[#0066D6] text-white text-xs font-medium rounded-xl transition-all shadow-md cursor-pointer"
            >
              <Plus className="w-4 h-4 mr-1.5" /> Adicionar Novo Perfil
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
