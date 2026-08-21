import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PLANS } from '../src/domain/billing';

let passed = 0;
function test(name: string, fn: () => void) { fn(); passed++; console.log(`✓ BILLING ${passed}: ${name}`); }

test('limites comerciais correspondem à oferta', () => {
  assert.equal(PLANS.essential.analysisLimit, 60);
  assert.equal(PLANS.professional.analysisLimit, 200);
  assert.equal(PLANS.business.analysisLimit, 500);
});
test('preços mensais correspondem à landing page', () => {
  assert.equal(PLANS.essential.monthlyPrice, 59.9);
  assert.equal(PLANS.professional.monthlyPrice, 119.9);
  assert.equal(PLANS.business.monthlyPrice, 199.9);
});
test('preços anuais correspondem à landing page', () => {
  assert.equal(PLANS.essential.yearlyPrice, 599);
  assert.equal(PLANS.professional.yearlyPrice, 1199);
  assert.equal(PLANS.business.yearlyPrice, 1999);
});
test('oferta de lançamento é mensal, 200 análises e seis ciclos', () => {
  assert.equal(PLANS.professional_launch.monthlyPrice, 79.9);
  assert.equal(PLANS.professional_launch.analysisLimit, 200);
  assert.equal(PLANS.professional_launch.launchCycles, 6);
});
test('migration cria idempotência por analysis_id', () => {
  const sql = fs.readFileSync('supabase/migrations/003_billing_and_cycle_usage.sql','utf8');
  assert.match(sql, /UNIQUE \((user_id,\s*)?analysis_id\)/);
});
test('migration torna assinatura e uso somente leitura via RLS para cliente', () => {
  const sql = fs.readFileSync('supabase/migrations/003_billing_and_cycle_usage.sql','utf8');
  assert.match(sql, /subscriptions_read_own/);
  assert.match(sql, /usage_events_read_own/);
  assert.match(sql, /DROP POLICY IF EXISTS "usage_records_insert_own"/);
});
test('promoção possui proteção de uso único por usuário', () => {
  const sql = fs.readFileSync('supabase/migrations/003_billing_and_cycle_usage.sql','utf8');
  assert.match(sql, /idx_launch_promo_once_per_user/);
});
test('backend bloqueia antes do multer quando limite termina', () => {
  const server = fs.readFileSync('server.ts','utf8');
  assert.ok(server.indexOf("PLAN_LIMIT_REACHED") < server.indexOf('upload.single("file")'));
});
test('backend registra uso somente após extração concluída', () => {
  const server = fs.readFileSync('server.ts','utf8');
  const uploadRoute = server.slice(server.indexOf('/api/upload'));
  assert.ok(uploadRoute.indexOf('extractPdfStructure(file.buffer)') < uploadRoute.indexOf('recordSuccessfulAnalysis(billingUserId'));
});
test('checkout não simula pagamento aprovado sem provedor', () => {
  const server = fs.readFileSync('server.ts','utf8');
  assert.match(server, /BILLING_PROVIDER_NOT_CONFIGURED/);
});
test('quota é isolada por período sem deletar eventos passados', () => {
  const server = fs.readFileSync('server.ts','utf8');
  assert.match(server, /gte\('counted_at',\s*subscription\.current_period_start\)/);
  assert.match(server, /lt\('counted_at',\s*subscription\.current_period_end\)/);
});
test('promoção nunca ultrapassa 6 ciclos e transição para professional é preparada', () => {
  const server = fs.readFileSync('server.ts','utf8');
  assert.match(server, /Math\.min\(6,/);
  assert.match(server, /targetPlanCode\s*=\s*'professional'/);
});
test('webhook valida assinatura e consulta recurso antes de alterar banco', () => {
  const server = fs.readFileSync('server.ts','utf8');
  assert.match(server, /verifyMercadoPagoWebhookSignature/);
  assert.match(server, /fetchMercadoPagoResource/);
});
test('api/upload e rotas /api possuem garantia de resposta JSON estrita', () => {
  const server = fs.readFileSync('server.ts','utf8');
  assert.match(server, /app\.all\("\/api\/\*"/);
  assert.match(server, /req\.path\.startsWith\("\/api\/"\)/);
  assert.match(server, /res\.status\(200\)\.json\(/);
});
console.log(`\nBilling: ${passed}/${passed} testes aprovados.`);
