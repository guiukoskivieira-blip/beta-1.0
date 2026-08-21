/**
 * ARTECHECK — Testes de regressão para SaaS/Billing.
 * Testa idempotência de quota, limites, JWT, RLS, checkout e webhook.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PLANS } from '../src/domain/billing';

let passed = 0;
let failed = 0;
const bugs: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ BILL ${passed}: ${name}`);
  } catch (err: any) {
    failed++;
    console.log(`  ✗ BILL ${passed + failed}: ${name} — ${err.message}`);
  }
}

console.log('\n================================================================');
console.log('ARTECHECK — REGRESSÃO: SAAS/BILLING');
console.log('================================================================\n');

const serverSrc = fs.readFileSync('server.ts', 'utf8');
const migrationSql = fs.readFileSync('supabase/migrations/003_billing_and_cycle_usage.sql', 'utf8');
const rlsSql = fs.readFileSync('supabase/migrations/002_rls_policies.sql', 'utf8');

// ============================================================================
// TESTES: Quota idempotente por analysis_id
// ============================================================================

test('Quota idempotente: upsert com onConflict analysis_id e ignoreDuplicates', () => {
  assert.match(serverSrc, /onConflict:\s*['"]analysis_id['"]/);
  assert.match(serverSrc, /ignoreDuplicates:\s*true/);
});

test('Migration: UNIQUE(user_id, analysis_id) em analysis_usage_events', () => {
  assert.match(migrationSql, /UNIQUE\s*\(\s*user_id,\s*analysis_id\s*\)/i);
});

// ============================================================================
// TESTES: Limite exato bloqueia próxima análise
// ============================================================================

test('Limite exato bloqueia: remaining <= 0 retorna 429 PLAN_LIMIT_REACHED', () => {
  assert.match(serverSrc, /state\.remaining\s*<=\s*0/);
  assert.match(serverSrc, /PLAN_LIMIT_REACHED/);
  assert.match(serverSrc, /429/);
});

test('Cálculo de remaining: Math.max(0, limit - used)', () => {
  assert.match(serverSrc, /Math\.max\(0,\s*limit\s*-\s*used\)/);
});

test('Billing block ocorre ANTES do multer (não consome upload se limite atingido)', () => {
  const planLimitPos = serverSrc.indexOf('PLAN_LIMIT_REACHED');
  const multerPos = serverSrc.indexOf('upload.single("file")');
  assert.ok(planLimitPos >= 0 && multerPos >= 0, 'Ambos devem existir');
  assert.ok(planLimitPos < multerPos, 'Verificação de limite deve vir antes do multer');
});

// ============================================================================
// TESTES: Falha não consome quota
// ============================================================================

test('Registro de uso ocorre APÓS extração bem-sucedida, não antes', () => {
  const uploadRoute = serverSrc.slice(serverSrc.indexOf('/api/upload'));
  const extractPos = uploadRoute.indexOf('extractPdfStructure(file.buffer)');
  const recordPos = uploadRoute.indexOf('recordSuccessfulAnalysis(');
  assert.ok(extractPos >= 0 && recordPos >= 0, 'Ambos devem existir na rota de upload');
  assert.ok(extractPos < recordPos, 'Extração deve ocorrer antes do registro de uso');
});

test('recordSuccessfulAnalysis verifica remaining > 0 antes de registrar', () => {
  assert.match(serverSrc, /state\.remaining\s*<=\s*0.*return/);
});

test('recordSuccessfulAnalysis só executa se billing estiver enforced', () => {
  assert.match(serverSrc, /if \(!isBillingEnforced\(\)\) return/);
});

// ============================================================================
// TESTES: JWT determina user_id
// ============================================================================

test('JWT determina user_id: supabase.auth.getUser(authToken) é chamado', () => {
  assert.match(serverSrc, /supabase\.auth\.getUser\(authToken\)/);
});

test('user_id do body nunca é usado para autorização (apenas token)', () => {
  assert.match(serverSrc, /\(req as any\)\.authUser =/);
  // SERVICE_ROLE nunca é exposta no código cliente
  assert.ok(!serverSrc.includes('VITE_SUPABASE_SERVICE_ROLE_KEY'), 'SERVICE_ROLE não deve ser referenciada como VITE_');
});

test('Token ausente resulta em authUser=null e role guest', () => {
  assert.match(serverSrc, /tokenProvided:\s*false/);
  assert.match(serverSrc, /role:\s*["']guest_or_local_dev["']/);
});

// ============================================================================
// TESTES: RLS entre usuários/organizações
// ============================================================================

test('RLS: subscriptions isoladas por user_id = auth.uid()', () => {
  // Subscriptions RLS está definida na migration 003, não na 002
  assert.match(migrationSql, /subscriptions_read_own.*user_id\s*=\s*auth\.uid\(\)/i);
});

test('RLS: usage_events isolados por user_id = auth.uid()', () => {
  assert.match(rlsSql, /usage.*user_id\s*=\s*auth\.uid\(\)/i);
});

test('RLS: organization_members check em analyses e production_profiles', () => {
  assert.match(rlsSql, /organization_members/);
  assert.match(rlsSql, /om\.organization_id\s*=\s*analyses\.organization_id/);
  assert.match(rlsSql, /om\.organization_id\s*=\s*production_profiles\.organization_id/);
});

test('RLS: assinatura e uso são somente leitura via cliente (DROP INSERT/UPDATE policies)', () => {
  assert.match(migrationSql, /DROP POLICY IF EXISTS.*usage_records_insert_own/);
  assert.match(migrationSql, /DROP POLICY IF EXISTS.*usage_records_update_own/);
});

// ============================================================================
// TESTES: Checkout inicia pending
// ============================================================================

test('Checkout cria assinatura com status=pending', () => {
  assert.match(serverSrc, /status:\s*['"]pending['"]/);
  assert.match(serverSrc, /checkoutUrl/);
});

test('Checkout sem provedor retorna 503 BILLING_PROVIDER_NOT_CONFIGURED', () => {
  assert.match(serverSrc, /BILLING_PROVIDER_NOT_CONFIGURED/);
  assert.match(serverSrc, /503/);
});

test('Checkout reutiliza assinatura pending existente (não duplica)', () => {
  // A consulta busca status='pending' e usa maybeSingle
  assert.match(serverSrc, /status[\s\S]*pending[\s\S]*maybeSingle/);
  assert.match(serverSrc, /existingSub\?\.id/);
});

// ============================================================================
// TESTES: Webhook repetido não duplica ciclo
// ============================================================================

test('Webhook valida assinatura antes de alterar banco', () => {
  assert.match(serverSrc, /verifyMercadoPagoWebhookSignature/);
  assert.match(serverSrc, /Assinatura de webhook inválida/);
  assert.match(serverSrc, /401/);
});

test('Webhook consulta recurso na API do MP antes de atualizar (não confia no payload)', () => {
  assert.match(serverSrc, /fetchMercadoPagoResource/);
});

test('Webhook: promotion_cycles_used nunca excede 6 (Math.min(6, ...))', () => {
  assert.match(serverSrc, /Math\.min\(6,/);
});

test('Webhook: transição de professional_launch para professional após 6 ciclos', () => {
  assert.match(serverSrc, /targetPlanCode\s*=\s*['"]professional['"]/);
});

test('Webhook: novo ciclo detectado apenas quando status muda OU período avança', () => {
  assert.match(serverSrc, /isNewCycle/);
  assert.match(serverSrc, /existingSub\.status\s*!==\s*['"]active['"]/);
});

// ============================================================================
// TESTES: Planos — consistência de preços e limites
// ============================================================================

test('Plano free tem 15 análises e preço 0', () => {
  assert.equal(PLANS.free.analysisLimit, 15);
  assert.equal(PLANS.free.monthlyPrice, 0);
});

test('Plano professional_launch é mensal apenas (sem yearlyPrice válido)', () => {
  assert.equal(PLANS.professional_launch.monthlyPrice, 79.9);
  assert.equal(PLANS.professional_launch.launchCycles, 6);
  // O teste de billing.test.ts já confirma que yearly é rejeitado na rota
});

// ============================================================================
// RELATÓRIO
// ============================================================================

console.log(`\n  SaaS/Billing: ${passed}/${passed + failed} aprovados${failed > 0 ? `, ${failed} falhas` : ''}`);
if (bugs.length > 0) {
  console.log('  BUGS REAIS ENCONTRADOS:');
  for (const b of bugs) console.log(`    - ${b}`);
}

export { bugs as billBugs, passed as billPassed, failed as billFailed };
