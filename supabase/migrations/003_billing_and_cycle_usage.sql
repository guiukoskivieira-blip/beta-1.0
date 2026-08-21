-- ARTECHECK AI — Billing + quotas por ciclo. Migração aditiva e segura.
CREATE TABLE IF NOT EXISTS public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  monthly_price NUMERIC(10,2) NOT NULL,
  yearly_price NUMERIC(10,2),
  analysis_limit INTEGER NOT NULL CHECK (analysis_limit > 0),
  user_limit INTEGER NOT NULL DEFAULT 1 CHECK (user_limit > 0),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.plans (code,name,monthly_price,yearly_price,analysis_limit,user_limit) VALUES
 ('essential','Essencial',59.90,599.00,60,1),
 ('professional','Profissional',119.90,1199.00,200,1),
 ('business','Gráfica',199.90,1999.00,500,1),
 ('professional_launch','Profissional — Lançamento',79.90,NULL,200,1)
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, monthly_price=EXCLUDED.monthly_price,
 yearly_price=EXCLUDED.yearly_price, analysis_limit=EXCLUDED.analysis_limit, user_limit=EXCLUDED.user_limit, updated_at=now();

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  plan_code TEXT NOT NULL REFERENCES public.plans(code),
  billing_period TEXT NOT NULL CHECK (billing_period IN ('monthly','yearly')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','past_due','canceled','expired')),
  provider TEXT,
  provider_customer_id TEXT,
  provider_subscription_id TEXT UNIQUE,
  provider_price_id TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  promotion_cycles_used INTEGER NOT NULL DEFAULT 0 CHECK (promotion_cycles_used >= 0 AND promotion_cycles_used <= 6),
  promotion_redeemed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_org ON public.subscriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);

-- Evita múltiplas assinaturas ativas/concorrentes para o mesmo usuário, permitindo histórico de canceladas/expiradas
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_single_active_per_user 
  ON public.subscriptions(user_id) 
  WHERE status IN ('active', 'pending', 'past_due');

CREATE TABLE IF NOT EXISTS public.analysis_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  analysis_id TEXT NOT NULL,
  upload_bytes BIGINT NOT NULL DEFAULT 0 CHECK (upload_bytes >= 0),
  billing_period_start TIMESTAMPTZ NOT NULL,
  billing_period_end TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'counted' CHECK (status IN ('counted','reversed')),
  counted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, analysis_id)
);
CREATE INDEX IF NOT EXISTS idx_usage_events_subscription_cycle ON public.analysis_usage_events(subscription_id,billing_period_start,billing_period_end);
CREATE INDEX IF NOT EXISTS idx_usage_events_user ON public.analysis_usage_events(user_id);

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_usage_events ENABLE ROW LEVEL SECURITY;

-- Criação idempotente e segura das políticas RLS
DROP POLICY IF EXISTS "plans_read_active" ON public.plans;
CREATE POLICY "plans_read_active" ON public.plans FOR SELECT TO authenticated USING (active = true);

DROP POLICY IF EXISTS "subscriptions_read_own" ON public.subscriptions;
CREATE POLICY "subscriptions_read_own" ON public.subscriptions FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "usage_events_read_own" ON public.analysis_usage_events;
CREATE POLICY "usage_events_read_own" ON public.analysis_usage_events FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Contadores e assinatura passam a ser server-authoritative. Navegador mantém somente leitura.
DROP POLICY IF EXISTS "usage_records_insert_own" ON public.usage_records;
DROP POLICY IF EXISTS "usage_records_update_own" ON public.usage_records;

-- Promoção de lançamento só pode existir uma vez por usuário.
CREATE UNIQUE INDEX IF NOT EXISTS idx_launch_promo_once_per_user
  ON public.subscriptions(user_id) WHERE plan_code = 'professional_launch';
