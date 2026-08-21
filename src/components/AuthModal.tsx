import React, { useState } from 'react';
import { X, Mail, Lock, Building, User, LogIn, UserPlus } from 'lucide-react';
import type { BetaUser } from '../domain/beta';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: BetaUser) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      setError('Por favor, informe um e-mail corporativo válido.');
      return;
    }
    const user: BetaUser = {
      id: `usr_${Date.now()}`,
      email,
      displayName: displayName || email.split('@')[0],
      companyName: companyName || 'Gráfica Modelo',
      role: 'authenticated',
    };
    onSuccess(user);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
      <div className="bg-[#101722] border border-[#243244] rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-[#8E98A7] hover:text-white p-1"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mb-6">
          <h3 className="text-xl font-bold text-white">
            {isSignUp ? 'Criar Conta de Gráfica' : 'Acessar ArteCheck IA'}
          </h3>
          <p className="text-xs text-[#8E98A7] mt-1">
            {isSignUp
              ? 'Cadastre-se para gerenciar cotas e histórico de análises.'
              : 'Entre para sincronizar seus perfis e laudos técnicos.'}
          </p>
        </div>

        {error && (
          <div className="mb-4 text-xs text-[#FF4D4D] bg-[#FF4D4D]/10 border border-[#FF4D4D]/30 p-2.5 rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {isSignUp && (
            <>
              <div>
                <label className="block text-[#8E98A7] mb-1 font-medium">Nome do Operador</label>
                <div className="relative">
                  <User className="w-4 h-4 text-[#556375] absolute left-3 top-3" />
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Ex: Carlos Pré-impressão"
                    className="w-full bg-[#0B1018] border border-[#243244] rounded-xl pl-9 pr-4 py-2.5 text-white focus:outline-hidden focus:border-[#007BFF]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[#8E98A7] mb-1 font-medium">Nome da Gráfica / Agência</label>
                <div className="relative">
                  <Building className="w-4 h-4 text-[#556375] absolute left-3 top-3" />
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Ex: Gráfica Alfa Express"
                    className="w-full bg-[#0B1018] border border-[#243244] rounded-xl pl-9 pr-4 py-2.5 text-white focus:outline-hidden focus:border-[#007BFF]"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-[#8E98A7] mb-1 font-medium">E-mail</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-[#556375] absolute left-3 top-3" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="operador@grafica.com.br"
                className="w-full bg-[#0B1018] border border-[#243244] rounded-xl pl-9 pr-4 py-2.5 text-white focus:outline-hidden focus:border-[#007BFF]"
              />
            </div>
          </div>

          <div>
            <label className="block text-[#8E98A7] mb-1 font-medium">Senha</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#556375] absolute left-3 top-3" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#0B1018] border border-[#243244] rounded-xl pl-9 pr-4 py-2.5 text-white focus:outline-hidden focus:border-[#007BFF]"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-[#007BFF] hover:bg-[#0066D6] text-white font-medium rounded-xl transition-all shadow-lg mt-2 cursor-pointer"
          >
            {isSignUp ? 'Concluir Cadastro' : 'Entrar na Plataforma'}
          </button>
        </form>

        <div className="mt-4 text-center text-xs text-[#8E98A7]">
          {isSignUp ? (
            <button
              type="button"
              onClick={() => setIsSignUp(false)}
              className="text-[#007BFF] hover:underline cursor-pointer"
            >
              Já possui conta? Faça login
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsSignUp(true)}
              className="text-[#007BFF] hover:underline cursor-pointer"
            >
              Não tem conta? Cadastre sua gráfica
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
