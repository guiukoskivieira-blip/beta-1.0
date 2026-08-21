import express, { Request, Response, NextFunction } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { createServer as createViteServer } from "vite";
import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { extractPdfStructure, inspectPayload, DiagnosticTracker, formatBytes } from "./server/pdfExtractor";
import { GoogleGenAI } from "@google/genai";
import { LIMITS } from "./src/config/limits";
import { getSupabaseClient, isSupabaseConfigured } from "./src/lib/supabaseClient";
import { PLANS, PlanCode, BillingPeriod } from "./src/domain/billing";
import {
  isMercadoPagoConfigured,
  createMercadoPagoCheckoutPreference,
  verifyMercadoPagoWebhookSignature,
  fetchMercadoPagoResource,
} from "./server/mercadopago";

// Configure Multer for in-memory storage (no permanent disk writes)
// Max file size: 50 MB
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAX_STRING_LENGTH = 20_000;
const MAX_ARRAY_ITEMS = 2_000;


const BILLING_PLAN_LIMITS: Record<string, number> = {
  essential: 60,
  professional: 200,
  business: 500,
  professional_launch: 200,
};

function getBillingAdmin() {
  const rawUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const rawKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!rawUrl || !rawKey || !rawUrl.startsWith('http')) return null;
  return createClient(rawUrl, rawKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function isBillingEnforced() {
  return Boolean(getBillingAdmin() && process.env.BILLING_PROVIDER);
}

async function getSubscriptionUsage(userId: string) {
  const admin = getBillingAdmin();
  if (!admin) return null;
  const { data: subscription } = await admin.from('subscriptions').select('*')
    .eq('user_id', userId).in('status', ['active','canceled']).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!subscription || !subscription.current_period_start || !subscription.current_period_end) return null;
  const limit = BILLING_PLAN_LIMITS[subscription.plan_code] || 0;
  const { count } = await admin.from('analysis_usage_events').select('id', { count: 'exact', head: true })
    .eq('subscription_id', subscription.id).eq('status', 'counted')
    .gte('counted_at', subscription.current_period_start).lt('counted_at', subscription.current_period_end);
  const used = count || 0;
  return { subscription, used, limit, remaining: Math.max(0, limit - used) };
}

async function recordSuccessfulAnalysis(userId: string, analysisId: string, uploadBytes: number) {
  if (!isBillingEnforced()) return;
  const admin = getBillingAdmin();
  const state = await getSubscriptionUsage(userId);
  if (!admin || !state || state.remaining <= 0) return;
  await admin.from('analysis_usage_events').upsert({
    user_id: userId,
    organization_id: state.subscription.organization_id || null,
    subscription_id: state.subscription.id,
    analysis_id: analysisId,
    upload_bytes: Math.max(0, uploadBytes || 0),
    billing_period_start: state.subscription.current_period_start,
    billing_period_end: state.subscription.current_period_end,
    status: 'counted',
    counted_at: new Date().toISOString(),
  }, { onConflict: 'analysis_id', ignoreDuplicates: true });
}

/** Creates a JSON-safe client payload without retaining binary PDF objects. */
function sanitizeForClient(value: any, seen = new WeakSet<object>(), depth = 0): any {
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") {
    return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}…[truncated]` : value;
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") return undefined;
  if (Buffer.isBuffer(value) || value instanceof Uint8Array || value instanceof ArrayBuffer) {
    const byteLength = Buffer.isBuffer(value) ? value.length : value.byteLength;
    return { omittedBinary: true, byteLength };
  }
  if (depth > 20) return "[max-depth]";
  if (typeof value === "object") {
    if (seen.has(value)) return "[circular]";
    seen.add(value);
    if (Array.isArray(value)) {
      return value.slice(0, MAX_ARRAY_ITEMS).map(v => sanitizeForClient(v, seen, depth + 1));
    }
    const out: Record<string, any> = {};
    for (const [key, child] of Object.entries(value)) {
      if (/^(buffer|bytes|contents?|decoded|stream|pdfBytes|rawBytes)$/i.test(key)) {
        const len = Buffer.isBuffer(child) || child instanceof Uint8Array ? child.length : undefined;
        out[key] = { omitted: true, ...(len !== undefined ? { byteLength: len } : {}) };
        continue;
      }
      const clean = sanitizeForClient(child, seen, depth + 1);
      if (clean !== undefined) out[key] = clean;
    }
    return out;
  }
  return String(value);
}

function getSlowestStage(stages: Record<string, { durationMs: number }>) {
  return Object.entries(stages).sort((a, b) => b[1].durationMs - a[1].durationMs)[0]?.[0] || "not_determined";
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: LIMITS.MAX_UPLOAD_BYTES,
    files: 1,
  },
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  // CORS and headers middleware to support iframe and cross-origin preview requests
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Cache-Control", "no-store");
    res.header("X-Content-Type-Options", "nosniff");
    res.header("Referrer-Policy", "no-referrer");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, PATCH, DELETE");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept, X-Request-ID");
    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }
    next();
  });

  // Session & Identity token extraction middleware (Etapa 10)
  // Real JWT validation via Supabase Auth when configured, with clean local dev fallback.
  // Never trusts user_id / organization_id sent in body/query for authorization.
  app.use(async (req: Request, _res: Response, next: NextFunction) => {
    const authHeader = req.header("authorization");
    let authToken: string | null = null;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      authToken = authHeader.substring(7).trim();
    }

    (req as any).authToken = authToken;

    if (!authToken) {
      (req as any).authUser = null;
      (req as any).user = {
        tokenProvided: false,
        authenticated: false,
        role: "guest_or_local_dev",
      };
      return next();
    }

    if (isSupabaseConfigured()) {
      const supabase = getSupabaseClient();
      if (supabase) {
        try {
          const { data: { user }, error } = await supabase.auth.getUser(authToken);
          if (!error && user && user.id) {
            const authUser = {
              id: user.id,
              email: user.email || null,
              role: user.role || 'authenticated',
            };
            (req as any).authUser = authUser;
            (req as any).user = {
              ...authUser,
              tokenProvided: true,
              authenticated: true,
            };
            return next();
          }
        } catch {
          // Token validation failed
        }
      }
      // Invalid/Expired Supabase token
      (req as any).authUser = null;
      (req as any).user = {
        tokenProvided: true,
        authenticated: false,
        role: "unauthenticated",
      };
      return next();
    }

    // Local dev mode without remote Supabase
    if (authToken === "local_dev_token" || authToken.length > 0) {
      const devUser = {
        id: "local_dev_user",
        email: "dev@artecheck.local",
        role: "developer",
      };
      (req as any).authUser = devUser;
      (req as any).user = {
        ...devUser,
        tokenProvided: true,
        authenticated: true,
      };
    } else {
      (req as any).authUser = null;
      (req as any).user = {
        tokenProvided: false,
        authenticated: false,
        role: "guest_or_local_dev",
      };
    }

    next();
  });

  app.use(express.json({ limit: "1mb" }));

  // API Health Endpoint (Stage 1 validation)
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({
      ok: true,
      status: "ok",
      service: "artecheck-backend",
    });
  });

  // Deployment/beta capability discovery. Contains configuration only; no secrets.
  app.get("/api/capabilities", (_req: Request, res: Response) => {
    const isSupabase = Boolean(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL);
    res.json({
      ok: true,
      service: "artecheck-backend",
      releaseChannel: "closed_beta",
      deterministicPreflight: true,
      aiAssistantOptional: true,
      maxUploadMb: LIMITS.MAX_UPLOAD_MB,
      endpoints: ["/api/health", "/api/upload", "/api/diagnose", "/api/assistant"],
      persistence: isSupabase ? "supabase_postgres" : "local_client_only",
      authentication: isSupabase ? "supabase_jwt" : "local_dev",
      billing: isBillingEnforced() ? "configured" : "test_architecture_only",
    });
  });

  // Billing status is read-only for the browser; prices/limits remain server authoritative.
  app.get('/api/billing/status', async (req: Request, res: Response) => {
    const userId = (req as any).authUser?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Autenticação necessária.' });
    const state = await getSubscriptionUsage(userId);
    if (!state) return res.json({ success: true, configured: isBillingEnforced(), subscription: null, usage: { used: 0, limit: 0, remaining: 0, percentage: 0 } });
    const s = state.subscription;
    return res.json({ success: true, configured: isBillingEnforced(), subscription: {
      id: s.id, planCode: s.plan_code, billingPeriod: s.billing_period, status: s.status,
      currentPeriodStart: s.current_period_start, currentPeriodEnd: s.current_period_end,
      cancelAtPeriodEnd: s.cancel_at_period_end, promotionCyclesUsed: s.promotion_cycles_used || 0,
    }, usage: { used: state.used, limit: state.limit, remaining: state.remaining, percentage: state.limit ? Math.min(100, Math.round(state.used / state.limit * 100)) : 0 } });
  });

  app.post('/api/billing/checkout', async (req: Request, res: Response) => {
    const authUser = (req as any).authUser;
    if (!authUser?.id) {
      return res.status(401).json({ success: false, error: 'Autenticação necessária.' });
    }

    const planCode = String(req.body?.plan_code || req.body?.plan || '').trim() as PlanCode;
    const billingPeriod = String(req.body?.billing_period || req.body?.period || '').trim() as BillingPeriod;

    const planDef = PLANS[planCode];
    if (!planDef) {
      return res.status(400).json({ success: false, error: 'Plano inválido ou inexistente.' });
    }

    if (billingPeriod !== 'monthly' && billingPeriod !== 'yearly') {
      return res.status(400).json({ success: false, error: 'Período de cobrança inválido.' });
    }

    if (planCode === 'professional_launch' && billingPeriod === 'yearly') {
      return res.status(400).json({ success: false, error: 'O plano promocional de lançamento está disponível apenas no ciclo mensal.' });
    }

    // Preço é estritamente resolvido server-side a partir da definição do plano (public.plans / PLANS)
    const price = billingPeriod === 'yearly' ? planDef.yearlyPrice : planDef.monthlyPrice;
    if (price == null || price <= 0 || isNaN(price)) {
      return res.status(400).json({ success: false, error: 'Preço inválido para o ciclo selecionado.' });
    }

    if (!isMercadoPagoConfigured()) {
      return res.status(503).json({
        success: false,
        code: 'BILLING_PROVIDER_NOT_CONFIGURED',
        error: 'Checkout em modo de preparação. Configure MERCADOPAGO_ACCESS_TOKEN e BILLING_PROVIDER=mercadopago para ativar cobranças.'
      });
    }

    try {
      const admin = getBillingAdmin();
      let subscriptionId = randomUUID();

      if (admin) {
        const { data: existingSub } = await admin
          .from('subscriptions')
          .select('id')
          .eq('user_id', authUser.id)
          .eq('status', 'pending')
          .maybeSingle();

        if (existingSub?.id) {
          subscriptionId = existingSub.id;
          await admin.from('subscriptions').update({
            plan_code: planCode,
            billing_period: billingPeriod,
            provider: 'mercadopago',
            updated_at: new Date().toISOString(),
          }).eq('id', subscriptionId);
        } else {
          const { data: insertedSub } = await admin.from('subscriptions').insert({
            id: subscriptionId,
            user_id: authUser.id,
            plan_code: planCode,
            billing_period: billingPeriod,
            status: 'pending',
            provider: 'mercadopago',
          }).select('id').single();

          if (insertedSub?.id) {
            subscriptionId = insertedSub.id;
          }
        }
      }

      const hostHeader = req.get('host') || 'localhost:3000';
      const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
      const appOrigin = process.env.APP_URL?.trim().replace(/\/$/, '') || `${protocol}://${hostHeader}`;

      const preference = await createMercadoPagoCheckoutPreference({
        userId: authUser.id,
        userEmail: authUser.email,
        planCode,
        planName: planDef.name,
        billingPeriod,
        price,
        subscriptionId,
        origin: appOrigin,
      });

      if (admin && preference.id) {
        await admin.from('subscriptions').update({
          provider_subscription_id: preference.id,
          updated_at: new Date().toISOString(),
        }).eq('id', subscriptionId);
      }

      return res.status(200).json({
        success: true,
        checkoutUrl: preference.initPoint,
        url: preference.initPoint,
        subscriptionId,
        status: 'pending',
      });
    } catch (checkoutError: any) {
      console.error('Erro ao gerar checkout do Mercado Pago:', checkoutError.message || checkoutError);
      return res.status(502).json({
        success: false,
        error: checkoutError.message || 'Falha ao processar checkout junto ao Mercado Pago.',
      });
    }
  });

  app.post('/api/billing/portal', async (req: Request, res: Response) => {
    if (!(req as any).authUser?.id) return res.status(401).json({ success: false, error: 'Autenticação necessária.' });
    return res.status(503).json({ success: false, code: 'BILLING_PROVIDER_NOT_CONFIGURED', error: 'Portal de cobrança ainda não configurado.' });
  });

  // POST /api/billing/webhook/mercadopago - Secure Mercado Pago Webhook
  app.post('/api/billing/webhook/mercadopago', async (req: Request, res: Response) => {
    const xSignatureHeader = req.headers['x-signature'] as string | undefined;
    const xRequestIdHeader = req.headers['x-request-id'] as string | undefined;
    const body = req.body || {};
    const query = req.query || {};

    const resourceType = String(body.type || body.topic || query.type || query.topic || '').trim();
    const dataId = String(body.data?.id || body.id || query['data.id'] || query.id || '').trim();

    // 1. Validar assinatura com chave secreta
    const isValidSignature = verifyMercadoPagoWebhookSignature({
      xSignatureHeader,
      xRequestIdHeader,
      dataId,
    });

    if (!isValidSignature) {
      // Assinatura inválida => HTTP 401 e nenhuma alteração no banco
      return res.status(401).json({
        success: false,
        error: 'Assinatura de webhook inválida ou ausente.',
      });
    }

    // 2. Tratar apenas eventos suportados de assinaturas
    const isPreapproval = resourceType === 'subscription_preapproval' || resourceType === 'preapproval';
    const isAuthorizedPayment = resourceType === 'subscription_authorized_payment' || resourceType === 'authorized_payment';

    if (!isPreapproval && !isAuthorizedPayment) {
      // Evento válido recebido mas fora do escopo de assinaturas (ex: teste ou outro tipo)
      return res.status(200).json({ received: true, ignored: true, reason: 'unsupported_resource_type' });
    }

    const admin = getBillingAdmin();
    if (!admin) {
      return res.status(500).json({ success: false, error: 'Database service role client not configured.' });
    }

    try {
      // 3. NUNCA confiar apenas no payload recebido; consultar diretamente a API do Mercado Pago
      const verifiedResource = await fetchMercadoPagoResource(resourceType, dataId);
      if (!verifiedResource) {
        return res.status(404).json({ success: false, error: 'Recurso não encontrado na API Mercado Pago.' });
      }

      let preapprovalId: string | null = null;
      let externalReference: string | null = null;
      let verifiedStatus: string | null = null;
      let nextPaymentDate: string | null = null;
      let dateCreated: string | null = null;

      if (isPreapproval) {
        preapprovalId = verifiedResource.id || dataId;
        externalReference = verifiedResource.external_reference || null;
        verifiedStatus = (verifiedResource.status || '').toLowerCase();
        nextPaymentDate = verifiedResource.next_payment_date || null;
        dateCreated = verifiedResource.date_created || null;
      } else if (isAuthorizedPayment) {
        preapprovalId = verifiedResource.preapproval_id || null;
        externalReference = verifiedResource.external_reference || null;
        const paymentStatus = (verifiedResource.status || '').toLowerCase();
        if (paymentStatus === 'approved') {
          verifiedStatus = 'authorized';
        } else if (paymentStatus === 'rejected' || paymentStatus === 'cancelled') {
          verifiedStatus = 'cancelled';
        }
      }

      // 4. Mapear status do Mercado Pago para os status permitidos em public.subscriptions
      // Status permitidos: ('pending','active','past_due','canceled','expired')
      let mappedStatus: 'active' | 'pending' | 'past_due' | 'canceled' | 'expired' | null = null;
      if (verifiedStatus === 'authorized' || verifiedStatus === 'active') {
        mappedStatus = 'active';
      } else if (verifiedStatus === 'pending') {
        mappedStatus = 'pending';
      } else if (verifiedStatus === 'paused') {
        mappedStatus = 'past_due';
      } else if (verifiedStatus === 'cancelled' || verifiedStatus === 'canceled') {
        mappedStatus = 'canceled';
      } else if (verifiedStatus === 'expired') {
        mappedStatus = 'expired';
      }

      if (!mappedStatus) {
        return res.status(200).json({ received: true, ignored: true, reason: 'unknown_mp_status', status: verifiedStatus });
      }

      // 5. Localizar assinatura existente por provider_subscription_id ou ID de referência
      let existingSub: any = null;
      if (preapprovalId) {
        const { data } = await admin
          .from('subscriptions')
          .select('*')
          .eq('provider_subscription_id', preapprovalId)
          .maybeSingle();
        existingSub = data;
      }

      if (!existingSub && externalReference) {
        const { data } = await admin
          .from('subscriptions')
          .select('*')
          .eq('id', externalReference)
          .maybeSingle();
        existingSub = data;
      }

      if (!existingSub) {
        return res.status(200).json({
          received: true,
          matched: false,
          message: 'Nenhuma assinatura local correspondente encontrada para atualizar.',
        });
      }

      // 6. Extrair períodos diretamente do recurso Mercado Pago
      // Mercado Pago preapproval traz:
      // auto_recurring: { start_date, end_date, ... } ou date_created / next_payment_date / last_modified
      const now = new Date();
      const mpStartDate = verifiedResource.auto_recurring?.start_date ||
        verifiedResource.date_created ||
        verifiedResource.start_date ||
        dateCreated;
      const mpEndDate = verifiedResource.next_payment_date ||
        verifiedResource.auto_recurring?.end_date ||
        nextPaymentDate;

      let periodStart = mpStartDate ? new Date(mpStartDate).toISOString() : (existingSub.current_period_start || now.toISOString());
      let periodEnd = mpEndDate ? new Date(mpEndDate).toISOString() : existingSub.current_period_end;

      if (!periodEnd) {
        const d = new Date(periodStart);
        if (existingSub.billing_period === 'yearly') {
          d.setFullYear(d.getFullYear() + 1);
        } else {
          d.setMonth(d.getMonth() + 1);
        }
        periodEnd = d.toISOString();
      }

      // Detecção de novo ciclo confirmado pelo Mercado Pago:
      // Se a data de início do período mudou ou o status transitou para active a partir de pending
      const isNewCycle = Boolean(
        mappedStatus === 'active' && (
          existingSub.status !== 'active' ||
          (mpStartDate && existingSub.current_period_start && new Date(mpStartDate).getTime() > new Date(existingSub.current_period_start).getTime())
        )
      );

      // 7. professional_launch:
      // - incrementar promotion_cycles_used somente após pagamento confirmado / novo ciclo
      // - nunca passar de 6
      // - após 6 ciclos, não permitir novo ciclo promocional e preparar transição para 'professional'
      let newPromoCycles = existingSub.promotion_cycles_used || 0;
      let targetPlanCode = existingSub.plan_code;

      if (existingSub.plan_code === 'professional_launch') {
        if (isNewCycle) {
          if (newPromoCycles < 6) {
            newPromoCycles += 1;
          }
        }
        // Se completou os 6 ciclos promocionais e um novo ciclo ocorrer, faz a transição segura para 'professional'
        if (newPromoCycles >= 6 && isNewCycle && (existingSub.promotion_cycles_used || 0) >= 6) {
          targetPlanCode = 'professional';
        }
      }

      newPromoCycles = Math.min(6, Math.max(0, newPromoCycles));

      // 8. Atualizar registro local em public.subscriptions
      const updatePayload: Record<string, any> = {
        status: mappedStatus,
        provider: 'mercadopago',
        plan_code: targetPlanCode,
        updated_at: now.toISOString(),
        promotion_cycles_used: newPromoCycles,
      };

      if (preapprovalId && !existingSub.provider_subscription_id) {
        updatePayload.provider_subscription_id = preapprovalId;
      }

      if (mappedStatus === 'active') {
        updatePayload.current_period_start = periodStart;
        updatePayload.current_period_end = periodEnd;
      }

      await admin
        .from('subscriptions')
        .update(updatePayload)
        .eq('id', existingSub.id);

      return res.status(200).json({
        success: true,
        subscriptionId: existingSub.id,
        status: mappedStatus,
        planCode: targetPlanCode,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        promotionCyclesUsed: newPromoCycles,
      });
    } catch (err: any) {
      console.error('Erro ao processar webhook do Mercado Pago:', err.message || err);
      return res.status(500).json({ success: false, error: err.message || 'Erro interno no processamento do webhook.' });
    }
  });

  // POST /api/upload - Stage 3 Real PDF Upload & Deterministic Structure Extraction
  app.post(
    "/api/upload",
    async (req: Request, res: Response, next: NextFunction) => {
      if (!isBillingEnforced()) return next();
      const userId = (req as any).authUser?.id;
      if (!userId) return res.status(401).json({ success: false, error: 'Faça login para iniciar uma análise.' });
      const state = await getSubscriptionUsage(userId);
      if (!state || !['active','canceled'].includes(state.subscription.status)) {
        return res.status(402).json({ success: false, code: 'SUBSCRIPTION_REQUIRED', error: 'É necessário um plano ativo para iniciar novas análises.' });
      }
      if (new Date(state.subscription.current_period_end).getTime() <= Date.now()) {
        return res.status(402).json({ success: false, code: 'SUBSCRIPTION_EXPIRED', error: 'Sua assinatura expirou. Escolha um plano para continuar analisando arquivos.' });
      }
      if (state.remaining <= 0) {
        return res.status(429).json({ success: false, code: 'PLAN_LIMIT_REACHED', renewsAt: state.subscription.current_period_end, error: `Você atingiu o limite do seu plano. Seu limite será renovado em ${new Date(state.subscription.current_period_end).toLocaleDateString('pt-BR')}. Para continuar analisando novos arquivos agora, faça upgrade para um plano maior.` });
      }
      (req as any).billingUserId = userId;
      next();
    },
    (req: Request, res: Response, next: NextFunction) => {
      const requestId = String(req.header("x-request-id") || `server-${Date.now().toString(36)}`);
      res.setHeader("X-Request-ID", requestId);
      (req as any).artecheckRequestId = requestId;
      const requestStartedAt = performance.now();
      console.log(`[SERVER:${requestId}] REQUEST RECEIVED (/api/upload reached)`);
      req.on("aborted", () => console.warn(`[SERVER:${requestId}] request aborted by client`));
      res.on("finish", () => console.log(`[SERVER:${requestId}] RESPONSE SENT status=${res.statusCode} elapsed=${Number((performance.now() - requestStartedAt).toFixed(2))}ms`));
      res.on("close", () => {
        if (!res.writableEnded) console.warn(`[SERVER:${requestId}] response closed before completion`);
      });
      // Execute upload handler with custom error handling for multer
      upload.single("file")(req, res, (err: any) => {
        if (err) {
          if (err instanceof multer.MulterError) {
            if (err.code === "LIMIT_FILE_SIZE") {
              return res.status(400).json({
                success: false,
                error: `O arquivo excede o limite máximo permitido de ${LIMITS.MAX_UPLOAD_MB} MB.`,
              });
            }
            return res.status(400).json({
              success: false,
              error: `Erro no upload: ${err.message}`,
            });
          }
          return res.status(400).json({
            success: false,
            error: err.message || "Erro durante o envio do arquivo.",
          });
        }
        console.log(`[SERVER:${(req as any).artecheckRequestId}] multer completed`);
        next();
      });
    },
    async (req: Request, res: Response) => {
      const serverTracker = new DiagnosticTracker('Server-Upload');
      const reqStart = serverTracker.startStage('request_received');
      const file = req.file;

      // 1. Validate that a file was sent
      if (!file) {
        return res.status(400).json({
          success: false,
          error: "Nenhum arquivo foi enviado. Por favor, selecione um arquivo PDF.",
        });
      }

      const originalName = (file.originalname || "").replace(/[\r\n\0]/g, "").slice(0, 255);
      const requestId = (req as any).artecheckRequestId || "unknown";
      console.log(`[SERVER:${requestId}] FILE RECEIVED: ${originalName} (buffer length: ${file.buffer?.length || 0} bytes)`);

      // 2. Validate file name extension and declared MIME (magic bytes remain authoritative below).
      if (!originalName.toLowerCase().endsWith(".pdf")) {
        return res.status(400).json({
          success: false,
          error: "Formato inválido. O arquivo deve possuir a extensão .pdf.",
        });
      }

      // 3. Validate file buffer content and magic bytes signature (%PDF-)
      serverTracker.startStage('file_header_validation', { sizeBytes: file.size, fileName: originalName });
      if (!file.buffer || file.buffer.length < 5) {
        return res.status(400).json({
          success: false,
          error: "Arquivo vazio ou corrompido.",
        });
      }

      // Check for %PDF- in the first 1024 bytes (standard PDF header per ISO 32000-1)
      const headerChunk = file.buffer.subarray(0, Math.min(file.buffer.length, 1024));
      const hasPdfHeader = headerChunk.includes(Buffer.from("%PDF-"));

      if (!hasPdfHeader) {
        return res.status(400).json({
          success: false,
          error:
            "Arquivo inválido. O conteúdo não possui a assinatura/cabeçalho de documento PDF (%PDF-).",
        });
      }
      serverTracker.endStage('file_header_validation');

      // 4. Stage 3 Deterministic Structural Extraction (in-memory, zero permanent storage)
      try {
        console.log(`[SERVER:${requestId}] PDF ENGINE START (extractPdfStructure executing)`);
        serverTracker.startStage('pdf_extractor_execution');
        const documentStructure = await extractPdfStructure(file.buffer);
        serverTracker.endStage('pdf_extractor_execution');
        console.log(`[SERVER:${requestId}] PDF ENGINE END (extractPdfStructure succeeded)`);

        // 5. Payload Inspection & Diagnostic Audit
        serverTracker.startStage('payload_inspection_and_audit');
        const clientDocument = sanitizeForClient(documentStructure);
        const payloadAudit = inspectPayload(clientDocument);
        serverTracker.endStage('payload_inspection_and_audit', {
          totalSizeBytes: payloadAudit.totalSizeBytes,
          formattedSize: payloadAudit.formattedSize,
          largeFieldsCount: payloadAudit.largeFields.length,
          hasRawBuffers: payloadAudit.hasRawBuffers,
        });

        if (payloadAudit.largeFields.length > 0) {
          console.warn(`⚠️ [Server-Upload] Detected ${payloadAudit.largeFields.length} field(s) exceeding 10k chars:`, 
            payloadAudit.largeFields.map(f => `${f.path} (${f.length} chars)`)
          );
        }

        if (payloadAudit.totalSizeBytes > MAX_RESPONSE_BYTES) {
          console.error(`[Server-Upload] Payload bloqueado: ${payloadAudit.formattedSize}`);
          return res.status(413).json({
            success: false,
            error: "A análise foi concluída, mas o relatório técnico ficou grande demais para ser exibido com segurança. Use o modo diagnóstico ou um perfil mais específico.",
            diagnosticInfo: { payloadSizeBytes: payloadAudit.totalSizeBytes, formattedPayloadSize: payloadAudit.formattedSize },
          });
        }

        const totalServerDuration = Number((performance.now() - reqStart).toFixed(2));
        serverTracker.markInstant('response_sending', {
          totalDurationMs: totalServerDuration,
          payloadSize: payloadAudit.formattedSize,
        });

        const analysisId = randomUUID();
        const billingUserId = (req as any).billingUserId as string | undefined;
        if (billingUserId) await recordSuccessfulAnalysis(billingUserId, analysisId, file.size);

        console.log(`[SERVER:${requestId}] response started`);
        return res.status(200).json({
          success: true,
          analysisId,
          file: {
            name: originalName,
            size: file.size,
            mimeType: "application/pdf",
          },
          document: clientDocument,
          diagnosticInfo: {
            stages: serverTracker.getStagesSummary(),
            totalDurationMs: totalServerDuration,
            payloadSizeBytes: payloadAudit.totalSizeBytes,
            formattedPayloadSize: payloadAudit.formattedSize,
            largeFieldsCount: payloadAudit.largeFields.length,
          },
        });
      } catch (extractError: any) {
        console.error("PDF Structure Extraction Error:", extractError.message || extractError);
        return res.status(400).json({
          success: false,
          error:
            extractError.message ||
            "Não foi possível interpretar a estrutura do arquivo PDF. O arquivo pode estar corrompido.",
        });
      }
    }
  );

  // POST /api/diagnose - lightweight server-only diagnostic; never returns the full PDF graph.
  app.post("/api/diagnose", upload.single("file"), async (req: Request, res: Response) => {
    const file = req.file;
    if (!file) return res.status(400).json({ success: false, error: "Nenhum PDF enviado." });
    const started = performance.now();
    try {
      if (!file.buffer.subarray(0, Math.min(file.buffer.length, 1024)).includes(Buffer.from("%PDF-"))) {
        return res.status(400).json({ success: false, error: "Arquivo sem assinatura PDF válida." });
      }
      const document = await extractPdfStructure(file.buffer);
      const clean = sanitizeForClient(document);
      const audit = inspectPayload(clean);
      const stages = (document as any).extractionDiagnostics?.stages || {};
      const totalTimeMs = Number((performance.now() - started).toFixed(2));
      const memory = process.memoryUsage();
      return res.json({
        success: true,
        fileSize: file.size,
        totalTimeMs,
        lastCompletedStage: "payload_audit",
        stages,
        counts: (audit as any).counts || { pages: document.pageCount, fonts: document.fonts.length },
        responseSize: audit.totalSizeBytes,
        responseSizeFormatted: audit.formattedSize,
        suspectedBottleneck: getSlowestStage(stages),
        memory: { heapUsed: memory.heapUsed, rss: memory.rss },
        hasRawBuffers: audit.hasRawBuffers,
        largeFields: audit.largeFields.slice(0, 10),
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        fileSize: file.size,
        totalTimeMs: Number((performance.now() - started).toFixed(2)),
        lastCompletedStage: "extractor_failed",
        error: error?.message || "Falha no diagnóstico.",
      });
    }
  });

  // POST /api/assistant - Grounded Gemini explanation layer strictly subordinate to preflight engine
  app.post("/api/assistant", async (req: Request, res: Response) => {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return res.status(503).json({
        success: false,
        error: "Assistente de IA não configurado. Defina GEMINI_API_KEY no servidor para habilitar esta função.",
      });
    }

    const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";
    const context = req.body?.context;

    if (!question || question.length > 1000) {
      return res.status(400).json({ success: false, error: "Pergunta inválida ou maior que 1000 caracteres." });
    }
    if (!context || (context.schemaVersion !== "1.0" && !context.fileName) || typeof context.score !== "number") {
      return res.status(400).json({ success: false, error: "Contexto técnico da análise ausente ou inválido." });
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
      const model = process.env.GEMINI_MODEL || "gemini-3.7-flash";

      const blockingList = Array.isArray(context.blockingErrors) && context.blockingErrors.length > 0
        ? context.blockingErrors.map((b: any) => `• [BLOQUEANTE] ${b.title || b.id}: ${b.evidence || ''}`).join('\n')
        : '• Nenhum erro bloqueante.';

      const warningList = Array.isArray(context.warnings) && context.warnings.length > 0
        ? context.warnings.map((w: any) => `• [ALERTA] ${w.title || w.id}: ${w.evidence || ''}`).join('\n')
        : '• Nenhum alerta.';

      const approvedList = Array.isArray(context.approvedRules) && context.approvedRules.length > 0
        ? context.approvedRules.map((a: any) => `• [APROVADO] ${a.title || a.id} (${a.evidence || 'Conforme'})`).join('\n')
        : '• Nenhuma.';

      const systemInstruction = [
        "Você é o assistente técnico de pré-impressão do ArteCheck AI.",
        "SUBORDINAÇÃO TOTAL AO MOTOR DETERMINÍSTICO:",
        "1. O motor determinístico é a ÚNICA fonte de verdade para status, medidas, dimensões e cores.",
        "2. NUNCA contradiga ou questione qualquer regra APROVADA. Se a sangria, cores, DPI ou caixas de corte foram aprovadas pelo motor, NUNCA sugira alterá-las, corrigi-las ou verificá-las.",
        "3. NUNCA invente novos erros ou suposições que não estejam nos erros bloqueantes ou alertas listados.",
        "4. ORDEM ESTRITA DE RESPOSTA: Foque primeiro nas regras BLOQUEANTES (BLOCKING), depois nos ALERTAS (WARNING).",
        "5. Para itens APROVADOS (APPROVED): NÃO gere nenhuma recomendação automática ou desnecessária.",
        "6. Explique de forma prática como resolver no Illustrator, InDesign, CorelDraw ou Photoshop apenas os problemas realmente detectados.",
        "7. Responda em português do Brasil de maneira concisa, clara e estritamente profissional.",
      ].join("\n");

      const promptPayload = [
        "--- DIAGNÓSTICO TÉCNICO OFICIAL DO ARTECHECK MOTOR ---",
        `Arquivo: ${context.fileName || 'documento.pdf'}`,
        `Score Oficial: ${context.score}/100 | Status: ${context.status}`,
        `Erros Bloqueantes (${context.errorCount ?? 0}):\n${blockingList}`,
        `Alertas (${context.warningCount ?? 0}):\n${warningList}`,
        `Regras Aprovadas (${context.approvedCount ?? (context.approvedRules?.length || 0)}):\n${approvedList}`,
        `Medições Feitas: ${JSON.stringify(context.measuredEvidence || {})}`,
        "",
        `PERGUNTA DO USUÁRIO:\n${question}`,
      ].join("\n");

      const response = await ai.models.generateContent({
        model,
        contents: promptPayload,
        config: {
          systemInstruction,
          temperature: 0.1,
          maxOutputTokens: 800,
        },
      });

      const answer = response.text?.trim();
      if (!answer) {
        return res.status(502).json({ success: false, error: "O modelo não retornou uma resposta utilizável." });
      }

      return res.json({ success: true, answer, reply: answer, model });
    } catch (error: any) {
      console.error("ArteCheck assistant error:", error?.message || error);
      return res.status(502).json({
        success: false,
        error: "Não foi possível consultar o assistente de IA neste momento.",
      });
    }
  });

  // Healthcheck endpoint for production uptime monitoring and container probes
  app.get("/api/health", (_req: Request, res: Response) => {
    res.status(200).json({
      status: "ok",
      service: "ArteCheck AI Engine",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Number(process.uptime().toFixed(1)),
    });
  });

  // Future analysis routes structure placeholder
  app.get("/api/info", (_req: Request, res: Response) => {
    res.json({
      name: "ArteCheck AI Engine",
      stage: "3 - Deterministic PDF Structure",
      supportedFormats: ["application/pdf"],
      maxFileSizeMB: 50,
    });
  });

  // Dedicated JSON 404 handler for unmatched /api routes to prevent returning HTML index
  app.all("/api/*", (_req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: "Endpoint de API não encontrado.",
    });
  });

  // Global JSON error handler for API routes
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api/")) {
      console.error("API Unhandled Error:", err?.message || err);
      return res.status(err.status || 500).json({
        success: false,
        error: err?.message || "Erro interno do servidor.",
      });
    }
    next(err);
  });

  // Vite middleware for development vs static serve for production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
        watch: null,
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`ArteCheck AI Server running on http://0.0.0.0:${PORT}`);
  });

  server.on("error", (err: any) => {
    if (err?.code === "EADDRINUSE") {
      console.warn(`[SERVER] Warning: Port ${PORT} already in use. Retrying or waiting for release...`);
      setTimeout(() => {
        try {
          server.close();
        } catch {}
      }, 1000);
    } else {
      console.error("[SERVER] Fatal Server Error:", err);
    }
  });

  const shutdown = () => {
    try {
      server.close(() => {
        process.exit(0);
      });
    } catch {
      process.exit(0);
    }
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}



startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
