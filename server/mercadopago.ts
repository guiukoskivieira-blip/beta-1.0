/**
 * Server-side Mercado Pago configuration, checkout and webhook verification module.
 * 
 * SECURITY RULES:
 * 1. MERCADOPAGO_ACCESS_TOKEN and MERCADOPAGO_WEBHOOK_SECRET must exist ONLY on the server side (process.env).
 * 2. Never prefix with VITE_.
 * 3. Never return or log credentials.
 * 4. Never trust prices or statuses sent by the client.
 * 5. Validate x-signature with crypto HMAC SHA-256 before any DB alteration.
 * 6. Always fetch the verified resource from Mercado Pago API before updating subscriptions.
 */

import crypto from 'crypto';

export interface MercadoPagoConfig {
  configured: boolean;
  provider: string;
}

export interface CreatePreferenceParams {
  userId: string;
  userEmail?: string | null;
  planCode: string;
  planName: string;
  billingPeriod: 'monthly' | 'yearly';
  price: number;
  subscriptionId?: string;
  origin?: string;
}

export interface MercadoPagoPreferenceResult {
  id: string;
  initPoint: string;
  sandboxInitPoint?: string;
}

export function getMercadoPagoAccessToken(): string | null {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) return null;
  const trimmed = token.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getMercadoPagoWebhookSecret(): string | null {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) return null;
  const trimmed = secret.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getMercadoPagoWebhookUrl(origin?: string): string | null {
  if (process.env.MERCADOPAGO_WEBHOOK_URL) {
    return process.env.MERCADOPAGO_WEBHOOK_URL.trim();
  }
  const base = process.env.API_URL || process.env.APP_URL || origin;
  if (base) {
    return `${base.replace(/\/$/, '')}/api/billing/webhook/mercadopago`;
  }
  return null;
}

export function isMercadoPagoConfigured(): boolean {
  const provider = (process.env.BILLING_PROVIDER || '').trim().toLowerCase();
  const token = getMercadoPagoAccessToken();
  return provider === 'mercadopago' && Boolean(token);
}

export function getMercadoPagoServerConfig(): MercadoPagoConfig {
  return {
    configured: isMercadoPagoConfigured(),
    provider: (process.env.BILLING_PROVIDER || '').trim().toLowerCase(),
  };
}

/**
 * Validates Mercado Pago webhook signature according to official specification:
 * Header: x-signature (ts=...,v1=...)
 * Manifest: "id:[data.id_or_data_id];request-id:[x-request-id];ts:[ts];"
 * HMAC-SHA256(manifest, secret) === v1
 */
export function verifyMercadoPagoWebhookSignature(params: {
  xSignatureHeader?: string | null;
  xRequestIdHeader?: string | null;
  dataId?: string | null;
  secret?: string | null;
}): boolean {
  const secret = params.secret || getMercadoPagoWebhookSecret();
  if (!secret) {
    // If webhook secret is not configured, deny unauthenticated webhooks
    return false;
  }

  const signatureHeader = params.xSignatureHeader;
  const requestId = params.xRequestIdHeader;
  const dataId = params.dataId;

  if (!signatureHeader || !requestId || !dataId) {
    return false;
  }

  // Parse ts and v1 from x-signature
  const parts = signatureHeader.split(',').map(p => p.trim());
  let ts: string | null = null;
  let hash: string | null = null;

  for (const part of parts) {
    const [key, val] = part.split('=').map(s => s?.trim());
    if (key === 'ts') ts = val;
    if (key === 'v1') hash = val;
  }

  if (!ts || !hash) {
    return false;
  }

  // Build manifest
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const computedHash = crypto
    .createHmac('sha256', secret)
    .update(manifest)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(computedHash, 'utf8'),
      Buffer.from(hash, 'utf8')
    );
  } catch {
    return false;
  }
}

/**
 * Fetches verified resource details directly from Mercado Pago API using server-side access token.
 */
export async function fetchMercadoPagoResource(
  type: 'subscription_preapproval' | 'subscription_authorized_payment' | 'payment' | 'preference' | string,
  id: string
): Promise<any> {
  const token = getMercadoPagoAccessToken();
  if (!token) {
    throw new Error('MERCADOPAGO_ACCESS_TOKEN não configurado.');
  }

  let endpoint = '';
  if (type === 'subscription_preapproval' || type === 'preapproval') {
    endpoint = `https://api.mercadopago.com/preapproval/${encodeURIComponent(id)}`;
  } else if (type === 'subscription_authorized_payment' || type === 'authorized_payment') {
    endpoint = `https://api.mercadopago.com/authorized_payments/${encodeURIComponent(id)}`;
  } else if (type === 'payment') {
    endpoint = `https://api.mercadopago.com/v1/payments/${encodeURIComponent(id)}`;
  } else if (type === 'preference') {
    endpoint = `https://api.mercadopago.com/checkout/preferences/${encodeURIComponent(id)}`;
  } else {
    endpoint = `https://api.mercadopago.com/v1/${encodeURIComponent(type)}/${encodeURIComponent(id)}`;
  }

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Mercado Pago API fetch error [${response.status}]: ${errorText}`);
  }

  return response.json();
}

/**
 * Creates a checkout preference directly on Mercado Pago API using server-side token.
 */
export async function createMercadoPagoCheckoutPreference(
  params: CreatePreferenceParams
): Promise<MercadoPagoPreferenceResult> {
  const token = getMercadoPagoAccessToken();
  if (!token) {
    throw new Error('MERCADOPAGO_ACCESS_TOKEN não configurado no servidor.');
  }

  const appOrigin = process.env.APP_URL?.trim().replace(/\/$/, '') || params.origin || 'http://localhost:3000';
  const webhookUrl = getMercadoPagoWebhookUrl(appOrigin);
  const periodLabel = params.billingPeriod === 'yearly' ? 'Anual' : 'Mensal';
  const itemTitle = `ArteCheck AI — Plano ${params.planName} (${periodLabel})`;

  const preferencePayload: Record<string, any> = {
    items: [
      {
        id: params.planCode,
        title: itemTitle,
        description: `Assinatura ArteCheck AI - ${params.planName}`,
        quantity: 1,
        currency_id: 'BRL',
        unit_price: Number(params.price.toFixed(2)),
      },
    ],
    payer: params.userEmail ? { email: params.userEmail } : undefined,
    external_reference: params.subscriptionId || params.userId,
    metadata: {
      user_id: params.userId,
      plan_code: params.planCode,
      billing_period: params.billingPeriod,
      subscription_id: params.subscriptionId,
    },
    back_urls: {
      success: `${appOrigin}/?billing=success`,
      failure: `${appOrigin}/?billing=failure`,
      pending: `${appOrigin}/?billing=pending`,
    },
    auto_return: 'approved',
  };

  if (webhookUrl) {
    preferencePayload.notification_url = webhookUrl;
  }

  const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(preferencePayload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    console.error('Mercado Pago Preferences API Error:', response.status, errorText);
    throw new Error(`Falha ao iniciar checkout no Mercado Pago (${response.status}).`);
  }

  const data: any = await response.json();
  const initPoint = data.init_point || data.sandbox_init_point;
  if (!initPoint) {
    throw new Error('Mercado Pago não retornou URL de checkout.');
  }

  return {
    id: data.id,
    initPoint,
    sandboxInitPoint: data.sandbox_init_point,
  };
}
