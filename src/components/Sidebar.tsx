import React from 'react';
import { STANDARD_PROFILES, ProductionProfile } from '../utils/productionProfiles';
import { Sliders, Check } from 'lucide-react';

interface SidebarProps {
  selectedProfile: ProductionProfile;
  onSelectProfile: (profile: ProductionProfile) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ selectedProfile, onSelectProfile }) => {
  return (
    <aside className="w-full lg:w-72 shrink-0 space-y-4">
      <div className="bg-[#101722] border border-[#243244] rounded-2xl p-5 shadow-xl">
        <h4 className="text-sm font-bold text-white mb-3 flex items-center">
          <Sliders className="w-4 h-4 mr-2 text-[#007BFF]" />
          Perfil de Produção
        </h4>
        <p className="text-xs text-[#8E98A7] mb-4">
          Selecione o gabarito de impressão para calibrar a checagem de DPI, sangria e formato.
        </p>

        <div className="space-y-2">
          {STANDARD_PROFILES.map((profile) => {
            const isSelected = selectedProfile.id === profile.id;
            return (
              <button
                key={profile.id}
                type="button"
                onClick={() => onSelectProfile(profile)}
                className={`w-full text-left p-3 rounded-xl border text-xs transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[#007BFF]/10 border-[#007BFF] text-white shadow-xs'
                    : 'bg-[#0B1018] border-[#243244] text-[#8E98A7] hover:border-[#007BFF]/40 hover:text-white'
                }`}
              >
                <div className="flex items-center justify-between font-semibold mb-1">
                  <span>{profile.name}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-[#007BFF]" />}
                </div>
                <p className="text-[11px] text-[#6B778C] line-clamp-2">
                  {profile.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
};
