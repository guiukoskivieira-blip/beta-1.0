import React, { useState } from 'react';
import { 
  RotateCcw, 
  History, 
  Info, 
  Building, 
  LogOut, 
  LogIn, 
  Sliders,
  ChevronDown,
  CreditCard
} from 'lucide-react';
import type { BetaUser } from '../domain/beta';

interface HeaderProps {
  onReset: () => void;
  canReset: boolean;
  onOpenHistory?: () => void;
  onOpenAbout?: () => void;
  currentUser?: BetaUser | null;
  onOpenAuth?: () => void;
  onSignOut?: () => void;
  onOpenProfiles?: () => void;
  onOpenPlans?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ 
  onReset, 
  canReset, 
  onOpenHistory, 
  onOpenAbout,
  currentUser,
  onOpenAuth,
  onSignOut,
  onOpenProfiles,
  onOpenPlans,
}) => {
  const [showUserMenu, setShowUserMenu] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full bg-[#0B1018]/95 backdrop-blur border-b border-[#243244]/80 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center">
          <img src="/brand/artecheck-logo-color.svg" alt="ArteCheck IA" className="h-9 sm:h-10 w-auto max-w-[170px] object-contain" />
        </div>

        <div className="flex items-center space-x-2.5">
          {currentUser && onOpenPlans && (
            <button type="button" onClick={onOpenPlans} className="inline-flex items-center px-3 py-1.5 border border-[#243244] text-xs font-semibold rounded-lg text-[#C3CBD6] bg-[#121820] hover:bg-[#101722] hover:text-white transition-colors" title="Planos e assinatura">
              <CreditCard className="w-3.5 h-3.5 mr-1.5 text-[#00D18F]"/><span className="hidden lg:inline">Planos</span>
            </button>
          )}
          {onOpenProfiles && (
            <button
              type="button"
              onClick={onOpenProfiles}
              className="inline-flex items-center px-3 py-1.5 border border-[#243244] text-xs font-semibold rounded-lg text-[#C3CBD6] bg-[#121820] hover:bg-[#101722] hover:text-[#F5F7FA] transition-colors shadow-2xs cursor-pointer"
              title="Gerenciar perfis de produção personalizados"
            >
              <Sliders className="w-3.5 h-3.5 mr-1.5 text-[#8E98A7]" />
              <span className="hidden md:inline">Perfis Customizados</span>
              <span className="md:hidden">Perfis</span>
            </button>
          )}

          {onOpenHistory && (
            <button
              type="button"
              onClick={onOpenHistory}
              className="inline-flex items-center px-3 py-1.5 border border-[#243244] text-xs font-semibold rounded-lg text-[#C3CBD6] bg-[#121820] hover:bg-[#101722] hover:text-[#F5F7FA] transition-colors shadow-2xs cursor-pointer"
              title="Ver histórico de análises"
            >
              <History className="w-3.5 h-3.5 mr-1.5 text-[#8E98A7]" />
              <span>Histórico</span>
            </button>
          )}

          {onOpenAbout && (
            <button
              type="button"
              onClick={onOpenAbout}
              className="inline-flex items-center px-3 py-1.5 border border-[#243244] text-xs font-semibold rounded-lg text-[#C3CBD6] bg-[#121820] hover:bg-[#101722] hover:text-[#F5F7FA] transition-colors shadow-2xs cursor-pointer"
              title="Sobre o ArteCheck AI"
            >
              <Info className="w-3.5 h-3.5 mr-1.5 text-[#8E98A7]" />
              <span>Sobre</span>
            </button>
          )}

          {canReset && (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center px-3.5 py-1.5 border border-[#334155] text-xs font-semibold rounded-lg text-[#C3CBD6] bg-[#121820] hover:bg-[#101722] hover:text-[#F5F7FA] transition-colors shadow-2xs cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5 text-[#8E98A7]" />
              <span>Novo Arquivo</span>
            </button>
          )}

          {/* User Account / Auth Section */}
          <div className="relative ml-1">
            {currentUser ? (
              <div>
                <button
                  type="button"
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-[#243244] bg-[#101722] hover:bg-[#182230] text-xs font-semibold text-[#E7ECF3] transition-colors cursor-pointer"
                >
                  <div className="w-6 h-6 rounded-md bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold">
                    {currentUser.displayName ? currentUser.displayName.charAt(0).toUpperCase() : 'U'}
                  </div>
                  <div className="hidden lg:block text-left">
                    <p className="text-xs font-bold leading-none text-[#F5F7FA] truncate max-w-[120px]">
                      {currentUser.displayName || currentUser.email}
                    </p>
                    <p className="text-[10px] text-[#8E98A7] leading-tight truncate max-w-[120px]">
                      {currentUser.organizationName || 'Gráfica'}
                    </p>
                  </div>
                  <ChevronDown className="w-3 h-3 text-[#667386]" />
                </button>

                {showUserMenu && (
                  <div 
                    className="absolute right-0 mt-2 w-56 bg-[#121820] rounded-xl border border-[#243244] shadow-xl py-2 z-50 animate-fadeIn"
                    onMouseLeave={() => setShowUserMenu(false)}
                  >
                    <div className="px-4 py-2 border-b border-[#1C2735]">
                      <p className="text-xs font-bold text-[#F5F7FA] truncate">{currentUser.displayName}</p>
                      <p className="text-[11px] text-[#8E98A7] truncate">{currentUser.email}</p>
                      {currentUser.organizationName && (
                        <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-blue-300 bg-blue-500/10 px-2 py-0.5 rounded-md">
                          <Building className="w-3 h-3" />
                          <span className="truncate">{currentUser.organizationName}</span>
                        </div>
                      )}
                    </div>

                    <div className="py-1">
                      <button
                        type="button"
                        onClick={() => {
                          setShowUserMenu(false);
                          onSignOut?.();
                        }}
                        className="w-full px-4 py-2 text-left text-xs font-semibold text-rose-600 hover:bg-rose-500/10 flex items-center gap-2 cursor-pointer transition-colors"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Sair da Conta</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={onOpenAuth}
                className="inline-flex items-center px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-bold rounded-lg transition-colors shadow-2xs cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5 mr-1.5" />
                <span>Entrar</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
