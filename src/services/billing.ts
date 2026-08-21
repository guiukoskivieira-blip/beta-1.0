import { auth } from '../auth';
import { apiUrl } from '../config/api';
import type { BillingStatus, BillingPeriod, PlanCode } from '../domain/billing';

async function headers() {
  const session = await auth.getSession();
  return session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {};
}

export async function getBillingStatus(): Promise<BillingStatus> {
  const res = await fetch(apiUrl('/api/billing/status'), { headers: await headers(), cache: 'no-store' });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'Não foi possível consultar sua assinatura.');
  return data;
}

export async function createCheckout(plan: PlanCode, period: BillingPeriod): Promise<{ success: boolean; checkoutUrl?: string; url?: string; subscriptionId?: string; status?: string }> {
  const res = await fetch(apiUrl('/api/billing/checkout'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await headers()) },
    body: JSON.stringify({ plan_code: plan, billing_period: period, plan, period })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'Checkout indisponível.');
  return data;
}
