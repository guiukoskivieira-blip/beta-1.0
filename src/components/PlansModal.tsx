import React, { useEffect, useState } from 'react';
import { X, Check, Crown, CreditCard, BarChart3, CalendarDays } from 'lucide-react';
import { PLANS, type BillingPeriod, type BillingStatus, type PlanCode } from '../domain/billing';
import { createCheckout, getBillingStatus } from '../services/billing';

export function PlansModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [period, setPeriod] = useState<BillingPeriod>('monthly');
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (isOpen) {
      getBillingStatus().then(setStatus).catch(e => setMessage(e.message));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentPlan = status?.plan;
  const plans = Object.values(PLANS);
  const money = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const checkout = async (code: PlanCode) => {
    try {
      setMessage('');
      const r = await createCheckout(code, period);
      const targetUrl = r?.checkoutUrl || r?.url;
      if (targetUrl) location.href = targetUrl;
    } catch (e: any) {
      setMessage(e.message);
    }
  };

  const usagePercent = status && status.limitAnalyses > 0
    ? Math.min(100, Math.round((status.usedAnalyses / status.limitAnalyses) * 100))
    : 0;

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="max-w-6xl mx-auto my-6 rounded-2xl border border-[#243244] bg-[#0B1018] shadow-2xl">
        <div className="p-5 border-b border-[#243244] flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Planos e assinatura</h2>
            <p className="text-sm text-[#8E98A7]">Escolha o volume ideal para sua produção.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/5">
            <X className="w-5 h-5 text-[#8E98A7]" />
          </button>
        </div>

        {status && (
          <div className="m-5 p-4 rounded-xl border border-blue-500/30 bg-blue-500/5 grid md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-[#8E98A7]">Plano atual</span>
              <div className="font-bold text-white">{PLANS[status.plan]?.name || status.plan}</div>
            </div>
            <div>
              <span className="text-[#8E98A7]">Uso do ciclo</span>
              <div className="font-bold">
                {status.usedAnalyses} de {status.limitAnalyses}{' '}
                <span className="text-xs text-blue-400 font-normal">
                  ({Math.max(0, status.limitAnalyses - status.usedAnalyses)} restantes)
                </span>
              </div>
            </div>
            <div>
              <span className="text-[#8E98A7]">Renovação</span>
              <div className="font-bold">
                {status.renewsAt ? new Date(status.renewsAt).toLocaleDateString('pt-BR') : 'Mensal'}
              </div>
            </div>
            <div>
              <span className="text-[#8E98A7]">Status</span>
              <div className="font-bold uppercase text-emerald-400">{status.status}</div>
            </div>
            <div className="md:col-span-4 h-2 bg-[#182231] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#007BFF] to-[#6A00FF]"
                style={{ width: `${usagePercent}%` }}
              />
            </div>
          </div>
        )}

        <div className="px-5 flex justify-center">
          <div className="inline-flex rounded-xl bg-[#121820] border border-[#243244] p-1">
            <button
              onClick={() => setPeriod('monthly')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                period === 'monthly' ? 'bg-[#007BFF] text-white' : 'text-[#8E98A7] hover:text-white'
              }`}
            >
              Mensal
            </button>
            <button
              onClick={() => setPeriod('yearly')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                period === 'yearly' ? 'bg-[#007BFF] text-white' : 'text-[#8E98A7] hover:text-white'
              }`}
            >
              Anual
            </button>
          </div>
        </div>

        {message && (
          <div className="mx-5 mt-4 p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-200 text-sm">
            {message}
          </div>
        )}

        <div className="p-5 grid md:grid-cols-2 xl:grid-cols-4 gap-4">
          {plans.map((p) => {
            const unavailable = p.id === 'professional_launch' && period === 'yearly';
            const price = period === 'yearly' ? p.yearlyPrice : p.monthlyPrice;
            const isCurrent = currentPlan === p.id;

            return (
              <div
                key={p.id}
                className={`relative rounded-2xl border p-5 bg-[#121820] ${
                  p.id === 'professional_launch' || p.id === 'professional'
                    ? 'border-[#007BFF] shadow-[0_0_30px_rgba(0,123,255,.12)]'
                    : 'border-[#243244]'
                }`}
              >
                {p.id === 'professional' && (
                  <span className="absolute -top-3 left-4 px-3 py-1 rounded-full bg-gradient-to-r from-[#007BFF] to-[#6A00FF] text-[10px] font-bold uppercase text-white">
                    Mais escolhido
                  </span>
                )}
                {p.id === 'professional_launch' && (
                  <span className="absolute -top-3 left-4 px-3 py-1 rounded-full bg-[#00D18F] text-[#07130f] text-[10px] font-bold uppercase">
                    Lançamento
                  </span>
                )}
                <h3 className="text-lg font-bold text-white mt-1">{p.name}</h3>
                <div className="my-4 text-3xl font-bold text-white">
                  {price ? money(price) : 'Grátis'}
                  <span className="text-xs text-[#8E98A7] font-normal">
                    /{period === 'monthly' ? 'mês' : 'ano'}
                  </span>
                </div>
                <ul className="space-y-2 text-sm text-[#C3CBD6]">
                  <li className="flex gap-2">
                    <Check className="w-4 text-[#00D18F]" />
                    {p.analysisLimit} análises por ciclo
                  </li>
                  <li className="flex gap-2">
                    <Check className="w-4 text-[#00D18F]" />
                    Até {p.maxUploadMb} MB por PDF
                  </li>
                  {p.launchCycles && (
                    <li className="flex gap-2">
                      <Crown className="w-4 text-amber-400" />
                      Preço promocional por {p.launchCycles} ciclos
                    </li>
                  )}
                </ul>
                <button
                  disabled={unavailable}
                  onClick={() => checkout(p.id)}
                  className="mt-5 w-full py-2.5 rounded-xl font-semibold bg-gradient-to-r from-[#007BFF] to-[#6A00FF] text-white disabled:opacity-40 hover:opacity-90 transition cursor-pointer"
                >
                  {isCurrent ? 'Plano atual' : 'Escolher plano'}
                </button>
              </div>
            );
          })}
        </div>

        <div className="px-5 pb-5 text-xs text-[#667386] flex gap-4 flex-wrap">
          <span className="flex gap-1">
            <CreditCard className="w-3.5" />
            Cartão processado pelo provedor de pagamento quando configurado.
          </span>
          <span className="flex gap-1">
            <BarChart3 className="w-3.5" />
            Uso não acumula entre ciclos.
          </span>
          <span className="flex gap-1">
            <CalendarDays className="w-3.5" />
            Ciclo segue a assinatura real.
          </span>
        </div>
      </div>
    </div>
  );
}
