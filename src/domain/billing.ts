export type PlanCode = 'free' | 'essential' | 'professional' | 'business' | 'professional_launch';
export type BillingPeriod = 'monthly' | 'yearly';
export type SubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'unpaid' | 'trialing';

export interface PlanDefinition {
  id: PlanCode;
  name: string;
  badge?: string;
  monthlyPrice: number;
  yearlyPrice: number;
  analysisLimit: number;
  maxUploadMb: number;
  customProfilesLimit: number;
  aiAssistant: boolean;
  features: string[];
  launchCycles?: number;
}

export const PLANS: Record<PlanCode, PlanDefinition> = {
  free: {
    id: 'free',
    name: 'Gratuito',
    monthlyPrice: 0,
    yearlyPrice: 0,
    analysisLimit: 15,
    maxUploadMb: 25,
    customProfilesLimit: 1,
    aiAssistant: false,
    features: ['15 análises/mês', 'Até 25 MB por arquivo', '1 perfil personalizado', 'Diagnóstico determinístico'],
  },
  essential: {
    id: 'essential',
    name: 'Essencial',
    monthlyPrice: 59.9,
    yearlyPrice: 599,
    analysisLimit: 60,
    maxUploadMb: 50,
    customProfilesLimit: 5,
    aiAssistant: true,
    features: ['60 análises/mês', 'Até 50 MB por arquivo', '5 perfis personalizados', 'Assistente IA de pré-impressão', 'Histórico completo'],
  },
  professional_launch: {
    id: 'professional_launch',
    name: 'Profissional (Lançamento)',
    badge: 'Oferta Especial 6 meses',
    monthlyPrice: 79.9,
    yearlyPrice: 799,
    analysisLimit: 200,
    maxUploadMb: 50,
    customProfilesLimit: 20,
    aiAssistant: true,
    launchCycles: 6,
    features: ['200 análises/mês', 'R$ 79,90/mês nos primeiros 6 meses', 'Até 50 MB por arquivo', '20 perfis personalizados', 'Assistente IA ilimitado', 'Suporte prioritário'],
  },
  professional: {
    id: 'professional',
    name: 'Profissional',
    monthlyPrice: 119.9,
    yearlyPrice: 1199,
    analysisLimit: 200,
    maxUploadMb: 50,
    customProfilesLimit: 20,
    aiAssistant: true,
    features: ['200 análises/mês', 'Até 50 MB por arquivo', '20 perfis personalizados', 'Assistente IA ilimitado', 'Suporte prioritário'],
  },
  business: {
    id: 'business',
    name: 'Gráfica / Business',
    monthlyPrice: 199.9,
    yearlyPrice: 1999,
    analysisLimit: 500,
    maxUploadMb: 100,
    customProfilesLimit: 100,
    aiAssistant: true,
    features: ['500 análises/mês', 'Até 100 MB por arquivo', 'Perfis ilimitados', 'Equipe e múltiplos operadores', 'API e integrações'],
  },
};

export interface BillingStatus {
  success: boolean;
  plan: PlanCode;
  period: BillingPeriod;
  status: SubscriptionStatus;
  usedAnalyses: number;
  limitAnalyses: number;
  renewsAt?: string;
  isPromotion?: boolean;
  promotionCyclesRemaining?: number;
}
